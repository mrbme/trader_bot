import { config } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import type { Symbol } from '@/utils/config.ts';

export type TradeEntry = {
  timestamp: string;
  symbol: Symbol;
  side: 'buy' | 'sell';
  qty: string;
  notional: string;
  price: string;
  reason: string;
};

export type SignalSnapshot = {
  symbol: Symbol;
  price: number;
  rsi: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  action: 'buy' | 'sell' | 'hold';
  timestamp: string;
};

export type BotState = {
  startedAt: string;
  initialCapital: number;
  highWaterMarks: Partial<Record<Symbol, number>>;
  lastTradeTime: Partial<Record<Symbol, number>>;
  tradeLog: TradeEntry[];
  signals: SignalSnapshot[];
  lastRebalanceAt: number;
  paused: boolean;
  pausedUntil: number | null;
};

const STATE_FILE = `${config.dataDir}/bot-state.json`;

const defaultState = (): BotState => ({
  startedAt: new Date().toISOString(),
  initialCapital: 0,
  highWaterMarks: {},
  lastTradeTime: {},
  tradeLog: [],
  signals: [],
  lastRebalanceAt: 0,
  paused: false,
  pausedUntil: null,
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

export const addSignals = (signals: SignalSnapshot[]): void => {
  state.signals = signals;
};
