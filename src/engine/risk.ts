import { RISK, SCALP } from '@/utils/config.ts';
import {
  getState,
  getOpenScalpCount,
  getOpenScalpsForSymbol,
  getDailyScalpCount,
} from '@/state/store.ts';
import type { Symbol } from '@/utils/config.ts';
import type { ScalpPosition } from '@/strategy/scalp-types.ts';
import type { ScalpExitReason } from '@/strategy/scalp-types.ts';

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

export const isPaused = (): boolean => {
  const state = getState();
  if (state.paused) return true;
  if (state.pausedUntil && Date.now() < state.pausedUntil) return true;
  return false;
};

export const canOpenScalp = (symbol: Symbol): { allowed: boolean; reason?: string } => {
  if (getOpenScalpCount() >= RISK.maxOpenScalps) {
    return { allowed: false, reason: `Max open scalps reached (${RISK.maxOpenScalps})` };
  }

  if (getOpenScalpsForSymbol(symbol).length >= RISK.maxPerSymbol) {
    return { allowed: false, reason: `Max scalps per symbol reached for ${symbol}` };
  }

  if (getDailyScalpCount() >= RISK.dailyMaxScalps) {
    return { allowed: false, reason: `Daily scalp limit reached (${RISK.dailyMaxScalps})` };
  }

  return { allowed: true };
};

export const checkScalpExit = (
  scalp: ScalpPosition,
  currentPrice: number,
  currentScore: number,
): { shouldExit: boolean; reason: ScalpExitReason } | null => {
  // Take profit
  if (currentPrice >= scalp.takeProfitPrice) {
    return { shouldExit: true, reason: 'take-profit' };
  }

  // Stop loss
  if (currentPrice <= scalp.stopLossPrice) {
    return { shouldExit: true, reason: 'stop-loss' };
  }

  // Timeout
  if (Date.now() >= scalp.maxHoldUntil) {
    return { shouldExit: true, reason: 'timeout' };
  }

  // Score reversal
  if (currentScore <= SCALP.exitReversalThreshold) {
    return { shouldExit: true, reason: 'reversal' };
  }

  return null;
};
