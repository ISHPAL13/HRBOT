// static/script.js
// Full HeyGen + LiveKit + STT(Whisper via backend) + LLM(Gemini via backend) integration
// LIVE CONVERSATION MODE with automatic turn-taking
(() => {
  // ----------------- CONFIG -----------------
  const BACKEND_BASE = window.location.origin; 
  const HEYGEN_API_BASE = "https://api.heygen.com";
  const SILENCE_THRESHOLD = 1500; // ms of silence before sending audio
  const MIN_RECORDING_TIME = 500; // minimum recording duration

  // ----------------- DOM -----------------
  const avatarID = document.getElementById("avatarID");
  const voiceID = document.getElementById("voiceID");
  const startBtn = document.getElementById("startBtn");
  const closeBtn = document.getElementById("closeBtn");
  const taskInput = document.getElementById("taskInput");
  const talkBtn = document.getElementById("talkBtn");
  const mediaElement = document.getElementById("mediaElement");
  const statusEl = document.getElementById("status");
  const conversationState = document.getElementById("conversationState");

  // ----------------- STATE -----------------
  let sessionToken = null;
  let sessionInfo = null;
  let room = null;
  let mediaStream = null;
  let audioStream = null;
  let audioContext = null;
  let analyser = null;
  let recorder = null;
  let recordedChunks = [];
  let isListening = false;
  let isSpeaking = false;
  let silenceTimer = null;
  let recordingStartTime = 0;
  let conversationActive = false;

  // ----------------- UTIL -----------------
  function logStatus(msg) {
    const ts = new Date().toLocaleTimeString();
    statusEl.innerHTML += `[${ts}] ${msg}\n`;
    statusEl.scrollTop = statusEl.scrollHeight;
    console.log(msg);
  }

  function safeJson(res) {
    return res.json().catch(() => ({}));
  }

  // ----------------- HeyGen / Backend helpers -----------------
  async function requestSessionTokenFromBackend() {
    logStatus("Requesting session token from backend...");
    const res = await fetch(`${BACKEND_BASE}/heygen/session-token`, { method: "POST" });
    const j = await safeJson(res);
    const token = j?.data?.token || j?.token || null;
    if (!token) throw new Error("No session token received from backend");
    logStatus("Obtained session token successfully");
    return token;
  }

  async function heygenCreateSession(token) {
    logStatus("Creating new HeyGen streaming session...");
    
    // Get voice configuration based on tone
    const voiceConfigRes = await fetch(`${BACKEND_BASE}/api/voice-config`);
    const voiceConfig = await voiceConfigRes.json();
    const selectedVoiceId = voiceConfig.voice_id;
    
    logStatus(`Using ${voiceConfig.tone} tone with matched voice`);
    
    const body = {
      quality: "high",
      version: "v2",
      video_encoding: "H264",
      avatar_name: avatarID.value,
      voice: { voice_id: selectedVoiceId },
      agent: { enable: false, type: "text" },
      disable_agent: true,
      silence_response: true,
      auto_response: false,
      response_mode: "manual",
      knowledge_base: null,
      prompt: ""
    };

    const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming.new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const j = await safeJson(res);
    if (!j?.data) throw new Error("heygen new session failed: " + JSON.stringify(j));
    logStatus("Session created: " + JSON.stringify(j.data));
    return j.data;
  }

  async function heygenStartSession(sid, token) {
    logStatus("Starting streaming session...");
    const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming.start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sid, silence_response: true, disable_agent: true }),
    });
    const j = await safeJson(res);
    logStatus("Streaming start response received.");
    return j;
  }

  async function heygenStopSession(sid, token) {
    try {
      await fetch(`${HEYGEN_API_BASE}/v1/streaming.stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sid }),
      });
    } catch {}
  }

  // Always force repeat mode
  async function heygenSendTask(sid, token, text) {
    if (!sid || !token) throw new Error("No active session");
    logStatus(`Sending Gemini text to HeyGen avatar (repeat): "${text.substring(0, 50)}..."`);
    const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming.task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ 
        session_id: sid, 
        text: text.trim(),
        task_type: "repeat",
        silence_response: true,
        disable_agent: true
      }),
    });
    const j = await safeJson(res);
    logStatus(`Task response: ${JSON.stringify(j)}`);
    return j;
  }

  // ----------------- LiveKit helpers -----------------
  async function connectLiveKit(sessionData) {
    logStatus("Preparing LiveKit connection...");
    const LivekitClient = window.LivekitClient;
    if (!LivekitClient) throw new Error("Livekit client not loaded");

    room = new LivekitClient.Room();
    mediaStream = new MediaStream();

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
      try {
        if (track && track.mediaStreamTrack) {
          mediaStream.addTrack(track.mediaStreamTrack);
        }
        if (mediaStream.getVideoTracks().length > 0) {
          mediaElement.srcObject = mediaStream;
          mediaElement.play().catch(()=>{});
          logStatus("Attached avatar media to player");
        }
      } catch (e) { console.warn("track subscribe handler error", e); }
    });

    await room.prepareConnection(sessionData.url, sessionData.access_token);
    await room.connect(sessionData.url, sessionData.access_token);
    logStatus("Connected to LiveKit room");
  }

  // ----------------- STT + LLM helpers -----------------
  async function postAudioToSTT(blob) {
    logStatus("Uploading audio to backend STT...");
    const fd = new FormData();
    fd.append("audio", blob, "clip.webm");
    const res = await fetch(`${BACKEND_BASE}/stt`, { method: "POST", body: fd });
    return safeJson(res);
  }

  async function postPromptToLLM(prompt) {
    logStatus("Calling backend LLM (Gemini)...");
    const res = await fetch(`${BACKEND_BASE}/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    return safeJson(res);
  }

  // ----------------- Voice Activity Detection -----------------
  function detectSilence() {
    if (!analyser || !isListening) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
    const isSilent = average < 10; // Silence threshold

    if (isSilent) {
      if (!silenceTimer && recordedChunks.length > 0) {
        const recordingDuration = Date.now() - recordingStartTime;
        if (recordingDuration > MIN_RECORDING_TIME) {
          silenceTimer = setTimeout(() => {
            logStatus("Silence detected, processing speech...");
            stopListeningAndProcess();
          }, SILENCE_THRESHOLD);
        }
      }
    } else {
      // Speech detected, clear silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }

    if (isListening) {
      requestAnimationFrame(detectSilence);
    }
  }

  // ----------------- Continuous Audio Recording -----------------
  async function startListening() {
    if (isListening || isSpeaking || !conversationActive) return;
    
    try {
      recordedChunks = [];
      recordingStartTime = Date.now();
      
      if (!audioStream) {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Set up audio analysis for VAD
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(audioStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
      }

      recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus" });
      
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size > 0) recordedChunks.push(ev.data);
      };

      recorder.start(100); // Collect data every 100ms
      isListening = true;
      updateConversationState("🎤 Listening...");
      logStatus("👂 Listening for your response...");
      
      // Start silence detection
      detectSilence();
      
    } catch (e) {
      logStatus("Microphone error: " + e);
      isListening = false;
    }
  }

  async function stopListeningAndProcess() {
    if (!isListening || !recorder) return;
    
    isListening = false;
    clearTimeout(silenceTimer);
    silenceTimer = null;

    updateConversationState("💭 Processing...");
    
    recorder.stop();
    
    // Wait for final data
    await new Promise(resolve => {
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        recordedChunks = [];
        
        if (blob.size < 1000) {
          logStatus("Audio too short, resuming listening...");
          if (conversationActive && !isSpeaking) {
            setTimeout(() => startListening(), 500);
          }
          resolve();
          return;
        }

        try {
          isSpeaking = true;
          updateConversationState("🤖 Avatar thinking...");
          
          const sttResp = await postAudioToSTT(blob);
          const userText = (sttResp?.text || "").trim();
          
          if (!userText) {
            logStatus("No speech detected, resuming listening...");
            isSpeaking = false;
            if (conversationActive) {
              setTimeout(() => startListening(), 500);
            }
            resolve();
            return;
          }

          logStatus("📝 You said: " + userText);

          // Send user input to LLM (CV context and tone handled by backend)
          const llmResp = await postPromptToLLM(userText);
          const botText = (llmResp?.text || "").trim();
          logStatus("💬 Sarah: " + botText);

          if (sessionInfo && sessionToken && botText) {
            updateConversationState("🗣️ Avatar speaking...");
            await heygenSendTask(sessionInfo.session_id, sessionToken, botText);
            
            // Wait for avatar to finish speaking (estimate based on text length)
            const speakingDuration = Math.max(3000, botText.length * 80); // ~80ms per character
            await new Promise(r => setTimeout(r, speakingDuration));
          }
          
          isSpeaking = false;
          
          // Auto-resume listening for next turn
          if (conversationActive) {
            logStatus("✅ Ready for your response...");
            setTimeout(() => startListening(), 800);
          }
          
        } catch (e) {
          logStatus("Error processing audio: " + e);
          isSpeaking = false;
          if (conversationActive) {
            setTimeout(() => startListening(), 1000);
          }
        }
        resolve();
      };
    });
  }

  function updateConversationState(message) {
    if (conversationState) {
      conversationState.textContent = message;
      
      // Update badge styling based on state
      conversationState.classList.remove('listening', 'speaking', 'processing');
      
      if (message.includes('Listening')) {
        conversationState.classList.add('listening');
      } else if (message.includes('speaking')) {
        conversationState.classList.add('speaking');
      } else if (message.includes('Processing') || message.includes('thinking')) {
        conversationState.classList.add('processing');
      }
    }
  }

  function stopListening() {
    isListening = false;
    conversationActive = false;
    clearTimeout(silenceTimer);
    silenceTimer = null;
    
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    updateConversationState("⏸️ Conversation paused");
  }

  // ----------------- Controls -----------------
  async function startSessionFlow() {
    try {
      startBtn.disabled = true;
      
      // Get user info from session
      const userInfoRes = await fetch(`${BACKEND_BASE}/api/user-info`);
      const userInfo = await userInfoRes.json();
      
      if (!userInfo.logged_in) {
        logStatus("❌ Not logged in. Redirecting...");
        window.location.href = '/login';
        return;
      }
      
      logStatus(`✅ Welcome ${userInfo.name}!`);
      logStatus(`   Interview Mode: ${userInfo.mock_interview ? 'Mock (' + userInfo.tone + ')' : 'Real'}`);
      
      sessionToken = await requestSessionTokenFromBackend();
      sessionInfo = await heygenCreateSession(sessionToken);
      await heygenStartSession(sessionInfo.session_id, sessionToken);
      await connectLiveKit(sessionInfo);
      logStatus("✅ Session started - Live conversation mode activated!");
      
      // Start with personalized avatar greeting
      conversationActive = true;
      isSpeaking = true;
      updateConversationState("🗣️ Avatar speaking...");
      
      const greeting = `Hello ${userInfo.name}! I'm Sarah, your interviewer today. Let's discuss your experience.`;
      await heygenSendTask(sessionInfo.session_id, sessionToken, greeting);
      logStatus("💬 Sarah: " + greeting);
      
      // Wait for greeting to finish, then start listening
      setTimeout(() => {
        isSpeaking = false;
        startListening();
      }, 6000);
      
    } catch (e) {
      logStatus("Start error: " + e);
      startBtn.disabled = false;
      conversationActive = false;
    }
  }

  async function stopSessionFlow() {
    conversationActive = false;
    stopListening();
    
    if (sessionInfo && sessionToken) await heygenStopSession(sessionInfo.session_id, sessionToken);
    if (room) { try { room.disconnect(); } catch {} room = null; }
    mediaElement.srcObject = null;
    sessionInfo = null; sessionToken = null;
    isSpeaking = false;
    
    updateConversationState("⏹️ Session ended");
    logStatus("Session stopped");
    startBtn.disabled = false;
  }

  async function onTalkClick() {
    const userText = (taskInput.value || "").trim();
    if (!userText || !sessionInfo || !sessionToken) return;

    // Pause listening during manual input
    const wasListening = isListening;
    if (wasListening) stopListening();

    try {
      isSpeaking = true;
      updateConversationState("🤖 Avatar thinking...");
      
      // Send user input to LLM (CV context and tone handled by backend)
      const llmResp = await postPromptToLLM(userText);
      const botText = (llmResp?.text || "").trim();
      logStatus("💬 Sarah: " + botText);

      if (botText) {
        updateConversationState("🗣️ Avatar speaking...");
        await heygenSendTask(sessionInfo.session_id, sessionToken, botText);
        
        // Wait for avatar to finish
        const speakingDuration = Math.max(3000, botText.length * 80);
        await new Promise(r => setTimeout(r, speakingDuration));
      }
      
      taskInput.value = "";
      isSpeaking = false;
      
      // Resume listening if conversation is active
      if (conversationActive) {
        setTimeout(() => startListening(), 800);
      }
    } catch (e) {
      logStatus("Manual input error: " + e);
      isSpeaking = false;
      if (conversationActive && wasListening) {
        setTimeout(() => startListening(), 1000);
      }
    }
  }

  // ----------------- Event wiring -----------------
  startBtn?.addEventListener("click", startSessionFlow);
  closeBtn?.addEventListener("click", stopSessionFlow);
  talkBtn?.addEventListener("click", onTalkClick);

  logStatus("🎯 UI ready. Click 'Start Session' to begin live conversation!");
})();
