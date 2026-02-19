import { TARGET_WEIGHTS, RISK, SYMBOLS } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';

export type PositionInfo = {
  symbol: Symbol;
  marketValue: number;
  qty: number;
  currentPrice: number;
};

export const calculatePositionSize = (
  symbol: Symbol,
  equity: number,
  currentPositionValue: number,
): number => {
  const targetValue = equity * TARGET_WEIGHTS[symbol];
  const buyAmount = targetValue - currentPositionValue;

  if (buyAmount < RISK.minOrderNotional) return 0;

  const maxAllowed = equity * RISK.maxPositionWeight - currentPositionValue;
  return Math.min(buyAmount, Math.max(maxAllowed, 0));
};

export type RebalanceAction = {
  symbol: Symbol;
  side: 'buy' | 'sell';
  notional: number;
};

export const calculateRebalance = (
  equity: number,
  positions: PositionInfo[],
): RebalanceAction[] => {
  const actions: RebalanceAction[] = [];
  const positionMap = new Map(positions.map((p) => [p.symbol, p]));

  for (const symbol of SYMBOLS) {
    const pos = positionMap.get(symbol);
    const currentValue = pos?.marketValue ?? 0;
    const currentWeight = equity > 0 ? currentValue / equity : 0;
    const targetWeight = TARGET_WEIGHTS[symbol];
    const drift = Math.abs(currentWeight - targetWeight);

    if (drift < RISK.rebalanceDriftPct) continue;

    const targetValue = equity * targetWeight;
    const diff = targetValue - currentValue;

    if (Math.abs(diff) < RISK.minOrderNotional) continue;

    actions.push({
      symbol,
      side: diff > 0 ? 'buy' : 'sell',
      notional: Math.abs(diff),
    });
  }

  return actions;
};
