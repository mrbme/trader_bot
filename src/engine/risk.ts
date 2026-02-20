import { RISK } from '@/utils/config.ts';
import { getState } from '@/state/store.ts';
import type { Symbol } from '@/utils/config.ts';

export const checkCooldown = (symbol: Symbol): boolean => {
  const state = getState();
  const lastTrade = state.lastTradeTime[symbol];
  if (!lastTrade) return false;
  return Date.now() - lastTrade < RISK.cooldownMs;
};

export const checkDailyLossLimit = (equity: number): boolean => {
  const state = getState();
  if (state.initialCapital <= 0) return false;
  const lossPct = (state.initialCapital - equity) / state.initialCapital;
  return lossPct >= RISK.dailyLossLimitPct;
};

export const checkTrailingStop = (
  symbol: Symbol,
  currentPrice: number,
  overrideStopPct?: number,
): boolean => {
  const state = getState();
  const hwm = state.highWaterMarks[symbol];
  if (!hwm || hwm <= 0) return false;
  const drawdown = (hwm - currentPrice) / hwm;
  const stopPct = overrideStopPct ?? RISK.trailingStopPct;
  return drawdown >= stopPct;
};

export const updateHighWaterMark = (symbol: Symbol, price: number): void => {
  const state = getState();
  const current = state.highWaterMarks[symbol] ?? 0;
  if (price > current) {
    state.highWaterMarks[symbol] = price;
  }
};

export const isPaused = (): boolean => {
  const state = getState();
  if (state.paused) return true;
  if (state.pausedUntil && Date.now() < state.pausedUntil) return true;
  return false;
};
