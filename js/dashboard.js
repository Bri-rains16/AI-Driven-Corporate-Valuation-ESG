const esgCls = score => score >= 75 ? 'hi' : score >= 65 ? 'md' : 'lo';

// Sidebar list management
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

// Search filtering
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

//LOAD COMPANY on click
async function loadCo(ticker) {
  if (document.getElementById('view').classList.contains('loading')) {
    toast('⚠ Please wait for current valuation to finish');
    return;
  }
  const companyMeta = COS.find(c => c.ticker === ticker);
  if (!companyMeta) return;

  STATE.selectedTicker = ticker;
  STATE.co = null; // Clear old data
  document.querySelectorAll('.co-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`ci-${companyMeta.id}`)?.classList.add('active');

  document.getElementById('empty').style.display = 'none';
  document.getElementById('view').style.display = 'block';

  // Update basic info so it doesn't look empty
  document.getElementById('bc').textContent = ticker;
  document.getElementById('v-sector').textContent = companyMeta.sector.toUpperCase();
  document.getElementById('v-name').textContent = companyMeta.name;
  document.getElementById('v-sub').textContent = `${ticker} · Pending Calculation...`;

  // Reset metrics to show they are pending
  document.querySelectorAll('.m-val, .dc-val, .ring-val').forEach(el => el.textContent = '---');
  document.getElementById('ring-arc').style.strokeDashoffset = 226;
  document.getElementById('gw-arc').style.strokeDashoffset = 226;
  document.getElementById('raw-arc').style.strokeDashoffset = 226;
  document.getElementById('gw-rating').textContent = '';
  document.getElementById('raw-rating').textContent = '';

  toast(`Selected ${ticker}. Click GO to start ${STATE.yrs}-year prediction.`);
}

//Run valuation
async function runValuation(ticker) {
  const companyMeta = COS.find(c => c.ticker === ticker);
  if (!companyMeta) return;

  //Show loading
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

// Data rendering
function renderAll() {
  const c = STATE.co;
  if (!c) return;
  console.log('Rendering company data:', c);

  document.getElementById('bc').textContent = c.ticker;

  document.getElementById('v-sector').textContent = c.sector.toUpperCase();
  document.getElementById('v-name').textContent = c.name;
  document.getElementById('v-sub').textContent = `${c.ticker} · ${c.brsr}`;

  //1. Raw ESG ring
  const rawArc = document.getElementById('raw-arc');
  const rScore = Math.round(c.esg.r);
  rawArc.style.strokeDashoffset = 226 - (226 * rScore) / 100;
  const rColor = rScore >= 75 ? 'var(--green)' : rScore >= 50 ? 'var(--amber)' : 'var(--red)';
  rawArc.style.stroke = rColor;
  document.getElementById('raw-v').style.color = rColor;
  document.getElementById('raw-v').textContent = rScore;
  document.getElementById('raw-rating').textContent = rScore >= 75 ? 'STRONG' : rScore >= 50 ? 'MODERATE' : 'WEAK';
  document.getElementById('raw-rating').style.color = rColor;

  //2. Greenwashing Penalty ring
  const gwArc = document.getElementById('gw-arc');
  const penalty = Math.round(c.esg.p);
  gwArc.style.strokeDashoffset = 226 - (226 * penalty) / 100;
  const gwColor = penalty <= 10 ? 'var(--green)' : penalty <= 25 ? 'var(--amber)' : 'var(--red)';
  gwArc.style.stroke = gwColor;
  document.getElementById('gw-v').style.color = gwColor;
  document.getElementById('gw-v').textContent = penalty;
  document.getElementById('gw-rating').textContent = penalty <= 10 ? 'CREDIBLE' : penalty <= 25 ? 'SUSPECT' : 'HIGH RISK';
  document.getElementById('gw-rating').style.color = gwColor;

  //3. Final Adjusted ESG ring
  const arc = document.getElementById('ring-arc');
  const score = Math.round(c.esg.t);
  arc.style.strokeDashoffset = 226 - (226 * score) / 100;
  const color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
  arc.style.stroke = color;
  document.getElementById('ring-v').style.color = color;
  document.getElementById('ring-v').textContent = score;
  document.getElementById('v-rating').textContent = score >= 70 ? 'STRONG ESG' : score >= 50 ? 'MODERATE' : 'WEAK ESG';
  document.getElementById('v-rating').style.color = color;


  //Metric cards
  document.getElementById('m-iv').textContent = '₹ ' + c.dcf.iv.toLocaleString('en-IN');

  document.getElementById('m-wacc').textContent = c.dcf.wacc + '%';
  document.getElementById('m-tg').textContent = c.dcf.tg + '%';
  document.getElementById('m-p50').textContent = '₹ ' + c.mc.p50.toLocaleString('en-IN');

  //DCF summary cards
  document.getElementById('dc-iv').textContent = '₹ ' + c.dcf.iv.toLocaleString('en-IN');
  document.getElementById('dc-p5').textContent = '₹ ' + c.mc.p5.toLocaleString('en-IN');
  document.getElementById('dc-p95').textContent = '₹ ' + c.mc.p95.toLocaleString('en-IN');

  //Forecast label in chart header
  document.getElementById('fc-lbl').textContent = STATE.yrs;
  document.getElementById('fc-n').value = STATE.yrs;

  //Render charts.js
  renderCharts();
}

//FORECAST YEAR INPUT
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

//INITIALIZATION
//Called by auth.js when the dashboard is shown.
async function initDashboard() {
  const companies = await fetchCompanies();
  buildList(companies);
}
