import os
import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional

# Vercel only has /tmp writable — yfinance needs this for its cache
try:
    yf.set_tz_cache_location("/tmp/.yf_cache")
except Exception:
    pass

def safe_float(val) -> float:
    try:
        f = float(val)
        return 0.0 if (np.isnan(f) or np.isinf(f)) else f
    except:
        return 0.0

def fetch_stock_financials(symbol: str) -> dict:
    ticker = yf.Ticker(f"{symbol}.NS")

    result = {
        "symbol": symbol,
        "quarter_labels": [],
        "pat_by_q": [],
        "revenue_by_q": [],
        "opm_by_q": [],
        "year_labels": [],
        "pat_by_year": [],
        "revenue_by_year": [],
        "debt_to_equity_by_year": [],
        "operating_cf_by_year": [],
        "roce_by_year": [],
        "roe_by_year": [],
        "promoter_by_q": [],
        "fii_by_q": [],
        "market_cap": 0.0,
        "pe": 0.0,
        "current_price": 0.0,
        "price_return_1yr": 0.0,
    }

    try:
        info = ticker.info
        result["market_cap"] = safe_float(info.get("marketCap", 0))
        result["pe"] = safe_float(info.get("trailingPE", 0))
        result["current_price"] = safe_float(info.get("currentPrice") or info.get("regularMarketPrice", 0))
        result["roe"] = safe_float(info.get("returnOnEquity", 0)) * 100
        result["name"] = info.get("longName") or info.get("shortName") or symbol

        qf = ticker.quarterly_financials
        if qf is not None and not qf.empty:
            result["quarter_labels"] = [str(c.date()) for c in qf.columns]

            for row_name in ["Net Income", "Net Income Common Stockholders"]:
                if row_name in qf.index:
                    result["pat_by_q"] = [safe_float(v) / 1e7 for v in qf.loc[row_name]]
                    break

            for row_name in ["Total Revenue", "Revenue"]:
                if row_name in qf.index:
                    result["revenue_by_q"] = [safe_float(v) / 1e7 for v in qf.loc[row_name]]
                    break

            op_income_row = next((r for r in ["Operating Income", "EBIT"] if r in qf.index), None)
            rev_row = next((r for r in ["Total Revenue", "Revenue"] if r in qf.index), None)
            if op_income_row and rev_row:
                result["opm_by_q"] = [
                    safe_float(qf.loc[op_income_row, c] / qf.loc[rev_row, c] * 100)
                    if safe_float(qf.loc[rev_row, c]) != 0 else 0.0
                    for c in qf.columns
                ]

        af = ticker.financials
        if af is not None and not af.empty:
            result["year_labels"] = [str(c.date()) for c in af.columns]

            for row_name in ["Net Income", "Net Income Common Stockholders"]:
                if row_name in af.index:
                    result["pat_by_year"] = [safe_float(v) / 1e7 for v in af.loc[row_name]]
                    break

            for row_name in ["Total Revenue", "Revenue"]:
                if row_name in af.index:
                    result["revenue_by_year"] = [safe_float(v) / 1e7 for v in af.loc[row_name]]
                    break

        bs = ticker.balance_sheet
        if bs is not None and not bs.empty:
            debt_row = next((r for r in ["Total Debt", "Long Term Debt", "Total Liabilities Net Minority Interest"] if r in bs.index), None)
            eq_row = next((r for r in ["Stockholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"] if r in bs.index), None)

            if debt_row and eq_row:
                result["debt_to_equity_by_year"] = [
                    safe_float(bs.loc[debt_row, c] / bs.loc[eq_row, c])
                    if safe_float(bs.loc[eq_row, c]) != 0 else 0.0
                    for c in bs.columns
                ]

        cf = ticker.cashflow
        if cf is not None and not cf.empty:
            for row_name in ["Operating Cash Flow", "Cash From Operations", "Cash Flows From Used In Operating Activities Direct"]:
                if row_name in cf.index:
                    result["operating_cf_by_year"] = [safe_float(v) / 1e7 for v in cf.loc[row_name]]
                    break

        if af is not None and not af.empty and bs is not None and not bs.empty:
            ebit_row = next((r for r in ["EBIT", "Operating Income"] if r in af.index), None)
            assets_row = next((r for r in ["Total Assets"] if r in bs.index), None)
            cl_row = next((r for r in ["Current Liabilities", "Total Current Liabilities Net Minority Interest"] if r in bs.index), None)

            if ebit_row and assets_row:
                roce_list = []
                for c in af.columns:
                    try:
                        ebit = safe_float(af.loc[ebit_row, c])
                        assets = safe_float(bs.loc[assets_row, c]) if c in bs.columns else 0
                        cl = safe_float(bs.loc[cl_row, c]) if (cl_row and c in bs.columns) else 0
                        capital_employed = assets - cl
                        roce = (ebit / capital_employed * 100) if capital_employed != 0 else 0.0
                        roce_list.append(safe_float(roce))
                    except:
                        roce_list.append(0.0)
                result["roce_by_year"] = roce_list

        hist = ticker.history(period="1y")
        if hist is not None and not hist.empty and len(hist) > 2:
            price_start = safe_float(hist["Close"].iloc[0])
            price_end = safe_float(hist["Close"].iloc[-1])
            if price_start > 0:
                result["price_return_1yr"] = ((price_end - price_start) / price_start) * 100

    except Exception as e:
        print(f"[financials] {symbol} failed: {e}")

    return result
