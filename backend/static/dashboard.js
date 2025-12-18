
const defaultConfig = {
  background_color: "#f0f4f8",
  surface_color: "#ffffff",
  text_color: "#1a202c",
  primary_action: "#3b82f6",
  secondary_action: "#6366f1",
  font_family: "Inter",
  font_size: 16,
  platform_title: "HireGenie",
  tagline: "Smart interviewing powered by AI",
  login_welcome: "Welcome back! Please sign in to continue.",
  dashboard_title: "Analytics Dashboard",
  interview_title: "Live Interview Session"
};

let config = { ...defaultConfig };
let currentRecordCount = 0;
let allRecords = [];
let currentPage = 'login';
let isLoggedIn = false;
let currentUser = null;

// API Helpers
async function apiCall(url, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (e) {
    console.error("API Error", e);
    return null;
  }
}

async function loadRecords() {
  const records = await apiCall('/api/records');
  if (records) {
    allRecords = records;
    currentRecordCount = records.length;
    if (currentPage === 'dashboard') renderDashboard();
  }
}

async function checkSession() {
  const info = await apiCall('/api/user-info');
  if (info && info.logged_in) {
    currentUser = { name: info.name, email: info.email };
    isLoggedIn = true;
    currentPage = 'dashboard';
    await loadRecords();
    renderApp();
  } else {
    renderApp();
  }
}

// Toast
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// App Logic
function initApp() {
  applyConfig();
  checkSession();

  window.navigateTo = (page) => {
    currentPage = page;
    renderApp();
  };

  window.logout = async () => {
    await apiCall('/api/logout', 'POST');
    isLoggedIn = false;
    currentUser = null;
    currentPage = 'login';
    renderApp();
  };
}

function applyConfig() {
  const customFont = config.font_family;
  const baseSize = config.font_size;
  const baseFontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  document.body.style.backgroundColor = config.background_color;
  document.body.style.fontFamily = `${customFont}, ${baseFontStack}`;
  document.body.style.fontSize = `${baseSize}px`;
  document.body.style.color = config.text_color;

  const app = document.getElementById('app');
  if (app) app.style.backgroundColor = config.background_color;
}

function renderApp() {
  const app = document.getElementById('app');
  const customFont = config.font_family;
  const baseSize = config.font_size;

  if (isLoggedIn) {
    app.innerHTML = `
      <div style="display: flex; height: 100vh; background-color: ${config.background_color}; color: ${config.text_color}; font-family: ${customFont}, sans-serif;">
        <!-- Sidebar Navigation -->
        <nav style="width: 260px; background-color: white; padding: 24px; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 10;">
          <div style="margin-bottom: 40px; padding: 0 12px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
               <div style="width: 32px; height: 32px; background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white;">
                  <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
               </div>
               <h1 style="font-size: ${baseSize * 1.2}px; font-weight: 800; color: ${config.text_color}; letter-spacing: -0.5px; margin: 0;">${config.platform_title}</h1>
            </div>
            <p style="font-size: ${baseSize * 0.75}px; color: #64748b; font-weight: 500; margin-left: 44px;">AI Interview Coach</p>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
            <button onclick="navigateTo('dashboard')" class="nav-btn ${currentPage === 'dashboard' ? 'active' : ''}" style="transition: all 0.2s; display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: none; border-radius: 12px; cursor: pointer; text-align: left; font-size: 0.95em; font-weight: 600; background: ${currentPage === 'dashboard' ? '#eff6ff' : 'transparent'}; color: ${currentPage === 'dashboard' ? config.primary_action : '#64748b'};">
              <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
              Dashboard
            </button>
            <button onclick="navigateTo('interview')" class="nav-btn ${currentPage === 'interview' ? 'active' : ''}" style="transition: all 0.2s; display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: none; border-radius: 12px; cursor: pointer; text-align: left; font-size: 0.95em; font-weight: 600; background: ${currentPage === 'interview' ? '#eff6ff' : 'transparent'}; color: ${currentPage === 'interview' ? config.primary_action : '#64748b'};">
              <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
              Interview Room
            </button>
            <button onclick="navigateTo('training')" class="nav-btn ${currentPage === 'training' ? 'active' : ''}" style="transition: all 0.2s; display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: none; border-radius: 12px; cursor: pointer; text-align: left; font-size: 0.95em; font-weight: 600; background: ${currentPage === 'training' ? '#eff6ff' : 'transparent'}; color: ${currentPage === 'training' ? config.primary_action : '#64748b'};">
               <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
               Training
            </button>
            <button onclick="navigateTo('profile')" class="nav-btn ${currentPage === 'profile' ? 'active' : ''}" style="transition: all 0.2s; display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: none; border-radius: 12px; cursor: pointer; text-align: left; font-size: 0.95em; font-weight: 600; background: ${currentPage === 'profile' ? '#eff6ff' : 'transparent'}; color: ${currentPage === 'profile' ? config.primary_action : '#64748b'};">
              <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
              My Profile
            </button>
          </div>
          
          <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid #f1f5f9;">
             <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 0 8px;">
                 <div style="width: 36px; height: 36px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #64748b;">
                    ${currentUser?.name.charAt(0) || 'U'}
                 </div>
                 <div style="flex: 1; overflow: hidden;">
                     <div style="font-size: 0.9em; font-weight: 600; color: ${config.text_color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser?.name}</div>
                     <div style="font-size: 0.75em; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser?.email}</div>
                 </div>
             </div>
             <button onclick="logout()" style="width: 100%; background: white; color: ${config.secondary_action}; border: 1px solid #e2e8f0; padding: 10px; border-radius: 10px; cursor: pointer; font-size: 0.9em; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.borderColor='${config.secondary_action}'" onmouseout="this.style.borderColor='#e2e8f0'">
               <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
               Log Out
             </button>
          </div>
        </nav>
        
        <main style="flex: 1; overflow-y: auto; position: relative;">
          <div id="page-content" style="height: 100%;"></div>
        </main>
      </div>
    `;

    if (currentPage === 'dashboard') renderDashboard();
    else if (currentPage === 'interview') renderInterview();
    if (currentPage === 'dashboard') renderDashboard();
    else if (currentPage === 'interview') renderInterview();
    else if (currentPage === 'training') renderTraining();
    else if (currentPage === 'profile') renderProfile();
  } else {
    renderLogin();
  }
}

