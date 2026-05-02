const express = require('express');
const cors    = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ─── IN-MEMORY STORE ──────────────────────────────────────────────────────────
const users = [];

// ─── SENDER ───────────────────────────────────────────────────────────────────
const FROM_ADDRESS = 'ValuESG <onboarding@resend.dev>';

// ─── EMAIL HELPERS ─────────────────────────────────────────────────────────────
async function sendWelcomeEmail(toEmail, name) {
  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      toEmail,
    subject: 'Welcome to ValuESG 🌱',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Welcome, ${name}! 👋</h3>
        <p style="color:#8a9090;line-height:1.7;">
          You now have access to AI-powered corporate valuation integrating ESG factors from
          SEBI-mandated BRSR reports.
        </p>
        <p style="color:#8a9090;line-height:1.7;">Here's what you can do:</p>
        <ul style="color:#8a9090;line-height:2;">
          <li>Browse ESG scores derived from BRSR filings</li>
          <li>Set a custom forecast horizon (1–10 years)</li>
          <li>View DCF intrinsic value with Monte Carlo distribution</li>
          <li>Compare E, S, G pillars across companies</li>
        </ul>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;font-size:.85rem;text-decoration:none;font-weight:600;">
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

async function sendLoginEmail(toEmail, name) {
  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      toEmail,
    subject: 'ValuESG — New Sign In Detected',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Welcome back, ${name}! 👋</h3>
        <p style="color:#8a9090;line-height:1.7;">
          A new sign-in to your ValuESG account was just detected.
          If this was you, no action is needed.
        </p>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;font-size:.85rem;text-decoration:none;font-weight:600;">
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

async function sendAnniversaryEmail(toEmail, name) {
  const year = new Date().getFullYear();
  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      toEmail,
    subject: `ValuESG — New BRSR Reports May Be Available (${year})`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0b0b;color:#e2e8e8;padding:2rem;border-radius:10px;">
        <h2 style="color:#00c896;font-family:monospace;">VALU/ESG</h2>
        <h3>Hi ${name} — it's been a year! 🗓</h3>
        <p style="color:#8a9090;line-height:1.7;">
          Companies are required to publish their BRSR reports for FY ${year} by
          the end of Q1. The companies you explored last year may now have updated
          ESG disclosures and revised financial data.
        </p>
        <p style="color:#8a9090;line-height:1.7;">
          Come back and check updated valuations, ESG scores, and forecasts.
        </p>
        <a href="http://localhost:3000"
           style="display:inline-block;margin-top:1.2rem;background:#00c896;color:#040909;padding:.6rem 1.4rem;border-radius:6px;font-family:monospace;font-size:.85rem;text-decoration:none;font-weight:600;">
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

// ─── ROUTES ────────────────────────────────────────────────────────────────────

// POST /register
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
    password,
    registeredAt: Date.now(),
    remindAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
  users.push(newUser);

  sendWelcomeEmail(email, name)
    .then(() => console.log(`✉  Welcome email sent → ${email}`))
    .catch(err  => console.error('Welcome email failed:', err.message));

  return res.status(201).json({ name, email });
});

// POST /login
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = users.find(u => u.email === email && u.password === password);
  if (!user)
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Anniversary reminder (once a year)
  if (user.remindAt && Date.now() >= user.remindAt) {
    sendAnniversaryEmail(user.email, user.name)
      .then(() => {
        user.remindAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
        console.log(`✉  Anniversary reminder sent → ${user.email}`);
      })
      .catch(err => console.error('Reminder email failed:', err.message));
  }

  // Login notification (every sign in)
  sendLoginEmail(user.email, user.name)
    .then(() => console.log(`✉  Login email sent → ${user.email}`))
    .catch(err => console.error('Login email failed:', err.message));

  return res.json({ name: user.name, email: user.email });
});

// GET /ping
app.get('/ping', (_, res) => res.json({ status: 'ok', users: users.length }));

// ─── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server → http://localhost:${PORT}`);
  console.log('   POST /register  POST /login  GET /ping');

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠  RESEND_API_KEY not set — emails will fail silently.');
  } else {
    console.log('✉  Resend API key loaded — emails ready.');
  }
});