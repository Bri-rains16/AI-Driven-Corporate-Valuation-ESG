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
const G_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';

// ── LOCAL STORAGE KEY ─────────────────────────────────────────
// The key used to persist the logged-in user in the browser.
// Changing this logs everyone out (useful for breaking changes).
const SESSION_KEY = 'vESG_session';

// ── SHARED APPLICATION STATE ──────────────────────────────────
// Single source of truth. Read and write from any JS file.
const STATE = {
  user: null,   // { name, email, pic? } — set on login, cleared on logout
  co:   null,   // currently selected company object from COS array
  yrs:  5,      // forecast horizon (years) — changed by the GO button
};

// ── COMPANY DATA ──────────────────────────────────────────────
// TODO: Replace this hardcoded array with a fetch() call to
//       GET /companies once your Python ML pipeline is connected.
//
// Each company has:
//   esg   — scores from NLP analysis of BRSR report (0–100)
//   dcf   — DCF intrinsic value, current market price, WACC, terminal growth
//   mc    — Monte Carlo percentiles (P5 = bear, P50 = median, P95 = bull)
//   rev   — 10-year revenue forecast (₹ Crores)
//   ebitda — 10-year EBITDA forecast (₹ Crores)
//   fcf   — 10-year Free Cash Flow forecast (₹ Crores)
const COS = [
  {
    id: 'rel', name: 'Reliance Industries Ltd',
    ticker: 'RELIANCE.NS', sector: 'Energy', brsr: 'FY 2023-24',
    esg: { t: 72, e: 68, s: 74, g: 75 }, gw: 'Low',
    dcf: { iv: 2847, cmp: 2990, up: -4.8, wacc: 11.2, tg: 4.5 },
    mc:  { p5: 2100, p50: 2847, p95: 3620 },
    rev:    [220000,238000,258000,280000,304000,330000,358000,388000,420000,455000],
    ebitda: [ 28000, 31000, 34500, 38200, 42300, 46800, 51800, 57200, 63100, 69500],
    fcf:    [ 12000, 14500, 17200, 20400, 24000, 28100, 32800, 38200, 44300, 51200],
  },
  {
    id: 'tcs', name: 'Tata Consultancy Services',
    ticker: 'TCS.NS', sector: 'IT', brsr: 'FY 2023-24',
    esg: { t: 81, e: 79, s: 84, g: 80 }, gw: 'None',
    dcf: { iv: 4120, cmp: 3975, up: 3.6, wacc: 10.1, tg: 5.0 },
    mc:  { p5: 3200, p50: 4120, p95: 5100 },
    rev:    [228000,248000,269000,291000,315000,340000,367000,396000,428000,463000],
    ebitda: [ 57000, 62500, 68500, 75000, 82000, 89800, 98200,107400,117500,128600],
    fcf:    [ 44000, 48500, 53500, 59000, 65000, 71500, 78800, 86700, 95400,104900],
  },
  {
    id: 'infy', name: 'Infosys Ltd',
    ticker: 'INFY.NS', sector: 'IT', brsr: 'FY 2023-24',
    esg: { t: 79, e: 76, s: 81, g: 80 }, gw: 'Low',
    dcf: { iv: 1640, cmp: 1590, up: 3.1, wacc: 10.4, tg: 4.8 },
    mc:  { p5: 1280, p50: 1640, p95: 2020 },
    rev:    [146767,159000,172000,186000,201000,217000,234000,253000,273000,295000],
    ebitda: [ 36900, 40000, 43500, 47200, 51200, 55500, 60200, 65300, 70900, 77000],
    fcf:    [ 28000, 31000, 34200, 37700, 41600, 45900, 50700, 56000, 61800, 68200],
  },
  {
    id: 'hdfc', name: 'HDFC Bank Ltd',
    ticker: 'HDFCBANK.NS', sector: 'Banking', brsr: 'FY 2023-24',
    esg: { t: 68, e: 60, s: 72, g: 73 }, gw: 'Medium',
    dcf: { iv: 1750, cmp: 1680, up: 4.2, wacc: 12.5, tg: 5.5 },
    mc:  { p5: 1350, p50: 1750, p95: 2200 },
    rev:    [166000,185000,206000,229000,254000,282000,313000,347000,385000,427000],
    ebitda: [ 62000, 70000, 79000, 89000,100000,112000,126000,141000,158000,177000],
    fcf:    [ 38000, 43500, 49500, 56500, 64000, 72500, 82000, 92500,104000,117000],
  },
  {
    id: 'wip', name: 'Wipro Ltd',
    ticker: 'WIPRO.NS', sector: 'IT', brsr: 'FY 2023-24',
    esg: { t: 76, e: 73, s: 78, g: 78 }, gw: 'Low',
    dcf: { iv: 460, cmp: 450, up: 2.2, wacc: 10.8, tg: 4.5 },
    mc:  { p5: 365, p50: 460, p95: 570 },
    rev:    [ 90488, 97000,104000,111000,119000,127000,135000,144000,154000,165000],
    ebitda: [ 16700, 18100, 19600, 21300, 23100, 25100, 27200, 29500, 32100, 34900],
    fcf:    [ 12400, 13600, 14900, 16300, 17900, 19700, 21700, 23900, 26300, 29000],
  },
  {
    id: 'mnm', name: 'Mahindra & Mahindra Ltd',
    ticker: 'M&M.NS', sector: 'Auto', brsr: 'FY 2023-24',
    esg: { t: 65, e: 60, s: 67, g: 69 }, gw: 'Medium',
    dcf: { iv: 1850, cmp: 2100, up: -11.9, wacc: 12.0, tg: 5.0 },
    mc:  { p5: 1400, p50: 1850, p95: 2350 },
    rev:    [121267,135000,150000,166000,184000,203000,224000,247000,272000,299000],
    ebitda: [ 17600, 19800, 22200, 24800, 27700, 30900, 34400, 38300, 42600, 47400],
    fcf:    [  9500, 11000, 12700, 14600, 16700, 19000, 21700, 24700, 28000, 31800],
  },
];