function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4f8 0%, #dbeafe 100%); padding: 20px;">
      <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); padding: 48px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); max-width: 440px; width: 100%; border: 1px solid rgba(255,255,255,0.6);">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 50px; height: 50px; background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
            <svg style="width: 26px; height: 26px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
          </div>
          <h1 style="font-size: ${config.font_size * 1.6}px; font-weight: 800; color: ${config.text_color}; margin: 0 0 6px 0; letter-spacing: -0.5px;">Welcome Back</h1>
          <p style="color: #64748b; margin: 0; font-size: 0.95em;">Enter your details to access your dashboard.</p>
        </div>
        
        <form id="loginForm" onsubmit="handleLoginSubmit(event)">
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569; font-size: 0.85em; text-transform: uppercase;">Full Name</label>
            <input type="text" id="name" required placeholder="Ex. Sarah Connor" style="width: 100%; padding: 12px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.95em; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='${config.primary_action}'; this.style.backgroundColor='white'">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569; font-size: 0.85em; text-transform: uppercase;">Email Address</label>
            <input type="email" id="email" required placeholder="sarah@example.com" style="width: 100%; padding: 12px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.95em; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='${config.primary_action}'; this.style.backgroundColor='white'">
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569; font-size: 0.85em; text-transform: uppercase;">Phone Number</label>
            <input type="tel" id="phone" required placeholder="+1 (555) 000-0000" style="width: 100%; padding: 12px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.95em; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='${config.primary_action}'; this.style.backgroundColor='white'">
          </div>

          <div style="margin-bottom: 24px; display: flex; align-items: start; gap: 10px;">
             <input type="checkbox" id="terms" required style="margin-top: 4px; accent-color: ${config.primary_action};">
             <label for="terms" style="font-size: 0.85em; color: #64748b; line-height: 1.4;">I agree to the <a href="#" style="color: ${config.primary_action}; text-decoration: none; font-weight: 500;">Terms of Service</a> & Privacy Policy.</label>
          </div>

          <button type="submit" id="loginBtn" class="btn-primary" style="width: 100%; background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); color: white; border: none; padding: 14px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1em; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); transition: transform 0.1s;">
            Get Verification Code
          </button>
        </form>
      </div>
    </div>
  `;
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;

  const btn = document.getElementById('loginBtn');
  btn.innerHTML = 'Sending Code...';
  btn.disabled = true;

  // Mock API delay
  setTimeout(() => {
    currentUser = { name, email, phone };
    renderOTP();
  }, 1000);
}

function renderOTP() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4f8 0%, #dbeafe 100%); padding: 20px;">
      <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); padding: 48px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); max-width: 440px; width: 100%; border: 1px solid rgba(255,255,255,0.6); text-align: center;">
        
        <div style="width: 60px; height: 60px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: ${config.primary_action};">
           <svg style="width: 28px; height: 28px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>

        <h2 style="font-size: 1.5em; font-weight: 800; color: ${config.text_color}; margin-bottom: 8px;">Verify Phone</h2>
        <p style="color: #64748b; font-size: 0.95em; margin-bottom: 30px;">Enter the 4-digit code sent to <br><strong>${currentUser.phone}</strong></p>

        <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 30px;">
           <input type="text" maxlength="1" class="otp" style="width: 50px; height: 50px; text-align: center; font-size: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-weight: 700; color: ${config.text_color}; outline: none;" oninput="this.nextElementSibling?.focus()">
           <input type="text" maxlength="1" class="otp" style="width: 50px; height: 50px; text-align: center; font-size: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-weight: 700; color: ${config.text_color}; outline: none;" oninput="this.nextElementSibling?.focus()">
           <input type="text" maxlength="1" class="otp" style="width: 50px; height: 50px; text-align: center; font-size: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-weight: 700; color: ${config.text_color}; outline: none;" oninput="this.nextElementSibling?.focus()">
           <input type="text" maxlength="1" class="otp" style="width: 50px; height: 50px; text-align: center; font-size: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-weight: 700; color: ${config.text_color}; outline: none;" oninput="handleOTPInput()">
        </div>

        <button onclick="handleOTPSubmit()" id="verifyBtn" class="btn-primary" style="width: 100%; background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); color: white; border: none; padding: 14px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1em; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
            Verify & Continue
        </button>

         <p style="margin-top: 24px; font-size: 0.85em; color: #64748b;">
            Didn't receive code? <button style="background: none; border: none; color: ${config.primary_action}; font-weight: 600; cursor: pointer;">Resend</button>
         </p>
         <button onclick="renderLogin()" style="margin-top: 12px; background: none; border: none; font-size: 0.85em; text-decoration: underline; color: #94a3b8; cursor: pointer;">Change Phone Number</button>
      </div>
    </div>
  `;
}

