# AI-Driven Corporate Valuation Model Integrating ESG Factors

> JIIT Noida · Even Semester 2026 · Minor Project-2

---

## Team

| Name | Enrollment No. |
|------|---------------|
| Sidhi Kedia | 23104008 |
| Bristi Biswas | 23104028 |
| Kapil Sharma | 23104036 |

---

## Overview

Traditional corporate valuation models rely purely on financial metrics and ignore sustainability factors. This project builds an **AI-driven valuation system** that integrates:

- **ML-based financial forecasting** (Random Forest, XGBoost) for revenue and margin prediction
- **NLP-based ESG scoring** from SEBI-mandated BRSR reports using TF-IDF vectorization
- **Three-statement financial modeling** to estimate Free Cash Flow
- **DCF valuation** with Gordon terminal value
- **Monte Carlo simulation** (8,000 paths) for risk-adjusted valuation ranges
- **Greenwashing detection** via vagueness density analysis on ESG disclosures

---

## System Architecture

```
User Input (Company Ticker + Forecast Period)
        │
        ├──► ESG Data Collection → NLP Processing → ESG Feature Extraction
        │
        ├──► Financial Data Collection → Preprocessing
        │
        └──► Dataset Integration & Feature Engineering
                        │
                        ▼
              Machine Learning Models
          ┌─────────┼──────────────┐
          ▼         ▼              ▼
    Revenue     Margin        ESG Score
    Prediction  Prediction    Prediction
          └─────────┼──────────────┘
                    ▼
        Three-Statement Financial Model
                    │
                    ▼
            FCF Calculation
            FCF = EBIT×(1−Tax) + Dep − CapEx − ΔNWC
                    │
                    ▼
          DCF Valuation Model
                    │
                    ▼
        Monte Carlo Simulation (8,000 paths)
                    │
                    ▼
     Valuation Distribution + ESG Score + Risk Range
```

---

## Tech Stack

| Layer | Tools |
|-------|-------|
| Language | Python, JavaScript |
| ML Models | Scikit-learn, XGBoost, TensorFlow |
| NLP | NLTK, SpaCy, TF-IDF |
| Data | Pandas, NumPy |
| Visualization | Matplotlib, Plotly, Chart.js |
| Backend | Node.js, Express |
| Email | Resend API |
| Frontend | HTML, CSS, Vanilla JS |
| Data Sources | BRSR Reports (SEBI), Company Annual Reports |

---

## Project Structure

```
Minor 2/
├── index.html              # Clean HTML skeleton (UI structure only)
├── css/
│   └── style.css           # All styling
├── js/
│   ├── data.js             # Company data handling
│   ├── charts.js           # Chart.js visualization logic
│   ├── dashboard.js        # Sidebar + dashboard rendering
│   └── auth.js             # Login, register, session management
├── backend/
│   ├── server.js           # Express API + user persistence (/me endpoint)
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example        # Environment variables template
└── ESG extractor/
    ├── esg_extractor.py    # NLP pipeline for ESG/BRSR processing
    └── ...
```

---

## Getting Started

### Prerequisites
- Node.js v18+
- Python 3.9+
- A free [Resend](https://resend.com) account for email

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Open .env and paste your Resend API key
node server.js
```

Server runs at `http://localhost:3000`

### Frontend

Just open `http://localhost:3000` in your browser — the backend serves `index.html` automatically.

---

## Features

- **Landing page** with capabilities overview matching the project pipeline
- **Auth system** — register, login with session persistence
- **Welcome email** sent on registration via Resend
- **Anniversary reminder** sent on login after 1 year (prompts users to check updated BRSR reports)
- **Dashboard** with company sidebar, ESG ring, E/S/G pillar bars
- **DCF metrics** — intrinsic value, WACC, terminal growth, P50 Monte Carlo
- **Three Chart.js charts** — revenue/EBITDA/FCF forecast, Monte Carlo distribution, FCF yield
- **Adjustable forecast horizon** — 1 to 10 years

---

## Key Financial Formulas

**Free Cash Flow:**
```
FCF = EBIT × (1 − Tax Rate) + Depreciation − CapEx − ΔNWC
```

**DCF Intrinsic Value:**
```
IV = Σ [FCFt / (1 + WACC)^t] + [Terminal Value / (1 + WACC)^n]
Terminal Value = FCFn × (1 + g) / (WACC − g)
```

**Monte Carlo:** 8,000 simulations perturbing growth rate, margin, WACC, and terminal rate ± σ

---

## Data Sources

- SEBI BRSR (Business Responsibility and Sustainability Report) filings — FY 2023-24
- Company annual reports — Reliance, TCS, Infosys, HDFC Bank, Wipro, M&M
- Public financial statement datasets

---

## References

Key references from the project synopsis — see [`references`](./references.md) or the full synopsis PDF for the complete list including Damodaran (2012), Friede et al. (2015), Chen & Guestrin XGBoost (2016), and SEBI BRSR Framework (2021).

---

## Environment Variables

Create `backend/.env` with:

```
RESEND_API_KEY=your_resend_api_key_here
```

Never commit your `.env` file — it is gitignored.
