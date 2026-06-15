import asyncio
import httpx
import io

async def fetch_nse_universe(include_sme: bool = False) -> list[dict]:
    loop = asyncio.get_event_loop()

    def fetch_symbols() -> list[dict]:
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
            import pandas as pd
            df = pd.read_csv(io.StringIO(r.text))
            if "Symbol" not in df.columns:
                raise ValueError(f"No Symbol column, got: {df.columns.tolist()}")
            if "Series" in df.columns:
                df = df[df["Series"] == "EQ"]
            records = []
            for _, row in df.iterrows():
                sym = str(row.get("Symbol", "")).strip()
                if not sym:
                    continue
                name = str(row.get("Company Name", sym)).strip() if "Company Name" in df.columns else sym
                records.append({"symbol": sym, "name": name})
            return records[:15]
        except Exception as e:
            print(f"[universe] CSV failed ({e})")
            raise

    records = await loop.run_in_executor(None, fetch_symbols)
    if not records:
        raise ValueError("Could not fetch any symbols from NSE")

    return records