function handleOTPInput() {
  // Auto-focus logic can be enhanced, simplified here
}

function handleOTPSubmit() {
  const inputs = document.querySelectorAll('.otp');
  let code = '';
  inputs.forEach(i => code += i.value);

  if (code.length === 4) {
    const btn = document.getElementById('verifyBtn');
    btn.innerHTML = 'Verifying...';
    setTimeout(() => {
      renderOnboarding();
    }, 800);
  } else {
    showToast("Please enter a 4-digit code");
  }
}

function renderOnboarding() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4f8 0%, #dbeafe 100%); padding: 20px;">
      <div style="background: white; padding: 40px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto;">
        <div style="text-align: center; margin-bottom: 24px;">
           <h1 style="font-size: 1.8em; font-weight: 800; color: ${config.text_color}; margin: 0 0 8px 0;">Setup Your Profile</h1>
           <p style="color: #64748b; font-size: 0.95em;">Personalize your AI interview experience.</p>
        </div>

        <form id="onboardingForm" onsubmit="completeOnboarding(event)">
          
          <!-- Resume -->
          <div style="margin-bottom: 24px; padding: 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.2s;" onclick="document.getElementById('resumeInput').click()" onmouseover="this.style.borderColor='${config.primary_action}'; this.style.backgroundColor='#eff6ff'" onmouseout="this.style.borderColor='#cbd5e1'; this.style.backgroundColor='#f8fafc'">
             <input type="file" id="resumeInput" accept=".pdf" style="display: none;" onchange="document.getElementById('fName').textContent = this.files[0]?.name">
             <div style="color: ${config.primary_action}; font-weight: 600; margin-bottom: 4px;">📂 Upload Resume (PDF)</div>
             <div id="fName" style="font-size: 0.85em; color: #64748b;">Click to browse</div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
             <div>
                <label style="display: block; font-size: 0.8em; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">Target Role</label>
                <input type="text" id="targetRole" placeholder="e.g. Product Manager" class="input-field" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9em;">
             </div>
             <div>
                <label style="display: block; font-size: 0.8em; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">Experience</label>
                <select id="experience" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9em; bg: white;">
                    <option value="entry">0-2 Years</option>
                    <option value="mid">3-5 Years</option>
                    <option value="senior">5-8 Years</option>
                    <option value="lead">8+ Years</option>
                </select>
             </div>
          </div>

          <div style="margin-bottom: 16px;">
             <label style="display: block; font-size: 0.8em; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">Top Skills</label>
             <input type="text" id="skills" placeholder="Java, Leadership, SEO..." style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9em;">
          </div>
          
          <div style="margin-bottom: 24px;">
             <label style="display: block; font-size: 0.8em; font-weight: 600; color: #64748b; margin-bottom: 10px; text-transform: uppercase;">Interviewer Persona</label>
             <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <div onclick="selectTone('professional', this)" class="tone-card selected" style="padding: 10px; border: 1px solid ${config.primary_action}; background: #eff6ff; border-radius: 8px; cursor: pointer; text-align: center;">
                    <div style="font-size: 0.85em; font-weight: 600; color: ${config.primary_action}">Professional</div>
                </div>
                <div onclick="selectTone('friendly', this)" class="tone-card" style="padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; text-align: center;">
                    <div style="font-size: 0.85em; font-weight: 600; color: #475569">Friendly</div>
                </div>
                <div onclick="selectTone('strict', this)" class="tone-card" style="padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; text-align: center;">
                    <div style="font-size: 0.85em; font-weight: 600; color: #475569">Strict</div>
                </div>
             </div>
             <input type="hidden" id="selectedTone" value="professional">
          </div>

          <button type="submit" id="finishBtn" class="btn-primary" style="width: 100%; background: ${config.primary_action}; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 1.05em; display: flex; align-items: center; justify-content: center; gap: 8px;">
            Start Interview Journey &rarr;
          </button>
        </form>
      </div>
    </div>
  `;
}

function selectTone(tone, el) {
  document.querySelectorAll('.tone-card').forEach(c => {
    c.style.borderColor = '#e2e8f0';
    c.style.background = 'white';
    c.querySelector('div').style.color = '#475569';
  });
  el.style.borderColor = config.primary_action;
  el.style.background = '#eff6ff';
  el.querySelector('div').style.color = config.primary_action;
  document.getElementById('selectedTone').value = tone;
}

async function completeOnboarding(event) {
  event.preventDefault();

  const fileInput = document.getElementById('resumeInput');
  if (!fileInput.files[0]) {
    showToast("Please upload a resume");
    return;
  }

  const formData = new FormData();
  formData.append('userName', currentUser.name);
  formData.append('userEmail', currentUser.email);
  formData.append('userPhone', currentUser.phone);
  formData.append('cvFile', fileInput.files[0]);

  formData.append('targetRole', document.getElementById('targetRole').value || '');
  formData.append('experience', document.getElementById('experience').value);
  formData.append('skills', document.getElementById('skills').value || '');
  formData.append('selectedTone', document.getElementById('selectedTone').value);

  const finishBtn = document.getElementById('finishBtn');
  finishBtn.innerHTML = 'Setting up space...';
  finishBtn.disabled = true;

  showToast("Uploading and analyzing...");

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      showToast("Profile setup complete!");
      isLoggedIn = true;
      currentPage = 'dashboard';
      loadRecords();
      renderApp();
    } else {
      const err = await res.json();
      showToast("Error: " + (err.detail || "Login failed"));
    }
  } catch (e) {
    showToast("Login error: " + e.message);
  }
}

function renderDashboard() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const interviews = allRecords;
  const avgScore = interviews.length > 0 ? interviews.reduce((sum, i) => sum + (i.score || 0), 0) / interviews.length : 0;

  pageContent.innerHTML = `
    <div style="padding: 40px; background-color: ${config.background_color}; min-height: 100%;">
       <div style="margin-bottom: 32px;"> 
         <h2 style="font-size: 2em; font-weight: 800; color: ${config.text_color}; margin: 0 0 8px 0; letter-spacing: -0.5px;">Dashboard Overview</h2>
         <p style="color: #64748b; font-size: 1.1em;">Here's how your interview preparation is going.</p>
       </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 40px;">
        <div class="card" style="background: white; padding: 32px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden;">
          <div style="position: absolute; top: -10px; right: -10px; width: 100px; height: 100px; background: #dbeafe; border-radius: 50%; opacity: 0.5;"></div>
          <div style="position: relative;">
              <div style="font-size: 0.9em; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 12px; letter-spacing: 0.05em;">Total Interviews</div>
              <div style="font-size: 3.5em; font-weight: 800; color: ${config.text_color}; line-height: 1;">${interviews.length}</div>
              <div style="margin-top: 12px; font-size: 0.9em; color: #10b981; font-weight: 500;">
                 <span style="background: #d1fae5; padding: 4px 8px; border-radius: 6px;">+${interviews.length} this month</span>
              </div>
          </div>
        </div>

        <div class="card" style="background: white; padding: 32px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden;">
          <div style="position: absolute; top: -10px; right: -10px; width: 100px; height: 100px; background: #ede9fe; border-radius: 50%; opacity: 0.5;"></div>
           <div style="position: relative;">
              <div style="font-size: 0.9em; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 12px; letter-spacing: 0.05em;">Average Score</div>
              <div style="font-size: 3.5em; font-weight: 800; color: ${config.text_color}; line-height: 1;">${avgScore.toFixed(0)}<span style="font-size: 0.5em; color: #94a3b8; font-weight: 600; margin-left: 4px;">%</span></div>
              <div style="margin-top: 12px; font-size: 0.9em; color: ${avgScore >= 70 ? '#10b981' : '#f59e0b'}; font-weight: 500;">
                 ${avgScore >= 70 ? 'Excellent performance' : 'Keep practicing'}
              </div>
          </div>
        </div>
        
        <div class="card" style="background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); padding: 32px; border-radius: 20px; box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2); color: white; display: flex; flex-direction: column; justify-content: center;">
             <h3 style="margin: 0 0 8px 0; font-size: 1.5em; font-weight: 700;">Start a New Session</h3>
             <p style="margin: 0 0 24px 0; opacity: 0.9;">Ready to practice? Jump into a realistic AI interview.</p>
             <button onclick="navigateTo('interview')" style="background: white; color: ${config.primary_action}; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; align-self: flex-start;">Start Now</button>
        </div>
      </div>
      
      <div style="background: white; padding: 0; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
        <div style="padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-weight: 700; margin: 0; font-size: 1.25em;">Recent Activity</h3>
            <button style="background: none; border: none; color: ${config.primary_action}; font-weight: 600; cursor: pointer;">View All</button>
        </div>
        <div id="interviewList">
           ${interviews.length > 0 ? `
             <table style="width: 100%; border-collapse: collapse;">
               <thead style="background: #f8fafc; color: #64748b; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em;">
                 <tr>
                    <th style="padding: 16px 32px; text-align: left; font-weight: 600;">Date</th>
                    <th style="padding: 16px 32px; text-align: left; font-weight: 600;">Candidate</th>
                    <th style="padding: 16px 32px; text-align: left; font-weight: 600;">Status</th>
                    <th style="padding: 16px 32px; text-align: right; font-weight: 600;">Score</th>
                    <th style="padding: 16px 32px; text-align: right; font-weight: 600;">Actions</th>
                 </tr>
               </thead>
               <tbody>
                  ${interviews.map(i => `
                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                      <td style="padding: 20px 32px; color: ${config.text_color}; font-weight: 500;">${new Date(i.timestamp).toLocaleDateString()}</td>
                      <td style="padding: 20px 32px; color: #64748b;">${i.name || currentUser.name}</td>
                      <td style="padding: 20px 32px;"><span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600;">Completed</span></td>
                      <td style="padding: 20px 32px; text-align: right; font-weight: 700; color: ${config.text_color};">${i.score || 'N/A'}/100</td>
                      <td style="padding: 20px 32px; text-align: right;">
                        <button onclick="deleteInterview('${i.__backendId}')" style="background: white; border: 1px solid #e2e8f0; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; color: #ef4444; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                           <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
               </tbody>
             </table>
           ` : `
             <div style="padding: 60px; text-align: center; color: #94a3b8;">
                <div style="width: 60px; height: 60px; background: #f1f5f9; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                   <svg style="width: 30px; height: 30px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <p style="font-size: 1.1em; margin: 0;">No interviews recorded yet.</p>
                <button onclick="navigateTo('interview')" style="margin-top: 16px; color: ${config.primary_action}; font-weight: 600; background: none; border: none; cursor: pointer;">Start your first session &rarr;</button>
             </div>
           `}
        </div>
      </div>
    </div>
  `;
}

