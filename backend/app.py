from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_file
import requests, os, tempfile
import whisper
import PyPDF2
from google import genai
from werkzeug.utils import secure_filename
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import json

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['REPORTS_FOLDER'] = 'reports'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create folders if they don't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['REPORTS_FOLDER'], exist_ok=True)

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
        session['conversation_history'] = []  # Track all Q&A
        session['interview_start_time'] = datetime.now().isoformat()
        
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
        print(f"\n🎤 STT Request - Audio size: {audio_file.content_length or 'unknown'} bytes")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp_path = tmp.name
            audio_file.save(tmp_path)
            
            print("   Loading Whisper model...")
            model = get_whisper_model()  # Load model only when needed
            
            print("   Transcribing audio...")
            # Use faster settings for quicker transcription
            result = model.transcribe(tmp_path, fp16=False, language="en")
            text = result["text"].strip()
            
            print(f"✅ STT Result: '{text}'")
        return jsonify({"text": text})
    except Exception as e:
        print(f"❌ STT error: {str(e)}")
        return jsonify({"error": f"STT error: {str(e)}"}), 500
    finally:
        # Clean up temporary file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass

@app.route("/llm", methods=["POST"])
def llm():
    data = request.get_json()
    user_input = data.get("prompt", "")
    
    print(f"\n🤖 LLM Request - User input: '{user_input}'")
    
    if not GEMINI_API_KEY or GEMINI_API_KEY.startswith("your_"):
        print("❌ GEMINI_API_KEY not configured properly!")
        print(f"   Current value: {GEMINI_API_KEY[:20]}...")
        print("   Please set your Gemini API key in the environment or app.py")
        return jsonify({
            "error": "GEMINI_API_KEY not configured. Please set your API key.",
            "text": "I apologize, but my AI system is not configured properly. Please contact the administrator."
        }), 200  # Return 200 so frontend can show the message
    
    # Check if user is logged in
    if 'user_name' not in session:
        print("❌ User not logged in")
        return jsonify({"error": "Not logged in"}), 401
    
    # Get user context
    user_name = session.get('user_name', 'Candidate')
    cv_text = session.get('cv_text', '')
    tone = session.get('interviewer_tone', 'professional')
    
    print(f"   User: {user_name}, Tone: {tone}")
    
    # Build context-aware prompt
    context_prompt = get_tone_prompt(tone, cv_text, user_name)
    
    full_prompt = f"""{context_prompt}

Candidate just said: "{user_input}"

Now give your one-sentence reply as the interviewer."""

    try:
        # Initialize Google GenAI client (auto-detects GEMINI_API_KEY from environment)
        # If not in environment, use the one from app config
        import os
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        print("   Calling Gemini API using official SDK...")
        print("   Model: gemini-2.5-flash")
        
        # Use gemini-2.5-flash (latest model)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=full_prompt
        )
        
        text = response.text.strip()
        
        print(f"   Raw response length: {len(text)} characters")
        if len(text) > 0:
            print(f"   Raw response preview: '{text[:100]}...'")
        
        if not text:
            print("⚠️ Empty response from Gemini API")
            text = "Could you tell me more about that?"
        
        print(f"✅ LLM Response: '{text}'")
        
        # Track conversation for evaluation
        if 'conversation_history' not in session:
            session['conversation_history'] = []
        
        session['conversation_history'].append({
            "question": text,
            "answer": user_input,
            "timestamp": datetime.now().isoformat()
        })
        session.modified = True
        
        return jsonify({"text": text})
    except Exception as e:
        print(f"❌ LLM API error: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Full error: {repr(e)}")
        # Fallback response
        fallback_text = "Could you elaborate on that?"
        return jsonify({"text": fallback_text}), 200

def evaluate_candidate_with_gemini(cv_text, conversation_history, user_name):
    """Use Gemini to evaluate the candidate based on CV and interview responses"""
    
    # Build conversation summary
    conv_summary = "\n".join([
        f"Q: {item['question']}\nA: {item['answer']}\n"
        for item in conversation_history
    ])
    
    evaluation_prompt = f"""You are an expert HR evaluator. Analyze this candidate's interview performance.

CANDIDATE: {user_name}

CV SUMMARY:
{cv_text[:2000]}

INTERVIEW CONVERSATION:
{conv_summary}

Provide a detailed evaluation in the following JSON format:
{{
  "overall_score": <number 0-100>,
  "technical_score": <number 0-100>,
  "communication_score": <number 0-100>,
  "experience_score": <number 0-100>,
  "strengths": [
    "strength 1",
    "strength 2",
    "strength 3"
  ],
  "weaknesses": [
    "weakness 1",
    "weakness 2"
  ],
  "recommendations": [
    "recommendation 1",
    "recommendation 2"
  ],
  "summary": "2-3 sentence overall summary"
}}

Be objective, professional, and constructive. Base scores on actual responses."""

    try:
        # Use official Google GenAI SDK for evaluation
        import os
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=evaluation_prompt
        )
        
        text = response.text
        
        # Extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            evaluation = json.loads(json_match.group())
            return evaluation
        else:
            raise ValueError("Could not parse evaluation JSON")
            
    except Exception as e:
        print(f"Evaluation error: {e}")
        # Return default evaluation
        return {
            "overall_score": 70,
            "technical_score": 70,
            "communication_score": 70,
            "experience_score": 70,
            "strengths": ["Participated in interview", "Provided responses"],
            "weaknesses": ["Evaluation system encountered an error"],
            "recommendations": ["Try again or contact support"],
            "summary": "Could not complete full evaluation due to technical issues."
        }

