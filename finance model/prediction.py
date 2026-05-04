# =========================================================
# DCF DRIVER ML PREDICTION ENGINE
# Restructured to be importable by fusion_layer.py
# =========================================================

import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# =========================================================
# INTERNAL HELPERS
# =========================================================

def _find_col(df, names):
    for name in names:
        for col in df.columns:
            if name.lower() in col.lower():
                return col
    return None

def _load_and_prepare(csv_path=None):
    if csv_path is None:
        csv_path = os.path.join(BASE_DIR, "financials_cleaned.csv")

    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    if "Company" not in df.columns:
        if "Ticker" in df.columns:   df["Company"] = df["Ticker"]
        elif "Symbol" in df.columns: df["Company"] = df["Symbol"]
        else:                        df["Company"] = "Default"

    if "Year" not in df.columns and "Date" in df.columns:
        df["Year"] = pd.to_datetime(df["Date"], errors="coerce").dt.year

    df = df.dropna(subset=["Year"])
    df["Year"] = df["Year"].astype(int)
    df = df.sort_values(["Company", "Year"])

    revenue_col = _find_col(df, ["revenue"])
    if revenue_col is None:
        raise ValueError("Revenue column not found in CSV!")

    ebitda_col = _find_col(df, ["ebitda", "operating income"])
    capex_col  = _find_col(df, ["capex", "capital expenditure"])
    dep_col    = _find_col(df, ["depreciation"])
    ca_col     = _find_col(df, ["current assets"])
    cl_col     = _find_col(df, ["current liabilities"])

    df["revenue_growth"] = df.groupby("Company")[revenue_col].pct_change()

    if ebitda_col:
        df["ebitda_margin"] = df[ebitda_col] / df[revenue_col]
    else:
        ni_col = _find_col(df, ["net income", "profit"])
        df["ebitda_margin"] = df[ni_col] / df[revenue_col] if ni_col else 0.15

    df["capex_pct"] = df[capex_col] / df[revenue_col] if capex_col else df["revenue_growth"].abs() * 0.5
    df["wc_pct"]    = (df[ca_col] - df[cl_col]) / df[revenue_col] if (ca_col and cl_col) else df["revenue_growth"] * 0.2
    df["depreciation_pct"] = df[dep_col] / df[revenue_col] if dep_col else 0.03

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df = df.dropna()

    df["target_growth"] = df.groupby("Company")["revenue_growth"].shift(-1)
    df["target_margin"] = df.groupby("Company")["ebitda_margin"].shift(-1)
    df["target_capex"]  = df.groupby("Company")["capex_pct"].shift(-1)
    df["target_wc"]     = df.groupby("Company")["wc_pct"].shift(-1)
    df["target_dep"]    = df.groupby("Company")["depreciation_pct"].shift(-1)
    df = df.dropna()

    return df, revenue_col

def _train(df):
    features = ["revenue_growth", "ebitda_margin", "capex_pct", "wc_pct", "depreciation_pct"]
    if "ESG_score" in df.columns:
        features.append("ESG_score")

    X = df[features]
    X_train, _ = train_test_split(X, test_size=0.2, random_state=42)

    targets = {"growth": df["target_growth"], "margin": df["target_margin"],
               "capex": df["target_capex"], "wc": df["target_wc"], "depreciation": df["target_dep"]}

    models = {}
    for name, y in targets.items():
        m = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=42)
        m.fit(X_train, y.loc[X_train.index])
        models[name] = m

    return models, features

def _forecast(latest_row, models, features, forecast_years):
    results = []
    current = latest_row.copy()
    for i in range(forecast_years):
        pred = {
            "year":             i + 1,
            "revenue_growth":   float(models["growth"].predict(current)[0]),
            "ebitda_margin":    float(models["margin"].predict(current)[0]),
            "capex_pct":        float(models["capex"].predict(current)[0]),
            "wc_pct":           float(models["wc"].predict(current)[0]),
            "depreciation_pct": float(models["depreciation"].predict(current)[0]),
        }
        pred["ebitda_margin"]    = max(min(pred["ebitda_margin"], 0.6), 0.01)
        pred["capex_pct"]        = max(min(pred["capex_pct"], 0.20), 0.01)
        pred["wc_pct"]           = max(min(pred["wc_pct"], 0.30), 0.01)
        pred["depreciation_pct"] = max(min(pred["depreciation_pct"], 0.10), 0.01)
        results.append(pred)
        for k in ["revenue_growth", "ebitda_margin", "capex_pct", "wc_pct", "depreciation_pct"]:
            current[k] = pred[k]
    return pd.DataFrame(results)

# =========================================================
# PUBLIC API — called by fusion_layer.py
# =========================================================

def get_financial_predictions(ticker, forecast_years=5, csv_path=None):
    """
    Returns a dict with base_revenue and year-1 ML predictions.
    Returns None if ticker not found.
    """
    df, revenue_col = _load_and_prepare(csv_path)

    company_df = df[df["Company"] == ticker]
    if company_df.empty:
        return None

    models, features = _train(df)

    latest_row = company_df.sort_values("Year").iloc[-1]
    base_revenue = float(latest_row[revenue_col])
    latest_features = latest_row[features].to_frame().T

    forecast_df = _forecast(latest_features, models, features, forecast_years)
    year1 = forecast_df.iloc[0].to_dict()

    return {
        "base_revenue":     base_revenue,
        "revenue_growth":   year1["revenue_growth"],
        "ebitda_margin":    year1["ebitda_margin"],
        "capex_pct":        year1["capex_pct"],
        "wc_pct":           year1["wc_pct"],
        "depreciation_pct": year1["depreciation_pct"],
        "full_forecast":    forecast_df.to_dict(orient="records"),
    }

# =========================================================
# INTERACTIVE USAGE (unchanged behaviour)
# =========================================================

if __name__ == "__main__":
    df, revenue_col = _load_and_prepare()
    print("\nColumns:", df.columns.tolist())
    print("\nAvailable companies:\n", df["Company"].unique())

    company_input = input("\nEnter company name exactly as shown: ").strip()
    years_input   = input("Enter forecast period (years): ").strip()
    try:
        forecast_years = int(years_input)
    except:
        forecast_years = 5

    result = get_financial_predictions(company_input, forecast_years)
    if result is None:
        print("\n❌ Company not found!")
    else:
        print(f"\n📊 Year-1 DCF Driver Forecast for: {company_input}\n")
        for k, v in result.items():
            if k != "full_forecast":
                print(f"  {k}: {v}")
        print("\nFull forecast:")
        print(pd.DataFrame(result["full_forecast"]))