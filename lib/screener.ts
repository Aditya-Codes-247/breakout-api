import { ScreenerClient } from 'screener-india';
import type { ParsedFinancials } from './types.js';

export const client = new ScreenerClient({
  cacheTtlMs: 900_000,
  minIntervalMs: 400,
  maxRetries: 3,
  timeoutMs: 25_000,
});

function parseNum(val: unknown): number {
  if (val == null || val === '' || val === '-') return 0;
  if (typeof val === 'number') return val;
  const str = String(val)
    .replace(/[,₹]/g, '')
    .replace(/\s*Cr\s*$/i, '')
    .replace(/\s*Lakh\s*$/i, '')
    .trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function findRow(rows: { title: string; values: (string | number)[] }[], titles: string[]): { title: string; values: (string | number)[] } | undefined {
  return rows.find(r =>
    titles.some(t => r.title.toLowerCase().includes(t.toLowerCase()))
  );
}

function extractValues(rows: { title: string; values: (string | number)[] }[], titles: string[]): number[] {
  const row = findRow(rows, titles);
  if (!row) return [];
  return row.values.map(v => parseNum(v));
}

async function fetchWithFallback(symbol: string): Promise<any> {
  try {
    return await client.getCompany(symbol, 'consolidated');
  } catch {
    return await client.getCompany(symbol, 'standalone');
  }
}

export async function parseFinancials(symbol: string): Promise<ParsedFinancials> {
  const data = await fetchWithFallback(symbol);

  const quarters = data.quarters;
  const quarterLabels: string[] = quarters?.columns ?? [];
  const revenueByQ = extractValues(quarters?.rows ?? [], ['Sales', 'Revenue']);
  const patByQ = extractValues(quarters?.rows ?? [], ['Net Profit', 'PAT']);
  const opmByQ = extractValues(quarters?.rows ?? [], ['OPM %', 'Operating Profit Margin %']);

  const pl = data.profitLoss;
  const yearLabels: string[] = pl?.columns ?? [];
  const revenueByYear = extractValues(pl?.rows ?? [], ['Sales', 'Revenue']);
  const patByYear = extractValues(pl?.rows ?? [], ['Net Profit', 'PAT']);

  const bs = data.balanceSheet;
  let debtToEquityByYear: number[] = extractValues(bs?.rows ?? [], ['Debt to equity', 'Debt to Equity']);

  if (debtToEquityByYear.length === 0 && bs?.rows) {
    const borrowings = extractValues(bs.rows, ['Borrowings']);
    const equity = extractValues(bs.rows, ['Equity Capital', 'Reserves', 'Shareholders']);
    const equityPlus = equity.length > 0 ? equity : extractValues(bs.rows, ['Equity']);
    if (borrowings.length > 0 && equityPlus.length > 0) {
      const minLen = Math.min(borrowings.length, equityPlus.length);
      debtToEquityByYear = [];
      for (let i = 0; i < minLen; i++) {
        const e = equityPlus[i];
        debtToEquityByYear.push(e !== 0 ? borrowings[i] / e : 0);
      }
    }
  }

  const cf = data.cashFlow;
  const operatingCFByYear = extractValues(cf?.rows ?? [], ['Cash from Operations', 'Cash from operations']);

  const ratios = data.ratios;
  const roceByYear = extractValues(ratios?.rows ?? [], ['ROCE %', 'ROCE']);
  const roeByYear = extractValues(ratios?.rows ?? [], ['ROE %', 'ROE']);

  const sh = data.shareholding;
  const promoterByQ = extractValues(sh?.rows ?? [], ['Promoters', 'Promoter']);
  const fiiByQ = extractValues(sh?.rows ?? [], ['FII', 'Foreign']);
  const diiByQ = extractValues(sh?.rows ?? [], ['DII', 'Domestic']);
  const mfCountByQ = extractValues(sh?.rows ?? [], ['No. of shareholders', 'Mutual Fund', 'MF']);

  return {
    quarterLabels,
    revenueByQ,
    patByQ,
    opmByQ,
    yearLabels,
    revenueByYear,
    patByYear,
    debtToEquityByYear,
    operatingCFByYear,
    roceByYear,
    roeByYear,
    promoterByQ,
    fiiByQ,
    diiByQ,
    mfCountByQ,
  };
}

export async function getTopRatio(symbol: string, ratioName: string): Promise<number> {
  try {
    const data = await client.getCompany(symbol, 'consolidated');
    const topRatios = data.data?.topRatios;
    if (!topRatios) return 0;
    const entry = topRatios.find((r: any) =>
      r.title?.toLowerCase().includes(ratioName.toLowerCase())
    );
    return entry ? parseNum(entry.value) : 0;
  } catch {
    try {
      const data = await client.getCompany(symbol, 'standalone');
      const topRatios = data.data?.topRatios;
      if (!topRatios) return 0;
      const entry = topRatios.find((r: any) =>
        r.title?.toLowerCase().includes(ratioName.toLowerCase())
      );
      return entry ? parseNum(entry.value) : 0;
    } catch {
      return 0;
    }
  }
}
