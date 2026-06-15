import { ScreenerClient } from 'screener-india';
import type { ParsedFinancials } from './types.js';

export const client = new ScreenerClient({
  cacheTtlMs: 900_000,
  minIntervalMs: 400,
  maxRetries: 3,
  timeoutMs: 25_000,
});

function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, '')
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/Cr\.?/gi, '')
    .replace(/%/g, '')
    .trim();
  if (cleaned === '-' || cleaned === '' || cleaned === 'NA') return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function parseFinancials(symbol: string): Promise<ParsedFinancials> {
  const empty: ParsedFinancials = {
    quarterLabels: [], revenueByQ: [], patByQ: [], opmByQ: [],
    yearLabels: [], revenueByYear: [], patByYear: [],
    debtToEquityByYear: [], operatingCFByYear: [],
    roceByYear: [], roeByYear: [],
    promoterByQ: [], fiiByQ: [], diiByQ: [], mfCountByQ: [],
  };

  try {
    const [quartersRes, plRes, bsRes, cfRes, ratiosRes, shRes] = await Promise.allSettled([
      client.getCompanyTab(symbol, 'quarters', 'consolidated'),
      client.getCompanyTab(symbol, 'profit-loss', 'consolidated'),
      client.getCompanyTab(symbol, 'balance-sheet', 'consolidated'),
      client.getCompanyTab(symbol, 'cash-flow', 'consolidated'),
      client.getCompanyTab(symbol, 'ratios', 'consolidated'),
      client.getCompanyTab(symbol, 'shareholding', 'consolidated'),
    ]);

    function extractRow(table: any, ...titleFragments: string[]): number[] {
      if (!table?.rows) return [];
      const row = table.rows.find((r: any) =>
        titleFragments.some(frag =>
          String(r?.title ?? '').toLowerCase().includes(frag.toLowerCase())
        )
      );
      if (!row?.values) return [];
      return row.values.map((v: any) => parseNum(v));
    }

    function getColumns(table: any): string[] {
      return table?.columns ?? [];
    }

    if (quartersRes.status === 'fulfilled') {
      const t = quartersRes.value.data.quarters;
      console.log('quarters table sample:', JSON.stringify(t)?.substring(0, 300));
      empty.quarterLabels = getColumns(t);
      empty.revenueByQ = extractRow(t, 'sales', 'revenue');
      empty.patByQ = extractRow(t, 'net profit', 'pat');
      empty.opmByQ = extractRow(t, 'opm', 'operating profit margin');
    }

    if (plRes.status === 'fulfilled') {
      const t = plRes.value.data.profitLoss;
      empty.yearLabels = getColumns(t);
      empty.revenueByYear = extractRow(t, 'sales', 'revenue');
      empty.patByYear = extractRow(t, 'net profit', 'pat');
    }

    if (bsRes.status === 'fulfilled') {
      const t = bsRes.value.data.balanceSheet;
      const borrowings = extractRow(t, 'borrowing');
      const equity = extractRow(t, 'equity', 'reserve');
      empty.debtToEquityByYear = borrowings.map((b, i) => {
        const eq = equity[i] ?? 1;
        return eq !== 0 ? b / eq : 0;
      });
    }

    if (cfRes.status === 'fulfilled') {
      const t = cfRes.value.data.cashFlow;
      empty.operatingCFByYear = extractRow(t, 'operating', 'cash from operations');
    }

    if (ratiosRes.status === 'fulfilled') {
      const t = ratiosRes.value.data.ratios;
      empty.roceByYear = extractRow(t, 'roce');
      empty.roeByYear = extractRow(t, 'roe');
    }

    if (shRes.status === 'fulfilled') {
      const t = shRes.value.data.shareholding;
      empty.promoterByQ = extractRow(t, 'promoter');
      empty.fiiByQ = extractRow(t, 'fii', 'foreign');
      empty.diiByQ = extractRow(t, 'dii', 'domestic');
      empty.mfCountByQ = empty.diiByQ.map(v => v > 0 ? 1 : 0);
    }

  } catch (err) {
    console.error(`parseFinancials failed for ${symbol}:`, err);
  }

  return empty;
}
