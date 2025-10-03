import React, { useState, useRef } from 'react';

const VoiceRecorder = ({ onTranscription, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await sendAudioToServer(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const sendAudioToServer = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'recording.wav');

      const response = await fetch('http://localhost:8000/api/v1/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        onTranscription(result.transcribed_text);
      } else {
        const error = await response.json();
        console.error('Speech-to-text error:', error);
        alert('Failed to convert speech to text: ' + error.detail);
      }
    } catch (error) {
      console.error('Error sending audio:', error);
      alert('Failed to process audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      className={`voice-button ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
      onClick={handleClick}
      disabled={disabled || isProcessing}
      title={isRecording ? 'Click to stop recording' : 'Click to start recording'}
    >
      {isProcessing ? (
        <span className="processing-icon">⏳</span>
      ) : isRecording ? (
        <span className="recording-icon">⏹️</span>
      ) : (
        <span className="mic-icon">🎤</span>
      )}
    </button>
  );
};

export default VoiceRecorder;