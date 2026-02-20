import type { Symbol } from '@/utils/config.ts';

const ALPACA_MAP: Record<Symbol, string> = {
  'BTC/USD': 'BTCUSD',
  'ETH/USD': 'ETHUSD',
  'SOL/USD': 'SOLUSD',
  'DOGE/USD': 'DOGEUSD',
  'LINK/USD': 'LINKUSD',
};

const BINANCE_MAP: Record<Symbol, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
  'SOL/USD': 'SOLUSDT',
  'DOGE/USD': 'DOGEUSDT',
  'LINK/USD': 'LINKUSDT',
};

export const toAlpacaSymbol = (symbol: Symbol): string =>
  ALPACA_MAP[symbol] ?? symbol.replace('/', '');

export const toBinanceSymbol = (symbol: Symbol): string =>
  BINANCE_MAP[symbol] ?? symbol.replace('/USD', 'USDT');

export const fromAlpacaSymbol = (alpacaSymbol: string): Symbol | null => {
  const entry = Object.entries(ALPACA_MAP).find(([, v]) => v === alpacaSymbol);
  return entry ? (entry[0] as Symbol) : null;
};

const HYPERLIQUID_MAP: Record<Symbol, string> = {
  'BTC/USD': 'BTC',
  'ETH/USD': 'ETH',
  'SOL/USD': 'SOL',
  'DOGE/USD': 'DOGE',
  'LINK/USD': 'LINK',
};

export const toHyperliquidSymbol = (symbol: Symbol): string =>
  HYPERLIQUID_MAP[symbol] ?? symbol.split('/')[0];
