import React, { useState, useRef, useEffect } from 'react';

// Global audio player to avoid React re-render issues
let globalAudio = null;

const VoicePlayer = ({ text, autoPlay = false, onPlayStart, onPlayEnd }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const isProcessing = useRef(false);
  const componentId = useRef(Math.random().toString(36));

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
    console.log('🔊 Voice button clicked!');
    console.log('Text to convert:', text);
    
    // Prevent duplicate calls
    if (isProcessing.current) {
      console.log('Already processing, ignoring duplicate call');
      return;
    }
    
    isProcessing.current = true;
    
    if (isPlaying) {
      console.log('Stopping current audio');
      stopCurrentAudio();
      setIsPlaying(false);
      if (onPlayEnd) onPlayEnd();
      isProcessing.current = false;
      return;
    }

    if (!text || text.trim().length === 0) {
      console.log('No text provided');
      setError('No text to convert to speech');
      isProcessing.current = false;
      return;
    }

    console.log('Starting TTS process...');
    setIsLoading(true);
    setError(null);

    console.log('🔊 Calling TTS API with text:', text.substring(0, 50) + '...');
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice_id: "21m00Tcm4TlvDq8ikWAM" // Rachel voice - professional female
        }),
      });
      
      console.log('TTS API response status:', response.status);

      if (response.ok) {
        const audioBlob = await response.blob();
        console.log('Audio blob size:', audioBlob.size, 'type:', audioBlob.type);
        
        const url = URL.createObjectURL(audioBlob);
        
        // Stop any existing audio
        stopCurrentAudio();
        
        // Create new global audio
        globalAudio = new Audio(url);
        
        globalAudio.onplay = () => {
          console.log('Audio started playing');
          setIsPlaying(true);
          setIsLoading(false);
          isProcessing.current = false;
          if (onPlayStart) onPlayStart();
        };
        
        globalAudio.onended = () => {
          console.log('Audio ended');
          setIsPlaying(false);
          if (onPlayEnd) onPlayEnd();
          URL.revokeObjectURL(url);
        };
        
        globalAudio.onerror = (e) => {
          console.error('Audio error:', e);
          setError('Audio playback failed');
          setIsPlaying(false);
          setIsLoading(false);
          isProcessing.current = false;
          if (onPlayEnd) onPlayEnd();
        };
        
        // Play audio
        try {
          await globalAudio.play();
        } catch (playError) {
          console.error('Play error:', playError);
          if (playError.name === 'NotAllowedError') {
            console.log('Auto-play blocked, user interaction required');
            setError('Click 🔊 to play');
          } else {
            setError('Audio failed');
          }
          setIsLoading(false);
          isProcessing.current = false;
        }
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.detail || 'Failed to generate speech';
        
        // Handle permission errors specifically
        if (response.status === 403 && errorMessage.includes('permission')) {
          setError('Voice feature requires ElevenLabs subscription');
        } else {
          setError(errorMessage);
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error('TTS Error:', error);
      setError('Network error: ' + error.message);
      setIsLoading(false);
      isProcessing.current = false;
    }
  };



  if (!text || text.trim().length === 0) {
    return null;
  }

  return (
    <button
      className={`voice-player-button ${isPlaying ? 'playing' : ''} ${isLoading ? 'loading' : ''}`}
      onClick={handlePlay}
      disabled={isLoading}
      title={isPlaying ? 'Stop speaking' : 'Play message aloud'}
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