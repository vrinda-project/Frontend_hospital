import { useState, useRef, useEffect } from "react";

const VoiceMode = ({ sessionId, hospitalId, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const voiceUrl = process.env.REACT_APP_VOICE;

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const voiceSessionIdRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      initVoiceMode();
    }
    return () => cleanup();
  }, [isActive]);

  const initVoiceMode = async () => {
    try {
      wsRef.current = new WebSocket(`${voiceUrl}/api/v1/ws/voice-mode`);

      wsRef.current.onopen = () => {
        console.log("📡 WebSocket connected, sending init...");
        wsRef.current.send(
          JSON.stringify({
            type: "init",
            hospital_id: hospitalId,
          })
        );
      };

      wsRef.current.onmessage = async (event) => {
        // Handle text messages
        if (typeof event.data === "string") {
          const data = JSON.parse(event.data);
          console.log("📨 Received message:", data.type);

          if (data.type === "ready") {
            console.log("🚀 Server ready, session_id:", data.session_id);
            voiceSessionIdRef.current = data.session_id;
            setupAudioCapture();
          } else if (data.type === "transcription") {
            console.log("📝 Transcription received:", data.text);
            setTranscript(data.text);
          } else if (data.type === "response") {
            console.log("💬 AI response received:", data.text);
            setAiResponse(data.text);
            setIsSpeaking(true);
            
            // Play audio response
            if (data.audio) {
              const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
              const blob = new Blob([audioData], { type: "audio/mpeg" });
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.play();
              audio.onended = () => {
                setIsSpeaking(false);
                setIsListening(true);
              };
            }
          }
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("🔌 WebSocket closed");
      };
    } catch (error) {
      console.error("❌ Voice mode init error:", error);
    }
  };

  const setupAudioCapture = async () => {
    try {
      console.log("🔄 Starting audio capture...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      localStreamRef.current = stream;
      console.log("✅ Got microphone permission");

      // Setup MediaRecorder to send audio chunks via WebSocket
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
          console.log("📤 Audio chunk sent:", event.data.size, "bytes");
        }
      };
      
      mediaRecorderRef.current.start(100); // Send chunks every 100ms
      setIsListening(true);
      console.log("✅ Audio recording started");
    } catch (error) {
      console.error("❌ Audio capture error:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      console.log("⏹️ Recording stopped");
      
      // Notify server that audio recording ended
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "audio-end" }));
      }
    }
  };

  const cleanup = () => {
    stopRecording();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const toggleVoiceMode = () => {
    if (isActive) {
      cleanup();
      setIsActive(false);
      setIsListening(false);
      setIsSpeaking(false);
      onClose?.();
    } else {
      setIsActive(true);
    }
  };

  return (
    <div className="voice-mode-container">
      <button
        className={`voice-mode-btn ${isActive ? "active" : ""}`}
        onClick={toggleVoiceMode}
      >
        {isActive ? "🔴 Stop Voice Mode" : "🎤 Start Voice Mode"}
      </button>

      {isActive && (
        <div className="voice-mode-status">
          <div
            className={`status-indicator ${
              isListening ? "listening" : isSpeaking ? "speaking" : "idle"
            }`}
          >
            {isListening && "🎤 Listening..."}
            {isSpeaking && "🔊 AI Speaking..."}
            {!isListening && !isSpeaking && "⏸️ Ready"}
          </div>

          {transcript && (
            <div className="transcript">
              <strong>You:</strong> {transcript}
            </div>
          )}

          {aiResponse && (
            <div className="ai-response">
              <strong>AI:</strong> {aiResponse}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceMode;
