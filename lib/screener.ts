import { ScreenerClient } from 'screener-india';
import type { CompanyMode } from 'screener-india';
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

  // DIAGNOSTIC — remove after shape is confirmed
  try {
    const diag = await client.getCompanyTab(symbol, 'quarters', 'consolidated' as CompanyMode);
    console.error('DIAG quarters keys:', Object.keys(diag.data ?? {}));
    const qt = (diag.data as any).quarters;
    console.error('DIAG quarters type:', typeof qt);
    console.error('DIAG quarters keys2:', Object.keys(qt ?? {}));
    console.error('DIAG quarters sample:', JSON.stringify(qt)?.substring(0, 600));
  } catch(e) {
    console.error('DIAG quarters failed:', e);
  }

  function extractRow(table: any, ...titleFragments: string[]): number[] {
    if (!table) return [];

    // Try shape A: { rows: [{ title, values }] }
    if (Array.isArray(table.rows)) {
      const row = table.rows.find((r: any) =>
        titleFragments.some(f => String(r?.title ?? '').toLowerCase().includes(f.toLowerCase()))
      );
      if (row?.values) return row.values.map(parseNum);
    }

    // Try shape B: table is array of objects with a title field
    if (Array.isArray(table)) {
      const row = table.find((r: any) =>
        titleFragments.some(f => String(r?.title ?? r?.name ?? '').toLowerCase().includes(f.toLowerCase()))
      );
      if (row?.values) return row.values.map(parseNum);
      if (row?.data) return row.data.map(parseNum);
    }

    // Try shape C: { [rowTitle]: number[] }
    for (const frag of titleFragments) {
      for (const key of Object.keys(table)) {
        if (key.toLowerCase().includes(frag.toLowerCase())) {
          const val = table[key];
          if (Array.isArray(val)) return val.map(parseNum);
        }
      }
    }

    return [];
  }

  function getColumns(table: any): string[] {
    if (!table) return [];
    if (Array.isArray(table.columns)) return table.columns;
    if (Array.isArray(table.headers)) return table.headers;
    if (Array.isArray(table)) return [];
    return [];
  }

  try {
    const [quartersRes, plRes, bsRes, cfRes, ratiosRes, shRes] = await Promise.allSettled([
      client.getCompanyTab(symbol, 'quarters', 'consolidated'),
      client.getCompanyTab(symbol, 'profit-loss', 'consolidated'),
      client.getCompanyTab(symbol, 'balance-sheet', 'consolidated'),
      client.getCompanyTab(symbol, 'cash-flow', 'consolidated'),
      client.getCompanyTab(symbol, 'ratios', 'consolidated'),
      client.getCompanyTab(symbol, 'shareholding', 'consolidated'),
    ]);

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
