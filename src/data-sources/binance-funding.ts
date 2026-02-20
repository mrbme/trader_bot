import { TtlCache } from '@/cache/ttl-cache.ts';
import { logger } from '@/utils/logger.ts';
import { toBinanceSymbol } from '@/data-sources/symbol-map.ts';
import { SYMBOLS } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { FundingRateData } from '@/data-sources/types.ts';

const cache = new TtlCache<FundingRateData[]>(15 * 60 * 1000);
const CACHE_KEY = 'funding';

type BinancePremiumIndex = {
  symbol: string;
  lastFundingRate: string;
  markPrice: string;
  nextFundingTime: number;
};

export const fetchFundingRates = async (): Promise<FundingRateData[]> => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const binanceSymbols = SYMBOLS.map((s) => toBinanceSymbol(s));
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    if (!res.ok) {
      logger.warn(`Binance funding API returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as BinancePremiumIndex[];
    const relevant = json.filter((item) => binanceSymbols.includes(item.symbol));

    const rates: FundingRateData[] = relevant.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.lastFundingRate),
      markPrice: parseFloat(item.markPrice),
      nextFundingTime: new Date(item.nextFundingTime).toISOString(),
    }));

    cache.set(CACHE_KEY, rates);
    logger.info(`Funding rates fetched for ${rates.length} symbols`);
    return rates;
  } catch (err) {
    logger.warn('Failed to fetch Binance funding rates', {
      error: (err as Error).message,
    });
    return [];
  }
};

export const getFundingRate = (
  rates: FundingRateData[],
  symbol: Symbol,
): number | null => {
  const binanceSymbol = toBinanceSymbol(symbol);
  const rate = rates.find((r) => r.symbol === binanceSymbol);
  return rate?.fundingRate ?? null;
};
