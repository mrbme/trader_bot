import { config } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import type { Symbol } from '@/utils/config.ts';
import type { TradeJournalEntry } from '@/llm/types.ts';
import type { EnrichmentContext } from '@/data-sources/types.ts';
import type {
  ScalpPosition,
  ClosedScalp,
  ScalpSignal,
  ScalpMetrics,
} from '@/strategy/scalp-types.ts';

export type TradeEntry = {
  timestamp: string;
  symbol: Symbol;
  side: 'buy' | 'sell';
  qty: string;
  notional: string;
  price: string;
  reason: string;
};

export type ScalpSignalSnapshot = {
  symbol: Symbol;
  direction: 'long' | 'short' | 'none';
  score: number;
  price: number;
  spread: number;
  timestamp: string;
};

export type BotState = {
  startedAt: string;
  initialCapital: number;
  lastTradeTime: Partial<Record<Symbol, number>>;
  tradeLog: TradeEntry[];
  signals: ScalpSignalSnapshot[];
  paused: boolean;
  pausedUntil: number | null;
  journalEntries: TradeJournalEntry[];
  lastEnrichment: EnrichmentContext | null;
  openScalps: ScalpPosition[];
  closedScalps: ClosedScalp[];
  dailyScalpCount: number;
  dailyScalpDate: string;
};

const STATE_FILE = `${config.dataDir}/bot-state.json`;

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const defaultState = (): BotState => ({
  startedAt: new Date().toISOString(),
  initialCapital: 0,
  lastTradeTime: {},
  tradeLog: [],
  signals: [],
  paused: false,
  pausedUntil: null,
  journalEntries: [],
  lastEnrichment: null,
  openScalps: [],
  closedScalps: [],
  dailyScalpCount: 0,
  dailyScalpDate: todayStr(),
});

let state: BotState = defaultState();

export const loadState = async (): Promise<BotState> => {
  try {
    const file = Bun.file(STATE_FILE);
    if (await file.exists()) {
      const raw = await file.json();
      state = { ...defaultState(), ...raw };
      logger.info('State loaded from disk', { file: STATE_FILE });
    } else {
      logger.info('No state file found, using defaults');
    }
  } catch (err) {
    logger.warn('Failed to load state, using defaults', {
      error: (err as Error).message,
    });
  }
  return state;
};

export const saveState = async (): Promise<void> => {
  try {
    await Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error('Failed to save state', { error: (err as Error).message });
  }
};

export const getState = (): BotState => state;

export const updateState = (updater: (s: BotState) => void): void => {
  updater(state);
};

export const addTrade = (trade: TradeEntry): void => {
  state.tradeLog.push(trade);
  if (state.tradeLog.length > 500) {
    state.tradeLog = state.tradeLog.slice(-500);
  }
};

export const addSignals = (signals: ScalpSignalSnapshot[]): void => {
  state.signals = signals;
};

export const addJournalEntry = (entry: TradeJournalEntry): void => {
  state.journalEntries.push(entry);
  if (state.journalEntries.length > 200) {
    state.journalEntries = state.journalEntries.slice(-200);
  }
};

export const setEnrichment = (enrichment: EnrichmentContext): void => {
  state.lastEnrichment = enrichment;
};

// Scalp position management

export const addOpenScalp = (scalp: ScalpPosition): void => {
  state.openScalps.push(scalp);
};

export const closeScalp = (
  scalpId: string,
  exitPrice: number,
  exitReason: ClosedScalp['exitReason'],
): ClosedScalp | null => {
  const idx = state.openScalps.findIndex((s) => s.id === scalpId);
  if (idx === -1) return null;

  const scalp = state.openScalps[idx];
  state.openScalps.splice(idx, 1);

  const pnl = (exitPrice - scalp.entryPrice) * scalp.qty;
  const pnlPct = (exitPrice - scalp.entryPrice) / scalp.entryPrice;
  const now = Date.now();

  const closed: ClosedScalp = {
    id: scalp.id,
    symbol: scalp.symbol,
    direction: scalp.direction,
    entryPrice: scalp.entryPrice,
    exitPrice,
    qty: scalp.qty,
    notional: scalp.notional,
    pnl,
    pnlPct,
    exitReason,
    entryTime: scalp.entryTime,
    exitTime: now,
    durationMs: now - scalp.entryTime,
  };

  state.closedScalps.push(closed);
  if (state.closedScalps.length > 1000) {
    state.closedScalps = state.closedScalps.slice(-1000);
  }

  return closed;
};

export const getOpenScalpsForSymbol = (symbol: Symbol): ScalpPosition[] =>
  state.openScalps.filter((s) => s.symbol === symbol);

export const getOpenScalpCount = (): number => state.openScalps.length;

export const incrementDailyScalpCount = (): void => {
  const today = todayStr();
  if (state.dailyScalpDate !== today) {
    state.dailyScalpDate = today;
    state.dailyScalpCount = 0;
  }
  state.dailyScalpCount++;
};

export const getDailyScalpCount = (): number => {
  const today = todayStr();
  if (state.dailyScalpDate !== today) {
    state.dailyScalpDate = today;
    state.dailyScalpCount = 0;
  }
  return state.dailyScalpCount;
};

export const calculateScalpMetrics = (): ScalpMetrics => {
  const scalps = state.closedScalps;
  if (scalps.length === 0) {
    return {
      totalScalps: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      avgDurationMs: 0,
      bestPnl: 0,
      worstPnl: 0,
    };
  }

  const wins = scalps.filter((s) => s.pnl > 0).length;
  const losses = scalps.filter((s) => s.pnl <= 0).length;
  const totalPnl = scalps.reduce((sum, s) => sum + s.pnl, 0);
  const avgDurationMs = scalps.reduce((sum, s) => sum + s.durationMs, 0) / scalps.length;
  const pnls = scalps.map((s) => s.pnl);

  return {
    totalScalps: scalps.length,
    wins,
    losses,
    winRate: wins / scalps.length,
    totalPnl,
    avgPnl: totalPnl / scalps.length,
    avgDurationMs,
    bestPnl: Math.max(...pnls),
    worstPnl: Math.min(...pnls),
  };
};
