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
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
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

      console.log("📨 Received:", data.type, data);

      switch (data.type) {
        case "ready":
          console.log("✅ Ready message received");
          setIsListening(true);
          break;

        case "recording_started":
          console.log("✅ Recording started");
          setIsListening(true);
          break;

        case "transcription":
          console.log("📝 Transcription:", data.text);
          setTranscript(data.text);
          setIsListening(false);
          setIsProcessing(true);
          break;

        case "response":
          console.log("💬 Response:", data.text);
          setAiResponse(data.text);
          setIsProcessing(false);
          setIsListening(true);
          if (data.audio) enqueueAudio(data.audio);
          break;

        case "error":
          console.error("❌ Error:", data.message);
          setError(data.message || "Unknown error");
          setIsProcessing(false);
          setIsListening(true);
          break;

        case "pong":
          console.log("🏓 Pong");
          break;

        default:
          console.warn("Unknown message type:", data.type);
      }
    },
    [enqueueAudio]
  );

  const initVoiceMode = useCallback(async () => {
    console.log("🔧 Initializing voice mode...");
    console.log("📍 voiceUrl:", voiceUrl);
    console.log("📍 hospitalId:", hospitalId);
    setError("");
    const wsUrl = `${voiceUrl}/api/v1/ws/voice-mode`;
    console.log("🔗 Connecting to:", wsUrl);

    wsRef.current = new WebSocket(wsUrl);
    wsRef.current.binaryType = "arraybuffer";

    wsRef.current.onopen = () => {
      console.log("✅ WebSocket connected");
      const initMsg = { type: "init", hospital_id: hospitalId };
      console.log("📤 Sending init:", initMsg);
      wsRef.current.send(JSON.stringify(initMsg));

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
      console.log("🔌 WebSocket closed");
      setIsListening(false);
      setIsProcessing(false);
      clearInterval(keepAliveRef.current);
    };
  }, [voiceUrl, hospitalId, handleMessage]);

  const startRecording = useCallback(async () => {
    console.log("🎤 Starting recording...");
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
      console.log("✅ Got microphone stream");

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log("📥 Audio chunk:", event.data.size, "bytes");
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("⏹️ Recording stopped, processing...");
        const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        console.log("📦 Audio blob size:", blob.size);
        const arrayBuffer = await blob.arrayBuffer();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log("📤 Sending audio:", arrayBuffer.byteLength, "bytes");
          wsRef.current.send(arrayBuffer);
        } else {
          console.error("❌ WebSocket not open, state:", wsRef.current?.readyState);
        }
        stream.getTracks().forEach((t) => t.stop());
      };

      wsRef.current.send(JSON.stringify({ type: "start_recording" }));
      mediaRecorder.start();
      setIsListening(true);
      console.log("🎤 Recording started");
    } catch (err) {
      console.error("❌ Recording error:", err);
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Failed to start recording."
      );
    }
  }, []);

  const stopRecording = useCallback(() => {
    console.log("⏹️ Stopping recording...");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      wsRef.current.send(JSON.stringify({ type: "stop_recording" }));
      setIsListening(false);
      setIsProcessing(true);
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log("🧹 Cleaning up...");
    clearInterval(keepAliveRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    wsRef.current?.close();
    wsRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  useEffect(() => {
    console.log("📌 isActive changed:", isActive);
    if (isActive) initVoiceMode();
    return cleanup;
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoiceMode = () => {
    console.log("🔘 Toggle voice mode, current:", isActive);
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

          {isListening && (
            <div className="recording-controls">
              <button onClick={startRecording} className="record-btn">
                🔴 Start Recording
              </button>
              <button onClick={stopRecording} className="stop-btn">
                ⏹️ Stop Recording
              </button>
            </div>
          )}

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
