import React, { useState, useRef, useEffect, useCallback } from "react";
import BASE_URL from './config';

let globalAudio = null;

const VoicePlayer = ({ text, autoPlay = false, onPlayStart, onPlayEnd }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const isProcessing = useRef(false);

  const stopCurrentAudio = useCallback(() => {
    if (globalAudio && !globalAudio.paused) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    }
  }, []);

  const handlePlay = useCallback(async () => {
    console.log("🔊 Voice button clicked!", text);

    if (isProcessing.current) return;
    isProcessing.current = true;

    if (isPlaying) {
      stopCurrentAudio();
      setIsPlaying(false);
      onPlayEnd?.();
      isProcessing.current = false;
      return;
    }

    if (!text?.trim()) {
      setError("No text to convert to speech");
      isProcessing.current = false;
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${BASE_URL}/api/v1/text-to-speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice_id: "21m00Tcm4TlvDq8ikWAM",
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const url = URL.createObjectURL(audioBlob);

        stopCurrentAudio();
        globalAudio = new Audio(url);

        globalAudio.onplay = () => {
          setIsPlaying(true);
          setIsLoading(false);
          isProcessing.current = false;
          onPlayStart?.();
        };

        globalAudio.onended = () => {
          setIsPlaying(false);
          onPlayEnd?.();
          URL.revokeObjectURL(url);
        };

        globalAudio.onerror = (e) => {
          console.error("Audio error:", e);
          setError("Audio playback failed");
          setIsPlaying(false);
          setIsLoading(false);
          isProcessing.current = false;
          onPlayEnd?.();
        };

        try {
          await globalAudio.play();
        } catch (playError) {
          console.error("Play error:", playError);
          setError("Click 🔊 to play");
          setIsLoading(false);
          isProcessing.current = false;
        }
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to generate speech");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("TTS Error:", err);
      setError("Network error: " + err.message);
      setIsLoading(false);
      isProcessing.current = false;
    }
  }, [isPlaying, onPlayEnd, onPlayStart, stopCurrentAudio, text]);

  useEffect(() => {
    if (autoPlay && text?.trim() && !hasAutoPlayed) {
      setTimeout(() => {
        handlePlay();
        setHasAutoPlayed(true);
      }, 500);
    }
  }, [autoPlay, text, hasAutoPlayed, handlePlay]);

  useEffect(() => {
    return () => {
      if (globalAudio && !globalAudio.paused) {
        globalAudio.pause();
      }
    };
  }, []);

  if (!text?.trim()) return null;

  return (
    <button
      className={`voice-player-button ${isPlaying ? "playing" : ""} ${isLoading ? "loading" : ""}`}
      onClick={handlePlay}
      disabled={isLoading}
      title={isPlaying ? "Stop speaking" : "Play message aloud"}
    >
      {isLoading ? "⏳" : isPlaying ? "⏹️" : "🔊"}
      {error && <span className="error-text">{error}</span>}
    </button>
  );
};

export default VoicePlayer;
