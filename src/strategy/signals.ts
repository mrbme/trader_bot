import { calculateBollingerBands, calculateRSI } from '@/strategy/indicators.ts';
import { STRATEGY, TARGET_WEIGHTS, RISK } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { BollingerBands } from '@/strategy/indicators.ts';

export type Signal = 'buy' | 'sell' | 'hold';

export type SignalResult = {
  symbol: Symbol;
  signal: Signal;
  price: number;
  rsi: number;
  bb: BollingerBands;
  reason: string;
};

export const generateSignal = (
  symbol: Symbol,
  closes: number[],
  currentPrice: number,
  currentWeight: number,
): SignalResult => {
  const bb = calculateBollingerBands(closes, STRATEGY.bbPeriod, STRATEGY.bbMultiplier);
  const rsi = calculateRSI(closes, STRATEGY.rsiPeriod);

  const targetWeight = TARGET_WEIGHTS[symbol];

  const isBelowLowerBB = currentPrice < bb.lower;
  const isOversold = rsi < STRATEGY.rsiBuyThreshold;
  const isBelowTarget = currentWeight < targetWeight;

  if (isBelowLowerBB && isOversold && isBelowTarget) {
    return {
      symbol,
      signal: 'buy',
      price: currentPrice,
      rsi,
      bb,
      reason: `Price ${currentPrice.toFixed(2)} < BB lower ${bb.lower.toFixed(2)}, RSI ${rsi.toFixed(1)} < ${STRATEGY.rsiBuyThreshold}`,
    };
  }

  const isAboveUpperBB = currentPrice > bb.upper;
  const isOverbought = rsi > STRATEGY.rsiSellThreshold;
  const isOverMaxWeight = currentWeight > RISK.maxPositionWeight;

  if ((isAboveUpperBB && isOverbought) || isOverMaxWeight) {
    const reason = isOverMaxWeight
      ? `Position weight ${(currentWeight * 100).toFixed(1)}% > max ${RISK.maxPositionWeight * 100}%`
      : `Price ${currentPrice.toFixed(2)} > BB upper ${bb.upper.toFixed(2)}, RSI ${rsi.toFixed(1)} > ${STRATEGY.rsiSellThreshold}`;

    return { symbol, signal: 'sell', price: currentPrice, rsi, bb, reason };
  }

  return {
    symbol,
    signal: 'hold',
    price: currentPrice,
    rsi,
    bb,
    reason: 'No signal conditions met',
  };
};
