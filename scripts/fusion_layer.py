import sys
import os
import json
import numpy as np

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FIN    = os.path.join(_ROOT, "finance model")
_NLP    = os.path.join(_ROOT, "nlp")

sys.path.insert(0, _FIN)
sys.path.insert(0, _NLP)

from prediction import get_financial_predictions
from esg_nlp    import get_esg_score

#Constants
TAX_RATE        = 0.25 
MC_SIMULATIONS  = 8000

def calculate_fcf(revenue, ebitda_margin, tax_rate, depreciation_pct, capex_pct, wc_pct):
    ebit         = revenue * ebitda_margin
    nopat        = ebit * (1 - tax_rate)
    depreciation = revenue * depreciation_pct
    capex        = revenue * capex_pct
    delta_nwc    = revenue * wc_pct
    return nopat + depreciation - capex - delta_nwc

def get_absolute_projections(fin, tax_rate, forecast_years):
    projections = []

    curr_rev = float(fin.get("base_revenue", 0))
    
    for f in fin.get("full_forecast", [])[:forecast_years]:
 
        curr_rev *= (1 + f.get("revenue_growth", 0))
        revenue = curr_rev

        margin = f.get("ebitda_margin", 0.15)
        ebitda = revenue * margin

        fcf = calculate_fcf(
            revenue, margin, tax_rate, 
            f.get("depreciation_pct", 0.03), 
            f.get("capex_pct", 0.05), 
            f.get("wc_pct", 0.02)
        )
        
        projections.append({
            "year": f.get("year", 0),
            "revenue": round(revenue, 2),
            "ebitda":  round(ebitda, 2),
            "fcf":     round(fcf, 2)
        })
    return projections


def run_monte_carlo(base_fcf, adjusted_wacc, terminal_growth_rate, num_years):

    wacc_paths   = np.random.normal(adjusted_wacc,            0.010,             MC_SIMULATIONS)
    growth_paths = np.random.normal(terminal_growth_rate,     0.05,             MC_SIMULATIONS)
    fcf_paths    = np.random.normal(base_fcf,                 abs(base_fcf * 0.05), MC_SIMULATIONS)

    valuations = []
    for i in range(MC_SIMULATIONS):
        w   = wacc_paths[i]
        g   = growth_paths[i]
        fcf = fcf_paths[i]

        # Guard: WACC must be > terminal growth or Terminal Value formula breaks
        if w <= g:
            w = g + 0.01

        pv = 0.0
        current_fcf = fcf
        for t in range(1, num_years + 1):
            current_fcf *= (1 + g)
            pv          += current_fcf / ((1 + w) ** t)

        terminal_value = (current_fcf * (1 + g)) / (w - g)
        pv            += terminal_value / ((1 + w) ** num_years)
        valuations.append(pv)

    valuations = np.array(valuations)
    return {
        "p10":  float(np.percentile(valuations, 10)),   # Bear / worst case
        "p50":  float(np.percentile(valuations, 50)),   # Median / most likely
        "p90":  float(np.percentile(valuations, 90)),   # Bull / best case
        "mean": float(np.mean(valuations)),
    }


def calculate_dcf(fcf_array, wacc, terminal_growth, num_years):
    pv = 0.0
    for t, fcf in enumerate(fcf_array):
        pv += fcf / ((1 + wacc) ** (t + 1))
    
    # Terminal Value based on the last year's absolute FCF
    last_fcf = fcf_array[-1]
    if wacc <= terminal_growth:
        wacc = terminal_growth + 0.01
        
    terminal_value = (last_fcf * (1 + terminal_growth)) / (wacc - terminal_growth)
    pv += terminal_value / ((1 + wacc) ** num_years)
    return round(pv, 2)

NLP_DIR = os.path.join(_ROOT, "nlp")

COMPANIES = [
    {"name": "Infosys Ltd",              "ticker": "INFY.NS",       "pdf": os.path.join(NLP_DIR, "infosys-ar-24.pdf")},
    {"name": "Reliance Industries Ltd",  "ticker": "RELIANCE.NS",   "pdf": os.path.join(NLP_DIR, "reliance_brsr.pdf")},
    {"name": "Tata Steel Ltd",           "ticker": "TATASTEEL.NS",  "pdf": os.path.join(NLP_DIR, "brsr-tatasteel.pdf")},
    {"name": "Wipro Ltd",                "ticker": "WIPRO.NS",      "pdf": os.path.join(NLP_DIR, "business-responsibility-report-wipro.pdf")},
    {"name": "Hindustan Unilever Ltd",   "ticker": "HINDUNILVR.NS", "pdf": os.path.join(NLP_DIR, "HUL_BRSR.pdf")},
    {"name": "Adani Ports & SEZ Ltd",    "ticker": "ADANIPORTS.NS", "pdf": os.path.join(NLP_DIR, "adaniport_brsr.pdf")},
]

