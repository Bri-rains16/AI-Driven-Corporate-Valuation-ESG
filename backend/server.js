const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());

// This means http://localhost:3000 → index.html
// and http://localhost:3000/css/style.css etc. all work.
app.use(express.static(path.join(__dirname, '..')));

// USER PERSISTENCE (users.json) 
const USERS_FILE = path.join(__dirname, 'users.json');

// Load existing users from disk on startup.
// If the file doesn't exist yet, start with an empty array.
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error(' Could not parse users.json — starting fresh.');
    return [];
  }
}

// Write the current users array to disk.
// Called after every successful register.
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('⚠  Could not write users.json:', e.message);
  }
}

// Load on startup — survives server restarts
let users = loadUsers();
console.log(`👥 Loaded ${users.length} user(s) from users.json`);

//EMAIL SENDER ADDRESS
// Resend free tier only allows sending FROM onboarding@resend.dev
// unless you verify your own domain at resend.com/domains.
const FROM = 'ValuESG <onboarding@resend.dev>';

// EMAIL: WELCOME
async function sendWelcomeEmail(toEmail, name) {
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Welcome to ValuESG 🌱',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;
                  background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Welcome, ${name}! 👋</h3>
        <p style="color:#8a9090;line-height:1.7;">
          You now have access to AI-powered corporate valuation integrating ESG factors
          from SEBI-mandated BRSR reports.
        </p>
        <p style="color:#8a9090;line-height:1.7;">What you can explore:</p>
        <ul style="color:#8a9090;line-height:2;">
          <li>ESG scores derived from BRSR filings (E, S, G breakdown)</li>
          <li>Custom forecast horizon — set any number of years</li>
          <li>DCF intrinsic value with Monte Carlo distribution (P5/P50/P95)</li>
          <li>Revenue, EBITDA, and Free Cash Flow projections</li>
        </ul>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;
                  padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;
                  font-size:.85rem;text-decoration:none;font-weight:600;">
          OPEN PLATFORM →
        </a>
        <p style="margin-top:2rem;color:#3a4040;font-size:.75rem;font-family:monospace;">
          ValuESG · AI-Driven Corporate Valuation · JIIT Minor Project
        </p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
}

// Annual reminder email
// Sent 1 year after registration to invite the user back.
async function sendAnniversaryEmail(toEmail, name) {
  const year = new Date().getFullYear();
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `ValuESG — New BRSR Reports May Be Available (${year})`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;
                  background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Hi ${name} — it's been a year! 🗓</h3>
        <p style="color:#8a9090;line-height:1.7;">
          Companies publish their BRSR reports for FY ${year} by the end of Q1.
          The companies you explored last year may now have updated ESG disclosures
          and revised financial data.
        </p>
        <p style="color:#8a9090;line-height:1.7;">
          Come back and check updated valuations, ESG scores, and forecasts.
        </p>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;
                  padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;
                  font-size:.85rem;text-decoration:none;font-weight:600;">
          CHECK UPDATES →
        </a>
        <p style="margin-top:2rem;color:#3a4040;font-size:.75rem;font-family:monospace;">
          ValuESG · AI-Driven Corporate Valuation · JIIT Minor Project
        </p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
}

// Login notification email
async function sendLoginEmail(toEmail, name) {
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'ValuESG — New Sign In Detected',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;
                  background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Welcome back, ${name}! 👋</h3>
        <p style="color:#8a9090;line-height:1.7;">
          A new sign-in to your ValuESG account was just detected.
          If this was you, no action is needed.
        </p>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;
                  padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;
                  font-size:.85rem;text-decoration:none;font-weight:600;">
          OPEN PLATFORM →
        </a>
        <p style="margin-top:2rem;color:#3a4040;font-size:.75rem;font-family:monospace;">
          ValuESG · AI-Driven Corporate Valuation · JIIT Minor Project
        </p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
}

// API Routes

// POST /register
// Creates a new user account, saves to users.json, sends welcome email.
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (users.find(u => u.email === email))
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const newUser = {
    name,
    email,
    password,          // TODO: hash with bcrypt before production deployment
    registeredAt: Date.now(),
    // One year from now — when this timestamp passes on login, send reminder
    remindAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };

  users.push(newUser);
  saveUsers(users);    // ← writes to users.json immediately

  // Send welcome email (fire-and-forget — don't block the response)
  sendWelcomeEmail(email, name)
    .then(() => console.log(`✉  Welcome email sent → ${email}`))
    .catch(err => console.error('Welcome email failed:', err.message));

  return res.status(201).json({ name, email });
});

