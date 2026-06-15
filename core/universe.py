import asyncio
import pandas as pd
import yfinance as yf
import httpx
import io
import concurrent.futures

async def fetch_nse_universe(include_sme: bool = False) -> list[dict]:
    loop = asyncio.get_event_loop()

    def fetch_symbols() -> list[str]:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.nseindia.com/",
            }
            r = httpx.get(
                "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv",
                headers=headers, timeout=30, follow_redirects=True
            )
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            if "Symbol" not in df.columns:
                raise ValueError(f"No Symbol column, got: {df.columns.tolist()}")
            if "Series" in df.columns:
                syms = df[df["Series"] == "EQ"]["Symbol"].dropna().tolist()
            else:
                syms = df["Symbol"].dropna().tolist()
            return syms[:80]
        except Exception as e:
            print(f"[universe] CSV failed ({e}), falling back to nsepython")
            from nsepython import nse_eq_symbols
            syms = nse_eq_symbols()
            return syms[:80]

    symbols = await loop.run_in_executor(None, fetch_symbols)
    if not symbols:
        raise ValueError("Could not fetch any symbols from NSE")

    def fetch_single(sym: str) -> dict | None:
        try:
            ticker = yf.Ticker(f"{sym}.NS")
            hist = ticker.history(period="5d")
            if hist is None or hist.empty:
                return None
            close = float(hist["Close"].dropna().iloc[-1])
            volume = float(hist["Volume"].dropna().iloc[-1])
            if volume < 50_000:
                return None
            return {
                "symbol": sym,
                "name": sym,
                "last_price": close,
                "volume": volume,
                "market_cap": 0.0,
                "pe": 0.0,
                "roe": 0.0,
            }
        except Exception as e:
            print(f"[universe] {sym} failed: {e}")
            return None

    universe = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_single, sym): sym for sym in symbols}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result is not None:
                universe.append(result)

    if not universe:
        raise ValueError("Universe empty after liquidity filter")

    universe.sort(key=lambda x: x["volume"], reverse=True)
    return universe
