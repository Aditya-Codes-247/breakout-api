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
  const screener = new StockScreener();

  const results = await screener
    .where(StockField.COUNTRY.eq('India'))
    .where(StockField.MARKET_CAPITALIZATION.gt(includeSME ? 50_000_000 : 500_000_000))
    .where(StockField.VOLUME.gt(50_000))
    .select(
      StockField.NAME,
      StockField.PRICE,
      StockField.MARKET_CAPITALIZATION,
      StockField.PRICE_TO_EARNINGS_RATIO_TTM,
      StockField.RETURN_ON_EQUITY_FY,
      StockField.VOLUME,
    )
    .sortBy(StockField.MARKET_CAPITALIZATION, false)
    .setRange(0, 80)
    .get();

  console.log('TV universe count:', results.data.length);
  if (results.data.length > 0) console.log('TV first row:', JSON.stringify(results.data[0]));

  return results.data.map((row) => {
    const rawSymbol = String(row['symbol'] ?? '');
    const nseSymbol = rawSymbol.replace(/^(NSE|BSE):/, '');
    return {
      symbol: rawSymbol,
      nseSymbol,
      name: String(row['name'] ?? nseSymbol),
      price: parseFloat(String(row['close'] ?? '0')) || 0,
      marketCap: parseFloat(String(row['market_cap_basic'] ?? '0')) || 0,
      pe: parseFloat(String(row['price_earnings_ttm'] ?? '0')) || 0,
      roe: parseFloat(String(row['return_on_equity'] ?? '0')) || 0,
      volume: parseFloat(String(row['volume'] ?? '0')) || 0,
      changePercent1d: parseFloat(String(row['change'] ?? '0')) || 0,
    };
  });
}

export async function fetchPriceReturn1yr(nseSymbols: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  if (nseSymbols.length === 0) return map;

  try {
    const screener = new StockScreener()
      .where(StockField.COUNTRY.eq('India'))
      .select(StockField.NAME, StockField.CHANGE_PERCENT)
      .setRange(0, 150);

    const results = await screener.get();

    for (const row of results.data) {
      const raw = String(row['symbol'] ?? '');
      const sym = raw.replace(/^(NSE:|BSE:)/, '');
      const change = parseFloat(String(row['change'] ?? '0'));
      map.set(sym, isNaN(change) ? 0 : change);
    }
  } catch {
  }

  return map;
}