// POST /login
// Validates credentials against users.json, sends login notification.
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = users.find(u => u.email === email && u.password === password);
  if (!user)
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Check if 1 year has passed since registration → send annual reminder
  if (user.remindAt && Date.now() >= user.remindAt) {
    sendAnniversaryEmail(user.email, user.name)
      .then(() => {
        // Reset timer to 1 year from now and persist
        user.remindAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
        saveUsers(users);
        console.log(`✉  Anniversary reminder sent → ${user.email}`);
      })
      .catch(err => console.error('Reminder email failed:', err.message));
  }

  // Login notification email (every sign-in)
  sendLoginEmail(user.email, user.name)
    .then(() => console.log(`✉  Login email sent → ${user.email}`))
    .catch(err => console.error('Login email failed:', err.message));

  return res.json({ name: user.name, email: user.email });
});

// GET /ping — health check
app.get('/ping', (_, res) => res.json({ status: 'ok', users: users.length }));

// GET /me — verify a stored session (useful when connecting a real token later)
app.get('/me', (req, res) => {
  const email = req.query.email;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ name: user.name, email: user.email });
});

// Company data registry
// Shared with fusion_layer.py — maps ticker to name, sector, and PDF.
const COMPANIES = [
  { id: 'infy', name: 'Infosys Ltd',             ticker: 'INFY.NS',       sector: 'IT',        pdf: 'infosys-ar-24.pdf' },
  { id: 'rel',  name: 'Reliance Industries Ltd', ticker: 'RELIANCE.NS',   sector: 'Energy',    pdf: 'reliance_brsr.pdf' },
  { id: 'tstat',name: 'Tata Steel Ltd',          ticker: 'TATASTEEL.NS',  sector: 'Materials', pdf: 'brsr-tatasteel.pdf' },
  { id: 'wipro',name: 'Wipro Ltd',               ticker: 'WIPRO.NS',      sector: 'IT',        pdf: 'business-responsibility-report-wipro.pdf' },
  { id: 'hul',  name: 'Hindustan Unilever Ltd',  ticker: 'HINDUNILVR.NS', sector: 'FMCG',      pdf: 'HUL_BRSR.pdf' },
  { id: 'adani',name: 'Adani Ports & SEZ Ltd',   ticker: 'ADANIPORTS.NS', sector: 'Logistics', pdf: 'adaniport_brsr.pdf' },
];

// GET /api/companies — returns available companies for the sidebar
app.get('/api/companies', (req, res) => {
  res.json(COMPANIES.map(c => ({
    id: c.id,
    name: c.name,
    ticker: c.ticker,
    sector: c.sector
  })));
});

// GET /api/valuation/:ticker — runs the Python fusion layer
app.get('/api/valuation/:ticker', (req, res) => {
  const ticker = req.params.ticker;
  const years  = req.query.years || 5;
  
  // Find the company to get its PDF path
  const company = COMPANIES.find(c => c.ticker === ticker);
const pdfPath = company ? path.join(__dirname, '../nlp', company.pdf) : '';
const pythonScript = path.join(__dirname, '../scripts/fusion_layer.py');

const pythonExecutable = process.platform === 'win32'
  ? path.join(__dirname, '../valuation_env/Scripts/python.exe')
  : path.join(__dirname, '../valuation_env/bin/python');


  const pythonCmd = fs.existsSync(pythonExecutable) ? pythonExecutable : 'python';

  console.log(`Starting valuation for ${ticker} (${years} yrs) using ${pythonCmd}...`);
  const child = spawn(pythonCmd, [pythonScript, ticker, pdfPath, years]);

  let data = '';
  let errorData = '';

  child.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    errorData += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script error (${code}): ${errorData}`);
      return res.status(500).json({ error: 'Failed to calculate valuation.' });
    }

    try {
      // Find the JSON object starting with {"ticker": and ending at the end of the output
      const jsonStart = data.lastIndexOf('{"ticker":');
      if (jsonStart === -1) throw new Error('No JSON output found');
      
      const jsonStr = data.substring(jsonStart).trim();
      const result = JSON.parse(jsonStr);
      res.json(result);
    } catch (e) {
      console.error('Failed to parse Python output:', data);
      res.status(500).json({ error: 'Invalid response from valuation engine.' });
    }
  });
});

// Server startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server → http://localhost:${PORT}`);
  console.log('   Routes: POST /register  POST /login  GET /ping  GET /me');
  console.log('   Frontend: open http://localhost:3000\n');

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠  RESEND_API_KEY not set in .env — emails will fail silently.');
  } else {
    console.log('✉  Resend API key loaded — emails ready.');
  }
});