def generate_pdf_report(evaluation, user_name, user_email, cv_text, conversation_history):
    """Generate professional PDF evaluation report"""
    
    filename = f"{user_email}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_report.pdf"
    filepath = os.path.join(app.config['REPORTS_FOLDER'], filename)
    
    doc = SimpleDocTemplate(filepath, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#3b82f6'),
        spaceAfter=12,
        spaceBefore=20
    )
    
    # Title
    story.append(Paragraph("INTERVIEW EVALUATION REPORT", title_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Candidate Info
    info_data = [
        ['Candidate Name:', user_name],
        ['Email:', user_email],
        ['Date:', datetime.now().strftime('%B %d, %Y')],
        ['Interview Duration:', f"{len(conversation_history)} Q&A exchanges"]
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONT', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#4b5563')),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9fafb')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb'))
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.4*inch))
    
    # Overall Score - Large Display
    story.append(Paragraph("OVERALL EVALUATION SCORE", heading_style))
    score_data = [[f"{evaluation['overall_score']}/100"]]
    score_table = Table(score_data, colWidths=[6*inch])
    score_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, 0), 36),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#10b981') if evaluation['overall_score'] >= 70 else colors.HexColor('#ef4444')),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('PADDING', (0, 0), (0, 0), 20),
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f0fdf4') if evaluation['overall_score'] >= 70 else colors.HexColor('#fef2f2')),
        ('GRID', (0, 0), (0, 0), 1, colors.HexColor('#10b981') if evaluation['overall_score'] >= 70 else colors.HexColor('#ef4444'))
    ]))
    story.append(score_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Detailed Scores
    story.append(Paragraph("DETAILED SCORES", heading_style))
    scores_data = [
        ['Category', 'Score', 'Rating'],
        ['Technical Skills', f"{evaluation['technical_score']}/100", get_rating(evaluation['technical_score'])],
        ['Communication', f"{evaluation['communication_score']}/100", get_rating(evaluation['communication_score'])],
        ['Experience Match', f"{evaluation['experience_score']}/100", get_rating(evaluation['experience_score'])]
    ]
    
    scores_table = Table(scores_data, colWidths=[2.5*inch, 1.5*inch, 2*inch])
    scores_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONT', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')])
    ]))
    story.append(scores_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Strengths
    story.append(Paragraph("STRENGTHS", heading_style))
    for i, strength in enumerate(evaluation['strengths'], 1):
        story.append(Paragraph(f"✓ {strength}", styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
    
    story.append(Spacer(1, 0.2*inch))
    
    # Weaknesses
    story.append(Paragraph("AREAS FOR IMPROVEMENT", heading_style))
    for i, weakness in enumerate(evaluation['weaknesses'], 1):
        story.append(Paragraph(f"• {weakness}", styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
    
    story.append(Spacer(1, 0.2*inch))
    
    # Recommendations
    story.append(Paragraph("RECOMMENDATIONS", heading_style))
    for i, rec in enumerate(evaluation['recommendations'], 1):
        story.append(Paragraph(f"{i}. {rec}", styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
    
    story.append(Spacer(1, 0.3*inch))
    
    # Summary
    story.append(Paragraph("SUMMARY", heading_style))
    story.append(Paragraph(evaluation['summary'], styles['Normal']))
    
    # Build PDF
    doc.build(story)
    return filename

def get_rating(score):
    """Convert numeric score to rating label"""
    if score >= 90:
        return "Excellent"
    elif score >= 75:
        return "Good"
    elif score >= 60:
        return "Average"
    elif score >= 40:
        return "Below Average"
    else:
        return "Poor"

@app.route("/api/evaluate", methods=["POST"])
def evaluate_interview():
    """Evaluate candidate and generate PDF report"""
    try:
        if 'user_name' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_name = session.get('user_name')
        user_email = session.get('user_email')
        cv_text = session.get('cv_text', '')
        conversation_history = session.get('conversation_history', [])
        
        if len(conversation_history) < 2:
            return jsonify({"error": "Not enough conversation data. Continue the interview."}), 400
        
        print(f"🔍 Evaluating {user_name}...")
        
        # Get evaluation from Gemini
        evaluation = evaluate_candidate_with_gemini(cv_text, conversation_history, user_name)
        
        print(f"   Overall Score: {evaluation['overall_score']}/100")
        
        # Generate PDF report
        filename = generate_pdf_report(evaluation, user_name, user_email, cv_text, conversation_history)
        
        print(f"✅ Report generated: {filename}")
        
        return jsonify({
            "success": True,
            "evaluation": evaluation,
            "report_filename": filename
        })
        
    except Exception as e:
        print(f"Evaluation error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/download-report/<filename>")
def download_report(filename):
    """Download generated PDF report"""
    try:
        filepath = os.path.join(app.config['REPORTS_FOLDER'], filename)
        if os.path.exists(filepath):
            return send_file(filepath, as_attachment=True, download_name=f"Interview_Report_{filename}")
        else:
            return jsonify({"error": "Report not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