async function deleteInterview(id) {
  if (confirm("Delete this record?")) {
    await apiCall(`/api/records/${id}`, 'DELETE');
    loadRecords();
  }
}

function renderInterview() {
  const pageContent = document.getElementById('page-content');

  pageContent.innerHTML = `
    <div style="padding: 24px; background-color: ${config.background_color}; height: 100%; overflow-y: auto;">
      <div style="max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 1fr 360px; gap: 24px;">
        
        <!-- Main Interview Area -->
        <div style="min-width: 0;">
           <!-- Header / State -->
           <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
               <div>
                   <h2 style="font-size: ${config.font_size * 1.5}px; font-weight: 800; margin: 0; color: ${config.text_color}; letter-spacing: -0.5px;">${config.interview_title}</h2>
                   <p style="color: #64748b; margin: 4px 0 0 0; font-size: 0.9em;">Session in progress • Professional Tone</p>
               </div>
               <div id="conversationState" style="padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 0.85em; font-weight: 600; color: #64748b; display: flex; align-items: center; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                   <span style="display: block; width: 8px; height: 8px; background-color: #10b981; border-radius: 50%;"></span>
                   Ready to Start
               </div>
           </div>

           <div style="background: white; padding: 4px; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
              
              <!-- VIDEO CONTAINER FOR HEYGEN/WEBCAM -->
              <div class="video-container" style="position: relative; width: 100%; aspect-ratio: 16/9; background: black; border-radius: 16px; overflow: hidden;">
                  <video id="mediaElement" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
                  
                  <!-- Gradient Overlay -->
                  <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 120px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); pointer-events: none;"></div>

                  <!-- User Webcam (Bottom Right) -->
                  <div style="position: absolute; bottom: 20px; right: 20px; width: 200px; aspect-ratio: 4/3; border-radius: 12px; overflow: hidden; border: 2px solid rgba(255,255,255,0.2); background: #1a1a1a; box-shadow: 0 8px 16px rgba(0,0,0,0.4);">
                      <video id="userWebcam" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
                  </div>
                  
                  <!-- Live Badge -->
                   <div style="position: absolute; top: 20px; left: 20px; padding: 6px 12px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); border-radius: 8px; color: white; font-size: 0.8em; font-weight: 600; display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.1);">
                      <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 8px #ef4444;"></div>
                      Live Connection
                  </div>
              </div>

              <div style="padding: 24px;">
                    <!-- Live Transcript Overlay -->
                  <div id="liveTranscriptBox" style="display:none; margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 12px; border-left: 4px solid ${config.primary_action};">
                     <div style="font-size: 0.75em; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 6px; letter-spacing: 0.05em;">Live Transcript</div>
                     <div id="liveTranscript" style="font-style: italic; color: #334155; font-size: 1.1em; line-height: 1.5;"></div>
                  </div>

                  <!-- Controls -->
                  <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                       <button id="startBtn" class="btn-primary" style="background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); color: white; border: none; padding: 14px 40px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1.05em; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); transition: transform 0.1s;">
                        Start Interview
                       </button>
                       <button id="stopSpeakingBtn" style="display:none; background: ${config.secondary_action}; color: white; border: none; padding: 14px 40px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1.05em;">
                        Stop Speaking
                       </button>
                       <button id="closeBtn" style="background: white; border: 1px solid #fee2e2; color: #ef4444; padding: 14px 24px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1em; transition: all 0.2s;">
                        End Session
                       </button>
                       <button id="evaluateBtn" style="display:none; background: #10b981; color: white; border: none; padding: 14px 24px; border-radius: 12px; cursor: pointer; font-weight: 600;">
                        Generate Report
                       </button>
                  </div>
                  
                  <input type="hidden" id="avatarID" value="June_HR_public">
                  <input type="hidden" id="voiceID" value="">
              </div>
           </div>
           
           <!-- Manual Input -->
           <div style="background: white; padding: 20px; border-radius: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
              <h3 style="font-weight: 600; margin: 0 0 12px 0; font-size: 0.85em; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Manual Override</h3>
              <div style="display: flex; gap: 12px;">
                  <input id="taskInput" type="text" placeholder="Type a message to the AI interviewer..." style="flex:1; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.95em; outline: none; transition: border-color 0.2s;">
                  <button id="talkBtn" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Send</button>
              </div>
           </div>
        </div>

        <!-- Sidebar / Stats -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
            <div style="background: white; padding: 24px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
                <h3 style="font-weight: 700; margin: 0 0 16px 0; font-size: 1.1em; color: ${config.text_color};">Interview Questions</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="nav-item" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; text-align: left; cursor: pointer; background: white; font-size: 0.9em; color: #475569; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between;">
                        Tell me about yourself
                        <span style="opacity: 0.5;">&rarr;</span>
                    </button>
                    <button class="nav-item" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; text-align: left; cursor: pointer; background: white; font-size: 0.9em; color: #475569; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between;">
                        What are your strengths?
                         <span style="opacity: 0.5;">&rarr;</span>
                    </button>
                    <button class="nav-item" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; text-align: left; cursor: pointer; background: white; font-size: 0.9em; color: #475569; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between;">
                        Why do you want this role?
                         <span style="opacity: 0.5;">&rarr;</span>
                    </button>
                </div>
            </div>
            
            <div style="background: white; padding: 24px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
                <h3 style="font-weight: 700; margin: 0 0 16px 0; font-size: 1.1em; color: ${config.text_color};">Real-time Analysis</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button id="bodyLanguageBtn" style="width: 100%; padding: 14px; border: 1px solid #d1fae5; color: #059669; background: #ecfdf5; border-radius: 10px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;">
                        <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Analyze Body Language
                    </button>
                    <div id="bodyLanguageScores" style="display:none; background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size: 0.9em; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;"><span>Posture Score</span> <span id="postureScore" style="font-weight:700;">--</span></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size: 0.9em; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;"><span>Eye Contact</span> <span id="eyeContactScore" style="font-weight:700;">--</span></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size: 0.9em; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;"><span>Confidence</span> <span id="confidenceLevel" style="font-weight:700;">--</span></div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.9em;"><span>Expression</span> <span id="facialExpression" style="font-weight:700;">--</span></div>
                    </div>
                </div>
                
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                   <button id="micTestBtn" style="width: 100%; padding: 14px; border: 1px solid #e0e7ff; color: #4f46e5; background: #eef2ff; border-radius: 10px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;">
                       <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                       Test Microphone
                   </button>
                   <div id="micTestResult" style="display:none; font-size: 0.85em; margin-top: 12px; text-align: center; color: #475569; background: #f8fafc; padding: 8px; border-radius: 6px;"></div>
                   <div id="micTranscript" style="display:none; font-size: 0.8em; margin-top: 4px;">
                       <p style="font-weight:600;">Transcript:</p>
                       <p id="transcriptText"></p>
                   </div>
                </div>
            </div>

            <div style="background: white; padding: 24px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
                <h3 style="font-weight: 700; margin: 0 0 12px 0; font-size: 0.9em; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">System Log</h3>
                <div id="status" style="height: 150px; overflow-y: auto; background: #0f172a; padding: 16px; border-radius: 10px; font-family: 'JetBrains Mono', 'Menlo', monospace; font-size: 0.75em; color: #a5b4fc; line-height: 1.6;">Use 'Start Interview' to begin...</div>
            </div>
        </div>

      </div>
    </div>
  `;

  console.log("Checking for initializeInterviewLogic...", typeof window.initializeInterviewLogic);
  if (window.initializeInterviewLogic) {
    console.log("Scheduling interview logic initialization...");
    setTimeout(window.initializeInterviewLogic, 300);
  } else {
    console.error("CRITICAL: window.initializeInterviewLogic is undefined! script.js may not be loaded.");
  }
}

