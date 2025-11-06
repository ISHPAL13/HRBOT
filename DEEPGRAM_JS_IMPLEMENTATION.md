# 🎙️ Deepgram JavaScript SDK Implementation Guide

## Overview

This implementation uses Deepgram's JavaScript SDK for **client-side real-time speech-to-text** via WebSocket streaming. This is much more efficient than the previous approach of recording audio and uploading to the backend.

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   Browser   │ ◄─────────────────────────► │  Deepgram    │
│  (Frontend) │    Live Audio Streaming     │     API      │
└─────────────┘                             └──────────────┘
       │
       │ HTTP (API Key Request)
       ▼
┌─────────────┐
│   Flask     │
│  (Backend)  │
└─────────────┘
```

## Benefits

✅ **Real-time**: Instant transcription as you speak  
✅ **Lower latency**: No file upload/download overhead  
✅ **Better accuracy**: Streaming provides context  
✅ **Efficient**: Direct WebSocket connection  
✅ **Scalable**: No backend processing needed  

## Files Modified

### 1. Backend (`app.py`)
- ❌ Removed: Deepgram Python SDK dependency
- ✅ Added: `/deepgram/api-key` endpoint to provide API key to frontend
- ✅ Removed: `/stt` endpoint (no longer needed)

### 2. Frontend HTML (`templates/index.html`)
- ✅ Added: Deepgram JS SDK via CDN
- ✅ Added: `deepgram-stt.js` module

### 3. New Module (`static/deepgram-stt.js`)
- ✅ Created: `DeepgramSTT` class for managing live transcription
- ✅ Features:
  - WebSocket connection management
  - Real-time audio streaming
  - Transcript event handling
  - Error handling

### 4. Main Script (`static/script.js`)
- 🔄 **TODO**: Update to use `DeepgramSTT` instead of `postAudioToSTT()`

## How It Works

### Step 1: Initialize Deepgram
```javascript
const deepgramSTT = new DeepgramSTT();
await deepgramSTT.initialize(); // Gets API key from backend
```

### Step 2: Set Up Callbacks
```javascript
deepgramSTT.onTranscript((transcript) => {
  console.log("User said:", transcript);
  // Process the transcript (send to LLM, etc.)
});

deepgramSTT.onError((error) => {
  console.error("STT Error:", error);
});
```

### Step 3: Start Listening
```javascript
// Get microphone stream
const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Start live transcription
await deepgramSTT.startListening(audioStream);
```

### Step 4: Stop Listening
```javascript
deepgramSTT.stopListening();
```

## Integration with Existing Code

### Current Flow (Old)
```
1. Record audio with MediaRecorder
2. Wait for silence
3. Stop recording
4. Upload audio blob to /stt endpoint
5. Backend processes with Whisper
6. Return transcript
```

### New Flow (Deepgram)
```
1. Start Deepgram WebSocket connection
2. Stream audio in real-time
3. Receive transcripts as events
4. Process transcript immediately
```

## Required Changes to `script.js`

### Replace `postAudioToSTT()` function:

**Old:**
```javascript
async function postAudioToSTT(blob) {
  logStatus("Uploading audio to backend STT...");
  const fd = new FormData();
  fd.append("audio", blob, "clip.webm");
  const res = await fetch(`${BACKEND_BASE}/stt`, { method: "POST", body: fd });
  return safeJson(res);
}
```

**New:**
```javascript
// Initialize Deepgram STT at startup
let deepgramSTT = null;

async function initializeSTT() {
  deepgramSTT = new DeepgramSTT();
  await deepgramSTT.initialize();
  
  // Set up transcript handler
  deepgramSTT.onTranscript(async (transcript) => {
    logStatus(`📝 You said: ${transcript}`);
    
    // Stop listening while processing
    deepgramSTT.stopListening();
    isSpeaking = true;
    
    // Send to LLM
    const llmResp = await postPromptToLLM(transcript);
    const aiText = llmResp?.text || "I didn't catch that.";
    
    // Speak response
    await speakText(aiText);
    
    // Resume listening
    isSpeaking = false;
    await startListening();
  });
  
  deepgramSTT.onError((error) => {
    logStatus(`❌ STT Error: ${error.message}`);
  });
}

