# 🎯 InterviewAI - AI-Powered Interview Coach

Professional AI interview platform with CV-based personalized questions, multiple interviewer tones, and live conversation mode.

## ✨ Features

### 🔐 **Login System**
- User registration with Name & Email
- CV upload (PDF format)
- Automatic CV parsing and analysis
- Session management

### 🎭 **Mock Interview Mode**
Optional practice mode with **4 interviewer personalities**:
- **Professional** - Neutral, business-like, standard questions
- **Friendly** - Warm, encouraging, supportive tone
- **Strict** - Demanding, critical, tough questions
- **Casual** - Relaxed, conversational, laid-back

### 🤖 **AI-Powered Features**
- ✅ **CV-Based Questions** - Personalized based on your resume
- ✅ **Live Conversation** - Automatic turn-taking (no button clicking!)
- ✅ **Voice Activity Detection** - Detects when you stop speaking
- ✅ **Realistic Avatar** - HeyGen lip-synced AI interviewer
- ✅ **Smart Responses** - Google Gemini 2.0 powered
- ✅ **Speech-to-Text** - OpenAI Whisper for accurate transcription

### 🎨 **Premium UI**
- Modern glassmorphism design
- Indigo/Purple gradient theme
- Real-time status indicators
- Smooth animations and transitions

---

## 🚀 Quick Start

### 1. **Install Dependencies**
```bash
cd backend
pip install -r requirements.txt
```

### 2. **Configure API Keys**
Edit `backend/app.py` line 17:
```python
GEMINI_API_KEY = "your_actual_gemini_api_key_here"
```

Get your API key: https://makersuite.google.com/app/apikey

### 3. **Run the Server**
```bash
python app.py
```

### 4. **Open Browser**
Navigate to: `http://localhost:5000`

---

## 📋 How to Use

### **Step 1: Login**
1. Enter your full name
2. Provide email address
3. Upload your CV (PDF format)
4. *(Optional)* Check "Mock Interview" to select tone
5. Click "Start Interview"

### **Step 2: Interview**
1. Click "Start Interview" button
2. Allow microphone access
3. **Just speak naturally!**
   - System auto-detects when you stop talking
   - Avatar responds automatically
   - Conversation flows naturally

### **Step 3: Alternative Input**
- Type responses manually if preferred
- Click "Send Message" to submit

---

## 🎯 Interview Modes

### **Real Interview** (Default)
- Professional tone only
- Questions based on your CV
- Standard interview format

### **Mock Interview** (Practice Mode)
- Choose from 4 different tones
- Practice handling different interviewer personalities
- Perfect for interview preparation

---

## 🔧 Technical Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | Flask (Python) |
| **Frontend** | Vanilla JavaScript |
| **Styling** | TailwindCSS |
| **Avatar** | HeyGen Streaming API |
| **Video** | LiveKit |
| **Speech-to-Text** | OpenAI Whisper |
| **LLM** | Google Gemini 2.0 Flash |
| **CV Parsing** | PyPDF2 |

---

## 📁 Project Structure

```
HRBOT/
├── backend/
│   ├── app.py                 # Flask server
│   ├── requirements.txt       # Python dependencies
│   ├── uploads/              # CV uploads (auto-created)
│   ├── templates/
│   │   ├── login.html        # Login page
│   │   └── index.html        # Interview interface
│   └── static/
│       └── script.js         # Frontend logic
```

---

## ⚙️ Configuration Options

### **Avatar Settings** (Sidebar)
- **Avatar ID**: Change HeyGen avatar character
- **Voice ID**: Modify voice characteristics (optional)

### **Environment Variables** (Optional)
```bash
export SECRET_KEY="your-secure-secret-key"
export HEYGEN_API_KEY="your-heygen-key"
export GEMINI_API_KEY="your-gemini-key"
```

---

## 🎤 Interviewer Tone Details

### 1. **Professional** 
- Polite and respectful
- Standard interview questions
- Clear and direct communication

### 2. **Friendly**
- Warm and supportive
- Positive encouragement
- Makes you feel comfortable

### 3. **Strict**
- Critical analysis
- Challenges your responses
- Points out gaps professionally

### 4. **Casual**
- Conversational style
- Informal but professional
- Relaxed atmosphere

---

## 🔒 Security Notes

- CVs stored temporarily in `uploads/` folder
- Session data cleared on logout
- Change `SECRET_KEY` in production
- Use HTTPS in production

---

## 🐛 Troubleshooting

### **Server won't start**
```bash
# Install all dependencies
pip install flask requests openai-whisper PyPDF2

# Run from correct directory
cd backend
python app.py
```

### **Microphone not working**
- Allow browser microphone permission
- Check system microphone settings
- Try manual text input as alternative

### **CV not parsing**
- Ensure PDF format (not image-based PDF)
- Check file size < 16MB
- Verify PDF isn't password protected

### **Avatar not responding**
- Check Gemini API key is configured
- Verify internet connection
- Wait 30-60 seconds on first use (Whisper loads)

---

## 📊 System Requirements

- **Python**: 3.8+
- **RAM**: 2GB+ (Whisper model)
- **Browser**: Chrome, Firefox, Edge (latest)
- **Microphone**: Required for voice input
- **Internet**: Stable connection for APIs

---

## 🎓 Use Cases

✅ **Interview Preparation** - Practice with different interviewer styles  
✅ **CV Review** - Get questions based on your actual experience  
✅ **Confidence Building** - Low-pressure mock interviews  
✅ **Communication Skills** - Improve verbal responses  
✅ **Stress Testing** - Try strict mode for tough interviews  

---

## 📝 Future Enhancements

- [ ] Interview recording & playback
- [ ] Performance analytics
- [ ] Multi-language support
- [ ] Custom question templates
- [ ] Interview feedback reports

---

## 📄 License

© 2025 InterviewAI - Educational & Personal Use

---

## 🙏 Credits

- **HeyGen** - Realistic AI avatars
- **Google Gemini** - Advanced language model
- **OpenAI Whisper** - Speech recognition
- **LiveKit** - Real-time video streaming

---

## 💡 Tips for Best Results

1. **CV Tips**: Use clear formatting, include keywords
2. **Speaking**: Speak clearly, pause between sentences
3. **Practice**: Try different tones to prepare for various scenarios
4. **Environment**: Use quiet room for better audio
5. **Preparation**: Review your CV before starting

---

**Ready to ace your interview? Start practicing now!** 🚀

