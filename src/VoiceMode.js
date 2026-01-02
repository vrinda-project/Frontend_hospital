import { useState, useRef, useEffect } from "react";

const VoiceMode = ({ sessionId, hospitalId, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const voiceUrl = process.env.REACT_APP_VOICE;

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

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
        wsRef.current.send(
          JSON.stringify({
            type: "init",
            session_id: sessionId,
            hospital_id: hospitalId,
          })
        );
      };

      wsRef.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "ready") {
          startListening();
        } else if (data.type === "transcription") {
          setTranscript(data.text);
          setIsListening(false);
        } else if (data.type === "response") {
          setAiResponse(data.text);
          await playAudioResponse(data.audio);
        }
      };
    } catch (error) {
      console.error("❌ Voice mode init error:", error);
    }
  };

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();

        reader.onloadend = () => {
          const base64Audio = reader.result.split(",")[1];

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "audio",
                audio: base64Audio,
              })
            );
          }
        };

        reader.readAsDataURL(audioBlob);
      };

      setIsListening(true);
      mediaRecorderRef.current.start();

      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 3000);
    } catch (error) {
      console.error("❌ Microphone error:", error);
    }
  };

  const playAudioResponse = async (base64Audio) => {
    return new Promise((resolve) => {
      setIsSpeaking(true);
      const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);

      audio.onended = () => {
        setIsSpeaking(false);
        if (isActive) {
          setTimeout(() => startListening(), 1000);
        }
        resolve();
      };

      audio.onerror = (e) => {
        console.error("❌ Audio play error:", e);
        setIsSpeaking(false);
        resolve();
      };

      audio.play().catch((e) => {
        console.error("❌ Play failed:", e);
        setIsSpeaking(false);
        resolve();
      });
    });
  };

  const cleanup = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
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
