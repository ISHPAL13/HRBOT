from flask import Flask, request, jsonify, render_template, session, redirect, url_for
import requests, os, tempfile
import whisper
import PyPDF2
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create uploads folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Get API keys from environment, fallback to manual hardcoded values for dev
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY", "ZWQ3MGM4ZGE4NDdiNDU3MjkxMTA3ZjlhNmUwY2FiY2YtMTc1NjcwNDg3OQ==")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your_gemini_api_key_here")

# Lazy load Whisper model (loads on first use instead of startup)
whisper_model = None

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        print("Loading Whisper model... (this may take a minute)")
        whisper_model = whisper.load_model("base")
        print("Whisper model loaded successfully!")
    return whisper_model

def extract_text_from_pdf(pdf_path):
    """Extract text content from PDF file"""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
    except Exception as e:
        print(f"Error extracting PDF: {e}")
        return None

def get_tone_prompt(tone, cv_text, user_name):
    """Generate interviewer prompt based on selected tone"""
    base_context = f"""You are Sarah, an HR interviewer conducting an interview with {user_name}.

CANDIDATE'S CV SUMMARY:
{cv_text[:1500]}  

Based on their CV, ask relevant questions about their experience, skills, and background."""

    tone_styles = {
        'professional': """
TONE: Professional & Neutral
- Be polite, business-like, and respectful
- Ask standard interview questions
- Keep responses clear and direct
- Reply in ONE short sentence (10-15 words max)""",
        
        'friendly': """
TONE: Friendly & Encouraging  
- Be warm, supportive, and encouraging
- Use positive language and show enthusiasm
- Make the candidate feel comfortable
- Reply in ONE short sentence (10-15 words max)""",
        
        'strict': """
TONE: Strict & Demanding
- Be critical and challenge their responses
- Ask tough follow-up questions
- Point out gaps or weaknesses professionally
- Reply in ONE short sentence (10-15 words max)""",
        
        'casual': """
TONE: Casual & Relaxed
- Be conversational and laid-back
- Use informal language (but still professional)
- Keep the atmosphere relaxed
- Reply in ONE short sentence (10-15 words max)"""
    }
    
    return base_context + "\n" + tone_styles.get(tone, tone_styles['professional'])

def get_voice_for_tone(tone):
    """Map interview tone to appropriate HeyGen voice ID"""
    voice_map = {
        'professional': '2d5b0e6cf36f460aa7fc47e3eee4ba54',  # Professional female voice
        'friendly': 'a7c6da62cc1e4dfab500dc13fcd4b103',      # Warm, friendly female
        'strict': '1bd001e7e50f421d891986aad5158bc8',        # Firm, authoritative female
        'casual': '3b554273f2b94a1e89473b7fddad1880'         # Relaxed, conversational female
    }
    return voice_map.get(tone, voice_map['professional'])

@app.route("/api/voice-config", methods=["GET"])
def get_voice_config():
    """Return voice configuration based on user's tone"""
    if 'user_name' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    tone = session.get('interviewer_tone', 'professional')
    voice_id = get_voice_for_tone(tone)
    
    return jsonify({
        "tone": tone,
        "voice_id": voice_id
    })

@app.route("/")
def index():
    # Redirect to login if no session
    if 'user_name' not in session:
        return redirect(url_for('login'))
    return render_template("index.html")

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/interview")
def interview():
    # Check if user is logged in
    if 'user_name' not in session:
        return redirect(url_for('login'))
    return render_template("index.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    try:
        # Get form data
        user_name = request.form.get('userName')
        user_email = request.form.get('userEmail')
        mock_interview = request.form.get('mockInterview') == 'on'
        selected_tone = request.form.get('selectedTone', 'professional')
        
        # Handle CV file upload
        if 'cvFile' not in request.files:
            return jsonify({"success": False, "error": "No CV file uploaded"}), 400
        
        cv_file = request.files['cvFile']
        
        if cv_file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
        
        if not cv_file.filename.endswith('.pdf'):
            return jsonify({"success": False, "error": "Only PDF files are allowed"}), 400
        
        # Save CV file
        filename = secure_filename(cv_file.filename)
        cv_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{user_email}_{filename}")
        cv_file.save(cv_path)
        
        # Extract text from PDF
        cv_text = extract_text_from_pdf(cv_path)
        
        if not cv_text:
            return jsonify({"success": False, "error": "Could not read CV content"}), 400
        
        # Store in session
        session['user_name'] = user_name
        session['user_email'] = user_email
        session['cv_text'] = cv_text
        session['mock_interview'] = mock_interview
        session['interviewer_tone'] = selected_tone if mock_interview else 'professional'
        
        print(f"✅ User logged in: {user_name} ({user_email})")
        print(f"   Mock Mode: {mock_interview}, Tone: {session['interviewer_tone']}")
        print(f"   CV Length: {len(cv_text)} characters")
        
        return jsonify({"success": True})
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/user-info", methods=["GET"])
def get_user_info():
    """Return current user session info"""
    if 'user_name' not in session:
        return jsonify({"logged_in": False}), 401
    
    return jsonify({
        "logged_in": True,
        "name": session.get('user_name'),
        "email": session.get('user_email'),
        "mock_interview": session.get('mock_interview', False),
        "tone": session.get('interviewer_tone', 'professional')
    })

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/heygen/session-token", methods=["POST"])
def get_session_token():
    if not HEYGEN_API_KEY or HEYGEN_API_KEY.startswith("your_"):
        return jsonify({"error": "HEYGEN_API_KEY not configured"}), 500
    return jsonify({"data": {"token": HEYGEN_API_KEY}})

@app.route("/stt", methods=["POST"])
def stt():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file"}), 400

    audio_file = request.files['audio']
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp_path = tmp.name
            audio_file.save(tmp_path)
            model = get_whisper_model()  # Load model only when needed
            result = model.transcribe(tmp_path)
            text = result["text"].strip()
        return jsonify({"text": text})
    finally:
        # Clean up temporary file
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.route("/llm", methods=["POST"])
def llm():
    data = request.get_json()
    user_input = data.get("prompt", "")
    
    if not GEMINI_API_KEY or GEMINI_API_KEY.startswith("your_"):
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500
    
    # Check if user is logged in
    if 'user_name' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    # Get user context
    user_name = session.get('user_name', 'Candidate')
    cv_text = session.get('cv_text', '')
    tone = session.get('interviewer_tone', 'professional')
    
    # Build context-aware prompt
    context_prompt = get_tone_prompt(tone, cv_text, user_name)
    
    full_prompt = f"""{context_prompt}

Candidate just said: "{user_input}"

Now give your one-sentence reply as the interviewer."""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    try:
        response = requests.post(url, json={"contents": [{"parts": [{"text": full_prompt}]}]}, timeout=30)
        response.raise_for_status()
        j = response.json()

        text = (
            j.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        return jsonify({"text": text})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"LLM API error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
