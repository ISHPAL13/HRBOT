# Project Report: HireGenie – AI-Powered Interview Coach

## 1. Introduction
**HireGenie** is a comprehensive, AI-driven recruitment ecosystem designed to serve both sides of the hiring table. It functions as an advanced **AI Interview Coach** for job seekers, providing realistic mock interviews and personalized feedback, while simultaneously serving recruiters as an **Autonomous Interviewing Agent** capable of conducting initial screening rounds and assessing candidates without human intervention. By leveraging Generative AI, real-time audio/video streaming, and speech recognition, HireGenie bridges the gap between talent and opportunity, ensuring candidates are well-prepared and recruiters can hire faster and fairer.

---

## 2. Problem Statement

The recruitment landscape is fraught with inefficiencies for both sides of the hiring table:

### For Job Seekers
Candidates often struggle to present their best selves due to:
*   **Interview Anxiety:** The pressure of high-stakes interviews often leads to underperformance, even for highly qualified candidates.
*   **Lack of Realistic Practice:** Traditional methods (mirrors, friends) fail to simulate the pressure and unpredictability of a real corporate interviewer.
*   **Expensive Coaching:** Professional career coaching and mock interview services are often prohibitively expensive for students and early-career professionals.
*   **Generic Feedback:** Online resources provide generic questions that lack context, failing to challenge the candidate based on their specific resume or background.
*   **Subjective Self-Assessment:** Candidates struggle to objectively evaluate their own non-verbal cues, tone of voice, and answer structure without unbiased feedback.

### For Recruiters
Hiring teams face significant resource constraints and process bottlenecks:
*   **Screening Fatigue:** Reviewing hundreds of resumes and conducting repetitive initial screening calls consumes vast amounts of recruiter time.
*   **Scheduling Nightmares:** Coordinating availability between candidates and interviewers leads to long hiring cycles.
*   **Inconsistent Evaluation:** Different interviewers may ask different questions or have varying standards, leading to unfair comparisons and subconscious bias.
*   **Limited Soft Skills Assessment:** Resumes only show technical skills; assessing communication, confidence, and cultural fit usually requires a time-consuming face-to-face meeting.
*   **Candidate Drop-off:** Slow interview processes result in losing top talent to faster-moving competitors.

---

## 3. Solution Overview
HireGenie offers a unified platform with distinct workflows for candidates and employers.

### Key Features for Recruiters (Automated Hiring)
1.  **Zero-Touch Screening:** Companies can upload a Job Description (JD), and the AI Avatar will autonomously interview thousands of candidates simultaneously.
2.  **Standardized Evaluation:** Eliminates human bias by ensuring every candidate is evaluated against the same consistent criteria.
3.  **Automated Reporting & Ranking:** Recruiters receive generated report cards with scores on Technical Knowledge, Communication, and Confidence.
4.  **24/7 Availability:** Interviews can happen anytime, anywhere.

### Detailed Platform Features (Candidate & Core System)

#### 1. Authentication & Onboarding
*   **User Login Flow:**
    *   Inputs for Name, Email, and Phone.
    *   Mandatory Terms & Conditions acceptance.
    *   **OTP Verification:** Includes mock logic for sending and resending OTPs, with UI state switching (Login → OTP → Onboarding). *(Note: Currently frontend-simulated)*.
*   **Guided Onboarding:**
    *   **Profile Setup:** Resume upload, Experience level, Target role, Industry, and Skills input.
    *   **Preferences:** Selection for Interview type (Behavioral/Technical), Difficulty, and Duration.
    *   **Communication:** Options for Email notifications and SMS reminders.

#### 2. Resume Handling
*   **Upload System:** Click-to-upload UI with file preview.
*   **Validation:** Supports PDF/DOC/DOCX formats with a 5MB size limit.
*   **Management:** Users can view uploaded filenames or remove resumes.

#### 3. Dashboard & Analytics
*   **Interview Analytics:** Dynamic calculation of Total interviews, Average score, Pass rate (≥70%), and High/Low scores.
*   **Performance Distribution:** Visual categorization of scores:
    *   *Excellent (90–100)*
    *   *Good (70–89)*
    *   *Average (50–69)*
    *   *Needs Improvement (<50)*
*   **Activity Tracking:** Weekly/Monthly interview counts and Language usage analytics.
*   **Recent Interviews:** List view with score badges, date/time, language used, and delete functionality.

#### 4. Interview Session Features
*   **Live Workspace:** Dedicated two-column layout separating the interaction area from controls/analytics.
*   **Live Transcription:** UI-ready interface for Start/Stop recording with animations to differentiate AI vs. Candidate speech.
*   **Manual Input:** Text-based fallback for sending messages to the AI flow.
*   **Quick Prompts:** Predefined questions (e.g., "Tell me about yourself", "Future goals") for easy interaction.
*   **Controls:** Pause and End interview capabilities.

#### 5. AI Feedback & Scoring
*   **Performance Indicators:** Real-time animated progress bars for:
    *   Communication Score
    *   Confidence Score
    *   Relevance Score
    *   *(Note: Metrics are currently simulated for demonstration)*.

#### 6. Session Tracking & Language Support
*   **Live Stats:** Display of session duration and message counts.
*   **Multilingual UI:** Selector supporting English, Spanish, French, German, Mandarin, Japanese, Hindi, and Arabic.

---

## 4. System Architecture

