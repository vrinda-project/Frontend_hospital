import React, { useState, useRef, useEffect } from 'react';

const BrowserVoicePlayer = ({ text, autoPlay = false, onPlayStart, onPlayEnd }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const utteranceRef = useRef(null);

  useEffect(() => {
    // Check if browser supports speech synthesis
    if ('speechSynthesis' in window) {
      setIsSupported(true);
    } else {
      setError('Voice not supported in this browser');
    }
  }, []);

  useEffect(() => {
    if (autoPlay && text && isSupported) {
      handlePlay();
    }
  }, [text, autoPlay, isSupported]);

  const handlePlay = () => {
    if (!isSupported) {
      setError('Voice not supported');
      return;
    }

    if (isPlaying) {
      // Stop current speech
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      if (onPlayEnd) onPlayEnd();
      return;
    }

    if (!text || text.trim().length === 0) {
      setError('No text to speak');
      return;
    }

    setError(null);

    // Create speech utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Configure voice settings for hospital use
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0; // Normal pitch
    utterance.volume = 0.8; // Slightly quieter

    // Try to use a female voice if available
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(voice => 
      voice.name.toLowerCase().includes('female') || 
      voice.name.toLowerCase().includes('zira') ||
      voice.name.toLowerCase().includes('hazel') ||
      voice.name.toLowerCase().includes('samantha')
    );
    
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    // Event handlers
    utterance.onstart = () => {
      setIsPlaying(true);
      if (onPlayStart) onPlayStart();
    };

    utterance.onend = () => {
      setIsPlaying(false);
      if (onPlayEnd) onPlayEnd();
    };

    utterance.onerror = (event) => {
      setError('Speech failed');
      setIsPlaying(false);
      if (onPlayEnd) onPlayEnd();
      console.error('Speech synthesis error:', event);
    };

    // Start speaking
    window.speechSynthesis.speak(utterance);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!text || text.trim().length === 0) {
    return null;
  }

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  return (
    <button
      className={`voice-player-button ${isPlaying ? 'playing' : ''}`}
      onClick={handlePlay}
      title={isPlaying ? 'Stop speaking' : 'Play message aloud (Browser Voice)'}
    >
      {isPlaying ? (
        <span className="stop-icon">⏹️</span>
      ) : (
        <span className="play-icon">🔊</span>
      )}
      {error && <span className="error-text">{error}</span>}
    </button>
  );
};

export default BrowserVoicePlayer;