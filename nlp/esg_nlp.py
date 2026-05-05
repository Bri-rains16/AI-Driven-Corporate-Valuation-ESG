"""
=============================================================================
ESG NLP PIPELINE — HYBRID APPROACH + ML GREENWASHING DETECTION
Project: AI-Driven Corporate Valuation Model Integrating ESG Factors
JIIT Noida | Even Sem 2026
=============================================================================

HOW TO RUN:
  python esg_nlp.py                      <- runs on built-in sample
  python esg_nlp.py your_report.pdf      <- runs on your BRSR PDF

REQUIRED FILES (all in same folder as this script):
  train_data.csv        <- ESG sentence classification training data
  test_data.csv         <- ESG sentence classification test data
  greenwash_train.csv   <- Greenwashing detection training data
  greenwash_test.csv    <- Greenwashing detection test data

INSTALL:
  pip install scikit-learn pandas numpy
  pip install pdfplumber    <- only if using a PDF

TO ADD MORE GREENWASHING TRAINING DATA:
  Open greenwash_train.csv and add rows with two columns:
    Sentence  |  Label
  Label must be exactly: Greenwash or Credible
=============================================================================
"""

import re
import sys
import os
import pandas as pd
import warnings
warnings.filterwarnings("ignore")

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.pipeline import Pipeline

STOPWORDS = {
    "i","me","my","we","our","you","your","he","him","his","she","her",
    "it","its","they","them","their","what","which","who","this","that",
    "these","those","am","is","are","was","were","be","been","being",
    "have","has","had","do","does","did","a","an","the","and","but",
    "if","or","as","of","at","by","for","with","about","into","through",
    "to","from","in","out","on","over","then","here","there","when",
    "where","how","all","both","each","more","other","some","so","than",
    "too","very","can","will","just","should","now","also","would","could",
    "may","might","upon","per","any","company","companies","year",
    "financial","during","report","total","s","t","d","ll","m","re","ve",
}

# HELPERS

def split_into_sentences(text: str) -> list:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if len(s.strip()) > 15]

def clean_text(text: str) -> str:
    """
    Standard cleaning — removes stopwords, punctuation, numbers.
    Used for ESG classification model.
    """
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    words = re.findall(r'\b[a-z]+\b', text)
    words = [w for w in words if w not in STOPWORDS and len(w) > 2]
    return " ".join(words)

def clean_text_greenwash(text: str) -> str:
    """
    Lighter cleaning for greenwashing model.
    Keeps words like 'will', 'aim', 'plan', 'going' which are
    critical signals for detecting vague future language.
    Without these words the greenwashing model loses its key features.
    """
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    words = re.findall(r'\b[a-z]+\b', text)
    light_stopwords = {
        "i","me","my","a","an","the","and","but","or","of","at","by",
        "for","with","into","from","in","on","there","when","where",
        "how","all","both","each","other","some","so","than","too",
        "very","just","now","per","any","s","t","d","ll","m","re","ve",
    }
    words = [w for w in words if w not in light_stopwords and len(w) > 1]
    return " ".join(words)

# STEP 1 — RULE-BASED METRIC EXTRACTION

