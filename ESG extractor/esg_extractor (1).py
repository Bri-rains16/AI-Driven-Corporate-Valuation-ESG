"""
ESG & Financial Data Extractor v2 — LLM-Powered
AI-Driven Corporate Valuation Project — JIIT 2026

Uses Claude API to intelligently extract ESG and financial data
from any annual/BRSR report PDF, regardless of formatting.

Usage:
    python3 extractor_v2.py --pdf infosys-ar-24.pdf --company Infosys --year 2024
"""

import re
import urllib.request
import pdfplumber
import json
import argparse
import warnings
import time
from pathlib import Path

warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────
#  SECTION 1: PDF TEXT EXTRACTION
# ─────────────────────────────────────────────

SECTION_KEYWORDS = {
    "environmental": [
        "scope 1", "scope 2", "scope 3", "ghg", "carbon", "emissions",
        "energy consumption", "renewable energy", "water withdrawal",
        "water consumption", "waste generated", "biodiversity", "natural capital",
        "climate", "greenhouse"
    ],
    "social": [
        "employees globally", "total employees", "workforce", "attrition",
        "training hours", "safety incidents", "fatalities", "diversity",
        "women in leadership", "csr spend", "human capital", "employee satisfaction",
        "fresh graduates", "nationalities", "disability"
    ],
    "governance": [
        "board of directors", "independent directors", "audit committee",
        "esg committee", "board meetings", "whistleblower", "compliance",
        "policy violations", "brsr", "gri", "tcfd", "governance"
    ],
    "financial": [
        "total revenue", "net revenue", "ebitda", "profit after tax",
        "earnings per share", "free cash flow", "capital expenditure",
        "return on equity", "debt to equity", "total assets", "balance sheet",
        "income statement", "cash flow from operations"
    ]
}


def extract_text_from_pdf(pdf_path: str) -> dict:
    """Extract and route page text into ESG/financial sections."""
    sections = {k: [] for k in SECTION_KEYWORDS}
    total_pages = 0

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            text_lower = text.lower()
            for section, keywords in SECTION_KEYWORDS.items():
                if any(kw in text_lower for kw in keywords):
                    sections[section].append(text.strip())

    print(f"[INFO] Processed {total_pages} pages.")
    for k, v in sections.items():
        print(f"[INFO] {k.capitalize():15} — {len(v)} relevant pages found")

    return {k: "\n\n".join(v) for k, v in sections.items()}


def chunk_text(text: str, max_chars: int = 12000) -> list[str]:
    """Split long text into chunks that fit in the API context."""
    if len(text) <= max_chars:
        return [text]
    chunks = []
    while text:
        chunks.append(text[:max_chars])
        text = text[max_chars:]
    return chunks


# ─────────────────────────────────────────────
#  SECTION 2: LLM EXTRACTION VIA CLAUDE API
# ─────────────────────────────────────────────

EXTRACTION_SCHEMA = {
    "environmental": {
        "scope_1_emissions_tco2e": "Scope 1 GHG emissions in tCO2e or metric tons CO2e",
        "scope_2_emissions_tco2e": "Scope 2 GHG emissions in tCO2e",
        "scope_3_emissions_tco2e": "Scope 3 GHG emissions in tCO2e",
        "total_ghg_emissions_tco2e": "Total GHG emissions in tCO2e",
        "carbon_intensity_per_employee": "Carbon intensity per employee (tCO2e per employee)",
        "total_energy_consumption_gj": "Total energy consumption in GJ or MWh",
        "renewable_energy_percent": "Percentage of energy from renewable sources",
        "water_withdrawal_kiloliters": "Total water withdrawal in kiloliters or million liters",
        "water_recycled_percent": "Percentage of water recycled or reused",
        "total_waste_generated_tonnes": "Total waste generated in metric tonnes",
        "waste_recycled_percent": "Percentage of waste recycled",
        "hazardous_waste_tonnes": "Hazardous waste generated in tonnes"
    },
    "social": {
        "total_employees": "Total number of employees globally",
        "employees_with_disability": "Number of employees who disclosed disability",
        "nationalities_in_workforce": "Number of nationalities in workforce",
        "ai_aware_employees": "Number of AI-trained or AI-aware employees",
        "fresh_graduates_hired": "Number of fresh graduates hired",
        "male_employees": "Number or percentage of male employees",
        "female_employees": "Number or percentage of female employees",
        "attrition_rate_percent": "Employee attrition rate as percentage",
        "new_hires": "Total new hires in the year",
        "employee_satisfaction_score_percent": "Employee satisfaction score as percentage",
        "avg_training_hours_per_employee": "Average training hours per employee",
        "lost_time_injury_rate": "Lost time injury frequency rate (LTIFR)",
        "fatalities": "Number of work-related fatalities",
        "women_in_leadership_percent": "Percentage of women in leadership or senior roles",
        "csr_spend_inr_cr": "CSR expenditure in INR crore"
    },
    "governance": {
        "total_board_members": "Total number of board directors",
        "independent_directors_percent": "Percentage of independent directors on board",
        "women_on_board": "Number of women directors on board",
        "board_meetings_per_year": "Number of board meetings held in the year",
        "has_esg_committee": "Whether company has an ESG or sustainability committee (true/false)",
        "has_audit_committee": "Whether company has an audit committee (true/false)",
        "policy_violations_reported": "Number of policy violations or non-compliances reported",
        "whistleblower_complaints": "Number of whistleblower complaints received",
        "follows_gri": "Whether company follows GRI reporting standards (true/false)",
        "follows_brsr": "Whether company files BRSR (true/false)",
        "follows_tcfd": "Whether company follows TCFD framework (true/false)"
    },
    "financial": {
        "revenue_inr_cr": "Total revenue in INR crore",
        "revenue_growth_percent": "Year-on-year revenue growth percentage",
        "ebitda_inr_cr": "EBITDA in INR crore",
        "ebitda_margin_percent": "EBITDA margin percentage",
        "pat_inr_cr": "Profit after tax (PAT) or net profit in INR crore",
        "pat_margin_percent": "Net profit margin percentage",
        "eps_inr": "Basic earnings per share in INR",
        "dividend_per_share_inr": "Dividend per share in INR",
        "total_assets_inr_cr": "Total assets in INR crore",
        "total_equity_inr_cr": "Total shareholders equity in INR crore",
        "total_debt_inr_cr": "Total debt in INR crore",
        "debt_to_equity_ratio": "Debt to equity ratio",
        "operating_cash_flow_inr_cr": "Net cash from operations in INR crore",
        "capex_inr_cr": "Capital expenditure in INR crore",
        "free_cash_flow_inr_cr": "Free cash flow in INR crore",
        "roce_percent": "Return on capital employed percentage",
        "roe_percent": "Return on equity percentage"
    }
}


