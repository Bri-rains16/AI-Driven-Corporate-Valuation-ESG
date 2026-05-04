/*
 * js/dashboard.js
 * ─────────────────────────────────────────────────────────────
 * PURPOSE: Everything inside the dashboard page.
 *   - Builds and filters the sidebar company list
 *   - Loads a company when clicked (populates all fields)
 *   - Handles the forecast year input (GO button)
 *
 * DEPENDS ON: data.js (STATE, COS), charts.js (renderCharts)
 * CALLED BY:  auth.js (showDash calls buildList)
 *             index.html (filterCos, goFC, loadCo via onclick)
 * ─────────────────────────────────────────────────────────────
 */

// ── ESG PILL COLOUR ───────────────────────────────────────────
// Returns CSS class for the ESG score badge in the sidebar
const esgCls = score => score >= 75 ? 'hi' : score >= 65 ? 'md' : 'lo';

// ── BUILD COMPANY LIST ────────────────────────────────────────
// Renders the sidebar list. Pass a filtered subset for search.
function buildList(arr) {
  const listEl = document.getElementById('co-list');
  if (arr.length === 0) {
    listEl.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--sub);font-size:1rem;">No companies found</div>';
    return;
  }

  listEl.innerHTML = arr.map(c => `
    <div class="co-item ${STATE.selectedTicker === c.ticker ? 'active' : ''}"
         id="ci-${c.id}" onclick="loadCo('${c.ticker}')">
      <div class="co-info">
        <div class="co-name">${c.name.split(' ').slice(0, 2).join(' ')}</div>
        <div class="co-ticker">${c.ticker} · ${c.sector}</div>
      </div>
      <span class="esg-pill md">••</span>
    </div>
  `).join('');
}

// ── FILTER COMPANIES ──────────────────────────────────────────
// Called by the search input in the sidebar (oninput in HTML)
function filterCos(query) {
  const q = query.toLowerCase();
  const filtered = q
    ? COS.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.ticker.toLowerCase().includes(q) ||
      c.sector.toLowerCase().includes(q)
    )
    : COS;
  buildList(filtered);
}

