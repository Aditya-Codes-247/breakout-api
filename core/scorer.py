def compute_brs(signals: dict, metrics: dict) -> int:
    score = 0
    if signals.get("earnings_inflection"): score += 25
    if signals.get("opm_expanding"): score += 10
    if signals.get("debt_declining") and signals.get("positive_cash_flow"): score += 15
    elif signals.get("debt_declining") or signals.get("positive_cash_flow"): score += 8
    if signals.get("roce_inflecting"): score += 15
    if signals.get("promoter_stable"): score += 10
    if signals.get("institutional_entry"): score += 10
    if signals.get("price_mismatch"): score += 5
    if metrics.get("pat_growth_latest_q", 0) > 60: score += 5
    if metrics.get("mismatch_score", 0) > 20: score += 5
    return min(score, 100)