ESG_PATTERNS = {
    "carbon_emissions_tCO2"    : r"(\d[\d,\.]*)\s*(million\s*)?(metric tons?|tCO2|tonnes?|MT)\s*(of\s*)?(CO2|carbon|GHG)?",
    "renewable_energy_pct"     : r"(\d[\d,\.]*)\s*(%|percent)\s*(of\s*)?(renewable|solar|wind|clean|green)\s*energy",
    "water_reduction_pct"      : r"(\d[\d,\.]*)\s*(%|percent)\s*(reduction|decrease|saving)\s*(in\s*)?water",
    "waste_generated"          : r"(\d[\d,\.]*)\s*(million\s*)?(tons?|tonnes?|kg|MT)\s*(of\s*)?(waste|hazardous waste)",
    "energy_consumption"       : r"(\d[\d,\.]*)\s*(GJ|MJ|KWh|MWh|GWh)\s*(of\s*)?(energy|electricity|power)?",
    "women_workforce_pct"      : r"(\d[\d,\.]*)\s*(%|percent)\s*(of\s*)?(women|female|gender)\s*(workforce|employees?|staff)?",
    "training_hours"           : r"(\d[\d,\.]*)\s*(hours?|hrs?)\s*(of\s*)?(training|learning|upskilling)",
    "csr_spend"                : r"(\d[\d,\.]*)\s*(crore|lakh|million|INR|Rs\.?)\s*(of\s*)?(CSR|social responsibility)",
    "independent_directors_pct": r"(\d[\d,\.]*)\s*(%|percent)\s*(of\s*)?(independent directors?|board independence)",
    "women_on_board_pct"       : r"(\d[\d,\.]*)\s*(%|percent)\s*(of\s*)?(women|female)\s*(directors?|board)",
}

def extract_esg_metrics(text: str) -> dict:
    found = {}
    for metric_name, pattern in ESG_PATTERNS.items():
        matches = re.findall(pattern, text, flags=re.IGNORECASE)
        if matches:
            found[metric_name] = [m[0].replace(",", "") for m in matches]
    return found

def show_extracted_metrics(metrics: dict, company: str):
    print(f"\n{'='*62}")
    print(f"  STEP 1 — RULE-BASED EXTRACTION  |  {company}")
    print(f"{'='*62}")
    if not metrics:
        print("  No quantitative ESG metrics found.")
    for name, values in metrics.items():
        print(f"  {name.replace('_',' ').title():<35}: {', '.join(values)}")
    print(f"{'='*62}")


# =============================================================================
# CSV LOADER  (shared by both models)
# =============================================================================

def load_csv(filepath: str) -> tuple:
    if not os.path.exists(filepath):
        print(f"\n  ERROR: File not found — {filepath}")
        print(f"  Make sure all four CSV files are in the same folder as esg_nlp.py\n")
        sys.exit(1)
    df = pd.read_csv(filepath)
    if "Sentence" not in df.columns or "Label" not in df.columns:
        print(f"\n  ERROR: {filepath} must have columns 'Sentence' and 'Label'")
        sys.exit(1)
    df = df.dropna(subset=["Sentence", "Label"])
    return df["Sentence"].tolist(), df["Label"].tolist()


# =============================================================================
# STEP 2 — ESG CLASSIFICATION MODEL
# Trains on train_data.csv, tests on test_data.csv
# Labels: Positive ESG / Negative ESG / Neutral
# =============================================================================

def train_esg_model(train_csv: str, test_csv: str):
    print(f"\n  Loading ESG training data : {train_csv}")
    print(f"  Loading ESG test data     : {test_csv}")

    X_train_raw, y_train = load_csv(train_csv)
    X_test_raw,  y_test  = load_csv(test_csv)

    X_train = [clean_text(s) for s in X_train_raw]
    X_test  = [clean_text(s) for s in X_test_raw]

    model = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=1000, sublinear_tf=True)),
        ("clf",   RandomForestClassifier(n_estimators=300, random_state=42, class_weight="balanced"))
    ])
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    acc = accuracy_score(y_test, predictions)
    f1  = f1_score(y_test, predictions, average="weighted")

    print(f"\n{'='*62}")
    print(f"  STEP 2 — ESG CLASSIFICATION MODEL")
    print(f"{'='*62}")
    print(f"  Algorithm    : Random Forest + TF-IDF")
    print(f"  Training set : {len(X_train)} sentences")
    print(f"  Test set     : {len(X_test)} sentences")
    print(f"  Accuracy     : {acc*100:.1f}%")
    print(f"  Weighted F1  : {f1:.4f}")
    print(f"\n  Per-Class Breakdown:")
    print(classification_report(y_test, predictions,
                                target_names=["Negative ESG", "Neutral", "Positive ESG"]))
    print(f"{'='*62}")
    return model