def run_valuation(ticker, pdf_path, forecast_years):

    # Core valuation process
    fin = get_financial_predictions(ticker, forecast_years)
    if fin is None:
        return {"error": f"Ticker '{ticker}' not found in financial dataset."}

    # Integrate ESG scores
    if pdf_path and os.path.exists(pdf_path):
        esg_result    = get_esg_score(pdf_path)
        esg_score     = esg_result["final_score"]
        adjusted_wacc = esg_result["adjusted_wacc"]
        esg_rating    = esg_result["rating"]
        gw_penalty    = esg_result["penalty_score"]
        esg_source    = "NLP pipeline"
    else:
        esg_score     = 50.0
        adjusted_wacc = 0.10
        esg_rating    = "NEUTRAL (no PDF provided)"
        gw_penalty    = 0.0
        esg_source    = "fallback (no PDF)"

    # Map growth rates to absolute ₹ amounts
    abs_projections = get_absolute_projections(fin, TAX_RATE, forecast_years)
    fcf_forecast    = [p["fcf"] for p in abs_projections]
    base_fcf        = fcf_forecast[0]

    BASE_WACC       = 0.10
    terminal_growth = max(fin["revenue_growth"] * 0.5, 0.02)

    dcf_before = calculate_dcf(fcf_forecast, BASE_WACC, terminal_growth, forecast_years)
    mc_before  = run_monte_carlo(base_fcf, BASE_WACC, terminal_growth, forecast_years)

    dcf_after = calculate_dcf(fcf_forecast, adjusted_wacc, terminal_growth, forecast_years)
    mc_after  = run_monte_carlo(base_fcf, adjusted_wacc, terminal_growth, forecast_years)

    wacc_delta_pct = round((adjusted_wacc - BASE_WACC) * 100, 4)
    dcf_delta      = round(dcf_after - dcf_before, 2)
    dcf_delta_pct  = round((dcf_delta / dcf_before) * 100, 2) if dcf_before != 0 else 0

    return {
        "ticker":         ticker,
        "forecast_years": forecast_years,
        "esg": {
            "score":             esg_score,
            "raw_score":         esg_result.get("raw_score", esg_score),
            "rating":            esg_rating,
            "greenwash_penalty": gw_penalty,
            "source":            esg_source,
        },
        "financial": {
            "base_revenue":        fin["base_revenue"],
            "terminal_growth_pct": round(terminal_growth * 100, 2),
            "full_forecast":       fin["full_forecast"],
            "absolute_projections": abs_projections
        },
        "before_esg": {
            "wacc_pct":      round(BASE_WACC * 100, 4),
            "dcf_intrinsic": dcf_before,
            "monte_carlo": {
                "p5":   round(mc_before["p10"],  2),  # Mapping p10 to p5 for UI
                "p50":  round(mc_before["p50"],  2),
                "p95":  round(mc_before["p90"],  2),  # Mapping p90 to p95 for UI
                "mean": round(mc_before["mean"], 2),
            },
        },
        "after_esg": {
            "wacc_pct":      round(adjusted_wacc * 100, 4),
            "dcf_intrinsic": dcf_after,
            "monte_carlo": {
                "p5":   round(mc_after["p10"],  2),  # Mapping p10 to p5 for UI
                "p50":  round(mc_after["p50"],  2),
                "p95":  round(mc_after["p90"],  2),  # Mapping p90 to p95 for UI
                "mean": round(mc_after["mean"], 2),
            },
        },
        "esg_impact": {
            "wacc_change_pct":  wacc_delta_pct,
            "dcf_value_change": dcf_delta,
            "dcf_change_pct":   dcf_delta_pct,
            "direction": "ESG penalised valuation" if dcf_delta < 0 else "ESG boosted valuation",
        },
    }


# Formatting numbers intocrores

def fmt(val):
    if abs(val) >= 1e9:
        return f"₹{val/1e7:,.2f} Cr"
    elif abs(val) >= 1e6:
        return f"₹{val/1e6:,.2f} M"
    else:
        return f"₹{val:,.2f}"

