import yfinance as yf
import pandas as pd
import httpx
import io

# Test 1: CSV download
print("=== Testing Nifty 500 CSV ===")
try:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.nseindia.com/",
    }
    r = httpx.get(
        "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv",
        headers=headers, timeout=30, follow_redirects=True
    )
    print("CSV status:", r.status_code)
    df = pd.read_csv(io.StringIO(r.text))
    print("CSV columns:", df.columns.tolist())
    print("CSV rows:", len(df))
    print("First 5 symbols:", df["Symbol"].head().tolist() if "Symbol" in df.columns else "NO SYMBOL COL")
    symbols = df[df["Series"] == "EQ"]["Symbol"].dropna().tolist()[:10]
    print("First 10 EQ symbols:", symbols)
except Exception as e:
    print("CSV failed:", e)
    symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
    print("Using fallback symbols:", symbols)

# Test 2: Single ticker download
print("\n=== Testing single ticker ===")
try:
    t = yf.Ticker("TCS.NS")
    hist = t.history(period="5d")
    print("Single ticker hist shape:", hist.shape)
    print("Single ticker columns:", hist.columns.tolist())
    print("Last close:", hist["Close"].iloc[-1])
    print("Last volume:", hist["Volume"].iloc[-1])
except Exception as e:
    print("Single ticker failed:", e)

# Test 3: Batch download — expose exact column structure
print("\n=== Testing batch download ===")
try:
    yf_syms = [f"{s}.NS" for s in symbols]
    data = yf.download(
        tickers=yf_syms,
        period="5d",
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=True,
    )
    print("Batch data type:", type(data))
    print("Batch data shape:", data.shape)
    print("Batch columns type:", type(data.columns))
    print("Batch columns:", data.columns.tolist()[:10])
    print("Is MultiIndex:", isinstance(data.columns, pd.MultiIndex))
    if isinstance(data.columns, pd.MultiIndex):
        print("MultiIndex levels:", data.columns.levels)
        print("Level 0 (fields):", data.columns.get_level_values(0).unique().tolist())
        print("Level 1 (tickers):", data.columns.get_level_values(1).unique().tolist())
        first_ticker = yf_syms[0]
        print(f"Close for {first_ticker}:", data["Close"][first_ticker].dropna().iloc[-1] if first_ticker in data["Close"].columns else "NOT FOUND")
        print("Alt access:", data.loc[:, ("Close", first_ticker)].dropna().iloc[-1])
    else:
        print("Flat columns — Close iloc[-1]:", data["Close"].iloc[-1])
except Exception as e:
    print("Batch download failed:", e)
    import traceback
    traceback.print_exc()

# Test 4: yfinance version
print("\n=== yfinance version ===")
print(yf.__version__)