# =============================================================================
# STEP 3 — CLASSIFY REPORT SENTENCES (ESG labels)
# =============================================================================

def classify_report(text: str, model) -> pd.DataFrame:
    sentences  = split_into_sentences(text)
    cleaned    = [clean_text(s) for s in sentences]
    labels     = model.predict(cleaned)
    probs      = model.predict_proba(cleaned)
    return pd.DataFrame({
        "Sentence"  : sentences,
        "Label"     : labels,
        "Confidence": [round(p.max(), 2) for p in probs]
    })

def show_classification_results(df: pd.DataFrame):
    print(f"\n{'='*62}")
    print(f"  STEP 3 — ESG SENTENCE CLASSIFICATION")
    print(f"{'='*62}")
    icons = {"Positive ESG": "🟢", "Negative ESG": "🔴", "Neutral": "⚪"}
    for label in ["Positive ESG", "Negative ESG", "Neutral"]:
        count = len(df[df["Label"] == label])
        print(f"  {icons[label]}  {label:<20}: {count} sentences")
    print(f"{'='*62}")


# =============================================================================
# STEP 4 — RAW ESG SCORE
# =============================================================================

def calculate_raw_esg_score(df: pd.DataFrame) -> dict:
    positive = len(df[df["Label"] == "Positive ESG"])
    negative = len(df[df["Label"] == "Negative ESG"])
    neutral  = len(df[df["Label"] == "Neutral"])
    score = round((positive / (positive + negative)) * 100, 2) if (positive + negative) > 0 else 50.0
    return {"positive": positive, "negative": negative, "neutral": neutral, "raw_esg_score": score}


# =============================================================================
# STEP 5 — GREENWASHING DETECTION MODEL
#
# Fully ML-based — no hardcoded keyword lists.
# Learns from greenwash_train.csv what makes a sentence greenwashing
# versus a credible ESG claim.
#
# GREENWASH patterns the model learns:
#   - Future-tense words: "aim", "plan", "aspire", "will", "going to",
#     "intend", "hope", "expect", "by 2050", "in the coming years"
#   - Vague repeated phrases: "carbon neutral", "sustainability",
#     "green", "committed to", "net zero" without supporting numbers
#   - Superlative language: "most sustainable", "leader in"
#
# CREDIBLE patterns the model learns:
#   - Specific numbers: percentages, quantities, years
#   - Past tense: "reduced", "achieved", "installed", "recorded"
#   - Third-party references: "verified", "audited", "certified"
#   - Shortfall acknowledgements: "missed", "fell short", "below target"
#
# PENALTY SCORE:
#   Penalty Score = (greenwash_sentences / total_sentences) x 100
#   Range: 0 (no greenwashing) to 100 (every sentence is greenwashing)
# =============================================================================

def train_greenwash_model(train_csv: str, test_csv: str):
    """
    Trains a binary ML classifier to detect greenwashing sentences.
    Labels: Greenwash | Credible
    Uses lighter text cleaning to preserve future-tense signal words.
    """
    print(f"\n  Loading greenwashing training data : {train_csv}")
    print(f"  Loading greenwashing test data     : {test_csv}")

    X_train_raw, y_train = load_csv(train_csv)
    X_test_raw,  y_test  = load_csv(test_csv)

    X_train = [clean_text_greenwash(s) for s in X_train_raw]
    X_test  = [clean_text_greenwash(s) for s in X_test_raw]

    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 3),
            max_features=800,
            sublinear_tf=True
        )),
        ("clf", GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.1,
            max_depth=4,
            random_state=42
        ))
    ])
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    acc = accuracy_score(y_test, predictions)
    f1  = f1_score(y_test, predictions, average="weighted")

    print(f"\n{'='*62}")
    print(f"  STEP 5 — GREENWASHING DETECTION MODEL")
    print(f"{'='*62}")
    print(f"  Algorithm    : Gradient Boosting + TF-IDF (trigrams)")
    print(f"  Training set : {len(X_train)} sentences")
    print(f"  Test set     : {len(X_test)} sentences")
    print(f"  Accuracy     : {acc*100:.1f}%")
    print(f"  Weighted F1  : {f1:.4f}")
    print(f"\n  Per-Class Breakdown:")
    print(classification_report(y_test, predictions, target_names=["Credible", "Greenwash"]))
    print(f"{'='*62}")
    return model