// Call during startup
await initializeSTT();
```

### Update `startListening()` function:

**Old:**
```javascript
async function startListening() {
  // ... get audioStream ...
  recorder = new MediaRecorder(audioStream, { mimeType });
  recorder.ondataavailable = (ev) => {
    if (ev.data?.size > 0) recordedChunks.push(ev.data);
  };
  recorder.start();
  detectSilence(); // Monitor for silence
}
```

**New:**
```javascript
async function startListening() {
  if (isListening || isSpeaking || !conversationActive) return;
  
  try {
    if (!audioStream) {
      audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    }
    
    // Start Deepgram live transcription
    await deepgramSTT.startListening(audioStream);
    isListening = true;
    updateConversationState("🎤 Listening...");
    logStatus("👂 Listening for your response...");
    
  } catch (error) {
    logStatus(`❌ Failed to start listening: ${error.message}`);
  }
}
```

### Update `stopListeningAndProcess()`:

**Old:**
```javascript
async function stopListeningAndProcess() {
  if (!isListening) return;
  isListening = false;
  recorder.stop();
  
  // Wait for final data
  await new Promise(resolve => {
    recorder.onstop = resolve;
  });
  
  // Create blob and send to STT
  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  const sttResp = await postAudioToSTT(blob);
  // ... process transcript ...
}
```

**New:**
```javascript
// No longer needed! Transcripts come via callback
// Just stop listening when needed:
function stopListening() {
  if (deepgramSTT && deepgramSTT.isListening) {
    deepgramSTT.stopListening();
    isListening = false;
    updateConversationState("⏸️ Paused");
  }
}
```

## Deepgram Configuration Options

The `DeepgramSTT` class uses these settings:

```javascript
{
  model: "nova-2",           // Latest accurate model
  language: "en-US",         // English (US)
  smart_format: true,        // Auto-format numbers, dates, etc.
  punctuate: true,           // Add punctuation
  interim_results: false,    // Only final transcripts
  endpointing: 300,          // 300ms silence before finalizing
}
```

### Available Models:
- `nova-2` - Latest, most accurate (recommended)
- `nova` - Previous generation
- `enhanced` - Good balance
- `base` - Fastest

### Other Options:
- `interim_results: true` - Get partial transcripts while speaking
- `endpointing: 500` - Increase for longer pauses
- `diarize: true` - Identify different speakers
- `filler_words: true` - Include "um", "uh", etc.

## Testing

### 1. Start the server:
```bash
python app.py
```

### 2. Open browser console:
```
http://localhost:5000
```

### 3. Watch for logs:
```
✅ Deepgram API key obtained
🎤 Deepgram connection opened
📝 Transcript: Hello, how are you?
```

### 4. Test microphone:
- Click "Start Interview"
- Speak clearly
- Watch for real-time transcripts in console

## Troubleshooting

### "Failed to get Deepgram API key"
- Set `DEEPGRAM_API_KEY` environment variable
- Or edit `app.py` line 28

### "Deepgram connection error"
- Check internet connection
- Verify API key is valid
- Check Deepgram status: https://status.deepgram.com/

### "No transcripts appearing"
- Check browser console for errors
- Verify microphone permissions granted
- Test microphone in browser settings
- Increase volume/speak louder

### "Transcripts are delayed"
- Reduce `endpointing` value (e.g., 200ms)
- Check network latency
- Try `interim_results: true` for faster feedback

## Security Note

⚠️ **Important**: The current implementation exposes the Deepgram API key to the frontend. This is acceptable for development but **NOT recommended for production**.

### Production Recommendations:

1. **Use Temporary Keys**: Generate short-lived keys on the backend
2. **Proxy Requests**: Route Deepgram requests through your backend
3. **Rate Limiting**: Implement usage limits per user
4. **Key Rotation**: Regularly rotate API keys

Example proxy approach:
```python
@app.route("/deepgram/proxy", methods=["POST"])
def deepgram_proxy():
    # Validate user session
    if 'user_name' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Forward request to Deepgram with server-side key
    # Return response to client
```

## Next Steps

1. ✅ Backend updated (API key endpoint added)
2. ✅ Frontend HTML updated (Deepgram SDK added)
3. ✅ Deepgram STT module created
4. 🔄 **TODO**: Update `script.js` to use Deepgram STT
5. 🔄 **TODO**: Test end-to-end flow
6. 🔄 **TODO**: Remove old MediaRecorder code

## Resources

- **Deepgram Docs**: https://developers.deepgram.com/docs
- **JS SDK Guide**: https://developers.deepgram.com/docs/js-sdk
- **Live Streaming**: https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio
- **API Reference**: https://developers.deepgram.com/reference

---

**Ready to implement! Follow the integration steps above to complete the migration.** 🚀
