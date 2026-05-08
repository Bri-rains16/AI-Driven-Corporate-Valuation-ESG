import yfinance as yf
import pandas as pd
import numpy as np
import time

tickers = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "ITC.NS", "LT.NS", 
    "WIPRO.NS", "BHARTIARTL.NS", "TATASTEEL.NS", "SUNPHARMA.NS", "HINDUNILVR.NS",
    "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS", 
    "ASIANPAINT.NS", "BAJFINANCE.NS", "MARUTI.NS", "HCLTECH.NS", "TITAN.NS", 
    "ULTRACEMCO.NS", "BAJAJFINSV.NS", "ONGC.NS", "NTPC.NS", "POWERGRID.NS", 
    "M&M.NS", "ADANIENT.NS", "ADANIPORTS.NS", "COALINDIA.NS", "TATAMOTORS.NS", 
    "JSWSTEEL.NS", "GRASIM.NS", "TECHM.NS", "INDUSINDBK.NS", "HINDALCO.NS", 
    "DRREDDY.NS", "CIPLA.NS", "APOLLOHOSP.NS", "EICHERMOT.NS", "DIVISLAB.NS", 
    "BRITANNIA.NS", "TATACONSUM.NS", "BAJAJ-AUTO.NS", "LTIM.NS", "HEROMOTOCO.NS", 
    "ZOMATO.NS", "TRENT.NS", "BEL.NS", "HAL.NS", "DMART.NS"
]

def fetch_and_calculate_financials(ticker_list):
    all_data = []
    
    print(f"Starting extraction for {len(ticker_list)} companies...\n")
    
    for ticker in ticker_list:
        print(f"Processing {ticker}...")
        
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # Let yfinance handle the session natively
                stock = yf.Ticker(ticker)
                
                inc_stmt = stock.financials.T
                bal_sheet = stock.balance_sheet.T
                cash_flow = stock.cashflow.T
                
                if inc_stmt.empty or bal_sheet.empty or cash_flow.empty:
                    if attempt < max_retries - 1:
                        print(f"   Blocked by Yahoo. Sleeping for 5 seconds and retrying (Attempt {attempt + 2}/{max_retries})...")
                        time.sleep(5)
                        continue 
                    else:
                        print(f"   Missing core financial statements after 3 attempts. Skipping.")
                        break 
                
                df = pd.concat([inc_stmt, bal_sheet, cash_flow], axis=1)
                
                def get_financial_column(dataframe, possible_names):
                    for name in possible_names:
                        if name in dataframe.columns:
                            return dataframe[name]
                    return pd.Series(np.nan, index=dataframe.index)
                
                revenue = get_financial_column(df, ['Total Revenue', 'Operating Revenue', 'Revenue'])
                ebitda = get_financial_column(df, ['EBITDA', 'Normalized EBITDA'])
                capex = get_financial_column(df, ['Capital Expenditure', 'Net PPE Purchase And Sale', 'Purchase Of PPE'])
                current_assets = get_financial_column(df, ['Total Current Assets', 'Current Assets'])
                current_liabilities = get_financial_column(df, ['Total Current Liabilities', 'Current Liabilities'])
                
                ticker_df = pd.DataFrame({
                    'Ticker': ticker,
                    'Date': df.index,
                    'Revenue': revenue,
                    'EBITDA': ebitda,
                    'CapEx': capex,
                    'Current Assets': current_assets,
                    'Current Liabilities': current_liabilities
                })
                
                ticker_df = ticker_df.dropna(subset=['Revenue'])
                ticker_df = ticker_df.sort_values('Date', ascending=True)
                
                ticker_df['Revenue Growth'] = ticker_df['Revenue'].pct_change()
                ticker_df['EBITDA Margin'] = ticker_df['EBITDA'] / ticker_df['Revenue']
                ticker_df['CapEx %'] = ticker_df['CapEx'].abs() / ticker_df['Revenue']
                ticker_df['Working Capital %'] = (ticker_df['Current Assets'] - ticker_df['Current Liabilities']) / ticker_df['Revenue']
                
                ticker_df['Year'] = pd.to_datetime(ticker_df['Date']).dt.year
                final_columns = ['Ticker', 'Year', 'Revenue', 'Revenue Growth', 'EBITDA Margin', 'CapEx %', 'Working Capital %']
                ticker_df = ticker_df[final_columns]
                
                all_data.append(ticker_df)
                print(f"  Success")
                break 
                
            except Exception as e:
                print(f"  Error: {e}")
                break
        
        # delay between success
        time.sleep(2.5) 
        
    if all_data:
        master_df = pd.concat(all_data, ignore_index=True)
        return master_df
    else:
        return pd.DataFrame()

final_dataset = fetch_and_calculate_financials(tickers)

if not final_dataset.empty:
    final_dataset.to_csv("yfinance_engineered_financials.csv", index=False)
    print("\n Extraction complete! Data saved to 'yfinance_engineered_financials.csv'")
else:
    print("\n No data was extracted.")