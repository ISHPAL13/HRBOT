// static/script.js
// Full HeyGen + LiveKit + STT(Whisper via backend) + LLM(Gemini via backend) integration
// LIVE CONVERSATION MODE with automatic turn-taking
// Wrapped logic in global function
window.initializeInterviewLogic = function () {
  console.log("Initializing interview logic...");

  // ----------------- CONFIG -----------------
  const BACKEND_BASE = window.location.origin;
  const HEYGEN_API_BASE = "https://api.heygen.com";
  const SILENCE_THRESHOLD = 800; // ms of silence before sending audio (optimized for faster response)
  const MIN_RECORDING_TIME = 300; // minimum recording duration (optimized)

  // ----------------- DOM -----------------
  const avatarID = document.getElementById("avatarID");
  const mediaElement = document.getElementById("mediaElement");
  const userWebcam = document.getElementById("userWebcam");
  const taskInput = document.getElementById("taskInput");
  const startBtn = document.getElementById("startBtn");
  console.log("Elements found:", { avatarID: !!avatarID, mediaElement: !!mediaElement, startBtn: !!startBtn });

  if (!startBtn) console.error("CRITICAL: Start button not found in DOM!");
  const stopSpeakingBtn = document.getElementById("stopSpeakingBtn");
  const closeBtn = document.getElementById("closeBtn");
  const evaluateBtn = document.getElementById("evaluateBtn");
  const conversationState = document.getElementById("conversationState");
  const voiceID = document.getElementById("voiceID");
  const statusEl = document.getElementById("status");
  const liveTranscriptBox = document.getElementById("liveTranscriptBox");
  const liveTranscript = document.getElementById("liveTranscript");

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

  // WebSocket state
  let ws = null;
  let wsConnected = false;
  let wsReconnectAttempts = 0;
  const MAX_WS_RECONNECT = 3;

  // Deepgram live streaming state
  let deepgramConnection = null;
  let deepgramApiKey = null;
  let isDeepgramConnected = false;
  let lastTranscript = '';
  let transcriptTimer = null;

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

  // Helper to get session ID from cookies
  function getSessionIdFromCookie() {
    const cookies = document.cookie.split(';');
    console.log('🍪 All cookies:', document.cookie);
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      console.log(`   Cookie: ${name} = ${value}`);
      if (name === 'session_id') {
        console.log(`✅ Found session_id: ${value}`);
        return value;
      }
    }
    console.log('⚠️ session_id cookie not found');
    return null;
  }

  // ----------------- WebSocket helpers -----------------
  function connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/interview`;

        logStatus("🔌 Connecting to WebSocket...");
        ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
          console.log("✅ WebSocket connected");
          wsConnected = true;
          wsReconnectAttempts = 0;

          // Initialize session
          let sessionId = getSessionIdFromCookie();

          // Fallback: Get session ID from user info API
          if (!sessionId) {
            console.log('⚠️ No session cookie, fetching from API...');
            try {
              const res = await fetch(`${BACKEND_BASE}/api/user-info`);
              const data = await res.json();
              // The session ID is in the Set-Cookie header, but we can't access it directly
              // So we'll just send the init without session_id and let backend handle it
              console.log('📋 User info:', data);
            } catch (e) {
              console.error('Failed to get user info:', e);
            }
          }

          if (sessionId) {
            console.log(`📤 Sending init with session_id: ${sessionId}`);
            ws.send(JSON.stringify({
              action: "init",
              session_id: sessionId
            }));
          } else {
            console.log('⚠️ Could not get session_id, WebSocket may not work properly');
          }

          resolve();
        };

        ws.onmessage = (event) => {
          handleWebSocketMessage(JSON.parse(event.data));
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          logStatus("⚠️ WebSocket error, will use HTTP fallback");
          wsConnected = false;
          reject(error);
        };

        ws.onclose = () => {
          logStatus("🔌 WebSocket disconnected");
          wsConnected = false;

          // Auto-reconnect if conversation is active
          if (conversationActive && wsReconnectAttempts < MAX_WS_RECONNECT) {
            wsReconnectAttempts++;
            logStatus(`🔄 Reconnecting WebSocket (attempt ${wsReconnectAttempts})...`);
            setTimeout(() => connectWebSocket(), 2000);
          }
        };

      } catch (error) {
        console.error("WebSocket connection error:", error);
        wsConnected = false;
        reject(error);
      }
    });
  }

  // WebSocket message handlers
  const wsCallbacks = {};
  let wsMessageId = 0;

  function handleWebSocketMessage(message) {
    const action = message.action;

    if (action === "init_success") {
      console.log("✅ WebSocket session initialized");
    } else if (action === "stt_response") {
      if (wsCallbacks.stt) {
        wsCallbacks.stt(message);
        delete wsCallbacks.stt;
      }
    } else if (action === "llm_response") {
      if (wsCallbacks.llm) {
        wsCallbacks.llm(message);
        delete wsCallbacks.llm;
      }
    } else if (action === "error") {
      console.error("WebSocket error:", message.error);
    }
  }

  // Send audio to STT via WebSocket
  async function sendAudioViaWebSocket(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Audio = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix

        wsCallbacks.stt = (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve({ text: response.text });
          }
        };

        ws.send(JSON.stringify({
          action: "stt",
          audio: base64Audio
        }));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Send prompt to LLM via WebSocket
  async function sendPromptViaWebSocket(prompt) {
    return new Promise((resolve, reject) => {
      wsCallbacks.llm = (response) => {
        if (response.error) {
          resolve({ text: response.text, error: response.error });
        } else {
          resolve({ text: response.text });
        }
      };

      ws.send(JSON.stringify({
        action: "llm",
        prompt: prompt
      }));
    });
  }

  // ----------------- Deepgram Live Streaming -----------------
  async function initDeepgramLiveStreaming() {
    try {
      // Get Deepgram API key from backend
      if (!deepgramApiKey) {
        const res = await fetch(`${BACKEND_BASE}/deepgram/api-key`);
        const data = await res.json();
        deepgramApiKey = data.api_key;
      }

      // Check if Deepgram SDK is loaded
      if (!window.deepgram || !window.deepgram.createClient) {
        console.error('Deepgram SDK not loaded');
        return false;
      }

      // Create Deepgram client
      const deepgram = window.deepgram.createClient(deepgramApiKey);

      // Create live transcription connection
      deepgramConnection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        interim_results: true,
        endpointing: 1500, // ms of silence to detect end of speech (1.5 seconds for natural pauses)
        vad_events: true, // Enable voice activity detection events
      });

      // Set up event listeners
      deepgramConnection.on(window.deepgram.LiveTranscriptionEvents.Open, () => {
        console.log('✅ Deepgram live connection opened');
        isDeepgramConnected = true;
        logStatus("✅ Real-time transcription connected");
      });

      deepgramConnection.on(window.deepgram.LiveTranscriptionEvents.Close, () => {
        console.log('🔌 Deepgram live connection closed');
        isDeepgramConnected = false;
      });

      deepgramConnection.on(window.deepgram.LiveTranscriptionEvents.Transcript, (data) => {
        console.log('📨 Deepgram transcript event:', data);

        const transcript = data.channel?.alternatives?.[0]?.transcript;

        if (!transcript || transcript.trim() === '') {
          console.log('⚠️ Empty transcript received');
          return;
        }

        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        console.log(`📝 Deepgram: "${transcript}" (final: ${isFinal}, speech_final: ${speechFinal})`);
        logStatus(`📝 Transcript: "${transcript}" (${speechFinal ? 'COMPLETE' : 'partial'})`);

        // Update live transcript display
        if (liveTranscript && liveTranscriptBox) {
          liveTranscriptBox.style.display = 'block';
          if (isFinal) {
            // Show final transcript in white
            liveTranscript.innerHTML = `<span class="text-white font-medium">${transcript}</span>`;
          } else {
            // Show interim transcript in gray
            liveTranscript.innerHTML = `<span class="text-gray-400">${transcript}</span>`;
          }
          // Auto-scroll to bottom
          liveTranscript.scrollTop = liveTranscript.scrollHeight;
        }

        // Update last transcript
        if (isFinal) {
          lastTranscript = transcript;

          // Clear existing timer
          if (transcriptTimer) {
            clearTimeout(transcriptTimer);
          }

          // If speech_final is true, process immediately
          if (speechFinal) {
            console.log('✅ Speech completed (speech_final):', transcript);
            handleFinalTranscript(transcript);
          } else {
            // Otherwise, wait 2.5 seconds of no new final transcripts before processing
            transcriptTimer = setTimeout(() => {
              if (lastTranscript && !isSpeaking) {
                console.log('✅ Speech completed (timeout):', lastTranscript);
                handleFinalTranscript(lastTranscript);
                lastTranscript = '';
              }
            }, 2500);
          }
        }
      });

      deepgramConnection.on(window.deepgram.LiveTranscriptionEvents.Error, (err) => {
        console.error('❌ Deepgram error:', err);
        logStatus('⚠️ Transcription error: ' + err.message);
      });

      deepgramConnection.on(window.deepgram.LiveTranscriptionEvents.Metadata, (data) => {
        console.log('📊 Deepgram metadata:', data);
      });

      logStatus("🎤 Initializing real-time transcription...");
      return true;

    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
      logStatus('⚠️ Could not initialize real-time transcription');
      return false;
    }
  }

  async function handleFinalTranscript(transcript) {
    if (!transcript || !transcript.trim()) {
      logStatus("⚠️ No speech detected");
      return;
    }

    // Clear transcript timer
    if (transcriptTimer) {
      clearTimeout(transcriptTimer);
      transcriptTimer = null;
    }
    lastTranscript = '';

    // Clear live transcript display
    if (liveTranscript) {
      liveTranscript.innerHTML = '<span class="text-gray-500 italic">Processing...</span>';
    }

    try {
      isSpeaking = true;
      isListening = false;

      logStatus("📝 You said: " + transcript);
      updateConversationState("🤖 Avatar thinking...");

      // Send to LLM
      const llmResp = await postPromptToLLM(transcript);
      const botText = (llmResp?.text || "").trim();

      if (!botText) {
        logStatus("⚠️ Empty response from LLM, using fallback");
        const fallbackText = "Could you please elaborate on that?";
        logStatus("💬 Sarah: " + fallbackText);

        if (sessionInfo && sessionToken) {
          updateConversationState("🗣️ Avatar speaking...");
          await heygenSendTask(sessionInfo.session_id, sessionToken, fallbackText);
          await new Promise(r => setTimeout(r, 4000));
        }
      } else {
        logStatus("💬 Sarah: " + botText);

        if (sessionInfo && sessionToken) {
          updateConversationState("🗣️ Avatar speaking...");
          await heygenSendTask(sessionInfo.session_id, sessionToken, botText);

          // Wait for avatar to finish speaking
          const speakingDuration = Math.max(1500, botText.length * 40);
          await new Promise(r => setTimeout(r, speakingDuration));
        }
      }

      isSpeaking = false;

      // Resume listening
      if (conversationActive && isDeepgramConnected) {
        logStatus("✅ Ready for your response...");
        updateConversationState("🎤 Listening...");
        isListening = true;

        // Reset live transcript display
        if (liveTranscript) {
          liveTranscript.innerHTML = '<span class="text-gray-500 italic">Waiting for speech...</span>';
        }
      }

    } catch (e) {
      logStatus("Error processing speech: " + e);
      isSpeaking = false;
      if (conversationActive && isDeepgramConnected) {
        isListening = true;
        updateConversationState("🎤 Listening...");
      }
    }
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
    } catch { }
  }

  // Always force repeat mode
  async function heygenSendTask(sid, token, text) {
    if (!sid || !token) throw new Error("No active session");
    if (!text || text.trim().length === 0) {
      logStatus("⚠️ Attempted to send empty text to HeyGen, skipping");
      return { code: 0, message: "Empty text skipped" };
    }
    logStatus(`Sending text to HeyGen avatar: "${text.substring(0, 50)}..."`);
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
          mediaElement.play().catch(() => { });
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
    // Use WebSocket if connected, otherwise fallback to HTTP
    if (wsConnected && ws && ws.readyState === WebSocket.OPEN) {
      logStatus("📤 Sending audio via WebSocket...");
      try {
        return await sendAudioViaWebSocket(blob);
      } catch (error) {
        logStatus("⚠️ WebSocket STT failed, using HTTP fallback");
        console.error("WebSocket STT error:", error);
        // Fall through to HTTP
      }
    }

    // HTTP fallback
    logStatus("Uploading audio to backend STT (HTTP)...");
    const fd = new FormData();
    fd.append("audio", blob, "clip.webm");
    const res = await fetch(`${BACKEND_BASE}/stt`, { method: "POST", body: fd });
    return safeJson(res);
  }

  async function postPromptToLLM(prompt) {
    // Use WebSocket if connected, otherwise fallback to HTTP
    if (wsConnected && ws && ws.readyState === WebSocket.OPEN) {
      logStatus("🤖 Sending prompt via WebSocket...");
      try {
        return await sendPromptViaWebSocket(prompt);
      } catch (error) {
        logStatus("⚠️ WebSocket LLM failed, using HTTP fallback");
        console.error("WebSocket LLM error:", error);
        // Fall through to HTTP
      }
    }

    // HTTP fallback
    logStatus("Calling backend LLM (Gemini - HTTP)...");
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
    const isSilent = average < 3; // Very low threshold to capture more audio

    // Debug: Log audio levels more frequently for troubleshooting
    if (Math.random() < 0.1) { // 10% of the time
      console.log(`🎤 Audio level: ${average.toFixed(2)} (threshold: 3, ${isSilent ? 'SILENT' : 'SPEAKING'})`);
    }

    if (isSilent) {
      if (!silenceTimer && recordedChunks.length > 0) {
        const recordingDuration = Date.now() - recordingStartTime;
        if (recordingDuration > MIN_RECORDING_TIME) {
          silenceTimer = setTimeout(() => {
            console.log("⏸️ Silence detected after speech, processing...");
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
      // Log when speech is detected
      if (Math.random() < 0.05) {
        console.log("🗣️ Speech detected!");
      }
    }

    if (isListening) {
      requestAnimationFrame(detectSilence);
    }
  }

  // ----------------- Continuous Audio Recording -----------------
  async function startListening() {
    if (isListening || isSpeaking || !conversationActive) return;

    // Show stop button when listening starts
    if (stopSpeakingBtn) stopSpeakingBtn.style.display = 'flex';

    try {
      recordedChunks = [];
      recordingStartTime = Date.now();

      if (!audioStream) {
        logStatus("🎤 Requesting microphone access...");
        console.log("Requesting microphone permissions...");

        try {
          // Request microphone with better constraints
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: false,  // Disable to capture more audio
              autoGainControl: true,
              sampleRate: 44100  // Higher sample rate for better quality
            }
          });

          console.log("✅ Microphone access granted");
          console.log("Audio tracks:", audioStream.getAudioTracks());

          // Check if audio track is enabled
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) {
            console.log("Audio track settings:", audioTrack.getSettings());
            console.log("Audio track enabled:", audioTrack.enabled);
          }

          // Set up audio analysis for VAD
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(audioStream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.3;  // Reduce smoothing for faster response
          source.connect(analyser);

          logStatus("✅ Microphone initialized successfully");
        } catch (micError) {
          console.error("Microphone access error:", micError);
          logStatus("❌ Microphone access denied or unavailable");
          logStatus("   Please allow microphone access in browser settings");
          throw micError;
        }
      }

      // Use Deepgram live streaming if connected
      if (isDeepgramConnected && deepgramConnection) {
        logStatus("🎤 Starting live transcription...");

        // Create MediaRecorder to stream audio to Deepgram
        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/webm";
        }

        recorder = new MediaRecorder(audioStream, {
          mimeType,
          audioBitsPerSecond: 16000  // 16kbps is sufficient for speech
        });

        recorder.ondataavailable = (ev) => {
          if (ev.data?.size > 0 && isDeepgramConnected) {
            // Send audio chunk directly to Deepgram
            console.log(`📤 Sending ${ev.data.size} bytes to Deepgram`);
            deepgramConnection.send(ev.data);
          } else {
            console.log(`⚠️ Not sending audio: size=${ev.data?.size}, connected=${isDeepgramConnected}`);
          }
        };

        recorder.onerror = (e) => {
          console.error("MediaRecorder error:", e);
          logStatus("❌ Recording error: " + e.error);
        };

        recorder.start(250); // Send chunks every 250ms
        isListening = true;
        updateConversationState("🎤 Listening (Live)...");
        logStatus("👂 Listening with real-time transcription...");
        console.log("🎤 Live streaming to Deepgram started");

        // Show live transcript box
        if (liveTranscriptBox) {
          liveTranscriptBox.style.display = 'block';
        }
        if (liveTranscript) {
          liveTranscript.innerHTML = '<span class="text-gray-500 italic">Waiting for speech...</span>';
        }

      } else {
        logStatus("⚠️ Live transcription not available, using fallback (Batch Mode)");

        // Fallback: Standard recording for batch processing
        let mimeType = "audio/webm";
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        }

        recorder = new MediaRecorder(audioStream, { mimeType });

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunks.push(ev.data);
        };

        recorder.start(100);
        isListening = true;
        updateConversationState("🎤 Listening (Batch)...");
        logStatus("👂 Listening (Batch Mode)...");

        // Start VAD monitoring
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
          const totalChunks = recordedChunks.length;
          recordedChunks = [];

          console.log(`📦 Audio blob created: ${blob.size} bytes from ${totalChunks} chunks`);
          logStatus(`📦 Audio captured: ${blob.size} bytes from ${totalChunks} chunks`);

          if (blob.size < 50) {  // Further reduced minimum to 50 bytes
            logStatus(`⚠️ Audio too short (${blob.size} bytes), resuming listening...`);
            console.log(`⚠️ Audio blob size: ${blob.size} bytes (too small, minimum 50)`);
            isSpeaking = false;
            if (conversationActive) setTimeout(() => startListening(), 500);
            resolve();
            return;
          }

          console.log(`✅ Audio blob size: ${blob.size} bytes - sending to STT`);
          console.log(`   Recording duration: ${Date.now() - recordingStartTime}ms`);

          try {
            isSpeaking = true;
            updateConversationState("🤖 Avatar thinking...");

            const sttResp = await postAudioToSTT(blob);
            console.log("STT Response:", sttResp);
            const userText = (sttResp?.text || "").trim();

            if (!userText) {
              logStatus(`⚠️ No speech detected in audio (STT response: ${JSON.stringify(sttResp)})`);
              logStatus("💡 Try speaking louder or check microphone settings");
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

            // Debug logging
            console.log("LLM Response:", llmResp);
            console.log("Bot Text:", botText);

            if (!botText) {
              logStatus("⚠️ Empty response from LLM, using fallback");
              const fallbackText = "Could you please elaborate on that?";
              logStatus("💬 Sarah: " + fallbackText);

              if (sessionInfo && sessionToken) {
                updateConversationState("🗣️ Avatar speaking...");
                await heygenSendTask(sessionInfo.session_id, sessionToken, fallbackText);
                await new Promise(r => setTimeout(r, 4000));
              }
            } else {
              logStatus("💬 Sarah: " + botText);

              if (sessionInfo && sessionToken) {
                updateConversationState("🗣️ Avatar speaking...");
                await heygenSendTask(sessionInfo.session_id, sessionToken, botText);

                // Wait for avatar to finish speaking (optimized for speed)
                const speakingDuration = Math.max(1500, botText.length * 40); // ~40ms per character (faster)
                await new Promise(r => setTimeout(r, speakingDuration));
              }
            }

            isSpeaking = false;

            // Auto-resume listening for next turn
            if (conversationActive) {
              logStatus("✅ Ready for your response...");
              setTimeout(() => startListening(), 300);
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

      // Hide stop button when listening stops
      if (stopSpeakingBtn) stopSpeakingBtn.style.display = 'none';

      updateConversationState("⏸️ Conversation paused");
    }

    // Manual stop speaking function
    async function manualStopSpeaking() {
      if (!isListening || !recorder) {
        logStatus("⚠️ Not currently listening");
        return;
      }

      const recordingDuration = Date.now() - recordingStartTime;
      logStatus(`🛑 Manual stop - processing your speech... (recorded ${recordingDuration}ms, ${recordedChunks.length} chunks)`);

      // Immediately trigger processing
      stopListeningAndProcess();
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

        logStatus("✅ Welcome ${userInfo.name}!");
        logStatus(`   Interview Mode: ${userInfo.mock_interview ? 'Mock (' + userInfo.tone + ')' : 'Real'}`);

        // Show evaluate button after session starts
        if (evaluateBtn) evaluateBtn.style.display = 'flex';

        // Connect WebSocket for faster communication
        try {
          await connectWebSocket();
        } catch (error) {
          logStatus("⚠️ WebSocket unavailable, using HTTP (slower)");
        }

        // Initialize Deepgram live streaming
        const deepgramReady = await initDeepgramLiveStreaming();
        if (!deepgramReady) {
          logStatus("⚠️ Live transcription unavailable");
        }

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
        }, 4000);

      } catch (e) {
        logStatus("Start error: " + e);
        startBtn.disabled = false;
        conversationActive = false;
      }
    }

    async function stopSessionFlow() {
      conversationActive = false;
      stopListening();

      // Close WebSocket connection
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        logStatus("🔌 WebSocket closed");
      }
      wsConnected = false;

      // Close Deepgram live connection
      if (deepgramConnection) {
        try {
          deepgramConnection.finish();
          logStatus("🔌 Deepgram connection closed");
        } catch (e) {
          console.error("Error closing Deepgram:", e);
        }
        deepgramConnection = null;
        isDeepgramConnected = false;
      }

      if (sessionInfo && sessionToken) await heygenStopSession(sessionInfo.session_id, sessionToken);
      if (room) { try { room.disconnect(); } catch { } room = null; }
      mediaElement.srcObject = null;
      sessionInfo = null; sessionToken = null;
      isSpeaking = false;

      // Note: We keep user webcam running even after session ends
      // User can refresh page to stop it

      updateConversationState("⏹️ Session ended");
      logStatus("Session stopped");
      startBtn.disabled = false;

      // Keep evaluate button visible after ending session
      if (evaluateBtn) evaluateBtn.style.display = 'flex';
    }

    async function evaluateAndGenerateReport() {
      if (!confirm("End interview and generate evaluation report?")) return;

      try {
        evaluateBtn.disabled = true;
        evaluateBtn.innerHTML = '<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Evaluating...';

        logStatus("🔍 Analyzing interview performance...");

        const response = await fetch(`${BACKEND_BASE}/api/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
          const evaluation = result.evaluation;
          logStatus(`✅ Evaluation Complete!`);
          logStatus(`   Overall Score: ${evaluation.overall_score}/100`);
          logStatus(`   Technical: ${evaluation.technical_score}/100`);
          logStatus(`   Communication: ${evaluation.communication_score}/100`);
          logStatus(`   Experience: ${evaluation.experience_score}/100`);

          // Download PDF
          const downloadUrl = `${BACKEND_BASE}/api/download-report/${result.report_filename}`;
          logStatus(`📄 Downloading PDF report...`);

          // Create download link and click it
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = 'Interview_Evaluation_Report.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          logStatus(`✅ Report downloaded successfully!`);

          alert(`Evaluation Complete!\n\nOverall Score: ${evaluation.overall_score}/100\n\nPDF report has been downloaded.`);

          // Reset button
          evaluateBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generate Report';
          evaluateBtn.disabled = false;
        } else {
          logStatus(`❌ Error: ${result.error}`);
          alert(`Error: ${result.error}`);
          evaluateBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generate Report';
          evaluateBtn.disabled = false;
        }
      } catch (error) {
        logStatus(`❌ Evaluation failed: ${error.message}`);
        alert(`Error: ${error.message}`);
        evaluateBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generate Report';
        evaluateBtn.disabled = false;
      }
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

        console.log("Manual LLM Response:", llmResp);
        console.log("Manual Bot Text:", botText);

        if (!botText) {
          logStatus("⚠️ Empty response from LLM");
          const fallbackText = "I didn't quite catch that. Could you rephrase?";
          logStatus("💬 Sarah: " + fallbackText);
          await heygenSendTask(sessionInfo.session_id, sessionToken, fallbackText);
          await new Promise(r => setTimeout(r, 4000));
        } else {
          logStatus("💬 Sarah: " + botText);
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
          setTimeout(() => startListening(), 300);
        }
      } catch (e) {
        logStatus("Manual input error: " + e);
        isSpeaking = false;
        if (conversationActive && wasListening) {
          setTimeout(() => startListening(), 1000);
        }
      }
    }

    // ----------------- User Webcam Setup -----------------
    async function startUserWebcam() {
      try {
        logStatus("📹 Starting your webcam...");
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: "user"
          }
        });

        if (userWebcam) {
          userWebcam.srcObject = videoStream;
          logStatus("✅ Your webcam is active");
        }
      } catch (e) {
        logStatus("⚠️ Could not access webcam: " + e.message);
        console.warn("Webcam error:", e);
      }
    }

    function stopUserWebcam() {
      if (userWebcam && userWebcam.srcObject) {
        userWebcam.srcObject.getTracks().forEach(track => track.stop());
        userWebcam.srcObject = null;
        logStatus("📹 Webcam stopped");
      }
    }

    // ----------------- NEW FEATURES -----------------

    // Microphone Test
    const micTestBtn = document.getElementById("micTestBtn");
    const micTestResult = document.getElementById("micTestResult");
    const micTranscript = document.getElementById("micTranscript");
    const transcriptText = document.getElementById("transcriptText");

    micTestBtn?.addEventListener("click", async () => {
      try {
        micTestBtn.disabled = true;
        micTestBtn.innerHTML = '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Testing...';
        micTestResult.style.display = 'block';
        micTestResult.textContent = 'Requesting microphone access...';
        micTestResult.className = 'text-xs text-center py-2 text-yellow-400';
        micTranscript.style.display = 'block';
        transcriptText.textContent = 'Waiting for audio...';

        // Request microphone
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micTestResult.textContent = '✅ Microphone access granted!';
        micTestResult.className = 'text-xs text-center py-2 text-green-400';

        // Set up recording
        const testRecorder = new MediaRecorder(testStream, { mimeType: 'audio/webm' });
        const testChunks = [];
        testRecorder.ondataavailable = (ev) => {
          if (ev.data?.size > 0) testChunks.push(ev.data);
        };

        // Test audio levels
        const testContext = new (window.AudioContext || window.webkitAudioContext)();
        const testSource = testContext.createMediaStreamSource(testStream);
        const testAnalyser = testContext.createAnalyser();
        testAnalyser.fftSize = 2048;
        testSource.connect(testAnalyser);

        micTestResult.textContent = '🎤 Speak now to test (5 seconds)...';
        micTestResult.className = 'text-xs text-center py-2 text-blue-400';
        transcriptText.textContent = 'Recording...';

        // Start recording
        testRecorder.start(200);

        // Monitor audio for 3 seconds
        let maxLevel = 0;
        const monitorInterval = setInterval(() => {
          const dataArray = new Uint8Array(testAnalyser.frequencyBinCount);
          testAnalyser.getByteFrequencyData(dataArray);
          const level = dataArray.reduce((a, b) => a + b) / dataArray.length;
          maxLevel = Math.max(maxLevel, level);
          micTestResult.textContent = `🎤 Audio level: ${level.toFixed(1)} (max: ${maxLevel.toFixed(1)})`;
        }, 100);

        setTimeout(async () => {
          clearInterval(monitorInterval);
          testRecorder.stop();

          testRecorder.onstop = async () => {
            testStream.getTracks().forEach(t => t.stop());
            testContext.close();

            if (maxLevel > 3) {
              micTestResult.textContent = `✅ Microphone working! Max level: ${maxLevel.toFixed(1)}`;
              micTestResult.className = 'text-xs text-center py-2 text-green-400';
              logStatus(`✅ Microphone test passed (max level: ${maxLevel.toFixed(1)})`);

              // Transcribe audio
              transcriptText.textContent = 'Transcribing...';
              transcriptText.className = 'text-yellow-300 italic';

              try {
                const audioBlob = new Blob(testChunks, { type: 'audio/webm' });
                const fd = new FormData();
                fd.append("audio", audioBlob, "test.webm");
                const sttRes = await fetch(`${BACKEND_BASE}/stt`, { method: "POST", body: fd });
                const sttData = await sttRes.json();

                if (sttData.text && sttData.text.trim()) {
                  transcriptText.textContent = `"${sttData.text}"`;
                  transcriptText.className = 'text-green-300';
                  logStatus(`📝 Transcript: ${sttData.text}`);

                  // Hide transcript after 10 seconds
                  setTimeout(() => {
                    micTranscript.style.display = 'none';
                  }, 10000);
                } else {
                  transcriptText.textContent = 'No speech detected in audio';
                  transcriptText.className = 'text-gray-400 italic';

                  // Hide after 10 seconds
                  setTimeout(() => {
                    micTranscript.style.display = 'none';
                  }, 10000);
                }
              } catch (e) {
                transcriptText.textContent = `Transcription error: ${e.message}`;
                transcriptText.className = 'text-red-400';

                // Hide after 10 seconds
                setTimeout(() => {
                  micTranscript.style.display = 'none';
                }, 10000);
              }
            } else {
              micTestResult.textContent = `⚠️ No audio detected. Check microphone volume. Max: ${maxLevel.toFixed(1)}`;
              micTestResult.className = 'text-xs text-center py-2 text-red-400';
              transcriptText.textContent = 'No audio detected';
              transcriptText.className = 'text-gray-400 italic';
              logStatus(`⚠️ Microphone test failed - no audio detected`);
            }

            micTestBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg> Test Microphone';
            micTestBtn.disabled = false;
          };
        }, 5000);

      } catch (error) {
        console.error("Microphone test error:", error);
        micTestResult.textContent = `❌ Error: ${error.message}`;
        micTestResult.className = 'text-xs text-center py-2 text-red-400';
        micTestResult.style.display = 'block';
        logStatus(`❌ Microphone test error: ${error.message}`);

        micTestBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg> Test Microphone';
        micTestBtn.disabled = false;
      }
    });

    // Coding Assessment
    const codingBtn = document.getElementById("codingBtn");
    codingBtn?.addEventListener("click", () => {
      window.location.href = '/coding-assessment';
    });

    // Body Language Analysis
    const bodyLanguageBtn = document.getElementById("bodyLanguageBtn");
    const bodyLanguageScores = document.getElementById("bodyLanguageScores");
    const postureScore = document.getElementById("postureScore");
    const eyeContactScore = document.getElementById("eyeContactScore");
    const confidenceLevel = document.getElementById("confidenceLevel");
    const facialExpression = document.getElementById("facialExpression");
    let bodyLanguageInterval = null;

    function updateBodyLanguageUI(analysis) {
      if (!analysis) return;

      // Update scores
      postureScore.textContent = `${analysis.posture_score}/100`;
      eyeContactScore.textContent = `${analysis.eye_contact_score}/100`;
      confidenceLevel.textContent = analysis.confidence_level;
      facialExpression.textContent = analysis.facial_expression;

      // Color code based on scores
      postureScore.className = analysis.posture_score >= 80 ? 'font-bold text-green-400' :
        analysis.posture_score >= 60 ? 'font-bold text-yellow-400' :
          'font-bold text-red-400';

      eyeContactScore.className = analysis.eye_contact_score >= 80 ? 'font-bold text-green-400' :
        analysis.eye_contact_score >= 60 ? 'font-bold text-yellow-400' :
          'font-bold text-red-400';
    }

    bodyLanguageBtn?.addEventListener("click", async () => {
      if (bodyLanguageInterval) {
        // Stop analysis
        clearInterval(bodyLanguageInterval);
        bodyLanguageInterval = null;
        bodyLanguageBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Body Language Score';
        bodyLanguageBtn.classList.remove('bg-green-600');
        bodyLanguageScores.style.display = 'none';
        logStatus("🛑 Body language analysis stopped");
      } else {
        // Start analysis
        bodyLanguageBtn.innerHTML = '<svg class="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Analyzing...';
        bodyLanguageBtn.classList.add('bg-green-600');
        bodyLanguageScores.style.display = 'block';
        logStatus("👁️ Body language analysis started (demo mode)...");

        // Initial analysis
        try {
          const response = await fetch(`${BACKEND_BASE}/api/analyze-body-language`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          const result = await response.json();

          if (result.success) {
            updateBodyLanguageUI(result.analysis);
            logStatus(`📊 Body Language: Posture ${result.analysis.posture_score}/100, Eye Contact ${result.analysis.eye_contact_score}/100, Confidence: ${result.analysis.confidence_level}`);
          }
        } catch (e) {
          console.error("Body language analysis error:", e);
        }

        // Analyze every 10 seconds
        bodyLanguageInterval = setInterval(async () => {
          try {
            const response = await fetch(`${BACKEND_BASE}/api/analyze-body-language`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
              updateBodyLanguageUI(result.analysis);
              logStatus(`📊 Body Language: Posture ${result.analysis.posture_score}/100, Eye Contact ${result.analysis.eye_contact_score}/100, Confidence: ${result.analysis.confidence_level}`);
            }
          } catch (e) {
            console.error("Body language analysis error:", e);
          }
        }, 10000);
      }
    });

    // ----------------- Event wiring -----------------
    startBtn?.addEventListener("click", startSessionFlow);
    stopSpeakingBtn?.addEventListener("click", manualStopSpeaking);
    closeBtn?.addEventListener("click", stopSessionFlow);
    talkBtn?.addEventListener("click", onTalkClick);
    evaluateBtn?.addEventListener("click", evaluateAndGenerateReport);

    // Start user webcam on page load
    startUserWebcam();

    logStatus("🎯 UI ready. Click 'Start Session' to begin live conversation!");
    logStatus("🤖 AI Features: Auto CV-based questions, Contextual follow-ups, Body language analysis");
    logStatus("💡 Questions will be automatically generated from candidate's resume");
    logStatus("💡 Questions will be automatically generated from candidate's resume");
  };

