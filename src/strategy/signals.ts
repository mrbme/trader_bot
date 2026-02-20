import { calculateBollingerBands, calculateRSI } from '@/strategy/indicators.ts';
import { STRATEGY, TARGET_WEIGHTS, RISK } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { BollingerBands } from '@/strategy/indicators.ts';
import type { SignalModifiers } from '@/llm/types.ts';

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
  modifiers?: SignalModifiers,
): SignalResult => {
  const bbMult = modifiers?.bbMultiplier ?? STRATEGY.bbMultiplier;
  const rsiBuy = modifiers?.rsiBuyThreshold ?? STRATEGY.rsiBuyThreshold;
  const rsiSell = modifiers?.rsiSellThreshold ?? STRATEGY.rsiSellThreshold;

  const bb = calculateBollingerBands(closes, STRATEGY.bbPeriod, bbMult);
  const rsi = calculateRSI(closes, STRATEGY.rsiPeriod);

  const targetWeight = TARGET_WEIGHTS[symbol];

  const isBelowLowerBB = currentPrice < bb.lower;
  const isOversold = rsi < rsiBuy;
  const isBelowTarget = currentWeight < targetWeight;

  if (isBelowLowerBB && isOversold && isBelowTarget) {
    return {
      symbol,
      signal: 'buy',
      price: currentPrice,
      rsi,
      bb,
      reason: `Price ${currentPrice.toFixed(2)} < BB lower ${bb.lower.toFixed(2)}, RSI ${rsi.toFixed(1)} < ${rsiBuy}`,
    };
  }

  const isAboveUpperBB = currentPrice > bb.upper;
  const isOverbought = rsi > rsiSell;
  const isOverMaxWeight = currentWeight > RISK.maxPositionWeight;

  if ((isAboveUpperBB && isOverbought) || isOverMaxWeight) {
    const reason = isOverMaxWeight
      ? `Position weight ${(currentWeight * 100).toFixed(1)}% > max ${RISK.maxPositionWeight * 100}%`
      : `Price ${currentPrice.toFixed(2)} > BB upper ${bb.upper.toFixed(2)}, RSI ${rsi.toFixed(1)} > ${rsiSell}`;

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