def run_greenwash_detection(sentences: list, gw_model) -> dict:
    """
    Runs every sentence through the greenwashing ML model.
    Returns counts, flagged sentences, and penalty score.
    """
    if not sentences:
        return {"penalty_score": 0, "greenwash_count": 0,
                "credible_count": 0, "flagged_sentences": [], "total": 0}

    cleaned    = [clean_text_greenwash(s) for s in sentences]
    labels     = gw_model.predict(cleaned)
    probs      = gw_model.predict_proba(cleaned)

    flagged         = []
    credible_count  = 0
    greenwash_count = 0

    for sentence, label, prob in zip(sentences, labels, probs):
        confidence = round(prob.max(), 2)
        if label == "Greenwash":
            greenwash_count += 1
            flagged.append({"sentence": sentence, "confidence": confidence})
        else:
            credible_count += 1

    total           = len(sentences)
    greenwash_ratio = greenwash_count / total
    penalty_score   = round(greenwash_ratio * 100, 2)

    return {
        "total"            : total,
        "greenwash_count"  : greenwash_count,
        "credible_count"   : credible_count,
        "greenwash_pct"    : round(greenwash_ratio * 100, 1),
        "penalty_score"    : penalty_score,
        "flagged_sentences": flagged,
    }


def show_greenwash_results(gw: dict):
    print(f"\n{'='*62}")
    print(f"  GREENWASHING ANALYSIS RESULTS")
    print(f"{'='*62}")
    print(f"  Total sentences analysed : {gw['total']}")
    print(f"  🟢 Credible              : {gw['credible_count']} sentences")
    print(f"  🚩 Greenwash detected    : {gw['greenwash_count']} sentences "
          f"({gw['greenwash_pct']}%)")
    print(f"\n  Penalty Score            : {gw['penalty_score']} / 100")

    if gw["flagged_sentences"]:
        print(f"\n  Top flagged sentences (showing up to 5):")
        top = sorted(gw["flagged_sentences"], key=lambda x: -x["confidence"])[:5]
        for item in top:
            print(f"  🚩 [conf: {item['confidence']}] {item['sentence']}")
    else:
        print(f"\n  No greenwashing sentences detected.")
    print(f"{'='*62}")


# =============================================================================
# STEP 6 — FINAL ADJUSTED ESG SCORE + WACC
#
# FORMULA:
#   Final ESG Score = Raw ESG Score - (Penalty Score x 0.3)
#
#   The 0.3 multiplier means even a penalty of 100 (every sentence is
#   greenwash) can only reduce the ESG score by 30 points — keeping
#   the penalty proportional and not catastrophic.
#
# WACC ADJUSTMENT RANGE: ±3%
#   Score 100 -> -3.00% -> WACC = 7.00%   (strong ESG, low risk)
#   Score  50 ->  0.00% -> WACC = 10.00%  (neutral)
#   Score   0 -> +3.00% -> WACC = 13.00%  (weak ESG, high risk)
#
# HOW IT CONNECTS TO DCF:
#   Higher ESG score -> lower WACC -> higher company valuation
#   Lower ESG score  -> higher WACC -> lower company valuation
# =============================================================================

