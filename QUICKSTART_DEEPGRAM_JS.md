# 🚀 Quick Start: Deepgram JavaScript SDK

## What Was Done

✅ **Backend Changes**
- Removed Deepgram Python SDK dependency
- Added `/deepgram/api-key` endpoint to provide API key to frontend
- Removed old `/stt` endpoint

✅ **Frontend Changes**
- Added Deepgram JS SDK via CDN in `index.html`
- Created `deepgram-stt.js` module for real-time transcription
- Ready to integrate with existing `script.js`

## Setup Steps

### 1. Get Deepgram API Key

Sign up and get your API key:
```
https://console.deepgram.com/signup
```

Free tier: **45,000 minutes/year** (no credit card required)

### 2. Configure API Key

**Windows PowerShell:**
```powershell
$env:DEEPGRAM_API_KEY="your_actual_deepgram_api_key_here"
```

**Or edit `backend/app.py` line 28:**
```python
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "your_actual_key_here")
```

### 3. Start the Server

```bash
cd backend
python app.py
```

### 4. Test the Integration

Open browser console and check:
```
http://localhost:5000
```

You should see:
```
✅ Deepgram API key obtained
🎤 Deepgram connection opened
```

## How It Works

### Real-Time Streaming Architecture

```
User speaks → Microphone → WebSocket → Deepgram API → Transcript → Your App
                                ↑                          ↓
                          Live Audio Stream         Real-time Text
```

### Key Differences from Old Approach

| Feature | Old (Whisper) | New (Deepgram JS) |
|---------|---------------|-------------------|
| **Processing** | Backend | Frontend |
| **Method** | Upload file | WebSocket stream |
| **Latency** | 2-5 seconds | <1 second |
| **Memory** | ~2GB backend | Minimal |
| **Accuracy** | Good | Excellent |
| **Setup** | Complex | Simple |

## Integration with Your Code

The `DeepgramSTT` class is ready to use. Here's a minimal example:

```javascript
// Initialize
const stt = new DeepgramSTT();
await stt.initialize();

// Handle transcripts
stt.onTranscript((text) => {
  console.log("User said:", text);
  // Send to your LLM, update UI, etc.
});

// Start listening
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
await stt.startListening(stream);

// Stop when done
stt.stopListening();
```

## Next Steps

### Option A: Full Integration (Recommended)

Follow the detailed guide in `DEEPGRAM_JS_IMPLEMENTATION.md` to:
1. Update `script.js` to use `DeepgramSTT`
2. Remove old MediaRecorder code
3. Test end-to-end flow

### Option B: Test Standalone

Create a simple test page to verify Deepgram works:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/@deepgram/sdk"></script>
  <script src="/static/deepgram-stt.js"></script>
</head>
<body>
  <button id="start">Start</button>
  <button id="stop">Stop</button>
  <div id="transcript"></div>
  
  <script>
    const stt = new DeepgramSTT();
    let stream = null;
    
    stt.onTranscript((text) => {
      document.getElementById('transcript').textContent = text;
    });
    
    document.getElementById('start').onclick = async () => {
      await stt.initialize();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await stt.startListening(stream);
    };
    
    document.getElementById('stop').onclick = () => {
      stt.stopListening();
    };
  </script>
</body>
</html>
```

## Troubleshooting

### API Key Not Working
```bash
# Check if environment variable is set
echo $env:DEEPGRAM_API_KEY  # Windows PowerShell

# Restart terminal after setting
# Restart Flask server
```

### No Transcripts
1. Open browser console (F12)
2. Check for errors
3. Verify microphone permissions
4. Test with: "Hello, this is a test"

### WebSocket Errors
- Check internet connection
- Verify API key is valid
- Check Deepgram status: https://status.deepgram.com/

## Benefits You'll Get

✅ **Instant Transcription**: See text as you speak  
✅ **Better Accuracy**: Deepgram's Nova-2 model  
✅ **Smart Formatting**: Auto-formats numbers, dates, etc.  
✅ **Lower Latency**: No upload/download delays  
✅ **Scalable**: No backend processing bottleneck  
✅ **Free Tier**: 45,000 minutes/year  

## Files Reference

- `backend/app.py` - Backend API key endpoint
- `backend/templates/index.html` - Deepgram SDK loaded
- `backend/static/deepgram-stt.js` - STT module (ready to use)
- `backend/static/script.js` - Main app (needs integration)
- `DEEPGRAM_JS_IMPLEMENTATION.md` - Detailed integration guide

## Support

- **Documentation**: `DEEPGRAM_JS_IMPLEMENTATION.md`
- **Deepgram Docs**: https://developers.deepgram.com/docs
- **API Status**: https://status.deepgram.com/

---

**Ready to go! Set your API key and start the server.** 🎉