def build_prompt(section: str, schema: dict, text_chunk: str) -> str:
    fields_desc = "\n".join([f'  - "{k}": {v}' for k, v in schema.items()])
    return f"""You are extracting {section} data from a corporate annual report / BRSR document.

Extract ONLY the following fields from the text below. 
Return a JSON object with exactly these keys.
Rules:
- Use null for any field not found in the text
- For numeric fields: return only the number (e.g. 317240, 25.1, 0.02) — no units, no commas
- For boolean fields: return true or false
- Do not guess or hallucinate values — only extract what is explicitly stated
- If a value appears multiple times, prefer the most recent or consolidated figure

Fields to extract:
{fields_desc}

Report text:
\"\"\"
{text_chunk}
\"\"\"

Return ONLY valid JSON. No explanation, no markdown, no extra text."""


def call_claude_api(prompt: str) -> dict:
    """Call Claude API and return parsed JSON response."""
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": "YOUR_API_KEY_HERE"   # ← replace with your key
        }
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    raw_text = result["content"][0]["text"].strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())


def merge_extractions(results: list[dict], schema_keys: list) -> dict:
    """
    Merge results from multiple chunks.
    Non-null values from later chunks override null values from earlier ones.
    """
    merged = {k: None for k in schema_keys}
    for result in results:
        for k in schema_keys:
            val = result.get(k)
            if val is not None and val is not False and val != "":
                merged[k] = val
    return merged


def extract_section_with_llm(section: str, text: str) -> dict:
    """Extract one section's fields using Claude, handling long text via chunking."""
    schema = EXTRACTION_SCHEMA[section]

    if not text.strip():
        print(f"  [WARN] No text found for {section} section")
        return {k: None for k in schema}

    chunks = chunk_text(text, max_chars=12000)
    print(
        f"  Processing {section} — {len(chunks)} chunk(s), {len(text):,} chars")

    chunk_results = []
    for i, chunk in enumerate(chunks):
        try:
            prompt = build_prompt(section, schema, chunk)
            result = call_claude_api(prompt)
            chunk_results.append(result)
            if len(chunks) > 1:
                time.sleep(0.5)  # avoid rate limiting
        except Exception as e:
            print(f"  [ERROR] Chunk {i+1} failed: {e}")
            chunk_results.append({k: None for k in schema})

    return merge_extractions(chunk_results, list(schema.keys()))


# ─────────────────────────────────────────────
#  SECTION 3: TF-IDF ESG SCORING (unchanged)
# ─────────────────────────────────────────────

def compute_tfidf_esg_scores(sections: dict) -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer

    ESG_VOCAB = {
        "environmental": (
            "carbon emissions scope renewable energy water waste biodiversity climate "
            "greenhouse pollution sustainability environment solar green hydrogen"
        ),
        "social": (
            "employees workforce training diversity inclusion safety health attrition "
            "gender women community csr welfare rights wellbeing"
        ),
        "governance": (
            "board directors audit committee compliance ethics transparency policy "
            "accountability regulation whistleblower risk management fiduciary"
        )
    }

    scores = {}
    for category, corpus_seed in ESG_VOCAB.items():
        all_docs = [corpus_seed, sections.get(category, "")]
        try:
            vectorizer = TfidfVectorizer(
                stop_words="english", max_features=100)
            tfidf_matrix = vectorizer.fit_transform(all_docs)
            section_scores = tfidf_matrix[1].toarray()[0]
            scores[f"{category}_tfidf_score"] = round(
                float(section_scores.mean() * 100), 4)
        except Exception:
            scores[f"{category}_tfidf_score"] = 0.0

    e = scores.get("environmental_tfidf_score", 0)
    s = scores.get("social_tfidf_score", 0)
    g = scores.get("governance_tfidf_score", 0)
    scores["composite_esg_score"] = round((e + s + g) / 3, 4)
    return scores


