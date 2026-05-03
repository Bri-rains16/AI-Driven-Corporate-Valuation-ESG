/*
 * js/auth.js
 * ─────────────────────────────────────────────────────────────
 * PURPOSE: All authentication and session management.
 *
 * RESPONSIBILITIES:
 *   1. Page navigation (showLanding / showAuth / showDash)
 *   2. AUTH GUARD — showDash() blocks unauthenticated access
 *   3. Login & Register (calls backend server.js API)
 *   4. Google OAuth sign-in
 *   5. Session persistence via localStorage
 *      → Session survives server restarts because it lives
 *        in the browser, not in server memory.
 *   6. Logout (clears session)
 *   7. Toast utility
 *
 * LOADED LAST — depends on data.js, charts.js, dashboard.js
 * ─────────────────────────────────────────────────────────────
 */

// ── SERVER URL ────────────────────────────────────────────────
// Change this if your backend runs on a different port.
const API = 'http://127.0.0.1:3000';

// ── PAGE NAVIGATION ───────────────────────────────────────────

function showLanding() {
  pg('landing');
}

function showAuth() {
  pg('auth');
  initGoogle();
}

// AUTH GUARD: If no user is logged in, redirect to auth page.
// This prevents the dashboard from being seen without login.
function showDash() {
  if (!STATE.user) {
    showAuth();
    return;
  }
  pg('dash');
  buildList(COS); // build sidebar company list (from dashboard.js)
}

// Switch visible page by ID (landing | auth | dash)
function pg(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── SESSION PERSISTENCE ───────────────────────────────────────
// localStorage keeps the user logged in even when:
//   • The browser tab is closed and reopened
//   • The server (server.js) is stopped and restarted
//   • The machine is rebooted
//
// The server separately persists user accounts in users.json
// so that login credentials still work after a server restart.

function saveSession(u) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch(e) {}
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
}

// ── GOOGLE OAUTH ──────────────────────────────────────────────
let gReady = false;

function initGoogle() {
  const note = document.getElementById('g-note');
  if (G_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    note.textContent = '⚠ Google Client ID not set — use email/password below';
    return;
  }
  if (!window.google || gReady) return;
  try {
    google.accounts.id.initialize({ client_id: G_CLIENT_ID, callback: onGoogleCredential });
    gReady = true;
  } catch(e) {}
}

function handleGoogle() {
  if (G_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    toast('Set G_CLIENT_ID in data.js to enable Google sign-in');
    return;
  }
  if (!gReady) initGoogle();
  try { google.accounts.id.prompt(); } catch(e) { toast('Google sign-in unavailable'); }
}

function onGoogleCredential(response) {
  try {
    // Decode the JWT payload (middle part of the token)
    const payload = JSON.parse(atob(
      response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    ));
    loginSuccess({
      name:  payload.name  || payload.email.split('@')[0],
      email: payload.email,
      pic:   payload.picture || null,
    });
  } catch(e) { toast('Google sign-in failed'); }
}

// ── AUTH FORM TABS ────────────────────────────────────────────

function switchTab(t) {
  document.getElementById('tab-in').classList.toggle('on', t === 'in');
  document.getElementById('tab-up').classList.toggle('on', t === 'up');
  document.getElementById('f-in').style.display = t === 'in' ? '' : 'none';
  document.getElementById('f-up').style.display = t === 'up' ? '' : 'none';
}

// ── LOGIN ─────────────────────────────────────────────────────
async function doLogin() {
  const email    = document.getElementById('li-email').value.trim();
  const password = document.getElementById('li-pass').value;

  if (!email || !password) { toast('Enter email and password'); return; }

  try {
    const res  = await fetch(`${API}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) { toast(data.error || 'Login failed'); return; }

    loginSuccess({ name: data.name, email: data.email });

  } catch(err) {
    console.error('Login error:', err);
    toast('Cannot reach server — is it running?');
  }
}

// ── REGISTER ──────────────────────────────────────────────────
async function doRegister() {
  const name     = document.getElementById('ru-name').value.trim();
  const email    = document.getElementById('ru-email').value.trim();
  const password = document.getElementById('ru-pass').value;

  if (!name || !email || !password) { toast('Fill in all fields'); return; }
  if (password.length < 8)         { toast('Password needs 8+ characters'); return; }

  try {
    const res  = await fetch(`${API}/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) { toast(data.error || 'Registration failed'); return; }

    toast('Account created! Welcome email sent ✉');
    loginSuccess({ name: data.name, email: data.email });

  } catch(err) {
    console.error('Register error:', err);
    toast('Cannot reach server — is it running?');
  }
}

// ── ON SUCCESSFUL LOGIN ───────────────────────────────────────
// Called after any successful auth (email login, register, Google).
function loginSuccess(u) {
  STATE.user = u;
  saveSession(u);   // persist in localStorage → survives server restarts
  applyUserUI();
  showDash();
  toast('Welcome, ' + u.name.split(' ')[0] + '!');
}

// ── UPDATE USER UI ────────────────────────────────────────────
// Sets the avatar initials, name, and email in the sidebar footer.
function applyUserUI() {
  if (!STATE.user) return;
  const initials = STATE.user.name
    .split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  const av = document.getElementById('uav');
  av.innerHTML = STATE.user.pic
    ? `<img src="${STATE.user.pic}" alt="${initials}">`
    : initials;
  document.getElementById('uname').textContent  = STATE.user.name;
  document.getElementById('uemail').textContent = STATE.user.email;
}

// ── LOGOUT ────────────────────────────────────────────────────
function logout() {
  STATE.user = null;
  STATE.co   = null;
  clearSession();

  // Reset dashboard view
  document.getElementById('empty').style.display = 'flex';
  document.getElementById('view').style.display  = 'none';

  showLanding();
}

// ── TOAST NOTIFICATION ────────────────────────────────────────
// Global utility — call toast('message') from any JS file.
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ── BOOT — AUTO-LOGIN FROM SAVED SESSION ──────────────────────
// Runs when the page loads. Restores session from localStorage.
// If a session exists → go straight to dashboard (auth-guarded).
// If not → show landing page.
document.addEventListener('DOMContentLoaded', () => {
  const saved = loadSession();
  if (saved?.email) {
    STATE.user = saved;
    applyUserUI();
    showDash();
    toast('Welcome back, ' + saved.name.split(' ')[0] + '!');
  } else {
    showLanding();
  }
});