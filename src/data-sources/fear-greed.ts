import { TtlCache } from '@/cache/ttl-cache.ts';
import { logger } from '@/utils/logger.ts';
import type { FearGreedData } from '@/data-sources/types.ts';

const cache = new TtlCache<FearGreedData>(15 * 60 * 1000);
const CACHE_KEY = 'fng';

type FngApiResponse = {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
};

export const fetchFearGreed = async (): Promise<FearGreedData | null> => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) {
      logger.warn(`Fear & Greed API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as FngApiResponse;
    const item = json.data?.[0];
    if (!item) return null;

    const data: FearGreedData = {
      value: parseInt(item.value, 10),
      classification: item.value_classification,
      timestamp: new Date(parseInt(item.timestamp, 10) * 1000).toISOString(),
    };

    cache.set(CACHE_KEY, data);
    logger.info(`Fear & Greed: ${data.value} (${data.classification})`);
    return data;
  } catch (err) {
    logger.warn('Failed to fetch Fear & Greed Index', {
      error: (err as Error).message,
    });
    return null;
  }
};
