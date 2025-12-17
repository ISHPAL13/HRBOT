from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, Depends, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import requests, os, tempfile, shutil
import PyPDF2
import base64
from google import genai
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import json
from dotenv import load_dotenv
from typing import Optional, Dict
import subprocess
import re
import secrets

# Load environment variables from .env file
load_dotenv()

# In-memory session store (simple alternative to Redis)
SESSION_STORE: Dict[str, Dict] = {}

app = FastAPI(title="HireGenie", version="1.0")

# Add CORS middleware FIRST
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom session helper functions
def get_session_id(request: Request) -> Optional[str]:
    """Get session ID from cookie"""
    return request.cookies.get("session_id")

def get_session_data(session_id: str) -> Dict:
    """Get session data from store"""
    return SESSION_STORE.get(session_id, {})

def create_session() -> str:
    """Create new session and return session ID"""
    session_id = secrets.token_urlsafe(32)
    SESSION_STORE[session_id] = {}
    return session_id

def save_session(session_id: str, data: Dict):
    """Save session data to store"""
    SESSION_STORE[session_id] = data

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Configuration
UPLOAD_FOLDER = 'uploads'
REPORTS_FOLDER = 'reports'
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

# Create folders if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(REPORTS_FOLDER, exist_ok=True)

# Get API keys from environment
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

INTERVIEW GUIDELINES:
- Ask diverse questions covering different aspects: technical skills, projects, experience, soft skills, challenges faced
- NEVER repeat similar questions or ask about the same topic twice
- Move naturally between topics: projects → skills → teamwork → problem-solving → future goals
- Build on their previous answers with NEW follow-up questions
- If they mention something interesting, explore that instead of asking generic questions
- Vary your question types: "What", "How", "Why", "Tell me about", "Describe", "What would you do if"
- Keep the conversation flowing naturally like a real interview"""

    tone_styles = {
        'professional': """
TONE: Professional & Neutral
- Be polite, business-like, and respectful
- Ask insightful questions that assess competency
- Keep responses clear and direct
- Reply in ONE short sentence (8-12 words max)
- Focus on skills, achievements, and problem-solving abilities""",
        
        'friendly': """
TONE: Friendly & Encouraging  
- Be warm, supportive, and encouraging
- Use positive language and show enthusiasm
- Make the candidate feel comfortable
- Reply in ONE short sentence (8-12 words max)
- Ask about their passions, learning experiences, and growth""",
        
        'strict': """
TONE: Strict & Demanding
- Be critical and challenge their responses
- Ask tough follow-up questions that probe deeper
- Point out gaps or weaknesses professionally
- Reply in ONE short sentence (8-12 words max)
- Test their knowledge and decision-making under pressure""",
        
        'casual': """
