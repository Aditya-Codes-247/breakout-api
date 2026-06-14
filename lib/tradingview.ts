import { StockScreener, StockField } from 'tradingview-screener';

export interface TVStock {
  symbol: string;
  nseSymbol: string;
  name: string;
  price: number;
  marketCap: number;
  pe: number;
  roe: number;
  volume: number;
  changePercent1d: number;
}

export async function fetchNSEUniverse(includeSME: boolean): Promise<TVStock[]> {
  const minMcap = includeSME ? 100e7 : 500e7;

  const screener = new StockScreener()
    .where(StockField.COUNTRY.eq('India'))
    .where(StockField.MARKET_CAPITALIZATION.gt(minMcap))
    .where(StockField.PRICE_TO_EARNINGS_RATIO_TTM.between(1, 40))
    .where(StockField.RETURN_ON_EQUITY_FY.gt(10))
    .where(StockField.VOLUME.gt(10000))
    .select(
      StockField.NAME,
      StockField.PRICE,
      StockField.MARKET_CAPITALIZATION,
      StockField.PRICE_TO_EARNINGS_RATIO_TTM,
      StockField.RETURN_ON_EQUITY_FY,
      StockField.VOLUME,
      StockField.CHANGE_PERCENT
    )
    .sortBy(StockField.MARKET_CAPITALIZATION, false)
    .setRange(0, 80);

  const results = await screener.getAll();

  return results.map((r: any) => {
    const rawSymbol: string = r.s ?? '';
    const exchangePrefix = rawSymbol.startsWith('NSE:') || rawSymbol.startsWith('BSE:')
      ? rawSymbol.substring(0, 4)
      : '';
    const nseSymbol = exchangePrefix ? rawSymbol.substring(4) : rawSymbol;

    return {
      symbol: rawSymbol,
      nseSymbol,
      name: r.name ?? '',
      price: r.price ?? 0,
      marketCap: r['market_cap_basic'] ?? 0,
      pe: r['price_earnings_ttm'] ?? 0,
      roe: r['return_on_equity_fy'] ?? 0,
      volume: r.volume ?? 0,
      changePercent1d: r['change_%'] ?? 0,
    };
  });
}

export async function fetchPriceReturn1yr(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (symbols.length === 0) return result;

  try {
    const screener = new StockScreener()
      .where(StockField.COUNTRY.eq('India'))
      .symbols(symbols)
      .select(StockField.CHANGE_PERCENT.withHistory(252));

    const rows = await screener.getAll();

    for (const r of rows) {
      const rawSymbol: string = r.s ?? '';
      const nseSymbol = rawSymbol.replace(/^(NSE:|BSE:)/, '');
      const perf = r['change_%|1y'] ?? r['Performance_1Y'] ?? r['Perf_1Y'] ?? 0;
      result.set(nseSymbol, typeof perf === 'number' ? perf : 0);
    }
  } catch {
    try {
      const screener = new StockScreener()
        .where(StockField.COUNTRY.eq('India'))
        .symbols(symbols)
        .select(StockField.PERFORMANCE_1_YEAR);

      const rows = await screener.getAll();

      for (const r of rows) {
        const rawSymbol: string = r.s ?? '';
        const nseSymbol = rawSymbol.replace(/^(NSE:|BSE:)/, '');
        const perf = r['Performance_1Y'] ?? r['Perf_1Y'] ?? 0;
        result.set(nseSymbol, typeof perf === 'number' ? perf : 0);
      }
    } catch {
    }
  }

  return result;
}