The application follows a modern client-server architecture designed for low latency and high scalability.

### High-Level Components

1.  **Frontend (Client-Side):**
    *   **Technology:** HTML5, Vanilla JavaScript (ES6+), Tailwind CSS.
    *   **Description:** A Single Page Application (SPA) dashboard that handles user session state, navigation, and media rendering. It utilizes `dashboard.js` for dynamic routing and UI updates.
    *   **Media Handling:** Integrates **LiveKit Client** for WebRTC streaming and **Deepgram SDK** for audio capture.

2.  **Backend (Server-Side):**
    *   **Technology:** Python, FastAPI, Uvicorn.
    *   **Description:** A high-performance asynchronous web server that manages API endpoints (`/api/login`, `/api/records`) and WebSocket connections for real-time state management.
    *   **Data Storage:** A lightweight JSON-based database (`db.py`) for persisting user sessions and interview records.

3.  **AI & Cloud Integrations:**
    *   **Google Gemini (GenAI):** The "Brain" of the operation. It generates dynamic prompts and evaluates user responses.
    *   **HeyGen API:** The "Face" of the interviewer. Generates the video stream for the interactive avatar.
    *   **Deepgram:** The "Ears" of the system. Converts user speech to text in real-time.
    *   **LiveKit:** The "Infrastructure" for transporting audio and video packets with minimal latency.

### Data Flow
1.  **Input:** User speaks into the microphone -> Browser captures Audio.
2.  **Transcription:** Audio stream -> Deepgram API -> Text Transcript.
3.  **Processing:** Transcript + Resume Context -> Backend -> Gemini LLM.
4.  **Response Generation:** Gemini generates a text response.
5.  **Synthesis:** Text Response -> HeyGen API -> Video Stream.
6.  **Output:** Video Stream -> LiveKit -> Browser Video Player.

---

## 5. Technology Stack

### Technical Stack
*   **Frontend:**
    *   **HTML5/CSS3:** Semantic markup with modern CSS features (Flexbox, Grid).
    *   **Tailwind CSS:** Utility-first CSS framework for rapid, responsive UI development.
    *   **JavaScript (ES6+):** Core application logic, DOM manipulation, and state management.
    *   **LiveKit Client SDK:** WebRTC implementation for real-time video streaming.
    *   **Deepgram SDK:** Real-time speech-to-text (STT) integration.

*   **Backend:**
    *   **Python 3.x:** Primary server-side programming language.
    *   **FastAPI:** High-performance, async web framework for building APIs.
    *   **Uvicorn:** ASGI web server implementation.
    *   **Requests/Aiohttp:** For handling asynchronous HTTP requests to external AI services.

*   **AI & Cloud Services:**
    *   **Google Gemini API:** Large Language Model (LLM) for conversational intelligence.
    *   **HeyGen API:** AI Video Generation for the interactive avatar.
    *   **Deepgram API:** Speech Recognition.
    *   **LiveKit Cloud:** Real-time media transport infrastructure.

*   **Data & Storage:**
    *   **Local JSON DB:** Lightweight, file-based persistence for user sessions and records (`db.py`).
    *   **FileSystem:** Storage for uploaded Resume PDFs.

### Non-Technical Stack
*   **Design:**
    *   **Glassmorphism UI:** Modern aesthetic utilizing background blur, semi-transparent layers, and soft shadows.
    *   **Inter Font:** Use of the 'Inter' typeface for clean, professional typography.
    *   **SVG Icons:** Lightweight, scalable vector icons for UI elements.
*   **Development Tools:**
    *   **VS Code:** Integrated Development Environment.
    *   **Git:** Version control system.
    *   **Pip/Virtualenv:** Python package and environment management.

---

## 6. Market Differentiation
What makes HireGenie unique compared to existing tools?

| Feature | Standard Mock Interview Tools | **HireGenie** |
| :--- | :--- | :--- |
| **Interaction Mode** | Text Chat / Audio Only | **Real-time Video Avatar** |
| **Context Awareness** | Generic Question Bank | **Resume-Aware Dynamic Questions** |
| **Latency** | High (Wait times for generation) | **Real-time Streaming (Low Latency)** |
| **UX/UI** | Basic Forms | **Modern, Glassmorphism Dashboard** |
| **Feedback Loop** | Text Summary | **Live Interaction + Post-Session Analytics** |

**Unique Selling Proposition (USP):** The combination of a *visual* AI avatar with *resume-specific* context creates a "suspension of disbelief," making the practice feel like a real human interaction rather than a test.

---

## 7. Future Scope & Roadmap
*   **Body Language Analysis:** Using computer vision to analyze user webcam feed for eye contact, posture, and facial expressions during the interview.
*   **Technical Coding Interviews:** Integration of a shared code editor for technical screening rounds.
*   **Voice Tone Analysis:** Analyzing user audio for confidence, pacing, and filler words ("um", "uh").
*   **Multi-Language Support:** conducting interviews in languages other than English using multi-lingual LLM capabilities.
*   **Enterprise Integration:** Allowing companies to upload their specific job descriptions to screen candidates automatically.

---

## 8. Conclusion
HireGenie represents the next generation of EdTech and HRTech tools. By democratizing access to high-quality, personalized interview coaching, it empowers job seekers to build confidence and secure their dream careers. The project successfully integrates complex, disparity AI technologies into a seamless, user-friendly cohesive web application.