// ── LOAD COMPANY ──────────────────────────────────────────────
// Called when a company is clicked in the sidebar.
// Updates STATE.co, highlights sidebar item, shows detail view.
async function loadCo(ticker) {
  const companyMeta = COS.find(c => c.ticker === ticker);
  if (!companyMeta) return;

  STATE.selectedTicker = ticker;
  STATE.co = null; // Clear old data

  // Highlight selected item in sidebar
  document.querySelectorAll('.co-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`ci-${companyMeta.id}`)?.classList.add('active');

  // Show detail panel and basic info
  document.getElementById('empty').style.display = 'none';
  document.getElementById('view').style.display = 'block';

  // Update basic info so it doesn't look empty
  document.getElementById('bc').textContent = ticker;
  document.getElementById('v-sector').textContent = companyMeta.sector.toUpperCase();
  document.getElementById('v-name').textContent = companyMeta.name;
  document.getElementById('v-sub').textContent = `${ticker} · Pending Calculation...`;

  // Reset metrics to show they are pending
  document.querySelectorAll('.m-val, .dc-val, .ring-val').forEach(el => el.textContent = '---');
  document.getElementById('ring-arc').style.strokeDashoffset = 264;

  toast(`Selected ${ticker}. Click GO to start ${STATE.yrs}-year prediction.`);
}

/**
 * The actual prediction engine runner.
 */
async function runValuation(ticker) {
  const companyMeta = COS.find(c => c.ticker === ticker);
  if (!companyMeta) return;

  // Show loading state
  document.getElementById('view').classList.add('loading');
  toast(`Calculating AI Valuation for ${ticker} (${STATE.yrs} yrs)...`);

  try {
    const valuationData = await fetchValuation(ticker, STATE.yrs);
    if (valuationData) {
      valuationData.sector = companyMeta.sector;
      valuationData.name = companyMeta.name;
      STATE.co = valuationData;
      renderAll();
      toast('Valuation complete!');
    } else {
      toast('⚠ Could not get valuation from server');
    }
  } catch (err) {
    console.error('Valuation error:', err);
    toast('Error during valuation calculation.');
  } finally {
    document.getElementById('view').classList.remove('loading');
  }
}

// ── RENDER ALL COMPANY DATA ───────────────────────────────────
// Populates every field in the detail view then renders charts.
function renderAll() {
  const c = STATE.co;
  if (!c) return;
  console.log('Rendering company data:', c);

  // Breadcrumb
  document.getElementById('bc').textContent = c.ticker;

  // Company header
  document.getElementById('v-sector').textContent = c.sector.toUpperCase();
  document.getElementById('v-name').textContent = c.name;
  document.getElementById('v-sub').textContent = `${c.ticker} · ${c.brsr}`;

  // ESG ring
  const arc = document.getElementById('ring-arc');
  const score = Math.round(c.esg.t); // Use mapped esg.t
  const offset = 226 - (226 * score) / 100; // Stroke dasharray is 226 in index.html
  arc.style.strokeDashoffset = offset;
  document.getElementById('ring-v').textContent = score;
  document.getElementById('v-rating').textContent = score >= 70 ? 'STRONG ESG' : score >= 50 ? 'STABLE' : 'RISK-WATCH';
  document.getElementById('v-rating').style.color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';

  // ESG Pillars
  document.getElementById('e-v').textContent = c.esg.e;
  document.getElementById('s-v').textContent = c.esg.s;
  document.getElementById('g-v').textContent = c.esg.g;

  // Animate bar fills after a tiny delay so CSS transition plays
  setTimeout(() => {
    document.getElementById('e-bar').style.width = c.esg.e + '%';
    document.getElementById('s-bar').style.width = c.esg.s + '%';
    document.getElementById('g-bar').style.width = c.esg.g + '%';
  }, 60);

  // Metric cards
  document.getElementById('m-iv').textContent = '₹ ' + c.dcf.iv.toLocaleString('en-IN');
  const up = c.dcf.up;
  document.getElementById('m-up').innerHTML = `
    <span class="${up >= 0 ? 'up' : 'dn'}">
      ${up >= 0 ? '▲' : '▼'} ${Math.abs(up)}% vs CMP ₹${c.dcf.cmp.toLocaleString('en-IN')}
    </span>`;
  document.getElementById('m-wacc').textContent = c.dcf.wacc + '%';
  document.getElementById('m-tg').textContent = c.dcf.tg + '%';
  document.getElementById('m-p50').textContent = '₹ ' + c.mc.p50.toLocaleString('en-IN');

  // DCF summary cards
  document.getElementById('dc-iv').textContent = '₹ ' + c.dcf.iv.toLocaleString('en-IN');
  document.getElementById('dc-p5').textContent = '₹ ' + c.mc.p5.toLocaleString('en-IN');
  document.getElementById('dc-p95').textContent = '₹ ' + c.mc.p95.toLocaleString('en-IN');

  // Forecast label in chart header
  document.getElementById('fc-lbl').textContent = STATE.yrs;
  document.getElementById('fc-n').value = STATE.yrs;

  // Render the three Chart.js charts
  renderCharts();
}

// ── FORECAST YEAR INPUT ───────────────────────────────────────
// Called by the GO button in the topbar.
// Clamps value to 1–30, updates STATE.yrs, re-renders charts.
async function goFC() {
  const input = document.getElementById('fc-n');
  const v = parseInt(input.value);
  STATE.yrs = Math.max(1, Math.min(30, isNaN(v) ? 5 : v));
  input.value = STATE.yrs;
  document.getElementById('fc-lbl').textContent = STATE.yrs;

  if (STATE.selectedTicker) {
    await runValuation(STATE.selectedTicker);
  } else {
    toast('Select a company first');
  }
}

// ── INITIALIZATION ───────────────────────────────────────────
// Called by auth.js when the dashboard is shown.
async function initDashboard() {
  const companies = await fetchCompanies();
  buildList(companies);
}
