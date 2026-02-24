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
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const keepAliveRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const pcmBufferRef = useRef([]);

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
          break;

        default:
          console.warn("Unknown message type:", data.type);
      }
    },
    [enqueueAudio]
  );

  const initVoiceMode = useCallback(async () => {
    console.log("🔧 Initializing voice mode...");
    setError("");
    const wsUrl = `${voiceUrl}/api/v1/ws/voice-mode`;
    console.log("🔗 Connecting to:", wsUrl);

    wsRef.current = new WebSocket(wsUrl);
    wsRef.current.binaryType = "arraybuffer";

    wsRef.current.onopen = () => {
      console.log("✅ WebSocket connected");
      wsRef.current.send(JSON.stringify({ type: "init", hospital_id: hospitalId }));

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

  const startContinuousRecording = useCallback(async () => {
    console.log("🎤 Starting continuous recording...");
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

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Voice Activity Detection: calculate RMS level
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        // Only buffer if audio level is above noise threshold
        if (rms > 0.02) {
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          pcmBufferRef.current.push(new Uint8Array(pcm16.buffer));
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      setIsListening(true);
      console.log("🎤 Recording started");

      // Auto-send PCM every 6 seconds
      recordingTimeoutRef.current = setInterval(async () => {
        if (pcmBufferRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const pcmData = new Uint8Array(
            pcmBufferRef.current.reduce((a, b) => a + b.length, 0)
          );
          let offset = 0;
          for (const chunk of pcmBufferRef.current) {
            pcmData.set(chunk, offset);
            offset += chunk.length;
          }
          console.log("📤 Sending PCM audio:", pcmData.byteLength, "bytes");
          wsRef.current.send(pcmData);
          pcmBufferRef.current = [];
        }
      }, 6000);
    } catch (err) {
      console.error("❌ Recording error:", err);
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Failed to start recording."
      );
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log("🧹 Cleaning up...");
    clearInterval(keepAliveRef.current);
    clearInterval(recordingTimeoutRef.current);
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    wsRef.current?.close();
    wsRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  useEffect(() => {
    console.log("📌 isActive changed:", isActive);
    if (isActive) {
      initVoiceMode();
      setTimeout(() => startContinuousRecording(), 500);
    }
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
