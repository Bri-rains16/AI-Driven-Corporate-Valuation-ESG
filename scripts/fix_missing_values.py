import pandas as pd
import numpy as np

df = pd.read_csv('data/yfinance_engineered_financials.csv')
df = df.sort_values(['Ticker', 'Year']).reset_index(drop=True)

# Columns to fix
target_cols = ['Revenue Growth', 'EBITDA Margin', 'Working Capital %']

for col in target_cols:
    # Step 1: Fill with each ticker's own mean across its 4 years
    df[col] = df.groupby('Ticker')[col].transform(lambda x: x.fillna(x.mean()))
    
    # Step 2: If ALL 4 years were missing (ticker mean = NaN), fill with dataset-wide mean of other companies
    df[col] = df[col].fillna(df[col].mean())

print("Null check after fix:")
print(df.isnull().sum())
print()
print("Any remaining nulls?", df.isnull().any().any())
print("Shape:", df.shape)

df.to_csv('yfinance_financials_cleaned.csv', index=False)
print("\nSaved to yfinance_financials_cleaned.csv")
