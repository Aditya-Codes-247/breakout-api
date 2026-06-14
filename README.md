# Breakout Scanner API

Vercel-deployable API middleware that scans Indian equities for breakout candidates using fundamental analysis.

## Deploy

```bash
npm install
vercel --prod
```

No build step needed — Vercel handles TypeScript natively for serverless functions.

## API Endpoints

### `GET /api/health`

Health check.

**Response:**
```json
{
  "status": "ok",
  "ts": "2025-01-15T10:30:00.000Z"
}
```

### `GET /api/scan?[sme=true]`

Runs the full 6-stage breakout scanner pipeline against NSE stocks.

**Query params:**
- `sme` (optional) — set to `true` to include SME stocks (market cap >= ₹100 Cr). Default excludes SME (>= ₹500 Cr).

**Response:**
```json
{
  "candidates": [
    {
      "symbol": "RELIANCE",
      "name": "Reliance Industries Ltd",
      "currentPrice": 2850.0,
      "marketCap": 1925000000000,
      "pe": 28.5,
      "roe": 12.3,
      "roce": 15.1,
      "brs": 85,
      "signals": {
        "earningsInflection": true,
        "opmExpanding": true,
        "debtDeclining": false,
        "positiveCashFlow": true,
        "roceInflecting": true,
        "promoterStable": true,
        "institutionalEntry": true,
        "priceMismatch": true
      },
      "metrics": {
        "patGrowthLatestQ": 45.2,
        "patGrowthPrevQ": 22.1,
        "opmLatest": 18.5,
        "opmPrev": 16.8,
        "debtToEquity": 0.45,
        "debtToEquityPrevYear": 0.52,
        "operatingCashFlow": 85000,
        "roce3yr": [12.1, 13.8, 15.1],
        "promoterHoldingChange": 0.5,
        "mfCountChange": 1,
        "fiiChange": 0.3,
        "earningsGrowth3yr": 22.5,
        "priceReturn1yr": 12.0,
        "mismatchScore": 10.5
      },
      "screenerUrl": "https://www.screener.in/company/RELIANCE/",
      "tvSymbol": "NSE:RELIANCE",
      "fetchedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "totalScanned": 80,
  "totalPassed": 12,
  "scanDurationMs": 56000,
  "fetchedAt": "2025-01-15T10:30:00.000Z",
  "stages": {
    "afterStage1": 80,
    "afterStage2": 45,
    "afterStage3": 38,
    "afterStage4": 28,
    "afterStage5": 24,
    "afterStage6": 12
  }
}
```

### `GET /api/stock/:symbol`

Fetches detailed financial data for a specific stock from Screener.in.

**Example:** `GET /api/stock/RELIANCE`

**Response:**
```json
{
  "meta": { "lastUpdated": "2025-01-14" },
  "name": "Reliance Industries Ltd",
  "symbol": "RELIANCE",
  "topRatios": [ ... ],
  "analysis": { ... },
  "peers": [ ... ],
  "financials": {
    "quarterLabels": ["Dec 2024", "Sep 2024", ...],
    "revenueByQ": [235000, 220000, ...],
    "patByQ": [18500, 17200, ...],
    "opmByQ": [18.5, 17.2, ...],
    "yearLabels": ["2024", "2023", ...],
    "revenueByYear": [900000, 850000, ...],
    "patByYear": [72000, 65000, ...],
    "debtToEquityByYear": [0.45, 0.52, ...],
    "operatingCFByYear": [85000, 78000, ...],
    "roceByYear": [15.1, 13.8, ...],
    "roeByYear": [12.3, 11.5, ...],
    "promoterByQ": [50.5, 50.3, ...],
    "fiiByQ": [22.1, 21.8, ...],
    "diiByQ": [15.3, 14.9, ...],
    "mfCountByQ": [120, 115, ...]
  },
  "screenerUrl": "https://www.screener.in/company/RELIANCE/"
}
```

## Pipeline Stages

| Stage | Filter | Description |
|-------|--------|-------------|
| 1 | Universe | TV screener: Mcap > ₹500 Cr, PE 1–40, ROE > 10%, Volume > 10k |
| 2 | Earnings Inflection | PAT growth > 25% (latest Q), > 15% (prev Q), accelerating |
| 3 | Balance Sheet | Debt declining YoY OR positive operating cash flow |
| 4 | ROCE Inflection | ROCE > 8% and improving vs 2 years ago |
| 5 | Promoter Stability | Promoter holding not declining > 1% YoY |
| 6 | Price-Earnings Mismatch | Earnings CAGR minus 1Y price return > 5 |

## Caching

- `/api/scan`: CDN cached for 30 min, stale-while-revalidate 10 min
- `/api/stock/:symbol`: CDN cached for 15 min, stale-while-revalidate 5 min

## Rate Limiting

Screener.in fetches are throttled at 400ms minimum interval and batched 10 at a time with 2s between batches to stay within Vercel's 120s timeout.