def calculate_final_score(raw: dict, gw: dict) -> dict:
    raw_score      = raw["raw_esg_score"]
    penalty        = gw["penalty_score"]
    deduction      = round(penalty * 0.3, 2)
    adjusted_score = max(round(raw_score - deduction, 2), 0)

    base_wacc      = 0.10
    # ±3% range — meaningful difference between strong and weak ESG companies
    esg_adjustment = ((50 - adjusted_score) / 50) * 0.03
    adjusted_wacc  = round(base_wacc + esg_adjustment, 6)

    if adjusted_score >= 75:
        rating = "STRONG ESG ✅"
    elif adjusted_score >= 50:
        rating = "MODERATE ESG ⚠️"
    else:
        rating = "WEAK ESG ❌"

    return {
        "raw_score"     : raw_score,
        "penalty_score" : penalty,
        "deduction"     : deduction,
        "final_score"   : adjusted_score,
        "rating"        : rating,
        "base_wacc"     : base_wacc,
        "esg_adjustment": round(esg_adjustment, 6),
        "adjusted_wacc" : adjusted_wacc,
    }

def show_final_score(result: dict):
    print(f"\n{'='*62}")
    print(f"  STEP 6 — FINAL ESG SCORE & DCF ADJUSTMENT")
    print(f"{'='*62}")
    print(f"\n  Raw ESG Score        : {result['raw_score']} / 100")
    print(f"  Greenwash Deduction  : -{result['deduction']} pts  "
          f"(penalty {result['penalty_score']} x 0.3)")
    print(f"  {'-'*55}")
    print(f"  FINAL ESG SCORE      : {result['final_score']} / 100")
    print(f"  RATING               : {result['rating']}")
    print(f"  {'-'*55}")
    print(f"  Base WACC            : {result['base_wacc']*100:.2f}%")
    print(f"  ESG Adjustment       : {result['esg_adjustment']*100:+.4f}%")
    print(f"  ADJUSTED WACC        : {result['adjusted_wacc']*100:.4f}%")
    print(f"\n  -> Use {result['adjusted_wacc']*100:.4f}% as your discount rate in DCF.")
    print(f"{'='*62}\n")


# =============================================================================
# PDF READER
# =============================================================================

def read_pdf(pdf_path: str) -> str:
    try:
        import pdfplumber
    except ImportError:
        print("\n  ERROR: pdfplumber not installed. Run: pip install pdfplumber\n")
        sys.exit(1)
    text = ""
    print(f"\n  Reading PDF: {pdf_path}")
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        print(f"  Pages: {len(pdf.pages)} | Characters: {len(text)}")
    return text


# =============================================================================
# SAMPLE REPORT
# Contains deliberate greenwashing signals so detection is visible:
#   - "carbon neutral" repeated many times
#   - Many vague future sentences: aim, plan, aspire, by 2045, etc.
# =============================================================================

SAMPLE_REPORT = """
Tata Steel Limited is committed to sustainable development and responsible business practices.
The company reduced its carbon emissions by 18% compared to the previous financial year.
Total GHG emissions stood at 28.4 million tCO2 during FY 2024-25.
Our renewable energy share rose to 52% of total electricity consumption at our Jamshedpur plant.
Water consumption was reduced by 22% through advanced recycling mechanisms.
The company generated 1.2 million tonnes of hazardous waste during the year, a 15% increase.
Employee training hours increased to 52 hours per employee across all divisions.
Women constitute 18% of our total workforce, and we are actively working to improve this.
No fatalities were recorded at our steel manufacturing units during the fiscal year.
The Board met five times during the financial year ended March 2025.
The company is registered under the Companies Act 2013 and listed on BSE and NSE.
We faced a penalty from the State Pollution Control Board for exceeding emission norms at one unit.
Scope 1 and Scope 2 emissions have been disclosed in line with the GHG Protocol.
Total revenue from operations for FY 2024-25 was INR 2,29,544 crore.
The company has adopted the BRSR framework for its ESG disclosures as mandated by SEBI.
40% of board members are independent directors ensuring strong corporate governance.
Community development programs benefited over 8 lakh people in Jharkhand and Odisha.
Supply chain audits revealed labour practice concerns at two sub-contractors.
Capital expenditure for the year amounted to INR 9,200 crore.
A tree plantation drive resulted in 5 lakh trees planted across operational areas.
We aim to become carbon neutral by 2045 and plan to reduce emissions further.
The company intends to achieve net zero carbon emissions across all operations by 2050.
We aspire to be a carbon negative enterprise in the coming years.
The company will work towards becoming carbon neutral in the near future.
We are committed to achieving carbon neutrality and plan to set science-based targets very soon.
The company hopes to reduce its carbon footprint significantly by the end of 2040.
We expect to transition fully to renewable energy going forward.
The company is working towards carbon neutral operations by 2035.
"""



