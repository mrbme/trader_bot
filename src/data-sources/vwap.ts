import type { Bar } from '@/alpaca/data.ts';
import type { VwapData } from '@/data-sources/types.ts';
import type { Symbol } from '@/utils/config.ts';

export const extractVwap = (symbol: Symbol, bars: Bar[]): VwapData | null => {
  if (!bars || bars.length === 0) return null;

  const latestBar = bars[bars.length - 1];
  if (!latestBar.vw || latestBar.vw <= 0) return null;

  return {
    symbol,
    vwap: latestBar.vw,
    timestamp: latestBar.t,
  };
};

export const extractAllVwaps = (
  barsBySymbol: Record<string, Bar[]>,
): Record<string, VwapData> => {
  const vwaps: Record<string, VwapData> = {};

  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    const vwap = extractVwap(symbol as Symbol, bars);
    if (vwap) {
      vwaps[symbol] = vwap;
    }
  }

  return vwaps;
};
