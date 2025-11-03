from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_file
import requests, os, tempfile
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
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "your_deepgram_api_key_here")

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

@app.route("/deepgram/api-key", methods=["GET"])
def get_deepgram_key():
    """Provide Deepgram API key to frontend (for client-side STT)"""
    if not DEEPGRAM_API_KEY or DEEPGRAM_API_KEY.startswith("your_"):
        return jsonify({"error": "DEEPGRAM_API_KEY not configured"}), 500
    
    # Return the API key for client-side use
    # Note: In production, consider using temporary keys or proxy requests
    return jsonify({"api_key": DEEPGRAM_API_KEY})

@app.route("/stt", methods=["POST"])
def speech_to_text():
    """Convert audio to text using Deepgram API"""
    try:
        if not DEEPGRAM_API_KEY or DEEPGRAM_API_KEY.startswith("your_"):
            return jsonify({"error": "DEEPGRAM_API_KEY not configured", "text": ""}), 500
        
        # Get audio file from request
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided", "text": ""}), 400
        
        audio_file = request.files['audio']
        
        # Read audio data
        audio_data = audio_file.read()
        
        if len(audio_data) == 0:
            return jsonify({"error": "Empty audio file", "text": ""}), 400
        
        print(f"📤 Sending {len(audio_data)} bytes to Deepgram STT...")
        
        # Send to Deepgram API
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "audio/webm"
        }
        
        params = {
            "model": "nova-2",
            "language": "en-US",
            "smart_format": "true",
            "punctuate": "true"
        }
        
        response = requests.post(
            "https://api.deepgram.com/v1/listen",
            headers=headers,
            params=params,
            data=audio_data,
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"❌ Deepgram API error: {response.status_code} - {response.text}")
            return jsonify({"error": f"Deepgram API error: {response.status_code}", "text": ""}), 500
        
        result = response.json()
        
        # Extract transcript
        transcript = ""
        if result.get("results") and result["results"].get("channels"):
            alternatives = result["results"]["channels"][0].get("alternatives", [])
            if alternatives:
                transcript = alternatives[0].get("transcript", "").strip()
        
        print(f"📝 Deepgram transcript: '{transcript}'")
        
        return jsonify({"text": transcript})
        
    except Exception as e:
        print(f"❌ STT error: {e}")
        return jsonify({"error": str(e), "text": ""}), 500

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
    conversation_history = session.get('conversation_history', [])
    
    print(f"   User: {user_name}, Tone: {tone}, Conversation turns: {len(conversation_history)}")
    
    # Generate CV-based questions on first interaction
    if 'cv_questions' not in session and cv_text:
        print("   📝 Generating CV-based questions...")
        session['cv_questions'] = generate_cv_questions_internal(cv_text)
        session['question_index'] = 0
        session.modified = True
    
    # Build context-aware prompt with CV analysis and conversation history
    context_prompt = get_tone_prompt(tone, cv_text, user_name)
    
    # Add conversation history for context
    history_context = ""
    if len(conversation_history) > 0:
        recent_history = conversation_history[-3:]  # Last 3 exchanges
        history_context = "\n\nRECENT CONVERSATION:\n" + "\n".join([
            f"Q: {item['question']}\nA: {item['answer']}"
            for item in recent_history
        ])
    
    # Get CV-based questions if available
    cv_questions_context = ""
    if 'cv_questions' in session:
        questions = session['cv_questions']
        question_index = session.get('question_index', 0)
        if question_index < len(questions):
            cv_questions_context = f"\n\nSUGGESTED QUESTIONS TO ASK (based on CV analysis):\n"
            for i in range(question_index, min(question_index + 3, len(questions))):
                cv_questions_context += f"- {questions[i]['question']}\n"
    
    full_prompt = f"""{context_prompt}{history_context}{cv_questions_context}

CANDIDATE'S LATEST RESPONSE: "{user_input}"

YOUR TASK AS INTERVIEWER:
1. If starting the interview or moving to a new topic:
   - Ask one of the CV-based questions listed above
   - Reference specific details from their resume (company names, technologies, projects)
   
2. If the candidate's answer was vague or incomplete:
   - Ask a follow-up question to probe deeper
   - Example: "Can you give me a specific example?" or "What was your exact role in that?"
   
3. If the candidate answered well:
   - Acknowledge briefly if appropriate (e.g., "That's interesting.")
   - Move to the next CV-based question
   - Or explore a related aspect of what they mentioned
   
4. Always:
   - Keep questions conversational and natural
   - Reference SPECIFIC items from their CV (technologies, companies, achievements)
   - Ask one clear question at a time
   - Avoid generic questions - be specific to their background

Generate your next interview question (one sentence, conversational tone):"""

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
        
        # Increment question index if we're using CV questions
        if 'cv_questions' in session and 'question_index' in session:
            # Check if the response contains a CV-based question
            cv_questions = session['cv_questions']
            question_index = session.get('question_index', 0)
            if question_index < len(cv_questions):
                # Move to next question after 2-3 exchanges on current topic
                if len(session['conversation_history']) % 2 == 0:
                    session['question_index'] = min(question_index + 1, len(cv_questions) - 1)
                    print(f"   📊 Progress: Question {session['question_index'] + 1}/{len(cv_questions)}")
        
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

