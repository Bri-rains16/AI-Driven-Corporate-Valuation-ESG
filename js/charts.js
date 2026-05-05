/*
 * js/charts.js
 * ─────────────────────────────────────────────────────────────
 * PURPOSE: All Chart.js chart rendering.
 *
 * CHARTS:
 *   ch1 — Revenue / EBITDA / FCF forecast (wide line chart)
 *   ch2 — Monte Carlo valuation distribution (bar chart)
 *   ch3 — FCF Yield % over forecast horizon (line chart)
 *
 * DEPENDS ON: data.js (STATE, COS must be loaded first)
 * CALLED BY:  dashboard.js → renderAll() → renderCharts()
 * ─────────────────────────────────────────────────────────────
 */

// Chart.js instances — kept so we can destroy before re-rendering
let ch1 = null, ch2 = null, ch3 = null;

// ── SHARED CHART STYLE CONSTANTS ─────────────────────────────
// Tooltip style matching the light theme
const TT = {
  backgroundColor: 'rgba(255,255,255,.98)',
  borderColor:     'rgba(0,0,0,.1)',
  borderWidth: 1,
  titleColor:  '#00a87d',
  titleFont:   { family: 'JetBrains Mono', size: 14, weight: 'bold' },
  bodyColor:   '#1a1d1d',
  bodyFont:    { family: 'JetBrains Mono', size: 12 },
  padding: 12,
  cornerRadius: 8,
  displayColors: true
};
// Axis tick style
const TX = { color: '#6a7070', font: { size: 12, weight: '500' } };
// Grid line style
const GR = { color: 'rgba(0,0,0,.05)', drawBorder: false };

// ── HELPERS ───────────────────────────────────────────────────

// Normal (Gaussian) probability density function — used for Monte Carlo bell curve
function npdf(x, mean, sigma) {
  return Math.exp(-0.5 * ((x - mean) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

// Generate year labels for the x-axis: ["FY2025", "FY2026", ...]
function getLabels() {
  return Array.from({ length: STATE.yrs }, (_, i) => `FY${2025 + i}`);
}

// Extrapolate array beyond 10 years using average CAGR with slight deceleration.
// In production replace this with real backend-computed values.
function extrapolate(arr, targetYears) {
  if (targetYears <= arr.length) return arr.slice(0, targetYears);
  const result = [...arr];
  const last4  = arr.slice(-4);
  let   g      = Math.pow(last4[last4.length - 1] / last4[0], 1 / 3) - 1;
  while (result.length < targetYears) {
    result.push(Math.round(result[result.length - 1] * (1 + g)));
    g = Math.max(g * 0.97, 0.02); // decelerate each year, minimum 2% growth
  }
  return result;
}

// ── MAIN RENDER FUNCTION ──────────────────────────────────────
// Called by dashboard.js every time a company is selected or forecast years change.
function renderCharts() {
  const c = STATE.co;
  const n = STATE.yrs;
  const L = getLabels();

  // Destroy previous chart instances to free canvas memory
  if (ch1) ch1.destroy();
  if (ch2) ch2.destroy();
  if (ch3) ch3.destroy();

  // Extend data if user requests > 10 years
  const revData    = extrapolate(c.rev,    n);
  const ebitdaData = extrapolate(c.ebitda, n);
  const fcfData    = extrapolate(c.fcf,    n);

  // ── CHART 1: Revenue / EBITDA / FCF forecast ──────────────
  ch1 = new Chart(document.getElementById('cForecast'), {
    type: 'line',
    data: {
      labels: L,
      datasets: [
        {
          label: 'Revenue',
          data:  revData,
          borderColor:     '#4d9ef5',
          backgroundColor: 'rgba(77,158,245,.07)',
          tension: .4, pointRadius: 3, borderWidth: 1.8, fill: true,
        },
        {
          label: 'EBITDA',
          data:  ebitdaData,
          borderColor:     '#f0a500',
          backgroundColor: 'rgba(240,165,0,.07)',
          tension: .4, pointRadius: 3, borderWidth: 1.8, fill: true,
          borderDash: [5, 3],
        },
        {
          label: 'FCF',
          data:  fcfData,
          borderColor:     '#00c896',
          backgroundColor: 'rgba(0,200,150,.07)',
          tension: .4, pointRadius: 3, borderWidth: 1.8, fill: true,
          borderDash: [2, 3],
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'top',
          labels: { color: '#5a6060', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 10, padding: 12 },
        },
        tooltip: {
          ...TT,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ₹${
              ctx.raw >= 100000
                ? (ctx.raw / 100000).toFixed(2) + 'L Cr'
                : (ctx.raw / 1000).toFixed(1)   + 'K Cr'
            }`,
          },
        },
      },
      scales: {
        x: { ticks: TX, grid: GR },
        y: {
          ticks: {
            ...TX,
            callback: v => v >= 100000
              ? `₹${(v / 100000).toFixed(1)}L`
              : v >= 1000 
                ? `₹${(v / 1000).toFixed(1)}K`
                : `₹${v}`,
          },
          grid: GR,
        },
      },
    },
  });

  // ── CHART 2: Monte Carlo distribution histogram ────────────
  const { p5, p50, p95 } = c.mc;
  const bins = 13;
  const step = (p95 - p5) / bins;
  const sig  = (p95 - p5) / 5;

  const buckets = Array.from({ length: bins }, (_, i) => {
    const mid = p5 + i * step + step / 2;
    return {
      label: `₹${Math.round(p5 + i * step).toLocaleString('en-IN')}`,
      count: Math.round(8000 * npdf(mid, p50, sig) * step),
      mid,
    };
  });

  ch2 = new Chart(document.getElementById('cMC'), {
    type: 'bar',
    data: {
      labels:   buckets.map(b => b.label),
      datasets: [{
        data: buckets.map(b => b.count),
        // Colour: amber = below median, blue = at median, green = above
        backgroundColor: buckets.map(b =>
          b.mid < p50 ? 'rgba(240,165,0,.45)'  :
          b.mid > p50 ? 'rgba(0,200,150,.45)'  :
                        'rgba(77,158,245,.65)'
        ),
        borderRadius: 2, borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TT,
          callbacks: {
            title: items => items[0].label,
            label: ctx  => ` ${ctx.raw.toLocaleString()} simulations`,
          },
        },
      },
      scales: {
        x: { ticks: { ...TX, font: { size: 8 }, maxRotation: 45, autoSkip: false }, grid: { display: false } },
        y: { ticks: TX, grid: GR },
      },
    },
  });

  //CHART 3: Absolute FCF Growth
  const fcfAbs = fcfData;

  ch3 = new Chart(document.getElementById('cFCF'), {
    type: 'line',
    data: {
      labels: L,
      datasets: [{
        label: 'FCF (₹ Cr)',
        data:  fcfAbs,
        borderColor:     '#00c896',
        backgroundColor: 'rgba(0,200,150,.08)',
        tension: .4, pointRadius: 3, fill: true, borderWidth: 1.8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TT,
          callbacks: { label: ctx => ` FCF: ₹${ctx.raw.toLocaleString('en-IN')} Cr` },
        },
      },
      scales: {
        x: { ticks: TX, grid: GR },
        y: { 
          ticks: { 
            ...TX, 
            callback: v => v >= 100000 
              ? `₹${(v / 100000).toFixed(1)}L` 
              : v >= 1000 
                ? `₹${(v / 1000).toFixed(1)}K` 
                : `₹${v}`
          }, 
          grid: GR 
        },
      },
    },
  });
}