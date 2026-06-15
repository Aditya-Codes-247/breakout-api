import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CompanyMode } from 'screener-india';
import { client, parseFinancials } from '../../lib/screener.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbol } = req.query;
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const upper = symbol.toUpperCase();

  try {
    const [company, financials] = await Promise.all([
      client.getCompany(upper, 'consolidated').catch(() => client.getCompany(upper, 'default' as CompanyMode)),
      parseFinancials(upper),
    ]);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
    return res.status(200).json({
      meta: company.meta,
      name: company.data.name,
      symbol: upper,
      topRatios: company.data.topRatios,
      analysis: company.data.analysis,
      peers: company.data.peers,
      financials,
      screenerUrl: `https://www.screener.in/company/${upper}/`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Fetch failed', message: err?.message });
  }
}