def pretty_print(result):
    if "error" in result:
        print(f"\n   {result['error']}\n")
        return

    e = result["esg"]
    f = result["financial"]
    b = result["before_esg"]
    a = result["after_esg"]
    imp = result["esg_impact"]

    print(f"\n{'='*70}")
    print(f"  FUSION LAYER OUTPUT — {result['ticker']}")
    print(f"  Forecast Period: {result['forecast_years']} years")
    print(f"{'='*70}")

    print(f"\n  {'─'*66}")
    print(f"  ESG ANALYSIS")
    print(f"  {'─'*66}")
    print(f"  ESG Score         : {e['score']} / 100")
    print(f"  Rating            : {e['rating']}")
    print(f"  Greenwash Penalty : {e['greenwash_penalty']}")
    print(f"  Source            : {e['source']}")

    print(f"\n  {'─'*66}")
    print(f"  FINANCIAL ML PREDICTIONS")
    print(f"  {'─'*66}")
    print(f"  Base Revenue      : {fmt(f['base_revenue'])}")
    print(f"  Revenue Growth    : {f['revenue_growth_pct']}%")
    print(f"  EBITDA Margin     : {f['ebitda_margin_pct']}%")
    print(f"  Base FCF          : {fmt(f['base_fcf'])}")
    print(f"  Terminal Growth   : {f['terminal_growth_pct']}%")

    print(f"\n  {'─'*66}")
    print(f"  BEFORE ESG (Pure Financial — WACC {b['wacc_pct']}%)")
    print(f"  {'─'*66}")
    print(f"  DCF Intrinsic     : {fmt(b['dcf_intrinsic'])}")
    print(f"  Monte Carlo P10   : {fmt(b['monte_carlo']['p10'])}")
    print(f"  Monte Carlo P50   : {fmt(b['monte_carlo']['p50'])}")
    print(f"  Monte Carlo P90   : {fmt(b['monte_carlo']['p90'])}")

    print(f"\n  {'─'*66}")
    print(f"  AFTER ESG (Adjusted — WACC {a['wacc_pct']}%)")
    print(f"  {'─'*66}")
    print(f"  DCF Intrinsic     : {fmt(a['dcf_intrinsic'])}")
    print(f"  Monte Carlo P10   : {fmt(a['monte_carlo']['p10'])}")
    print(f"  Monte Carlo P50   : {fmt(a['monte_carlo']['p50'])}")
    print(f"  Monte Carlo P90   : {fmt(a['monte_carlo']['p90'])}")

    print(f"\n  {'─'*66}")
    print(f"  ESG IMPACT ON VALUATION")
    print(f"  {'─'*66}")
    sign = "+" if imp["wacc_change_pct"] >= 0 else ""
    print(f"  WACC Change       : {sign}{imp['wacc_change_pct']}%")
    print(f"  DCF Value Change  : {fmt(imp['dcf_value_change'])}")
    print(f"  DCF Change %      : {imp['dcf_change_pct']}%")
    print(f"  Direction         : {imp['direction']}")
    print(f"{'='*70}\n")


# Interactive Mode

def interactive_mode():
    print("\n" + "=" * 62)
    print("  AI-DRIVEN CORPORATE VALUATION — FUSION LAYER")
    print("=" * 62)

    print(f"\n  Companies with BRSR reports available ({len(COMPANIES)}):\n")
    for i, c in enumerate(COMPANIES, 1):
        pdf_status = "Yes" if os.path.exists(c["pdf"]) else " PDF missing"
        print(f"    {i}. {c['name']:<30}  ({c['ticker']})  {pdf_status}")

    if len(COMPANIES) == 1:
        selected = COMPANIES[0]
        print(f"\n  → Auto-selected: {selected['name']} (only 1 company available)")
    else:
        #user selection
        print()
        while True:
            try:
                choice = int(input(f"  Enter number (1-{len(COMPANIES)}): ").strip())
                if 1 <= choice <= len(COMPANIES):
                    break
                print(f"  ⚠  Enter a number between 1 and {len(COMPANIES)}")
            except ValueError:
                print("  ⚠  Please enter a number, not text")
        selected = COMPANIES[choice - 1]

    print(f"\n  Selected: {selected['name']} ({selected['ticker']})")

    # Get forecast years
    while True:
        try:
            years = int(input("  Enter forecast period in years (1-10): ").strip())
            if 1 <= years <= 10:
                break
            print("  ⚠  Enter a value between 1 and 10")
        except ValueError:
            print("  ⚠  Please enter a number")

    print(f"\n  Running valuation for {selected['name']}...")
    print(f"  Ticker: {selected['ticker']}  |  Forecast: {years} years")
    print(f"  PDF: {selected['pdf']}")
    print(f"  {'─' * 56}")

    result = run_valuation(selected["ticker"], selected["pdf"], years)
    pretty_print(result)

def main():
    if len(sys.argv) >= 2:
        # CLI mode — used by Express backend (outputs JSON)
        ticker         = sys.argv[1]
        pdf_path       = sys.argv[2] if len(sys.argv) > 2 else None
        forecast_years = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        result = run_valuation(ticker, pdf_path, forecast_years)
        print(json.dumps(result))
    else:
        # Interactive mode — user selects from list
        interactive_mode()


if __name__ == "__main__":
    main()
