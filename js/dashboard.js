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
  document.getElementById('co-list').innerHTML = arr.map(c => `
    <div class="co-item ${STATE.co?.id === c.id ? 'on' : ''}"
         id="ci-${c.id}" onclick="loadCo('${c.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="co-name">${c.name.split(' ').slice(0, 2).join(' ')}</div>
        <span class="esg-pill ${esgCls(c.esg.t)}">${c.esg.t}</span>
      </div>
      <div class="co-meta">
        <span>${c.ticker}</span>
        <span>${c.sector}</span>
      </div>
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
function loadCo(id) {
  const company = COS.find(c => c.id === id);
  if (!company) return;

  STATE.co = company;

  // Highlight selected item in sidebar
  document.querySelectorAll('.co-item').forEach(el => el.classList.remove('on'));
  document.getElementById('ci-' + id)?.classList.add('on');

  // Show detail panel
  document.getElementById('empty').style.display = 'none';
  document.getElementById('view').style.display  = 'block';

  renderAll();
}

// ── RENDER ALL COMPANY DATA ───────────────────────────────────
// Populates every field in the detail view then renders charts.
function renderAll() {
  const c = STATE.co;

  // Breadcrumb
  document.getElementById('bc').textContent = c.ticker;

  // Company header
  document.getElementById('v-name').textContent = c.name;
  document.getElementById('v-sub').textContent  = `${c.ticker} · ${c.sector} · ${c.brsr}`;

  // Badges
  const gwCls = (c.gw === 'None' || c.gw === 'Low') ? 'bg' : 'ba';
  document.getElementById('v-badges').innerHTML = `
    <span class="badge bg">ESG ${c.esg.t}/100</span>
    <span class="badge ${gwCls}">Greenwash: ${c.gw}</span>
    <span class="badge bb">BRSR ${c.brsr}</span>
  `;

  // ESG ring animation
  document.getElementById('ring-arc').style.strokeDashoffset = 226 - (c.esg.t / 100) * 226;
  document.getElementById('ring-v').textContent = c.esg.t + '/100';
  document.getElementById('e-v').textContent    = c.esg.e;
  document.getElementById('s-v').textContent    = c.esg.s;
  document.getElementById('g-v').textContent    = c.esg.g;

  // Animate bar fills after a tiny delay so CSS transition plays
  setTimeout(() => {
    document.getElementById('e-bar').style.width = c.esg.e + '%';
    document.getElementById('s-bar').style.width = c.esg.s + '%';
    document.getElementById('g-bar').style.width = c.esg.g + '%';
  }, 60);

  // Metric cards
  document.getElementById('m-iv').textContent   = '₹ ' + c.dcf.iv.toLocaleString('en-IN');
  const up = c.dcf.up;
  document.getElementById('m-up').innerHTML = `
    <span class="${up >= 0 ? 'up' : 'dn'}">
      ${up >= 0 ? '▲' : '▼'} ${Math.abs(up)}% vs CMP ₹${c.dcf.cmp.toLocaleString('en-IN')}
    </span>`;
  document.getElementById('m-wacc').textContent = c.dcf.wacc + '%';
  document.getElementById('m-tg').textContent   = c.dcf.tg   + '%';
  document.getElementById('m-p50').textContent  = '₹ ' + c.mc.p50.toLocaleString('en-IN');

  // DCF summary cards
  document.getElementById('dc-iv').textContent  = '₹ ' + c.dcf.iv.toLocaleString('en-IN');
  document.getElementById('dc-p5').textContent  = '₹ ' + c.mc.p5.toLocaleString('en-IN');
  document.getElementById('dc-p95').textContent = '₹ ' + c.mc.p95.toLocaleString('en-IN');

  // Forecast label in chart header
  document.getElementById('fc-lbl').textContent = STATE.yrs;
  document.getElementById('fc-n').value         = STATE.yrs;

  // Render the three Chart.js charts
  renderCharts();
}

// ── FORECAST YEAR INPUT ───────────────────────────────────────
// Called by the GO button in the topbar.
// Clamps value to 1–30, updates STATE.yrs, re-renders charts.
function goFC() {
  const input = document.getElementById('fc-n');
  const v = parseInt(input.value);
  STATE.yrs = Math.max(1, Math.min(30, isNaN(v) ? 5 : v));
  input.value = STATE.yrs;
  document.getElementById('fc-lbl').textContent = STATE.yrs;
  if (STATE.co) renderCharts();
  toast(`${STATE.yrs}-year forecast applied`);
}