import time
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from core.universe import fetch_nse_universe
from core.pipeline import run_pipeline

app = FastAPI(title="Breakout Scanner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/scan")
async def scan(sme: bool = Query(False), response: Response = None):
    response.headers["Cache-Control"] = "s-maxage=1800, stale-while-revalidate=600"
    start = time.time()
    try:
        universe = await fetch_nse_universe(include_sme=sme)
        if not universe:
            raise HTTPException(status_code=502, detail="Failed to fetch NSE universe — no data returned")

        result = run_pipeline(universe)

        return {
            "candidates": result["candidates"],
            "total_scanned": len(universe),
            "total_passed": len(result["candidates"]),
            "scan_duration_ms": int((time.time() - start) * 1000),
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stages": result["stages"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock/{symbol}")
def stock_detail(symbol: str):
    from core.financials import fetch_stock_financials
    sym = symbol.upper()
    data = fetch_stock_financials(sym)
    if not data or not data.get("current_price"):
        raise HTTPException(status_code=404, detail=f"No data found for {sym}")
    data["screener_url"] = f"https://www.screener.in/company/{sym}/"
    data["tv_url"] = f"https://www.tradingview.com/chart/?symbol=NSE:{sym}"
    return data

handler = Mangum(app)
