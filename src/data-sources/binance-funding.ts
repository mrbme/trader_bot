import { TtlCache } from '@/cache/ttl-cache.ts';
import { logger } from '@/utils/logger.ts';
import { toBinanceSymbol, toHyperliquidSymbol } from '@/data-sources/symbol-map.ts';
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

const fetchFromBinance = async (symbols: string[]): Promise<FundingRateData[] | null> => {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    if (!res.ok) {
      logger.warn(`Binance funding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as BinancePremiumIndex[];
    const relevant = json.filter((item) => symbols.includes(item.symbol));

    const results = relevant.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.lastFundingRate),
      markPrice: parseFloat(item.markPrice),
      nextFundingTime: new Date(item.nextFundingTime).toISOString(),
    }));

    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn('Binance funding fetch failed', {
      error: (err as Error).message,
    });
    return null;
  }
};

const fetchFromBybit = async (symbols: string[]): Promise<FundingRateData[] | null> => {
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
    if (!res.ok) {
      logger.warn(`Bybit funding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as BybitResponse;
    if (json.retCode !== 0) {
      logger.warn(`Bybit funding API error: retCode ${json.retCode}`);
      return null;
    }

    const relevant = json.result.list.filter((item) => symbols.includes(item.symbol));

    const results = relevant.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.fundingRate),
      markPrice: parseFloat(item.markPrice),
      nextFundingTime: new Date(Number(item.nextFundingTime)).toISOString(),
    }));

    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn('Bybit funding fetch failed', {
      error: (err as Error).message,
    });
    return null;
  }
};

type HyperliquidAssetMeta = {
  name: string;
};

type HyperliquidAssetCtx = {
  funding: string;
  markPx: string;
};

type HyperliquidResponse = [{ universe: HyperliquidAssetMeta[] }, HyperliquidAssetCtx[]];

const fetchFromHyperliquid = async (symbols: string[]): Promise<FundingRateData[] | null> => {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!res.ok) {
      logger.warn(`Hyperliquid funding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as HyperliquidResponse;
    const [meta, assetCtxs] = json;

    const results: FundingRateData[] = [];
    for (let i = 0; i < meta.universe.length; i++) {
      const asset = meta.universe[i];
      if (!symbols.includes(asset.name)) continue;

      const ctx = assetCtxs[i];
      // Hyperliquid reports hourly funding; multiply by 8 to normalize to 8-hour rate
      const hourlyRate = parseFloat(ctx.funding);
      const nextHour = new Date();
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);

      results.push({
        symbol: `${asset.name}USDT`,
        fundingRate: hourlyRate * 8,
        markPrice: parseFloat(ctx.markPx),
        nextFundingTime: nextHour.toISOString(),
      });
    }

    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn('Hyperliquid funding fetch failed', {
      error: (err as Error).message,
    });
    return null;
  }
};

export const fetchFundingRates = async (): Promise<FundingRateData[]> => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const binanceSymbols = SYMBOLS.map((s) => toBinanceSymbol(s));
  const hlSymbols = SYMBOLS.map((s) => toHyperliquidSymbol(s));

  const rates =
    (await fetchFromBinance(binanceSymbols)) ??
    (await fetchFromBybit(binanceSymbols)) ??
    (await fetchFromHyperliquid(hlSymbols));

  if (!rates || rates.length === 0) {
    logger.warn('All funding rate sources failed');
    return [];
  }

  cache.set(CACHE_KEY, rates);
  logger.info(`Funding rates fetched for ${rates.length} symbols`);
  return rates;
};

export const getFundingRate = (rates: FundingRateData[], symbol: Symbol): number | null => {
  const binanceSymbol = toBinanceSymbol(symbol);
  const rate = rates.find((r) => r.symbol === binanceSymbol);
  return rate?.fundingRate ?? null;
};