function renderProfile() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  pageContent.innerHTML = `
        <div style="padding: 40px; background-color: ${config.background_color}; min-height: 100%;">
            <div style="max-width: 800px; margin: 0 auto;">
                <h2 style="font-size: 2em; font-weight: 800; color: ${config.text_color}; margin: 0 0 32px 0;">My Profile</h2>

                <div style="background: white; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, ${config.primary_action}, ${config.secondary_action}); height: 120px;"></div>
                    <div style="padding: 0 32px 32px 32px; position: relative;">
                         <div style="width: 100px; height: 100px; background: white; padding: 4px; border-radius: 50%; margin-top: -50px; margin-bottom: 20px;">
                             <div style="width: 100%; height: 100%; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5em; font-weight: 700; color: #64748b;">
                                 ${currentUser?.name.charAt(0) || 'U'}
                             </div>
                         </div>
                         
                         <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 32px;">
                             <div>
                                 <h3 style="font-size: 1.8em; font-weight: 700; margin: 0 0 8px 0; color: ${config.text_color};">${currentUser?.name}</h3>
                                 <p style="color: #64748b; margin: 0; font-size: 1.1em;">${currentUser?.email}</p>
                             </div>
                             <button style="background: white; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; color: #475569;">Edit Profile</button>
                         </div>
                         
                         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; border-top: 1px solid #f1f5f9; padding-top: 32px;">
                             <div>
                                 <h4 style="font-size: 0.9em; text-transform: uppercase; color: #64748b; margin: 0 0 16px 0; letter-spacing: 0.05em;">Account Settings</h4>
                                 <div style="display: flex; flex-direction: column; gap: 16px;">
                                     <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                         <input type="checkbox" checked style="accent-color: ${config.primary_action}; width: 18px; height: 18px;">
                                         <span style="color: ${config.text_color};">Email Notifications</span>
                                     </label>
                                     <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                         <input type="checkbox" checked style="accent-color: ${config.primary_action}; width: 18px; height: 18px;">
                                         <span style="color: ${config.text_color};">Interview Reminders</span>
                                     </label>
                                 </div>
                             </div>
                             <div>
                                 <h4 style="font-size: 0.9em; text-transform: uppercase; color: #64748b; margin: 0 0 16px 0; letter-spacing: 0.05em;">Plan & Usage</h4>
                                 <div style="background: #f8fafc; padding: 16px; border-radius: 12px;">
                                     <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: ${config.text_color};">
                                         <span>Free Plan</span>
                                         <span style="color: ${config.primary_action};">Active</span>
                                     </div>
                                     <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 12px;">
                                         <div style="width: ${Math.min(allRecords.length * 10, 100)}%; height: 100%; background: ${config.primary_action}; border-radius: 3px;"></div>
                                     </div>
                                     <div style="font-size: 0.85em; color: #64748b; margin-top: 8px;">${allRecords.length} / 10 interviews used</div>
                                 </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Initialize the application

function renderTraining() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const resources = [
    { title: "STAR Method for Behavioral Interview", type: "Video", duration: "10 mins", url: "https://www.youtube.com/watch?v=wexzvClUcUk", thumb: "https://img.youtube.com/vi/wexzvClUcUk/mqdefault.jpg" },
    { title: "System Design Primer", type: "Article", duration: "20 min read", url: "https://github.com/donnemartin/system-design-primer", thumb: "" },
    { title: "Top 50 Common Interview Questions", type: "Website", duration: "Resource", url: "https://www.glassdoor.com/blog/common-interview-questions/", thumb: "" },
    { title: "Salary Negotiation Tips", type: "Video", duration: "10 mins", url: "https://www.youtube.com/watch?v=kBIN2h16Rc4", thumb: "https://img.youtube.com/vi/kBIN2h16Rc4/mqdefault.jpg" },
    { title: "What to Wear to an Interview", type: "Video", duration: "6 mins", url: "https://www.youtube.com/watch?v=8Ch1y6lwSXc", thumb: "https://img.youtube.com/vi/8Ch1y6lwSXc/mqdefault.jpg" },
    { title: "Guide to the STAR Method", type: "Article", duration: "5 min read", url: "https://www.indeed.com/career-advice/interviewing/how-to-use-the-star-method", thumb: "" }
  ];

  pageContent.innerHTML = `
    <div style="padding: 40px; background-color: ${config.background_color}; min-height: 100%;">
        <div style="max-width: 1000px; margin: 0 auto;">
            <div style="margin-bottom: 32px;">
                <h2 style="font-size: 2em; font-weight: 800; color: ${config.text_color}; margin: 0 0 8px 0;">Training Resources</h2>
                <p style="color: #64748b; font-size: 1.1em;">Curated materials to help you ace your next interview.</p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px;">
                ${resources.map(r => `
                    <div class="card" onclick="window.open('${r.url}', '_blank')" style="background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; transition: transform 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
                        ${r.type === 'Video' ?
      `<div style="height: 160px; background: #e2e8f0; position: relative; overflow: hidden;">
                                <img src="${r.thumb}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.9;">
                                <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
                                    <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${config.primary_action};">
                                        <svg style="width: 20px; height: 20px;" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"></path></svg>
                                    </div>
                                </div>
                             </div>` :
      `<div style="height: 160px; background: linear-gradient(135deg, #e0f2fe, #dbeafe); display: flex; align-items: center; justify-content: center; color: ${config.primary_action};">
                                <svg style="width: 48px; height: 48px; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                             </div>`
    }
                        <div style="padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 0.75em; font-weight: 700; color: ${config.primary_action}; text-transform: uppercase;">${r.type}</span>
                                <span style="font-size: 0.85em; color: #94a3b8;">${r.duration}</span>
                            </div>
                            <h3 style="font-size: 1.1em; font-weight: 700; color: ${config.text_color}; margin: 0 0 8px 0; line-height: 1.4;">${r.title}</h3>
                            <a href="${r.url}" target="_blank" onclick="event.stopPropagation()" style="font-size: 0.9em; color: #64748b; text-decoration: none; display: flex; align-items: center; gap: 4px;">    
                                View Resource &rarr;
                            </a>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 40px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 16px; padding: 24px; display: flex; gap: 20px; align-items: center;">
                <div style="width: 48px; height: 48px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0284c7; flex-shrink: 0;">
                    <svg style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                    <h4 style="font-weight: 700; color: #0c4a6e; margin: 0 0 4px 0;">Looking for something specific?</h4>
                    <p style="font-size: 0.95em; color: #0369a1; margin: 0;">Our AI coach can also provide personalized tips during your interview session.</p>
                </div>
            </div>
        </div>
    </div>
  `;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', initApp);
