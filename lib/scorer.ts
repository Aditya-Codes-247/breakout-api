import type { BreakoutCandidate } from './types.js';

export function computeBRS(
  signals: BreakoutCandidate['signals'],
  metrics: BreakoutCandidate['metrics']
): number {
  let score = 0;

  if (signals.earningsInflection) score += 25;
  if (signals.opmExpanding) score += 10;
  if (signals.debtDeclining && signals.positiveCashFlow) score += 15;
  else if (signals.debtDeclining || signals.positiveCashFlow) score += 8;
  if (signals.roceInflecting) score += 15;
  if (signals.promoterStable) score += 10;
  if (signals.institutionalEntry) score += 10;
  if (signals.priceMismatch) score += 5;

  if (metrics.patGrowthLatestQ > 60) score += 5;
  if (metrics.mismatchScore > 20) score += 5;

  return Math.min(score, 100);
}