# ─────────────────────────────────────────────
#  SECTION 4: GREENWASHING DETECTION (unchanged)
# ─────────────────────────────────────────────


GREENWASHING_PHRASES = [
    r"committed to becoming\s+(?:carbon\s+)?(?:net\s+zero|sustainable|green)",
    r"striving\s+(?:towards?|to\s+be)\s+(?:sustainable|green|eco-friendly)",
    r"aim(?:ing|s)?\s+to\s+(?:reduce|achieve|become)",
    r"plan(?:ning|s)?\s+to\s+(?:reduce|offset|become)",
    r"working\s+towards?\s+(?:a\s+)?(?:sustainable|green|better)",
]

MISSING_DATA_INDICATORS = [
    r"data\s+not\s+(?:available|applicable|reported)",
    r"not\s+(?:tracked|measured|reported|available)",
    r"n/?a\b",
]


def detect_greenwashing_flags(text: str) -> dict:
    flags = []
    for pattern in GREENWASHING_PHRASES:
        for m in re.findall(pattern, text, re.IGNORECASE):
            flags.append({"type": "vague_aspirational_language",
                         "phrase": m.strip()[:80]})

    missing_count = sum(
        len(re.findall(p, text, re.IGNORECASE)) for p in MISSING_DATA_INDICATORS
    )

    return {
        "greenwashing_flag_count": len(flags),
        "missing_data_count": missing_count,
        "greenwashing_risk": "HIGH" if len(flags) >= 5 else "MEDIUM" if len(flags) >= 2 else "LOW",
        "sample_flags": flags[:5]
    }


# ─────────────────────────────────────────────
#  SECTION 5: MAIN PIPELINE
# ─────────────────────────────────────────────

def run_pipeline(pdf_path: str, company: str, year: str) -> dict:
    print(f"\n{'='*55}")
    print(f"  ESG Extractor v2 — LLM Powered")
    print(f"  Company : {company}  |  Year : {year}")
    print(f"{'='*55}\n")

    print("[1/4] Extracting & routing PDF text...")
    sections = extract_text_from_pdf(pdf_path)

    print("\n[2/4] Extracting values via Claude API...")
    extracted = {}
    for section in ["environmental", "social", "governance", "financial"]:
        extracted[section] = extract_section_with_llm(
            section, sections[section])

    print("\n[3/4] Computing TF-IDF ESG scores...")
    tfidf = compute_tfidf_esg_scores(sections)

    print("[4/4] Running greenwashing analysis...")
    gw_text = sections.get("environmental", "") + sections.get("social", "")
    greenwashing = detect_greenwashing_flags(gw_text)

    def coverage(d):
        total = len(d)
        found = sum(1 for v in d.values() if v is not None and v is not False)
        return f"{found}/{total} fields extracted"

    results = {
        "metadata": {"company": company, "year": year, "pdf_path": str(pdf_path)},
        **extracted,
        "esg_tfidf_scores": tfidf,
        "greenwashing_analysis": greenwashing,
        "extraction_summary": {
            f"{s}_coverage": coverage(extracted[s])
            for s in ["environmental", "social", "governance", "financial"]
        }
    }
    return results


def pretty_print(results: dict):
    print(f"\n{'='*55}\n  EXTRACTION RESULTS\n{'='*55}")
    for section in ["environmental", "social", "governance", "financial"]:
        print(f"\n--- {section.upper()} ---")
        for k, v in results[section].items():
            print(f"  {k:<45} {v if v is not None else '[not found]'}")

    print("\n--- ESG TF-IDF SCORES ---")
    for k, v in results["esg_tfidf_scores"].items():
        print(f"  {k:<45} {v}")

    print("\n--- GREENWASHING ---")
    gw = results["greenwashing_analysis"]
    print(f"  Risk: {gw['greenwashing_risk']}  |  Vague phrases: {gw['greenwashing_flag_count']}  |  Missing data refs: {gw['missing_data_count']}")

    print("\n--- COVERAGE ---")
    for k, v in results["extraction_summary"].items():
        print(f"  {k:<45} {v}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf",     required=True)
    parser.add_argument("--company", default="Unknown")
    parser.add_argument("--year",    default="Unknown")
    parser.add_argument("--output",  default=None)
    args = parser.parse_args()

    if not Path(args.pdf).exists():
        print(f"[ERROR] File not found: {args.pdf}")
        exit(1)

    results = run_pipeline(args.pdf, args.company, args.year)
    pretty_print(results)

    out = args.output or f"{args.company}_{args.year}_esg_extracted.json"
    with open(out, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n[SAVED] {out}")
