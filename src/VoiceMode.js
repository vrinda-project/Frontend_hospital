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
  const audioContextRef = useRef(null);
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
        const data = JSON.parse(event.data);
        console.log("📨 Received message:", data.type);

        if (data.type === "ready") {
          console.log("🚀 Server ready, session_id:", data.session_id);
          voiceSessionIdRef.current = data.session_id;
          setupWebRTC();
        } else if (data.type === "answer") {
          console.log("📨 Received answer from server");
          const answer = new RTCSessionDescription({
            sdp: data.answer.sdp,
            type: data.answer.type
          });
          await peerConnectionRef.current.setRemoteDescription(answer);
          console.log("✅ Handshake complete! Direct connection established");
        } else if (data.type === "ice-candidate") {
          console.log("🧊 Received ICE candidate from server");
          if (data.candidate) {
            const candidate = new RTCIceCandidate({
              sdpMid: data.candidate.sdpMid,
              sdpMLineIndex: data.candidate.sdpMLineIndex,
              candidate: data.candidate.candidate
            });
            await peerConnectionRef.current.addIceCandidate(candidate);
          }
        } else if (data.type === "transcription") {
          console.log("📝 Transcription received:", data.text);
          setTranscript(data.text);
          setIsListening(false);
        } else if (data.type === "response") {
          console.log("💬 AI response received:", data.text);
          setAiResponse(data.text);
          // Fix #7: Audio now comes through WebRTC, not base64
          // The backend will send audio through RTCPeerConnection
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
        console.log("🎙️ Audio Track added");
      });
      console.log("✅ Added microphone to connection");

      // Fix #6: Create AudioContext and store reference
      audioContextRef.current = new AudioContext();
      const analyser = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        if (average > 5) {
          console.log("🔊 Audio Level:", Math.round(average));
        }
        requestAnimationFrame(checkAudioLevel);
      };
      checkAudioLevel();

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
            candidate: {
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              candidate: event.candidate.candidate
            }
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
          offer: {
            sdp: offer.sdp,
            type: offer.type
          }
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

  const cleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    // Fix #6: Close AudioContext to prevent memory leak
    if (audioContextRef.current) {
      audioContextRef.current.close();
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
