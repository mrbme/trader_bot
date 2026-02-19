export const config = {
  alpaca: {
    keyId: Bun.env.ALPACA_KEY_ID ?? '',
    secretKey: Bun.env.ALPACA_SECRET_KEY ?? '',
    paperApiUrl: 'https://paper-api.alpaca.markets',
    dataApiUrl: 'https://data.alpaca.markets',
  },
  botMode: (Bun.env.BOT_MODE ?? 'paper') as 'paper' | 'live',
  logLevel: (Bun.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  port: parseInt(Bun.env.PORT ?? '3000', 10),
  dataDir: Bun.env.DATA_DIR ?? './data',
} as const;

export const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'LINK/USD'] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const TARGET_WEIGHTS: Record<Symbol, number> = {
  'BTC/USD': 0.35,
  'ETH/USD': 0.25,
  'SOL/USD': 0.15,
  'DOGE/USD': 0.15,
  'LINK/USD': 0.1,
};

export const STRATEGY = {
  bbPeriod: 20,
  bbMultiplier: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  barsTimeframe: '1Hour',
  barsLimit: 50,
  loopIntervalMs: 5 * 60 * 1000,
  rebalanceIntervalMs: 6 * 60 * 60 * 1000,
} as const;

export const RISK = {
  maxPositionWeight: 0.4,
  trailingStopPct: 0.05,
  minOrderNotional: 10,
  cooldownMs: 15 * 60 * 1000,
  dailyLossLimitPct: 0.08,
  dailyLossPauseMs: 4 * 60 * 60 * 1000,
  rebalanceDriftPct: 0.08,
} as const;

export default config;
