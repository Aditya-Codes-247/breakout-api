import type { TVStock } from './tradingview.js';
import type { ParsedFinancials, BreakoutCandidate } from './types.js';
import { parseFinancials } from './screener.js';
import { fetchPriceReturn1yr } from './tradingview.js';
import { computeBRS } from './scorer.js';

function getLast(arr: number[], offset: number = 0): number {
  const idx = arr.length - 1 - offset;
  return idx >= 0 ? arr[idx] : 0;
}

function computeGrowth(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

interface StockData {
  stock: TVStock;
  financials: ParsedFinancials;
}

export async function runPipeline(
  universe: TVStock[],
  options: { includeSME: boolean; onProgress?: (msg: string) => void }
): Promise<{ candidates: BreakoutCandidate[]; stages: Record<string, number> }> {
  const stages: Record<string, number> = {};
  stages.afterStage1 = universe.length;
  options.onProgress?.('Stage 1: Universe fetched with ' + universe.length + ' stocks');

  const batchSize = 10;
  const batchDelayMs = 2000;
  const financialsMap = new Map<string, ParsedFinancials | null>();

  for (let i = 0; i < universe.length; i += batchSize) {
    const batch = universe.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(s => parseFinancials(s.nseSymbol))
    );
    results.forEach((r, idx) => {
      const symbol = batch[idx].nseSymbol;
      if (r.status === 'fulfilled') {
        financialsMap.set(symbol, r.value);
      } else {
        console.warn(`Failed to fetch financials for ${symbol}:`, r.reason);
        financialsMap.set(symbol, null);
      }
    });
    if (i + batchSize < universe.length) {
      await new Promise(r => setTimeout(r, batchDelayMs));
    }
  }

  options.onProgress?.('Stage 2: Financials fetched for all stocks');

  const stage2Passed: StockData[] = [];
  for (const stock of universe) {
    const fin = financialsMap.get(stock.nseSymbol);
    if (!fin) continue;

    const patByQ = fin.patByQ;
    if (patByQ.length < 6) {
      console.warn(`Skipping ${stock.nseSymbol} — insufficient quarterly PAT data (${patByQ.length} quarters)`);
      continue;
    }

    const last = patByQ.length - 1;
    const patGrowthLatestQ = computeGrowth(patByQ[last], patByQ[last - 4]);
    const patGrowthPrevQ = computeGrowth(patByQ[last - 1], patByQ[last - 5]);

    if (patGrowthLatestQ > 25 && patGrowthPrevQ > 15 && patGrowthLatestQ > patGrowthPrevQ) {
      stage2Passed.push({ stock, financials: fin });
    }
  }
  stages.afterStage2 = stage2Passed.length;
  options.onProgress?.(`Stage 2: Earnings inflection — ${stage2Passed.length} passed`);

  const stage3Passed: StockData[] = [];
  for (const sd of stage2Passed) {
    const fin = sd.financials;
    const dte = fin.debtToEquityByYear;
    const ocf = fin.operatingCFByYear;

    const lastDte = dte.length - 1;
    const debtDeclining = dte.length >= 3
      && dte[lastDte] < dte[lastDte - 1]
      && dte[lastDte - 1] < dte[lastDte - 2];

    const lastOcf = ocf.length - 1;
    const positiveCashFlow = ocf.length >= 2
      && ocf[lastOcf] > 0
      && ocf[lastOcf - 1] > 0;

    if (debtDeclining || positiveCashFlow) {
      stage3Passed.push(sd);
    }
  }
  stages.afterStage3 = stage3Passed.length;
  options.onProgress?.(`Stage 3: Balance sheet quality — ${stage3Passed.length} passed`);

  const stage4Passed: StockData[] = [];
  for (const sd of stage3Passed) {
    const fin = sd.financials;
    const roce = fin.roceByYear;
    if (roce.length < 3) continue;

    const last = roce.length - 1;
    const roceInflecting = roce[last] > roce[last - 2] && roce[last] > 8;

    if (roceInflecting) {
      stage4Passed.push(sd);
    }
  }
  stages.afterStage4 = stage4Passed.length;
  options.onProgress?.(`Stage 4: ROCE inflection — ${stage4Passed.length} passed`);

  const stage5Passed: StockData[] = [];
  for (const sd of stage4Passed) {
    const fin = sd.financials;
    const promoter = fin.promoterByQ;
    if (promoter.length < 5) {
      stage5Passed.push(sd);
      continue;
    }

    const last = promoter.length - 1;
    const promoterHoldingChange = promoter[last] - promoter[last - 4];
    const promoterStable = promoterHoldingChange > -1.0;

    if (promoterStable) {
      stage5Passed.push(sd);
    }
  }
  stages.afterStage5 = stage5Passed.length;
  options.onProgress?.(`Stage 5: Institutional discovery — ${stage5Passed.length} passed`);

  const tvSymbols = stage5Passed.map(sd => sd.stock.symbol);
  const priceReturnMap = await fetchPriceReturn1yr(tvSymbols);

  const stage6Passed: BreakoutCandidate[] = [];
  for (const sd of stage5Passed) {
    const fin = sd.financials;
    const patByYear = fin.patByYear;
    if (patByYear.length < 4) continue;

    const last = patByYear.length - 1;
    const earningsGrowth3yr = computeGrowth(patByYear[last], patByYear[last - 3]);

    const priceReturn1yr = priceReturnMap.get(sd.stock.nseSymbol) ?? 0;
    const mismatchScore = earningsGrowth3yr - priceReturn1yr;

    if (mismatchScore > 5) {
      const roce = fin.roceByYear;
      const dte = fin.debtToEquityByYear;
      const ocf = fin.operatingCFByYear;

      const patGrowthLatestQ = computeGrowth(
        getLast(fin.patByQ, 0),
        getLast(fin.patByQ, 4)
      );
      const patGrowthPrevQ = computeGrowth(
        getLast(fin.patByQ, 1),
        getLast(fin.patByQ, 5)
      );

      const opmByQ = fin.opmByQ;
      const opmLatest = opmByQ.length > 0 ? getLast(opmByQ, 0) : 0;
      const opmPrev = opmByQ.length > 1 ? getLast(opmByQ, 1) : 0;

      const debtToEquity = dte.length > 0 ? getLast(dte, 0) : 0;
      const debtToEquityPrevYear = dte.length > 1 ? getLast(dte, 1) : 0;

      const operatingCashFlow = ocf.length > 0 ? getLast(ocf, 0) : 0;

      const lastDte = dte.length - 1;
      const debtDeclining = dte.length >= 3
        && dte[lastDte] < dte[lastDte - 1]
        && dte[lastDte - 1] < dte[lastDte - 2];

      const lastOcf = ocf.length - 1;
      const positiveCashFlow = ocf.length >= 2
        && ocf[lastOcf] > 0
        && ocf[lastOcf - 1] > 0;

      const roceLast = roce.length - 1;
      const roceInflecting = roce.length >= 3
        && roce[roceLast] > roce[roceLast - 2]
        && roce[roceLast] > 8;

      const promoter = fin.promoterByQ;
      const promoterHoldingChange = promoter.length >= 5
        ? promoter[promoter.length - 1] - promoter[promoter.length - 5]
        : 0;
      const promoterStable = promoterHoldingChange > -1.0;

      const fii = fin.fiiByQ;
      const fiiChange = fii.length >= 2
        ? fii[fii.length - 1] - fii[fii.length - 2]
        : 0;
      const institutionalEntry = fiiChange > 0.1;

      const dii = fin.diiByQ;
      const mfCountChange = dii.length >= 5
        ? (dii[dii.length - 1] > 0 ? 1 : 0) - (dii[dii.length - 5] > 0 ? 1 : 0)
        : 0;

      const signals = {
        earningsInflection: true,
        opmExpanding: opmByQ.length >= 2 && (opmByQ[opmByQ.length - 1] - opmByQ[opmByQ.length - 2]) > 1.5,
        debtDeclining,
        positiveCashFlow,
        roceInflecting,
        promoterStable,
        institutionalEntry,
        priceMismatch: true,
      };

      const roce3yr = roce.length >= 3
        ? [roce[roce.length - 3], roce[roce.length - 2], roce[roce.length - 1]]
        : [...roce];

      const metrics = {
        patGrowthLatestQ,
        patGrowthPrevQ,
        opmLatest,
        opmPrev,
        debtToEquity,
        debtToEquityPrevYear,
        operatingCashFlow,
        roce3yr,
        promoterHoldingChange,
        mfCountChange,
        fiiChange,
        earningsGrowth3yr,
        priceReturn1yr,
        mismatchScore,
      };

      const brs = computeBRS(signals, metrics);

      const candidate: BreakoutCandidate = {
        symbol: sd.stock.nseSymbol,
        name: sd.stock.name,
        currentPrice: sd.stock.price,
        marketCap: sd.stock.marketCap,
        pe: sd.stock.pe,
        roe: sd.stock.roe,
        roce: roce.length > 0 ? getLast(roce, 0) : 0,
        brs,
        signals,
        metrics,
        screenerUrl: `https://www.screener.in/company/${sd.stock.nseSymbol}/`,
        tvSymbol: sd.stock.symbol,
        fetchedAt: new Date().toISOString(),
      };

      stage6Passed.push(candidate);
    }
  }
  stages.afterStage6 = stage6Passed.length;
  options.onProgress?.(`Stage 6: Price-earnings mismatch — ${stage6Passed.length} passed`);

  stage6Passed.sort((a, b) => b.brs - a.brs);

  return { candidates: stage6Passed, stages };
}
