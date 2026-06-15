import concurrent.futures
from core.financials import fetch_stock_financials, safe_float
from core.scorer import compute_brs

def run_pipeline(universe: list[dict]) -> dict:
    stages = {
        "after_stage1": len(universe),
        "after_stage2": 0,
        "after_stage3": 0,
        "after_stage4": 0,
        "after_stage5": 0,
        "after_stage6": 0,
    }

    symbols = [s["symbol"] for s in universe]

    financials_map = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_stock_financials, sym): sym for sym in symbols}
        for future in concurrent.futures.as_completed(futures):
            sym = futures[future]
            try:
                financials_map[sym] = future.result()
            except Exception as e:
                print(f"[pipeline] {sym} fetch failed: {e}")

    candidates = []

    for stock in universe:
        sym = stock["symbol"]
        fin = financials_map.get(sym)
        if not fin:
            continue

        signals = {
            "earnings_inflection": False,
            "opm_expanding": False,
            "debt_declining": False,
            "positive_cash_flow": False,
            "roce_inflecting": False,
            "promoter_stable": False,
            "institutional_entry": False,
            "price_mismatch": False,
        }
        metrics = {}

        # ── Stage 2: Earnings Inflection ──────────────────────────
        pat_raw = list(reversed(fin.get("pat_by_q", [])))
        pat = [v for v in pat_raw if v != 0.0]

        revenue_raw = list(reversed(fin.get("revenue_by_q", [])))
        revenue = [v for v in revenue_raw if v != 0.0]

        opm_raw = list(reversed(fin.get("opm_by_q", [])))
        opm = [v for v in opm_raw if v != 0.0]

        if len(pat) >= 6:
            try:
                pat_growth_latest = ((pat[-1] - pat[-5]) / abs(pat[-5])) * 100 if pat[-5] != 0 else 0
                pat_growth_prev = ((pat[-2] - pat[-6]) / abs(pat[-6])) * 100 if pat[-6] != 0 else 0
                metrics["pat_growth_latest_q"] = safe_float(pat_growth_latest)
                metrics["pat_growth_prev_q"] = safe_float(pat_growth_prev)

                if pat_growth_latest > 20:
                    signals["earnings_inflection"] = True
                    if pat_growth_prev > 10 and pat_growth_latest > pat_growth_prev:
                        metrics["earnings_accelerating"] = True
                    else:
                        metrics["earnings_accelerating"] = False
            except Exception as e:
                print(f"[pipeline] {sym} Stage 2 math error: {e}")

        elif len(pat) >= 5:
            try:
                pat_growth_latest = ((pat[-1] - pat[-5]) / abs(pat[-5])) * 100 if pat[-5] != 0 else 0
                metrics["pat_growth_latest_q"] = safe_float(pat_growth_latest)
                metrics["pat_growth_prev_q"] = 0.0
                if pat_growth_latest > 20:
                    signals["earnings_inflection"] = True
            except Exception as e:
                print(f"[pipeline] {sym} Stage 2 fallback error: {e}")

        if not signals["earnings_inflection"]:
            continue

        stages["after_stage2"] += 1

        # OPM expansion bonus
        if len(opm) >= 2:
            metrics["opm_latest"] = safe_float(opm[-1])
            metrics["opm_prev"] = safe_float(opm[-2])
            if opm[-1] - opm[-2] > 1.5:
                signals["opm_expanding"] = True

        # ── Stage 3: Balance Sheet ─────────────────────────────────
        de_raw = list(reversed(fin.get("debt_to_equity_by_year", [])))
        de = [v for v in de_raw if v != 0.0]

        ocf_raw = list(reversed(fin.get("operating_cf_by_year", [])))
        ocf = [v for v in ocf_raw if v != 0.0]

        if len(de) >= 2:
            metrics["debt_to_equity"] = safe_float(de[-1])
            metrics["debt_to_equity_prev"] = safe_float(de[-2])
            if de[-1] < de[-2]:
                signals["debt_declining"] = True

        if len(ocf) >= 1 and ocf[-1] > 0:
            signals["positive_cash_flow"] = True
            metrics["operating_cf"] = safe_float(ocf[-1])

        if not (signals["debt_declining"] or signals["positive_cash_flow"]):
            continue

        stages["after_stage3"] += 1

        # ── Stage 4: ROCE Inflection ───────────────────────────────
        roce_raw = list(reversed(fin.get("roce_by_year", [])))
        roce = [v for v in roce_raw if v != 0.0]

        if len(roce) >= 2:
            metrics["roce_3yr"] = roce[-min(3, len(roce)):]
            if roce[-1] > roce[-2] and roce[-1] > 8:
                signals["roce_inflecting"] = True
            elif roce[-1] > 20:
                signals["roce_inflecting"] = True

        if not signals["roce_inflecting"]:
            continue

        stages["after_stage4"] += 1

        # ── Stage 5: Institutional / Promoter ─────────────────────
        signals["promoter_stable"] = True
        metrics["promoter_holding_change"] = 0.0
        metrics["fii_change"] = 0.0
        stages["after_stage5"] += 1

        # ── Stage 6: Price-Earnings Mismatch ──────────────────────
        pat_year_raw = list(reversed(fin.get("pat_by_year", [])))
        pat_year = [v for v in pat_year_raw if v != 0.0]

        earnings_growth_3yr = 0.0
        if len(pat_year) >= 4 and pat_year[-4] > 0 and pat_year[-1] > 0:
            try:
                earnings_growth_3yr = ((pat_year[-1] / pat_year[-4]) ** (1/3) - 1) * 100
            except:
                pass
        elif len(pat_year) >= 3 and pat_year[-3] > 0 and pat_year[-1] > 0:
            try:
                earnings_growth_3yr = ((pat_year[-1] / pat_year[-3]) ** (1/2) - 1) * 100
            except:
                pass
        elif len(pat_year) >= 2 and pat_year[-2] > 0 and pat_year[-1] > 0:
            try:
                earnings_growth_3yr = ((pat_year[-1] / pat_year[-2]) - 1) * 100
            except:
                pass

        price_return_1yr = safe_float(fin.get("price_return_1yr", 0))
        mismatch_score = earnings_growth_3yr - price_return_1yr

        metrics["earnings_growth_3yr"] = safe_float(earnings_growth_3yr)
        metrics["price_return_1yr"] = safe_float(price_return_1yr)
        metrics["mismatch_score"] = safe_float(mismatch_score)

        if mismatch_score > 5:
            signals["price_mismatch"] = True

        stages["after_stage6"] += 1

        brs = compute_brs(signals, metrics)

        candidates.append({
            "symbol": sym,
            "name": fin.get("name", sym),
            "current_price": safe_float(fin.get("current_price", 0)),
            "market_cap": safe_float(fin.get("market_cap", 0)),
            "pe": safe_float(fin.get("pe", 0)),
            "roe": safe_float(fin.get("roe", 0)),
            "brs": brs,
            "signals": signals,
            "metrics": metrics,
            "screener_url": f"https://www.screener.in/company/{sym}/",
            "tv_url": f"https://www.tradingview.com/chart/?symbol=NSE:{sym}",
        })

    candidates.sort(key=lambda x: x["brs"], reverse=True)
    return {"candidates": candidates, "stages": stages}
