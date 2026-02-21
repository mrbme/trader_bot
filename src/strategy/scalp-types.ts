import type { Symbol } from '@/utils/config.ts';

export type ScalpDirection = 'long' | 'short';

export type ScalpExitReason = 'take-profit' | 'stop-loss' | 'timeout' | 'reversal';

export type IndicatorScore = {
  name: string;
  raw: number; // -1 to +1
  weight: number;
  weighted: number; // raw * weight
};

export type ScalpSignal = {
  symbol: Symbol;
  direction: 'long' | 'short' | 'none';
  score: number; // aggregate weighted score
  indicators: IndicatorScore[];
  price: number;
  spread: number;
  timestamp: string;
};

export type ScalpPosition = {
  id: string;
  symbol: Symbol;
  direction: ScalpDirection;
  entryPrice: number;
  qty: number;
  notional: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  maxHoldUntil: number; // epoch ms
  entryScore: number;
  entryTime: number; // epoch ms
};

export type ClosedScalp = {
  id: string;
  symbol: Symbol;
  direction: ScalpDirection;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  notional: number;
  pnl: number;
  pnlPct: number;
  exitReason: ScalpExitReason;
  entryTime: number;
  exitTime: number;
  durationMs: number;
};

export type QuoteSnapshot = {
  symbol: Symbol;
  bid: number;
  ask: number;
  spread: number;
  midPrice: number;
  timestamp: string;
};

export type ScalpMetrics = {
  totalScalps: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgDurationMs: number;
  bestPnl: number;
  worstPnl: number;
};