# =============================================================================
# PUBLIC API — called by fusion_layer.py
# =============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_esg_score(pdf_path: str) -> dict:
    """
    Run the full ESG NLP pipeline on a BRSR PDF.
    Returns the final score dict including adjusted_wacc for DCF.
    """
    train_csv      = os.path.join(BASE_DIR, "train_data.csv")
    test_csv       = os.path.join(BASE_DIR, "test_data.csv")
    gw_train_csv   = os.path.join(BASE_DIR, "greenwash_train.csv")
    gw_test_csv    = os.path.join(BASE_DIR, "greenwash_test.csv")

    report_text = read_pdf(pdf_path)

    esg_model = train_esg_model(train_csv, test_csv)
    results   = classify_report(report_text, esg_model)
    raw       = calculate_raw_esg_score(results)

    gw_model  = train_greenwash_model(gw_train_csv, gw_test_csv)
    sentences = split_into_sentences(report_text)
    gw        = run_greenwash_detection(sentences, gw_model)

    final = calculate_final_score(raw, gw)
    return final


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":

    print("\n" + "#"*62)
    print("#   ESG NLP PIPELINE — ML GREENWASHING DETECTION")
    print("#   JIIT Minor Project 2 | Even Sem 2026")
    print("#"*62)

    # Decide report source
    if len(sys.argv) > 1:
        report_text = read_pdf(sys.argv[1])
        company     = sys.argv[1].replace(".pdf","").replace("_"," ").title()
    else:
        report_text = SAMPLE_REPORT
        company     = "Tata Steel Limited (Sample)"
        print(f"\n  No PDF provided — running on built-in sample report.")
        print(f"  To use your PDF:  python esg_nlp.py your_file.pdf")

    # STEP 1
    print(f"\n>>> STEP 1: RULE-BASED METRIC EXTRACTION")
    show_extracted_metrics(extract_esg_metrics(report_text), company)

    # STEP 2 — ESG classification model
    print(f"\n>>> STEP 2: TRAINING ESG CLASSIFICATION MODEL")
    esg_model = train_esg_model("train_data.csv", "test_data.csv")

    # STEP 3 — classify report sentences
    print(f"\n>>> STEP 3: CLASSIFYING REPORT SENTENCES")
    results = classify_report(report_text, esg_model)
    show_classification_results(results)

    # STEP 4 — raw ESG score
    print(f"\n>>> STEP 4: CALCULATING RAW ESG SCORE")
    raw = calculate_raw_esg_score(results)
    print(f"\n  Raw ESG Score (before greenwashing check) : {raw['raw_esg_score']} / 100")

    # STEP 5 — greenwashing ML model
    print(f"\n>>> STEP 5: TRAINING GREENWASHING DETECTION MODEL")
    gw_model = train_greenwash_model("greenwash_train.csv", "greenwash_test.csv")

    print(f"\n>>> STEP 5 (cont): RUNNING GREENWASHING DETECTION ON REPORT")
    sentences = split_into_sentences(report_text)
    gw        = run_greenwash_detection(sentences, gw_model)
    show_greenwash_results(gw)

    # STEP 6 — final score
    print(f"\n>>> STEP 6: FINAL ADJUSTED ESG SCORE")
    final = calculate_final_score(raw, gw)
    show_final_score(final)

    print("  Pipeline complete.\n")