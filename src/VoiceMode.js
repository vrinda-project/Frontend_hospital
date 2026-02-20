import { useState, useRef, useEffect } from "react";

const VoiceMode = ({ sessionId, hospitalId, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const voiceUrl = process.env.REACT_APP_VOICE;

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

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
        const data = JSON.parse(event.data);
        console.log("📨 Received message:", data.type);

        if (data.type === "ready") {
          console.log("🚀 Server ready");
          setupWebRTC();
        } else if (data.type === "answer") {
          console.log("📨 Received answer from server");
          const answer = new RTCSessionDescription({
            sdp: data.answer.sdp,
            type: data.answer.type
          });
          await pcRef.current.setRemoteDescription(answer);
          console.log("✅ WebRTC connection established!");
        } else if (data.type === "transcription") {
          console.log("📝 Transcription received:", data.text);
          setTranscript(data.text);
          setIsListening(false);
        } else if (data.type === "response") {
          console.log("💬 AI response received:", data.text);
          setAiResponse(data.text);
          
          if (data.audio) {
            const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            const blob = new Blob([audioData], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.play();
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

  const setupWebRTC = async () => {
    try {
      console.log("🔄 Setting up WebRTC...");
      
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

      pcRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });
      console.log("✅ Created peer connection");

      stream.getTracks().forEach(track => {
        pcRef.current.addTrack(track, stream);
        console.log("🎙️ Audio track added to WebRTC");
      });

      pcRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "ice-candidate",
            candidate: {
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              candidate: event.candidate.candidate
            }
          }));
        }
      };

      console.log("🔄 Creating WebRTC offer...");
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      console.log("✅ Created offer");
      
      wsRef.current.send(JSON.stringify({
        type: "offer",
        offer: {
          sdp: offer.sdp,
          type: offer.type
        }
      }));
      console.log("📤 Sent offer to server");

      setIsListening(true);
    } catch (error) {
      console.error("❌ WebRTC setup error:", error);
    }
  };

  const cleanup = () => {
    if (pcRef.current) {
      pcRef.current.close();
    }
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
          <div className={`status-indicator ${isListening ? "listening" : "idle"}`}>
            {isListening && "🎤 Listening..."}
            {!isListening && "⏸️ Ready"}
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
