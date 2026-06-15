import asyncio
import concurrent.futures
import yfinance as yf

NIFTY100_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK",
    "INFY", "SBIN", "HINDUNILVR", "ITC", "LICI",
    "KOTAKBANK", "LT", "HCLTECH", "MARUTI", "BAJFINANCE",
    "AXISBANK", "ONGC", "TITAN", "ASIANPAINT", "ADANIPORTS",
    "ULTRACEMCO", "WIPRO", "POWERGRID", "NTPC", "TATAMOTORS",
    "HDFCLIFE", "BAJAJFINSV", "JSWSTEEL", "COALINDIA", "M&M",
    "ADANIENT", "SIEMENS", "TECHM", "INDUSINDBK", "DRREDDY",
    "HINDALCO", "SUNPHARMA", "TATACONSUM", "BRITANNIA", "NESTLEIND",
    "CIPLA", "BPCL", "DIVISLAB", "GRASIM", "EICHERMOT",
    "BEL", "BAJAJ-AUTO", "APOLLOHOSP", "TATAPOWER", "HAVELLS",
    "PIDILITIND", "DABUR", "SBICARD", "VEDL", "AMBUJACEM",
    "TATASTEEL", "ABB", "GODREJCP", "BERGEPAINT", "CHOLAFIN",
    "ICICIPRULI", "MUTHOOTFIN", "BOSCHLTD", "PGHH", "MARICO",
    "DLF", "BANKBARODA", "ICICIGI", "SHREECEM", "HEROMOTOCO",
    "TRENT", "NYKAA", "ZOMATO", "PAYTM", "ADANIGREEN",
    "ADANITRANS", "ADANIENSOL", "ATGL", "AWL", "CANBK",
    "CONCOR", "CUMMINSIND", "DMART", "FLUOROCHEM", "GAIL",
    "GMRAIRPORT", "GODREJPROP", "HAL", "INDIGO", "IRFC",
    "JIOFIN", "LODHA", "MOTHERSON", "NHPC", "OBEROIRLTY",
    "OFSS", "PFC", "RECLTD", "SAIL", "SOLARINDS",
    "TORNTPHARM", "TVSMOTOR", "VBL", "ZYDUSLIFE", "RVNL",
]

async def fetch_nse_universe(include_sme: bool = False) -> list[dict]:
    loop = asyncio.get_event_loop()
    symbols = NIFTY100_SYMBOLS

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
        raise ValueError("Universe empty — yfinance unreachable from this server")

    universe.sort(key=lambda x: x["volume"], reverse=True)
    return universe
