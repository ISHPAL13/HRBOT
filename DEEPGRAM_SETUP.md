# 🎙️ Deepgram API Setup Guide

This guide will help you set up Deepgram API for speech-to-text functionality in the HRBOT application.

## Why Deepgram?

Deepgram offers several advantages over Whisper:
- ⚡ **Faster**: Cloud-based processing with lower latency
- 💰 **Cost-effective**: Free tier with 45,000 minutes/year
- 🎯 **Accurate**: State-of-the-art speech recognition
- 🔧 **Easy to use**: Simple API integration
- 📊 **Scalable**: No local model loading required

## Step 1: Get Your Deepgram API Key

1. **Sign up for Deepgram**
   - Visit: https://console.deepgram.com/signup
   - Create a free account (no credit card required)

2. **Create a Project**
   - After login, you'll be in the Deepgram Console
   - Click "Create a New Project" or use the default project

3. **Generate API Key**
   - Navigate to "API Keys" section
   - Click "Create a New API Key"
   - Give it a name (e.g., "HRBOT STT")
   - Copy the API key (you won't be able to see it again!)

## Step 2: Configure Your Application

### Option A: Using Environment Variables (Recommended)

**Windows (PowerShell):**
```powershell
$env:DEEPGRAM_API_KEY="your_actual_deepgram_api_key_here"
```

**Windows (Command Prompt):**
```cmd
set DEEPGRAM_API_KEY=your_actual_deepgram_api_key_here
```

**Linux/Mac:**
```bash
export DEEPGRAM_API_KEY="your_actual_deepgram_api_key_here"
```

### Option B: Using .env File

1. Copy the example file:
   ```bash
   cd backend
   cp .env.example .env
   ```

2. Edit `.env` file and add your key:
   ```
   DEEPGRAM_API_KEY=your_actual_deepgram_api_key_here
   ```

3. Install python-dotenv if not already installed:
   ```bash
   pip install python-dotenv
   ```

4. Add to `app.py` (at the top):
   ```python
   from dotenv import load_dotenv
   load_dotenv()
   ```

### Option C: Direct Configuration (Not Recommended for Production)

Edit `backend/app.py` line 29:
```python
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "your_actual_deepgram_api_key_here")
```

## Step 3: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `deepgram-sdk==3.8.3` - Deepgram Python SDK
- All other required dependencies

## Step 4: Test the Integration

1. **Start the server:**
   ```bash
   python app.py
   ```

2. **Check the logs:**
   - You should see: "Initializing Deepgram client..."
   - No errors about missing API keys

3. **Test speech-to-text:**
   - Open http://localhost:5000
   - Login with your CV
   - Start the interview
   - Speak into your microphone
   - Check console logs for "STT Request (Deepgram)"

## Deepgram Features Used

The integration uses the following Deepgram features:

```python
options = PrerecordedOptions(
    model="nova-2",           # Latest accurate model
    language="en-US",         # English (US)
    smart_format=True,        # Auto-format numbers, dates, etc.
    punctuate=True,           # Add punctuation
    diarize=False,            # Single speaker
)
```

### Available Models:
- `nova-2` - Latest, most accurate (recommended)
- `nova` - Previous generation
- `enhanced` - Good balance of speed/accuracy
- `base` - Fastest, less accurate

### Supported Languages:
- `en-US` - English (US)
- `en-GB` - English (UK)
- `en-AU` - English (Australia)
- Many more: https://developers.deepgram.com/docs/languages

## Troubleshooting

### Error: "DEEPGRAM_API_KEY not configured"
- Make sure you've set the environment variable
- Restart your terminal/IDE after setting the variable
- Check for typos in the variable name

### Error: "Invalid API key"
- Verify your API key is correct
- Check if the key has been revoked in Deepgram Console
- Generate a new key if needed

### Error: "Transcription failed"
- Check your internet connection
- Verify audio file is valid (not empty)
- Check Deepgram API status: https://status.deepgram.com/

### Slow transcription
- Deepgram is typically very fast (<1 second)
- Check your internet speed
- Try a different model (e.g., `base` for faster processing)

## Free Tier Limits

Deepgram's free tier includes:
- ✅ 45,000 minutes of transcription per year
- ✅ All models (including nova-2)
- ✅ All features (smart formatting, punctuation, etc.)
- ✅ No credit card required

**Usage calculation:**
- Average interview: 30 minutes
- Free tier allows: ~1,500 interviews per year
- More than enough for development and testing!

## API Usage Monitoring

1. **Check usage in Deepgram Console:**
   - Go to https://console.deepgram.com/
   - Navigate to "Usage" section
   - View detailed usage statistics

2. **Set up alerts:**
   - Configure email alerts for usage thresholds
   - Get notified before reaching limits

## Migration from Whisper

The migration is complete! Here's what changed:

### Before (Whisper):
```python
import whisper
model = whisper.load_model("base")
result = model.transcribe(audio_path)
text = result["text"]
```

### After (Deepgram):
```python
from deepgram import DeepgramClient, PrerecordedOptions
client = DeepgramClient(api_key)
response = client.listen.rest.v("1").transcribe_file(payload, options)
text = response["results"]["channels"][0]["alternatives"][0]["transcript"]
```

### Benefits:
- ⚡ No model loading time (instant startup)
- 💾 Lower memory usage (no local model)
- 🚀 Faster transcription (cloud processing)
- 📈 Better accuracy (latest models)

## Additional Resources

- **Deepgram Documentation**: https://developers.deepgram.com/docs
- **Python SDK Guide**: https://developers.deepgram.com/docs/python-sdk
- **API Reference**: https://developers.deepgram.com/reference
- **Community Forum**: https://community.deepgram.com/

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Deepgram documentation
3. Check application logs for detailed error messages
4. Contact Deepgram support: support@deepgram.com

---

**Ready to go! Your HRBOT now uses Deepgram for fast and accurate speech recognition.** 🎉