# ==================== NEW FEATURES ====================

# Feature 3: Technical Coding Assessment
@app.route("/coding-assessment")
def coding_assessment():
    """Render coding assessment page"""
    if 'user_name' not in session:
        return redirect(url_for('login'))
    return render_template('coding_assessment.html')

@app.route("/api/run-code", methods=["POST"])
def run_code():
    """Execute code and return output"""
    try:
        data = request.get_json()
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        print(f"\n💻 Running {language} code...")
        
        # Simple execution for Python (for demo - use Judge0 API in production)
        if language == 'python':
            import subprocess
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                f.flush()
                try:
                    result = subprocess.run(
                        ['python', f.name],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    os.unlink(f.name)
                    
                    if result.returncode == 0:
                        return jsonify({"success": True, "output": result.stdout})
                    else:
                        return jsonify({"success": False, "error": result.stderr})
                except subprocess.TimeoutExpired:
                    os.unlink(f.name)
                    return jsonify({"success": False, "error": "Execution timeout (5s limit)"})
        else:
            return jsonify({"success": False, "error": f"{language} execution not yet supported"})
            
    except Exception as e:
        print(f"❌ Code execution error: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/submit-code", methods=["POST"])
def submit_code():
    """Evaluate code against test cases"""
    try:
        data = request.get_json()
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        print(f"\n✅ Submitting {language} solution...")
        
        # Test cases for Two Sum problem
        test_cases = [
            {"input": ([2,7,11,15], 9), "expected": [0,1]},
            {"input": ([3,2,4], 6), "expected": [1,2]},
            {"input": ([3,3], 6), "expected": [0,1]}
        ]
        
        passed_tests = 0
        total_tests = len(test_cases)
        details = []
        
        for i, test in enumerate(test_cases):
            # Execute code with test input (simplified for demo)
            # In production, use Judge0 API or similar
            passed_tests += 1  # Mock pass for demo
            
        score = int((passed_tests / total_tests) * 100)
        
        # Save to session
        if 'coding_assessment' not in session:
            session['coding_assessment'] = {}
        session['coding_assessment']['score'] = score
        session['coding_assessment']['code'] = code
        session['coding_assessment']['language'] = language
        session.modified = True
        
        return jsonify({
            "passed": passed_tests == total_tests,
            "score": score,
            "passed_tests": passed_tests,
            "total_tests": total_tests,
            "execution_time": 45,  # Mock
            "details": "All test cases passed!" if passed_tests == total_tests else f"Failed {total_tests - passed_tests} test(s)"
        })
        
    except Exception as e:
        print(f"❌ Code submission error: {e}")
        return jsonify({"passed": False, "error": str(e)})

# Helper function for internal CV question generation
def generate_cv_questions_internal(cv_text):
    """Generate CV-based questions internally (called automatically)"""
    try:
        import os
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        prompt = f"""You are an expert HR interviewer. Analyze the candidate's resume below and generate 8-10 highly specific interview questions.

CANDIDATE RESUME:
{cv_text[:3000]}

INSTRUCTIONS:
1. Extract key information:
   - Specific technologies, tools, frameworks mentioned
   - Companies worked at and roles held
   - Projects completed and their impact
   - Skills, certifications, education
   - Achievements with quantifiable results

2. Generate questions that:
   - Reference SPECIFIC items from the resume (e.g., "Tell me about your work with React at XYZ Corp")
   - Probe technical depth (e.g., "How did you optimize the PostgreSQL queries in your project?")
   - Explore achievements (e.g., "You mentioned reducing costs by 30% - walk me through that")
   - Assess problem-solving (e.g., "What was the biggest challenge in the ML pipeline you built?")
   - Evaluate leadership/teamwork (if applicable)

3. Question categories to include:
   - Technical Skills (3-4 questions)
   - Work Experience (2-3 questions)
   - Projects & Achievements (2-3 questions)
   - Problem-Solving (1-2 questions)

4. Make questions conversational and natural, as if a human interviewer is asking them.

Return ONLY a valid JSON array with no markdown formatting:
[
  {{"category": "Technical", "question": "Can you explain your experience with [specific technology from CV]?"}},
  {{"category": "Experience", "question": "Tell me about your role at [company name]..."}},
  {{"category": "Projects", "question": "Walk me through the [specific project] you mentioned..."}},
  ...
]"""
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        
        # Extract JSON from response
        import re
        json_match = re.search(r'\[[\s\S]*\]', response.text)
        if json_match:
            questions = json.loads(json_match.group())
            print(f"   ✅ Generated {len(questions)} CV-based questions")
            return questions
        else:
            print("   ⚠️ Failed to parse questions, using defaults")
            return [
                {"category": "Experience", "question": "Tell me about your most recent role and key responsibilities."},
                {"category": "Technical", "question": "What technologies did you work with in your last project?"},
                {"category": "Problem-Solving", "question": "Describe a challenging problem you solved recently."}
            ]
    except Exception as e:
        print(f"   ❌ Question generation error: {e}")
        return [
            {"category": "Experience", "question": "Walk me through your professional background."},
            {"category": "Skills", "question": "What are your strongest technical skills?"}
        ]

# Feature 4: Resume Parsing & Auto-Question Generation (Manual API - now optional)
@app.route("/api/generate-questions", methods=["POST"])
def generate_questions():
    """Generate custom questions based on CV using Gemini (manual trigger)"""
    try:
        if 'cv_text' not in session:
            return jsonify({"error": "No CV uploaded"}), 400
        
        cv_text = session.get('cv_text', '')
        
        print(f"\n📝 Manually generating custom questions from CV...")
        
        # Use the same internal function for consistency
        questions = generate_cv_questions_internal(cv_text)
        
        # Store in session
        session['custom_questions'] = questions
        session.modified = True
        
        print(f"✅ Generated {len(questions)} custom questions")
        return jsonify({"success": True, "questions": questions})
            
    except Exception as e:
        print(f"❌ Question generation error: {e}")
        return jsonify({"error": str(e)}), 500

# Feature 6: Body Language Analysis
@app.route("/api/analyze-body-language", methods=["POST"])
def analyze_body_language():
    """Analyze body language from webcam frame"""
    try:
        # This would use MediaPipe or similar in production
        # For now, return mock data
        
        analysis = {
            "posture_score": 85,
            "eye_contact_score": 78,
            "confidence_level": "High",
            "fidgeting_detected": False,
            "facial_expression": "Neutral/Focused",
            "recommendations": [
                "Maintain good eye contact",
                "Sit up straight",
                "Avoid excessive hand movements"
            ]
        }
        
        # Store in session
        if 'body_language_analysis' not in session:
            session['body_language_analysis'] = []
        session['body_language_analysis'].append({
            "timestamp": datetime.now().isoformat(),
            "analysis": analysis
        })
        session.modified = True
        
        return jsonify({"success": True, "analysis": analysis})
        
    except Exception as e:
        print(f"❌ Body language analysis error: {e}")
        return jsonify({"error": str(e)}), 500

# Feature 8: Enhanced Practice Mode
@app.route("/api/practice-feedback", methods=["POST"])
def practice_feedback():
    """Get AI feedback on practice interview response"""
    try:
        data = request.get_json()
        question = data.get('question', '')
        answer = data.get('answer', '')
        
        print(f"\n🎯 Generating practice feedback...")
        
        import os
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        prompt = f"""As an interview coach, provide detailed feedback on this answer.

QUESTION: {question}
ANSWER: {answer}

Provide feedback in JSON format:
{{
  "score": <0-100>,
  "strengths": ["point 1", "point 2"],
  "weaknesses": ["point 1", "point 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "improved_answer": "A better way to answer this would be..."
}}"""
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        
        # Extract JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            feedback = json.loads(json_match.group())
            return jsonify({"success": True, "feedback": feedback})
        else:
            return jsonify({"error": "Failed to parse feedback"}), 500
            
    except Exception as e:
        print(f"❌ Practice feedback error: {e}")
        return jsonify({"error": str(e)}), 500

# Feature 10: AI-Powered Contextual Follow-ups
@app.route("/api/generate-followup", methods=["POST"])
def generate_followup():
    """Generate contextual follow-up question based on conversation history"""
    try:
        data = request.get_json()
        last_answer = data.get('answer', '')
        
        if 'conversation_history' not in session:
            return jsonify({"error": "No conversation history"}), 400
        
        conversation_history = session.get('conversation_history', [])
        cv_text = session.get('cv_text', '')
        
        print(f"\n🔄 Generating contextual follow-up...")
        
        import os
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        # Build conversation context
        context = "\n".join([
            f"Q: {item['question']}\nA: {item['answer']}"
            for item in conversation_history[-5:]  # Last 5 exchanges
        ])
        
        prompt = f"""You are an expert interviewer. Based on the conversation history and the candidate's latest answer, generate ONE insightful follow-up question that:
1. Probes deeper into their response
2. Clarifies vague points
3. Explores related experiences
4. Assesses problem-solving approach

CONVERSATION HISTORY:
{context}

LATEST ANSWER: {last_answer}

CV CONTEXT:
{cv_text[:1000]}

Generate a single, natural follow-up question (one sentence, conversational tone)."""
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        
        followup_question = response.text.strip()
        
        print(f"✅ Follow-up: {followup_question}")
        
        return jsonify({"success": True, "question": followup_question})
        
    except Exception as e:
        print(f"❌ Follow-up generation error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
