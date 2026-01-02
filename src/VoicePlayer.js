import { useState, useRef, useEffect } from "react";

// Global audio player to avoid React re-render issues
let globalAudio = null;

const VoicePlayer = ({ text, autoPlay = false, onPlayStart, onPlayEnd }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const isProcessing = useRef(false);
  const baseUrl = process.env.REACT_APP_BASE_URL;
  useEffect(() => {
    if (autoPlay && text && text.trim().length > 0 && !hasAutoPlayed) {
      // Small delay to ensure component is ready
      setTimeout(() => {
        handlePlay();
        setHasAutoPlayed(true);
      }, 500);
    }
  }, [text, autoPlay, hasAutoPlayed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (globalAudio && !globalAudio.paused) {
        globalAudio.pause();
      }
    };
  }, []);

  const stopCurrentAudio = () => {
    if (globalAudio && !globalAudio.paused) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    }
  };

  const handlePlay = async () => {
    // Prevent duplicate calls
    if (isProcessing.current) {
      return;
    }

    isProcessing.current = true;

    if (isPlaying) {
      stopCurrentAudio();
      setIsPlaying(false);
      if (onPlayEnd) onPlayEnd();
      isProcessing.current = false;
      return;
    }

    if (!text || text.trim().length === 0) {
      setError("No text to convert to speech");
      isProcessing.current = false;
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/api/v1/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          voice_id: "21m00Tcm4TlvDq8ikWAM",
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();

        const url = URL.createObjectURL(audioBlob);
        // Stop any existing audio
        stopCurrentAudio();
        // Create new global audio
        globalAudio = new Audio(url);
        globalAudio.onplay = () => {
          setIsPlaying(true);
          setIsLoading(false);
          isProcessing.current = false;
          if (onPlayStart) onPlayStart();
        };

        globalAudio.onended = () => {
          setIsPlaying(false);
          if (onPlayEnd) onPlayEnd();
          URL.revokeObjectURL(url);
        };

        globalAudio.onerror = (e) => {
          console.error("Audio error:", e);
          setError("Audio playback failed");
          setIsPlaying(false);
          setIsLoading(false);
          isProcessing.current = false;
          if (onPlayEnd) onPlayEnd();
        };

        // Play audio
        try {
          await globalAudio.play();
        } catch (playError) {
          console.error("Play error:", playError);
          if (playError.name === "NotAllowedError") {
            setError("Click 🔊 to play");
          } else {
            setError("Audio failed");
          }
          setIsLoading(false);
          isProcessing.current = false;
        }
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.detail || "Failed to generate speech";
        // Handle permission errors specifically
        if (response.status === 403 && errorMessage.includes("permission")) {
          setError("Voice feature requires ElevenLabs subscription");
        } else {
          setError(errorMessage);
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setError("Network error: " + error.message);
      setIsLoading(false);
      isProcessing.current = false;
    }
  };

  if (!text || text.trim().length === 0) {
    return null;
  }

  return (
    <button
      className={`voice-player-button ${isPlaying ? "playing" : ""} ${
        isLoading ? "loading" : ""
      }`}
      onClick={handlePlay}
      disabled={isLoading}
      title={isPlaying ? "Stop speaking" : "Play message aloud"}
    >
      {isLoading ? (
        <span className="loading-icon">⏳</span>
      ) : isPlaying ? (
        <span className="stop-icon">⏹️</span>
      ) : (
        <span className="play-icon">🔊</span>
      )}
      {error && <span className="error-text">{error}</span>}
    </button>
  );
};

export default VoicePlayer;