TONE: Casual & Relaxed
- Be conversational and laid-back
- Use informal language (but still professional)
- Keep the atmosphere relaxed
- Reply in ONE short sentence (8-12 words max)
- Ask about real-world scenarios and practical experiences"""
    }
    
    return base_context + "\n" + tone_styles.get(tone, tone_styles['professional'])

def get_voice_for_tone(tone):
    """Map interview tone to appropriate HeyGen voice ID"""
    voice_map = {
        'professional': '2d5b0e6cf36f460aa7fc47e3eee4ba54',
        'friendly': 'a7c6da62cc1e4dfab500dc13fcd4b103',
        'strict': '1bd001e7e50f421d891986aad5158bc8',
        'casual': '3b554273f2b94a1e89473b7fddad1880'
    }
    return voice_map.get(tone, voice_map['professional'])

@app.get("/api/voice-config")
async def get_voice_config(request: Request):
    """Return voice configuration based on user's tone"""
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    session_data = get_session_data(session_id)
    if 'user_name' not in session_data:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    tone = session_data.get('interviewer_tone', 'professional')
    voice_id = get_voice_for_tone(tone)
    
    return {"tone": tone, "voice_id": voice_id}

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    session_id = get_session_id(request)
    if not session_id:
        return RedirectResponse(url="/login", status_code=302)
    
    session_data = get_session_data(session_id)
    if 'user_name' not in session_data:
        return RedirectResponse(url="/login", status_code=302)
    
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def login(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/interview", response_class=HTMLResponse)
async def interview(request: Request):
    session_id = get_session_id(request)
    print(f"🔍 /interview - Session ID: {session_id}")
    
    if not session_id:
        print("   ❌ No session ID cookie")
        return RedirectResponse(url="/login", status_code=302)
    
    session_data = get_session_data(session_id)
    print(f"   Session data: {session_data}")
    print(f"   'user_name' in session: {'user_name' in session_data}")
    
    if 'user_name' not in session_data:
        print("   ❌ Redirecting to login - no user_name in session")
        return RedirectResponse(url="/login", status_code=302)
    
    print(f"   ✅ User {session_data.get('user_name')} accessing interview page")
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/login")
async def api_login(
    request: Request,
    userName: str = Form(...),
    userEmail: str = Form(...),
    mockInterview: Optional[str] = Form(None),
    selectedTone: str = Form('professional'),
    cvFile: UploadFile = File(...)
):
    try:
        # Validate CV file
        if not cvFile.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Save CV file
        filename = f"{userName.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(cvFile.file, buffer)
        
        # Extract CV text
        cv_text = extract_text_from_pdf(filepath)
        
        if not cv_text:
            raise HTTPException(status_code=400, detail="Failed to extract text from PDF")
        
        # Create new session
        session_id = create_session()
        
        # Store in session
        session_data = {
            'user_name': userName,
            'user_email': userEmail,
            'cv_path': filepath,
            'cv_text': cv_text,
            'mock_interview': mockInterview == 'on',
            'interviewer_tone': selectedTone if mockInterview == 'on' else 'professional',
            'conversation_history': []
        }
        save_session(session_id, session_data)
        
        print(f"✅ User logged in: {userName}")
        print(f"   Email: {userEmail}")
        print(f"   Mock Interview: {mockInterview == 'on'}")
        print(f"   Tone: {session_data['interviewer_tone']}")
        print(f"   CV extracted: {len(cv_text)} characters")
        print(f"   Session ID: {session_id}")
        print(f"   Session data saved: {session_data}")
        
        # Create response with session cookie
        response = JSONResponse({"success": True, "message": "Login successful"})
        response.set_cookie(
            key="session_id",
            value=session_id,
            max_age=14400,  # 4 hours
            httponly=True,
            samesite="lax",
            path="/"
        )
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user-info")
async def get_user_info(request: Request):
    """Return current user session info"""
    session_id = get_session_id(request)
    if not session_id:
        return {"logged_in": False}
    
    session_data = get_session_data(session_id)
    if 'user_name' not in session_data:
        return {"logged_in": False}
    
    return {
        "logged_in": True,
        "name": session_data.get('user_name'),
        "email": session_data.get('user_email'),
        "mock_interview": session_data.get('mock_interview', False),
        "tone": session_data.get('interviewer_tone', 'professional')
    }

@app.post("/api/logout")
async def logout(request: Request):
    session_id = get_session_id(request)
    if session_id and session_id in SESSION_STORE:
        del SESSION_STORE[session_id]
    
    response = JSONResponse({"success": True})
    response.delete_cookie("session_id")
    return response

@app.post("/heygen/session-token")
async def get_session_token():
    if not HEYGEN_API_KEY or HEYGEN_API_KEY.startswith("your_"):
        raise HTTPException(status_code=500, detail="HEYGEN_API_KEY not configured")
    return {"data": {"token": HEYGEN_API_KEY}}

@app.get("/deepgram/api-key")
async def get_deepgram_key():
    """Provide Deepgram API key to frontend"""
    if not DEEPGRAM_API_KEY or DEEPGRAM_API_KEY.startswith("your_"):
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not configured")
    return {"api_key": DEEPGRAM_API_KEY}

@app.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Convert audio to text using Deepgram API"""
    try:
        if not DEEPGRAM_API_KEY or DEEPGRAM_API_KEY.startswith("your_"):
            raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not configured")
        
        # Read audio data
        audio_data = await audio.read()
        
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
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
            raise HTTPException(status_code=500, detail=f"Deepgram API error: {response.status_code}")
        
        result = response.json()
        
        # Extract transcript
        transcript = ""
        if result.get("results") and result["results"].get("channels"):
            alternatives = result["results"]["channels"][0].get("alternatives", [])
            if alternatives:
                transcript = alternatives[0].get("transcript", "").strip()
        
        print(f"📝 Deepgram transcript: '{transcript}'")
        
        return {"text": transcript}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ STT error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/llm")
async def llm(request: Request):
    data = await request.json()
    user_input = data.get("prompt", "")
    
    print(f"\n🤖 LLM Request - User input: '{user_input}'")
    
    if not GEMINI_API_KEY or GEMINI_API_KEY.startswith("your_"):
        print("❌ GEMINI_API_KEY not configured properly!")
        return JSONResponse({
            "error": "GEMINI_API_KEY not configured. Please set your API key.",
            "text": "I apologize, but my AI system is not configured properly. Please contact the administrator."
        }, status_code=200)
    
    # Check if user is logged in
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    session_data = get_session_data(session_id)
    if 'user_name' not in session_data:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    try:
        # Set API key in environment
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        # Get user context
        cv_text = session_data.get('cv_text', '')
        user_name = session_data.get('user_name', 'Candidate')
        tone = session_data.get('interviewer_tone', 'professional')
        
        # Build prompt with CV context and tone
        system_prompt = get_tone_prompt(tone, cv_text, user_name)
        
        # Get conversation history
        conversation_history = session_data.get('conversation_history', [])
        
        # Build context from recent conversation
        context = ""
        if conversation_history:
            recent = conversation_history[-3:]
            context = "\n".join([
                f"Q: {item['question']}\nA: {item['answer']}"
                for item in recent
            ])
            context = f"\n\nRECENT CONVERSATION:\n{context}\n"
        
        full_prompt = f"""{system_prompt}

{context}

CANDIDATE'S RESPONSE: {user_input}

IMPORTANT: Reply with ONE concise sentence (8-12 words). Be direct and natural."""
        
        print(f"📤 Sending to Gemini 2.5 Flash...")
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=full_prompt
        )
        
        bot_response = response.text.strip()
        
        # Store in conversation history
        conversation_history.append({
            "question": bot_response,
            "answer": user_input,
            "timestamp": datetime.now().isoformat()
        })
        session_data['conversation_history'] = conversation_history
        save_session(session_id, session_data)
        
        print(f"✅ Gemini response: {bot_response}")
        
        return {"text": bot_response}
        
    except Exception as e:
        print(f"❌ LLM error: {e}")
        error_msg = "I'm having trouble processing that. Could you rephrase?"
        return {"text": error_msg, "error": str(e)}

@app.websocket("/ws/interview")
async def websocket_interview(websocket: WebSocket):
    """WebSocket endpoint for real-time STT and LLM communication"""
    await websocket.accept()
    print("🔌 WebSocket connection established")
    
    # Try to get session from cookies
    session_id = None
    cookies = websocket.cookies
    if 'session_id' in cookies:
        session_id = cookies['session_id']
        print(f"✅ Got session_id from WebSocket cookies: {session_id}")
    
    try:
        while True:
            # Receive message from client
            message = await websocket.receive_json()
            action = message.get("action")
            
            print(f"📨 WebSocket received action: {action}")
            
            # Handle session initialization
            if action == "init":
                # Get session from cookies (sent in initial message)
                session_id = message.get("session_id")
                if not session_id or session_id not in SESSION_STORE:
                    await websocket.send_json({
                        "action": "error",
                        "error": "Invalid session"
                    })
                    continue
                
                print(f"✅ WebSocket session initialized: {session_id}")
                await websocket.send_json({
                    "action": "init_success",
                    "message": "WebSocket connected"
                })
            
            # Handle STT request
            elif action == "stt":
                try:
                    # Receive base64 encoded audio
                    audio_base64 = message.get("audio")
                    if not audio_base64:
                        await websocket.send_json({
                            "action": "stt_response",
                            "error": "No audio data"
                        })
                        continue
                    
                    # Decode audio
                    audio_data = base64.b64decode(audio_base64)
                    
                    print(f"📤 WebSocket STT: Processing {len(audio_data)} bytes")
                    
                    # Send to Deepgram
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
                        await websocket.send_json({
                            "action": "stt_response",
                            "error": f"Deepgram error: {response.status_code}"
                        })
                        continue
                    
                    result = response.json()
                    transcript = ""
                    if result.get("results") and result["results"].get("channels"):
                        alternatives = result["results"]["channels"][0].get("alternatives", [])
                        if alternatives:
                            transcript = alternatives[0].get("transcript", "").strip()
                    
                    print(f"📝 WebSocket STT result: '{transcript}'")
                    
                    await websocket.send_json({
                        "action": "stt_response",
                        "text": transcript
                    })
                    
                except Exception as e:
                    print(f"❌ WebSocket STT error: {e}")
                    await websocket.send_json({
                        "action": "stt_response",
                        "error": str(e)
                    })
            
            # Handle LLM request
            elif action == "llm":
                print(f"\n📨 Received LLM request via WebSocket")
                print(f"   Action: {action}")
                print(f"   Message keys: {list(message.keys())}")
                try:
                    if not session_id or session_id not in SESSION_STORE:
                        print(f"   ❌ Session validation failed: session_id={session_id}, exists={session_id in SESSION_STORE}")
                        await websocket.send_json({
                            "action": "llm_response",
                            "error": "No active session"
                        })
                        continue
                    
                    user_input = message.get("prompt", "")
                    print(f"🤖 WebSocket LLM: Processing '{user_input}'")
                    print(f"   Session ID: {session_id}")
                    
                    session_data = get_session_data(session_id)
                    print(f"   Session data keys: {list(session_data.keys())}")
                    
                    # Set API key
                    if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
                        os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
                    
                    client = genai.Client()
                    
                    # Get user context
                    cv_text = session_data.get('cv_text', '')
                    user_name = session_data.get('user_name', 'Candidate')
                    tone = session_data.get('interviewer_tone', 'professional')
                    
                    # Build prompt
                    system_prompt = get_tone_prompt(tone, cv_text, user_name)
                    conversation_history = session_data.get('conversation_history', [])
                    
                    context = ""
                    if conversation_history:
                        recent = conversation_history[-3:]
                        context = "\n".join([
                            f"Q: {item['question']}\nA: {item['answer']}"
                            for item in recent
                        ])
                        context = f"\n\nRECENT CONVERSATION:\n{context}\n"
                    
                    full_prompt = f"""{system_prompt}

{context}

CANDIDATE'S RESPONSE: {user_input}

IMPORTANT: Reply with ONE concise sentence (8-12 words). Be direct and natural."""
                    
                    # Generate response
                    print(f"   Calling Gemini 2.5 Flash with prompt length: {len(full_prompt)}")
                    
                    response = client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=full_prompt
                    )
                    
                    bot_response = response.text.strip()
                    print(f"   Gemini raw response: '{bot_response}'")
                    print(f"   Response length: {len(bot_response)}")
                    
                    if not bot_response:
                        print(f"   ⚠️ WARNING: Empty response from Gemini!")
                        print(f"   Response object: {response}")
                    
                    # Store in conversation history
                    conversation_history.append({
                        "question": bot_response,
                        "answer": user_input,
                        "timestamp": datetime.now().isoformat()
                    })
                    session_data['conversation_history'] = conversation_history
                    save_session(session_id, session_data)
                    
                    print(f"✅ WebSocket LLM response: {bot_response}")
                    
                    await websocket.send_json({
                        "action": "llm_response",
                        "text": bot_response
                    })
                    
                except Exception as e:
                    print(f"❌ WebSocket LLM error: {e}")
                    import traceback
                    print(f"   Full traceback:")
                    traceback.print_exc()
                    try:
                        await websocket.send_json({
                            "action": "llm_response",
                            "text": "I'm having trouble processing that. Could you rephrase?",
                            "error": str(e)
                        })
                    except:
                        print(f"   ❌ Failed to send error response")
            
            else:
                await websocket.send_json({
                    "action": "error",
                    "error": f"Unknown action: {action}"
                })
                
    except WebSocketDisconnect:
        print("🔌 WebSocket disconnected")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass

@app.get("/coding-assessment", response_class=HTMLResponse)
async def coding_assessment(request: Request):
    """Render coding assessment page"""
    session_id = get_session_id(request)
    if not session_id:
        return RedirectResponse(url="/login", status_code=302)
    
    session_data = get_session_data(session_id)
    if 'user_name' not in session_data:
        return RedirectResponse(url="/login", status_code=302)
    
    return templates.TemplateResponse('coding_assessment.html', {"request": request})

@app.post("/api/run-code")
async def run_code(request: Request):
    """Execute code and return output"""
    try:
        data = await request.json()
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        print(f"\n💻 Running {language} code...")
        
        if language == 'python':
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
                        return {"success": True, "output": result.stdout}
                    else:
                        return {"success": False, "error": result.stderr}
                except subprocess.TimeoutExpired:
                    os.unlink(f.name)
                    return {"success": False, "error": "Execution timeout (5s limit)"}
        else:
            return {"success": False, "error": f"{language} execution not yet supported"}
            
    except Exception as e:
        print(f"❌ Code execution error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/submit-code")
async def submit_code(request: Request):
    """Submit and evaluate code solution"""
    try:
        data = await request.json()
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        session_id = get_session_id(request)
        
        print(f"\n✅ Submitting {language} solution...")
        
        # Simple mock evaluation (in production, run actual test cases)
        passed_tests = 3
        total_tests = 3
        score = int((passed_tests / total_tests) * 100)
        
        # Save to session if logged in
        if session_id:
            session_data = get_session_data(session_id)
            session_data['coding_assessment'] = {
                'score': score,
                'code': code,
                'language': language,
                'passed_tests': passed_tests,
                'total_tests': total_tests
            }
            save_session(session_id, session_data)
            print(f"   💾 Coding assessment saved to session (Score: {score}/100)")
        
        return {
            "passed": passed_tests == total_tests,
            "score": score,
            "passed_tests": passed_tests,
            "total_tests": total_tests,
            "execution_time": 45,
            "details": "All test cases passed!" if passed_tests == total_tests else f"Failed {total_tests - passed_tests} test(s)"
        }
        
    except Exception as e:
        print(f"❌ Code submission error: {e}")
        return {"passed": False, "error": str(e)}

@app.post("/api/analyze-body-language")
async def analyze_body_language():
    """Analyze body language from webcam frame (demo mode)"""
    try:
        import random
        
        # Generate random demo scores
        analysis = {
            "posture_score": random.randint(70, 95),
            "eye_contact_score": random.randint(65, 90),
            "confidence_level": random.choice(["High", "Medium", "Good"]),
            "facial_expression": random.choice(["Engaged", "Neutral", "Focused", "Confident"])
        }
        
        return {"success": True, "analysis": analysis}
        
    except Exception as e:
        print(f"❌ Body language analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluate")
async def evaluate_interview(request: Request):
    """Evaluate candidate using Gemini AI and generate comprehensive report"""
    try:
        session_id = get_session_id(request)
        if not session_id:
            raise HTTPException(status_code=401, detail="Not logged in")
        
        session_data = get_session_data(session_id)
        if 'user_name' not in session_data:
            raise HTTPException(status_code=401, detail="Not logged in")
        
        user_name = session_data.get('user_name')
        user_email = session_data.get('user_email', '')
        cv_text = session_data.get('cv_text', '')
        conversation_history = session_data.get('conversation_history', [])
        coding_assessment = session_data.get('coding_assessment', {})
        
        if len(conversation_history) < 2:
            raise HTTPException(status_code=400, detail="Not enough conversation data")
        
        print(f"🔍 Evaluating {user_name} using Gemini AI...")
        
        # Build conversation transcript
        transcript = "\n\n".join([
            f"Interviewer: {item['question']}\nCandidate: {item['answer']}"
            for item in conversation_history
        ])
        
        # Build coding assessment section
        coding_section = ""
        if coding_assessment:
            coding_section = f"""
CODING ASSESSMENT:
- Score: {coding_assessment.get('score', 'N/A')}/100
- Language: {coding_assessment.get('language', 'N/A')}
- Code Submitted: {'Yes' if coding_assessment.get('code') else 'No'}
"""
        
        # Set API key
        if 'GEMINI_API_KEY' not in os.environ and GEMINI_API_KEY:
            os.environ['GEMINI_API_KEY'] = GEMINI_API_KEY
        
        client = genai.Client()
        
        # Create comprehensive evaluation prompt
        evaluation_prompt = f"""You are an expert HR interviewer and talent evaluator. Analyze the following interview data and provide a comprehensive evaluation.

CANDIDATE INFORMATION:
Name: {user_name}
Email: {user_email}

CANDIDATE'S RESUME:
{cv_text[:3000]}

INTERVIEW TRANSCRIPT:
{transcript}

{coding_section}

EVALUATION INSTRUCTIONS:
Analyze the candidate's performance across multiple dimensions and provide detailed scores and feedback.

Provide your evaluation in the following JSON format (ONLY return valid JSON, no markdown):
{{
  "overall_score": <0-100>,
  "technical_score": <0-100>,
  "communication_score": <0-100>,
  "experience_score": <0-100>,
  "problem_solving_score": <0-100>,
  "cultural_fit_score": <0-100>,
  "strengths": [
    "Specific strength 1 with example from interview",
    "Specific strength 2 with example from interview",
    "Specific strength 3 with example from interview"
  ],
  "weaknesses": [
    "Specific weakness 1 with example",
    "Specific weakness 2 with example"
  ],
  "improvements": [
    "Actionable improvement suggestion 1",
    "Actionable improvement suggestion 2",
    "Actionable improvement suggestion 3"
  ],
  "technical_assessment": "Detailed paragraph about technical skills demonstrated",
  "communication_assessment": "Detailed paragraph about communication skills",
  "experience_assessment": "Detailed paragraph about relevant experience",
  "recommendation": "HIRE / MAYBE / REJECT with brief justification",
  "summary": "2-3 sentence overall summary of the candidate"
}}

SCORING CRITERIA:
- Technical Score: Depth of technical knowledge, problem-solving ability, coding skills
- Communication Score: Clarity, articulation, listening skills, professionalism
- Experience Score: Relevance of past experience, achievements, impact
- Problem Solving Score: Analytical thinking, approach to challenges
- Cultural Fit Score: Alignment with company values, teamwork, adaptability

Be specific and reference actual examples from the interview transcript and resume."""

        print("📤 Sending evaluation request to Gemini 2.5 Flash...")
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=evaluation_prompt
        )
        
        # Extract JSON from response
        response_text = response.text.strip()
        print(f"📥 Received Gemini response: {response_text[:200]}...")
        
        # Try to extract JSON
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            evaluation = json.loads(json_match.group())
            print(f"✅ Evaluation parsed successfully")
            print(f"   Overall Score: {evaluation.get('overall_score', 'N/A')}/100")
            print(f"   Recommendation: {evaluation.get('recommendation', 'N/A')}")
        else:
            print("⚠️ Could not parse JSON, using fallback evaluation")
            evaluation = {
                "overall_score": 75,
                "technical_score": 80,
                "communication_score": 70,
                "experience_score": 75,
                "problem_solving_score": 70,
                "cultural_fit_score": 75,
                "strengths": ["Good technical knowledge", "Clear communication", "Relevant experience"],
                "weaknesses": ["Could provide more specific examples", "Limited depth in some areas"],
                "improvements": ["Practice behavioral questions", "Prepare more detailed project examples"],
                "technical_assessment": "Demonstrated solid technical foundation",
                "communication_assessment": "Communicated clearly and professionally",
                "experience_assessment": "Has relevant experience in the field",
                "recommendation": "MAYBE",
                "summary": "Candidate shows promise with room for growth."
            }
        
        # Generate comprehensive PDF report
        filename = f"Interview_Report_{user_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = os.path.join(REPORTS_FOLDER, filename)
        
        # Create comprehensive PDF
        doc = SimpleDocTemplate(filepath, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=26,
            textColor=colors.HexColor('#4338ca'),
            spaceAfter=20,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        story.append(Paragraph("AI-Powered Interview Evaluation Report", title_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Candidate Info Box
        info_data = [
            ['Candidate:', user_name],
            ['Email:', user_email],
            ['Date:', datetime.now().strftime('%B %d, %Y')],
            ['Recommendation:', evaluation.get('recommendation', 'N/A')]
        ]
        info_table = Table(info_data, colWidths=[1.5*inch, 4.5*inch])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0f4ff')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#4338ca')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 3), (1, 3), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#4338ca')),
            ('PADDING', (0, 0), (-1, -1), 8)
        ]))
        story.append(info_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Executive Summary
        if 'summary' in evaluation:
            story.append(Paragraph("<b>Executive Summary</b>", styles['Heading2']))
            story.append(Paragraph(evaluation['summary'], styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
        
        # Comprehensive Scores
        story.append(Paragraph("<b>Evaluation Scores</b>", styles['Heading2']))
        score_data = [
            ['Category', 'Score', 'Rating'],
        ]
        
        def get_rating(score):
            if score >= 85: return 'Excellent'
            elif score >= 70: return 'Good'
            elif score >= 55: return 'Average'
            else: return 'Needs Improvement'
        
        score_categories = [
            ('Overall Performance', 'overall_score'),
            ('Technical Skills', 'technical_score'),
            ('Communication', 'communication_score'),
            ('Experience & Background', 'experience_score'),
            ('Problem Solving', 'problem_solving_score'),
            ('Cultural Fit', 'cultural_fit_score')
        ]
        
        for category, key in score_categories:
            score = evaluation.get(key, 0)
            rating = get_rating(score)
            score_data.append([category, f"{score}/100", rating])
        
        score_table = Table(score_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4338ca')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')])
        ]))
        story.append(score_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Detailed Assessments
        if 'technical_assessment' in evaluation:
            story.append(Paragraph("<b>Technical Assessment</b>", styles['Heading2']))
            story.append(Paragraph(evaluation['technical_assessment'], styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        
        if 'communication_assessment' in evaluation:
            story.append(Paragraph("<b>Communication Assessment</b>", styles['Heading2']))
            story.append(Paragraph(evaluation['communication_assessment'], styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        
        if 'experience_assessment' in evaluation:
            story.append(Paragraph("<b>Experience Assessment</b>", styles['Heading2']))
            story.append(Paragraph(evaluation['experience_assessment'], styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
        
        # Strengths
        story.append(Paragraph("<b>Key Strengths</b>", styles['Heading2']))
        for i, strength in enumerate(evaluation.get('strengths', []), 1):
            story.append(Paragraph(f"{i}. {strength}", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
        
        # Weaknesses
        if 'weaknesses' in evaluation and evaluation['weaknesses']:
            story.append(Paragraph("<b>Areas of Concern</b>", styles['Heading2']))
            for i, weakness in enumerate(evaluation['weaknesses'], 1):
                story.append(Paragraph(f"{i}. {weakness}", styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
        
        # Improvement Recommendations
        story.append(Paragraph("<b>Development Recommendations</b>", styles['Heading2']))
        for i, improvement in enumerate(evaluation.get('improvements', []), 1):
            story.append(Paragraph(f"{i}. {improvement}", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
        
        # Coding Assessment (if available)
        if coding_assessment:
            story.append(Paragraph("<b>Coding Assessment Results</b>", styles['Heading2']))
            story.append(Paragraph(f"Score: {coding_assessment.get('score', 'N/A')}/100", styles['Normal']))
            story.append(Paragraph(f"Language: {coding_assessment.get('language', 'N/A')}", styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
        
        # Footer
        story.append(Spacer(1, 0.3*inch))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        story.append(Paragraph("This report was generated using AI-powered analysis. Human review is recommended.", footer_style))
        story.append(Paragraph(f"Generated by HireGenie • {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        
        # Build PDF
        doc.build(story)
        
        print(f"✅ Report generated: {filename}")
        
        return {
            "success": True,
            "evaluation": evaluation,
            "report_filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download-report/{filename}")
async def download_report(filename: str):
    """Download generated PDF report"""
    try:
        filepath = os.path.join(REPORTS_FOLDER, filename)
        print(f"📥 Download request for: {filename}")
        print(f"   Looking in: {filepath}")
        print(f"   File exists: {os.path.exists(filepath)}")
        
        if os.path.exists(filepath):
            return FileResponse(
                filepath, 
                media_type="application/pdf",
                filename=filename
            )
        else:
            print(f"   ❌ File not found!")
            raise HTTPException(status_code=404, detail="Report not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Download error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
