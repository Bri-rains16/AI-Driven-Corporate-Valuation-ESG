/*
 * js/data.js
 * ─────────────────────────────────────────────────────────────
 * PURPOSE: Company dataset + shared application state object.
 *
 * WHY A STATE OBJECT?
 *   All JS files (auth, dashboard, charts) need to share the
 *   same `user`, `co` (selected company), and `yrs` (forecast
 *   years). Instead of separate global variables that are easy
 *   to lose track of, we use one `STATE` object. Any file can
 *   read or write STATE.user, STATE.co, etc.
 *
 * LOADED FIRST — all other JS files depend on this.
 * ─────────────────────────────────────────────────────────────
 */

// ── GOOGLE OAUTH CLIENT ID ────────────────────────────────────
// To enable Google sign-in:
//   1. console.cloud.google.com → APIs & Services → Credentials
//   2. Create OAuth 2.0 Client ID (Web application)
//   3. Paste the client ID below


// ── LOCAL STORAGE KEY ─────────────────────────────────────────
// The key used to persist the logged-in user in the browser.
// Changing this logs everyone out (useful for breaking changes).
const SESSION_KEY = 'vESG_session';

// ── SHARED APPLICATION STATE ──────────────────────────────────
// Single source of truth. Read and write from any JS file.
const STATE = {
  user: null,   // { name, email, pic? } — set on login, cleared on logout
  co:   null,   // currently selected company object from API
  yrs:  5,      // forecast horizon (years) — changed by the GO button
  selectedTicker: null, // tracked when user clicks sidebar but before GO is clicked
};

// ── COMPANY DATA ──────────────────────────────────────────────
let COS = [];

/**
 * Fetches the list of companies from the backend.
 */
async function fetchCompanies() {
  try {
    const res = await fetch('/api/companies');
    if (!res.ok) throw new Error('Failed to fetch companies');
    COS = await res.json();
    return COS;
  } catch (err) {
    console.error('Error fetching companies:', err);
    toast('⚠ Could not load company list');
    return [];
  }
}

/**
 * Runs the real-time valuation for a given ticker and forecast horizon.
 */
async function fetchValuation(ticker, years) {
  try {
    const res = await fetch(`/api/valuation/${ticker}?years=${years}`);
    if (!res.ok) throw new Error('Valuation engine failed');
    const data = await res.json();
    
    // Map backend response to the format expected by the UI/Charts
    // This ensures existing chart logic remains functional.
    const mapped = {
      ...data,
      id:     ticker.split('.')[0].toLowerCase(),
      name:   data.ticker, // or we can use the name from COS
      sector: 'Sector',     // will be updated from COS in dashboard.js
      brsr:   `FY ${new Date().getFullYear() - 1}-${new Date().getFullYear() % 100}`,
      gw:     data.esg.greenwash_penalty > 10 ? 'High' : data.esg.greenwash_penalty > 0 ? 'Medium' : 'None',
      esg: {
        t: Math.round(data.esg.score),
        e: Math.round(data.esg.score * 0.9), // Mock breakdown for UI
        s: Math.round(data.esg.score * 0.95),
        g: Math.round(data.esg.score * 0.85),
      },
      dcf: {
        iv:  Math.round(data.after_esg.dcf_intrinsic),
        cmp: Math.round(data.after_esg.dcf_intrinsic * 0.95), // CMP mock
        up:  data.esg_impact.dcf_change_pct,
        wacc: data.after_esg.wacc_pct,
        tg:   data.financial.terminal_growth_pct
      },
      mc: {
        p5:  Math.round(data.after_esg.monte_carlo.p5),
        p50: Math.round(data.after_esg.monte_carlo.p50),
        p95: Math.round(data.after_esg.monte_carlo.p95),
      },
    };

    // Extract arrays for charts (Cumulative growth + unit conversion to Crores)
    let currRev = data.financial.base_revenue;
    const rev = [];
    const ebitda = [];
    const fcf = [];

    data.financial.full_forecast.forEach(f => {
      currRev *= (1 + f.revenue_growth);
      const rCr = Math.round(currRev / 1e7);
      rev.push(rCr);
      ebitda.push(Math.round(rCr * f.ebitda_margin));
      
      const fCr = Math.round(rCr * (f.ebitda_margin * (1 - 0.25) + f.depreciation_pct - f.capex_pct - f.wc_pct));
      fcf.push(fCr);
    });

    return { ...mapped, rev, ebitda, fcf };

  } catch (err) {
    console.error('Valuation error:', err);
    toast('⚠ Valuation engine error');
    return null;
  }
}

// ── UTILS ─────────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}