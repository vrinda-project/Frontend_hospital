import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import VoiceRecorder from "./VoiceRecorder";
import VoicePlayer from "./VoicePlayer";

const FALLBACK_HOSPITALS = [
  {
    id: "fallback-1",
    name: "City General Hospital",
    address: "123 Main St, City",
    phone: "+1-555-0123",
  },
  {
    id: "fallback-2",
    name: "Metro Medical Center",
    address: "456 Oak Ave, Metro",
    phone: "+1-555-0456",
  },
];

function App() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiConnected, setApiConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const baseUrl = process.env.REACT_APP_BASE_URL;

  useEffect(() => {
    fetchHospitals();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchHospitals = async () => {
    try {
      const response = await axios.get(`${baseUrl}/api/chat/hospitals`);
      setHospitals(response.data.hospitals);
      setApiConnected(true);
      setError("");
    } catch (err) {
      console.error("Failed to fetch hospitals:", err);
      setHospitals(FALLBACK_HOSPITALS);
      setApiConnected(false);
      setError(
        "Backend server not running - Start: python -m uvicorn app.main:app --reload --port 8000"
      );
    }
  };

  const createSession = async (hospitalId) => {
    try {
      const response = await axios.post(`${baseUrl}/api/chat/session`, {
        hospital_id: hospitalId,
      });
      setSessionId(response.data.session_id);
      setMessages([
        {
          text: `Welcome to ${response.data.hospital_name}! I'm your AI assistant. How can I help you today?`,
          isUser: false,
          timestamp: new Date(),
          agent: "system",
        },
      ]);
      setError("");
    } catch (err) {
      setError("Failed to create chat session - Backend server not running");
      console.error("Session creation error:", err);
    }
  };

  const handleHospitalSelect = (e) => {
    const hospitalId = e.target.value;
    if (!hospitalId) {
      setSelectedHospital(null);
      setSessionId(null);
      setMessages([]);
      return;
    }

    const hospital = hospitals.find((h) => h.id === hospitalId);
    setSelectedHospital(hospital);
    createSession(hospitalId);
  };

  const sendMessage = async (messageText = inputMessage) => {
    if (!messageText.trim() || !sessionId) return;

    const userMessage = {
      text: messageText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    try {
      const response = await axios.post(`${baseUrl}/api/chat/message`, {
        session_id: sessionId,
        hospital_id: selectedHospital.id,
        message: messageText,
      });

      const aiMessage = {
        text: response.data.response,
        isUser: false,
        timestamp: new Date(),
        intent: response.data.intent,
        agent: response.data.agent_used,
        systemType: response.data.system_type,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setError("");
    } catch (err) {
      const errorMessage = {
        text: "Sorry, I encountered an error processing your message. Please try again.",
        isUser: false,
        timestamp: new Date(),
        agent: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
      setError("Message processing failed");
      console.error("Message error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🏥 AI Hospital Booking System</h1>
        <p>Testing Interface for Multi-Hospital AI Chat</p>
        <div className="status-indicator">
          <div
            className={`status-dot ${
              apiConnected ? "connected" : "disconnected"
            }`}
          ></div>
          API Status: {apiConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <div className="hospital-selector">
        <h3>Select Hospital</h3>
        <select
          onChange={handleHospitalSelect}
          value={selectedHospital?.id || ""}
        >
          <option value="">Choose a hospital...</option>
          {hospitals.map((hospital) => (
            <option key={hospital.id} value={hospital.id}>
              {hospital.name} - {hospital.phone}
            </option>
          ))}
        </select>

        {selectedHospital && (
          <div className="hospital-info">
            <strong>{selectedHospital.name}</strong>
            <br />
            📍 {selectedHospital.address}
            <br />
            📞 {selectedHospital.phone}
            <br />
            🆔 Hospital ID: {selectedHospital.id}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {selectedHospital && (
        <div className="chat-container">
          <div className="chat-header">
            <div>
              <strong>Chat with {selectedHospital.name}</strong>
              {sessionId && (
                <div style={{ fontSize: "12px", opacity: "0.8" }}>
                  Session: {sessionId.slice(0, 8)}...
                </div>
              )}
            </div>
            <div style={{ fontSize: "12px" }}>AI-Powered Booking Assistant</div>
          </div>

          <div className="chat-messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.isUser ? "user" : "ai"}`}
              >
                <div className="message-content">
                  <div className="message-text">{message.text}</div>
                  {!message.isUser && (
                    <VoicePlayer
                      text={message.text}
                      autoPlay={true}
                      onPlayStart={() => console.log("🔊 AI speaking...")}
                      onPlayEnd={() => console.log("🔇 AI finished speaking")}
                    />
                  )}
                </div>
                <div className="message-info">
                  {message.timestamp.toLocaleTimeString()}
                  {message.intent && ` • Intent: ${message.intent}`}
                  {message.agent && ` • Agent: ${message.agent}`}
                  {message.systemType &&
                    ` • System: ${
                      message.systemType === "langchain"
                        ? "🔗 LangChain"
                        : "⚡ Simple"
                    }`}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message ai">
                <div className="loading">
                  <span>AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chat-input">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message or use voice..."
              disabled={loading || !sessionId}
            />

            <button
              type="submit"
              disabled={loading || !sessionId || !inputMessage.trim()}
            >
              Send
            </button>
            <VoiceRecorder
              onTranscription={(text) => {
                setInputMessage(text);
                // Auto-send the transcribed message
                setTimeout(() => sendMessage(text), 100);
              }}
              disabled={loading || !sessionId}
            />
          </form>
        </div>
      )}

      {!selectedHospital && (
        <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
          👆 Please select a hospital above to start chatting with the AI
          assistant
        </div>
      )}
    </div>
  );
}

export default App;
