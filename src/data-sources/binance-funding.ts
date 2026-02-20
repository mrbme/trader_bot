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

type BybitTicker = {
  symbol: string;
  fundingRate: string;
  markPrice: string;
  nextFundingTime: string;
};

type BybitResponse = {
  retCode: number;
  result: {
    list: BybitTicker[];
  };
};

const fetchFromBinance = async (
  symbols: string[],
): Promise<FundingRateData[] | null> => {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    if (!res.ok) {
      logger.warn(`Binance funding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as BinancePremiumIndex[];
    const relevant = json.filter((item) => symbols.includes(item.symbol));

    return relevant.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.lastFundingRate),
      markPrice: parseFloat(item.markPrice),
      nextFundingTime: new Date(item.nextFundingTime).toISOString(),
    }));
  } catch (err) {
    logger.warn('Binance funding fetch failed', {
      error: (err as Error).message,
    });
    return null;
  }
};

const fetchFromBybit = async (
  symbols: string[],
): Promise<FundingRateData[] | null> => {
  try {
    const res = await fetch(
      'https://api.bybit.com/v5/market/tickers?category=linear',
    );
    if (!res.ok) {
      logger.warn(`Bybit funding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as BybitResponse;
    if (json.retCode !== 0) {
      logger.warn(`Bybit funding API error: retCode ${json.retCode}`);
      return null;
    }

    const relevant = json.result.list.filter((item) =>
      symbols.includes(item.symbol),
    );

    return relevant.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.fundingRate),
      markPrice: parseFloat(item.markPrice),
      nextFundingTime: new Date(Number(item.nextFundingTime)).toISOString(),
    }));
  } catch (err) {
    logger.warn('Bybit funding fetch failed', {
      error: (err as Error).message,
    });
    return null;
  }
};

export const fetchFundingRates = async (): Promise<FundingRateData[]> => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const symbols = SYMBOLS.map((s) => toBinanceSymbol(s));

  const rates =
    (await fetchFromBinance(symbols)) ?? (await fetchFromBybit(symbols));

  if (!rates || rates.length === 0) {
    logger.warn('All funding rate sources failed');
    return [];
  }

  cache.set(CACHE_KEY, rates);
  logger.info(`Funding rates fetched for ${rates.length} symbols`);
  return rates;
};

export const getFundingRate = (
  rates: FundingRateData[],
  symbol: Symbol,
): number | null => {
  const binanceSymbol = toBinanceSymbol(symbol);
  const rate = rates.find((r) => r.symbol === binanceSymbol);
  return rate?.fundingRate ?? null;
};
