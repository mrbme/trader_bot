import { TtlCache } from '@/cache/ttl-cache.ts';
import { alpacaFetch } from '@/alpaca/client.ts';
import { logger } from '@/utils/logger.ts';
import { SYMBOLS } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { NewsItem } from '@/data-sources/types.ts';

const cache = new TtlCache<NewsItem[]>(15 * 60 * 1000);

type AlpacaNewsItem = {
  headline: string;
  summary: string;
  source: string;
  created_at: string;
  symbols: string[];
};

type AlpacaNewsResponse = {
  news: AlpacaNewsItem[];
};

const fetchNewsForSymbol = async (symbol: Symbol): Promise<NewsItem[]> => {
  const cached = cache.get(symbol);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      symbols: symbol,
      limit: '10',
      sort: 'desc',
    });

    const data = await alpacaFetch<AlpacaNewsResponse>(
      `/v1beta1/news?${params.toString()}`,
      'data',
    );

    const items: NewsItem[] = (data.news ?? []).map((n) => ({
      headline: n.headline,
      summary: n.summary ?? '',
      source: n.source,
      createdAt: n.created_at,
      symbols: n.symbols ?? [],
    }));

    cache.set(symbol, items);
    return items;
  } catch (err) {
    logger.warn(`Failed to fetch news for ${symbol}`, {
      error: (err as Error).message,
    });
    return [];
  }
};

export const fetchAllNews = async (): Promise<Record<string, NewsItem[]>> => {
  const results: Record<string, NewsItem[]> = {};

  const fetches = SYMBOLS.map(async (symbol) => {
    const items = await fetchNewsForSymbol(symbol);
    results[symbol] = items;
  });

  await Promise.allSettled(fetches);
  const totalHeadlines = Object.values(results).reduce((sum, items) => sum + items.length, 0);
  logger.info(`News fetched: ${totalHeadlines} headlines across ${SYMBOLS.length} symbols`);
  return results;
};

export const getHeadlinesForSymbol = (
  allNews: Record<string, NewsItem[]>,
  symbol: Symbol,
): string[] => {
  const items = allNews[symbol] ?? [];
  return items.map((n) => n.headline);
};
