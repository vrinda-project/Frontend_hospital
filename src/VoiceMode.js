import { useState, useRef, useEffect } from "react";

const VoiceMode = ({ sessionId, hospitalId, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const voiceUrl = process.env.REACT_APP_VOICE;

  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
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
        console.log("📨 Received message:", data.type);

        if (data.type === "ready") {
          console.log("🚀 Server ready, starting WebRTC...");
          setupWebRTC();
        } else if (data.type === "answer") {
          console.log("📨 Received answer from server");
          await peerConnectionRef.current.setRemoteDescription(data.answer);
          console.log("✅ Handshake complete! Direct connection established");
        } else if (data.type === "ice-candidate") {
          console.log("🧊 Received ICE candidate from server");
          await peerConnectionRef.current.addIceCandidate(data.candidate);
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

  const setupWebRTC = async () => {
    try {
      console.log("🔄 Starting WebRTC setup...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      localStreamRef.current = stream;
      console.log("✅ Got microphone permission with noise suppression");

      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      });
      console.log("✅ Created peer connection");

      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      console.log("✅ Added microphone to connection");

      peerConnectionRef.current.ontrack = (event) => {
        console.log("✅ Received audio from server");
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play();
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        console.log("🧊 ICE candidate generated");
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          console.log("📤 Sending ICE candidate to server");
          wsRef.current.send(JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate
          }));
        }
      };

      console.log("🔄 Creating offer...");
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      console.log("✅ Created offer");
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log("📤 Sending offer to server");
        wsRef.current.send(JSON.stringify({
          type: "offer",
          offer: offer
        }));
        console.log("✅ Sent offer to server");
      } else {
        console.error("❌ WebSocket not ready!");
      }

      setIsListening(true);
    } catch (error) {
      console.error("❌ WebRTC setup error:", error);
    }
  };

  const playAudioResponse = async (base64Audio) => {
    return new Promise((resolve) => {
      setIsSpeaking(true);
      const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);

      audio.onended = () => {
        setIsSpeaking(false);
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
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
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
