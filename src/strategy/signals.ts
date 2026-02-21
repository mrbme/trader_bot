import {
  calculateEMACrossScore,
  calculateRSI,
  calculateRSIScore,
  calculateROCScore,
  calculateVolumeSpikeScore,
  calculateVWAPDeviationScore,
  calculateSpreadScore,
} from '@/strategy/indicators.ts';
import { SCALP } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { Bar } from '@/alpaca/data.ts';
import type { ScalpSignal, IndicatorScore, QuoteSnapshot } from '@/strategy/scalp-types.ts';

export const generateScalpSignal = (
  symbol: Symbol,
  bars: Bar[],
  quote: QuoteSnapshot,
  vwap: number | null,
): ScalpSignal => {
  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const { weights } = SCALP;

  const indicators: IndicatorScore[] = [];

  // 1. EMA 8/21 crossover
  const emaCrossRaw = calculateEMACrossScore(closes, SCALP.emaFast, SCALP.emaSlow);
  indicators.push({
    name: 'ema-cross',
    raw: emaCrossRaw,
    weight: weights.emaCross,
    weighted: emaCrossRaw * weights.emaCross,
  });

  // 2. RSI (7-period)
  const rsi = calculateRSI(closes, SCALP.rsiPeriod);
  const rsiRaw = calculateRSIScore(rsi);
  indicators.push({
    name: 'rsi',
    raw: rsiRaw,
    weight: weights.rsi,
    weighted: rsiRaw * weights.rsi,
  });

  // 3. Rate of Change (5-bar)
  const rocRaw = calculateROCScore(closes, SCALP.rocPeriod);
  indicators.push({
    name: 'roc',
    raw: rocRaw,
    weight: weights.roc,
    weighted: rocRaw * weights.roc,
  });

  // 4. Volume spike
  const volRaw = calculateVolumeSpikeScore(
    volumes,
    closes,
    SCALP.volumeAvgPeriod,
    SCALP.volumeSpikeMultiplier,
  );
  indicators.push({
    name: 'volume-spike',
    raw: volRaw,
    weight: weights.volumeSpike,
    weighted: volRaw * weights.volumeSpike,
  });

  // 5. VWAP deviation
  const vwapRaw = calculateVWAPDeviationScore(quote.midPrice, vwap);
  indicators.push({
    name: 'vwap-deviation',
    raw: vwapRaw,
    weight: weights.vwapDeviation,
    weighted: vwapRaw * weights.vwapDeviation,
  });

  // 6. Spread width
  const spreadRaw = calculateSpreadScore(quote.spread, quote.midPrice);
  indicators.push({
    name: 'spread',
    raw: spreadRaw,
    weight: weights.spread,
    weighted: spreadRaw * weights.spread,
  });

  const score = indicators.reduce((sum, ind) => sum + ind.weighted, 0);

  let direction: ScalpSignal['direction'] = 'none';
  if (score >= SCALP.entryThreshold) direction = 'long';

  return {
    symbol,
    direction,
    score,
    indicators,
    price: quote.midPrice,
    spread: quote.spread,
    timestamp: new Date().toISOString(),
  };
};
