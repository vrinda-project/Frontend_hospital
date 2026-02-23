import { useState, useRef, useEffect, useCallback } from "react";

const VoiceMode = ({ sessionId, hospitalId, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [error, setError] = useState("");

  const voiceUrl = process.env.REACT_APP_VOICE;

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const keepAliveRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  const playNextAudio = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    const url = audioQueueRef.current.shift();
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      playNextAudio();
    };
    audio.onerror = () => {
      isPlayingRef.current = false;
      playNextAudio();
    };
    audio.play().catch(console.error);
  }, []);

  const enqueueAudio = useCallback(
    (base64Audio) => {
      const audioData = Uint8Array.from(atob(base64Audio), (c) =>
        c.charCodeAt(0)
      );
      const blob = new Blob([audioData], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      audioQueueRef.current.push(url);
      playNextAudio();
    },
    [playNextAudio]
  );

  const handleMessage = useCallback(
    (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error("Failed to parse WS message");
        return;
      }

      console.log("📨 Received:", data.type);

      switch (data.type) {
        case "ready":
          setupWebRTC();
          break;

        case "answer":
          if (pcRef.current) {
            pcRef.current.setRemoteDescription(
              new RTCSessionDescription({ sdp: data.answer.sdp, type: data.answer.type })
            );
            console.log("✅ WebRTC answer set");
          }
          break;

        case "ice-candidate":
          if (pcRef.current && data.candidate) {
            try {
              pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.debug("ICE candidate skipped:", e);
            }
          }
          break;

        case "listening_start":
          setIsListening(true);
          setIsProcessing(false);
          break;

        case "listening_stop":
          setIsListening(false);
          setIsProcessing(true);
          break;

        case "transcription":
          setTranscript(data.text);
          setIsListening(false);
          setIsProcessing(true);
          break;

        case "response":
          setAiResponse(data.text);
          setIsProcessing(false);
          setIsListening(true);
          if (data.audio) enqueueAudio(data.audio);
          break;

        case "error":
          setError(data.message || "Unknown error");
          setIsProcessing(false);
          setIsListening(true);
          break;

        case "pong":
          break;

        default:
          console.warn("Unknown message type:", data.type);
      }
    },
    [enqueueAudio]
  );

  const initVoiceMode = useCallback(async () => {
    setError("");
    const wsUrl = `${voiceUrl}/api/v1/ws/voice-mode`;
    console.log("🔗 Connecting to:", wsUrl);

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("📡 WS connected");
      wsRef.current.send(
        JSON.stringify({ type: "init", hospital_id: hospitalId })
      );

      keepAliveRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    wsRef.current.onmessage = handleMessage;

    wsRef.current.onerror = (e) => {
      console.error("❌ WebSocket error:", e);
      setError("Connection error. Please try again.");
    };

    wsRef.current.onclose = () => {
      console.log("🔌 WS closed");
      setIsListening(false);
      setIsProcessing(false);
      clearInterval(keepAliveRef.current);
    };
  }, [voiceUrl, hospitalId, handleMessage]);

  const setupWebRTC = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "ice-candidate",
              candidate: {
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex,
              },
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("🔗 PC state:", pc.connectionState);
        if (pc.connectionState === "connected") setIsListening(true);
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          setIsListening(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsRef.current.send(
        JSON.stringify({
          type: "offer",
          offer: { sdp: offer.sdp, type: offer.type },
        })
      );
      console.log("📤 Offer sent");
    } catch (err) {
      console.error("❌ WebRTC setup error:", err);
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Failed to set up audio. Please try again."
      );
    }
  }, []);

  const cleanup = useCallback(() => {
    clearInterval(keepAliveRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  useEffect(() => {
    if (isActive) initVoiceMode();
    return cleanup;
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoiceMode = () => {
    if (isActive) {
      cleanup();
      setIsActive(false);
      setIsListening(false);
      setIsProcessing(false);
      setTranscript("");
      setAiResponse("");
      onClose?.();
    } else {
      setIsActive(true);
    }
  };

  const statusLabel = () => {
    if (isProcessing) return "⏳ Processing...";
    if (isListening) return "🎤 Listening...";
    return "⏸️ Ready";
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
              isListening ? "listening" : isProcessing ? "processing" : "idle"
            }`}
          >
            {statusLabel()}
          </div>

          {error && <div className="voice-error">⚠️ {error}</div>}

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
