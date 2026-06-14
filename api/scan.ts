import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchNSEUniverse } from '../lib/tradingview.js';
import { runPipeline } from '../lib/pipeline.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const includeSME = req.query.sme === 'true';
  const startTime = Date.now();

  try {
    const universe = await fetchNSEUniverse(includeSME);
    const { candidates, stages } = await runPipeline(universe, { includeSME });

    const result = {
      candidates,
      totalScanned: universe.length,
      totalPassed: candidates.length,
      scanDurationMs: Date.now() - startTime,
      fetchedAt: new Date().toISOString(),
      stages,
    };

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Scan failed:', err);
    return res.status(500).json({
      error: 'Scan failed',
      message: err?.message ?? 'Unknown error',
      fetchedAt: new Date().toISOString(),
    });
  }
}
