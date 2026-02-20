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
  dashboardPassword: Bun.env.DASHBOARD_PASSWORD ?? '',
  anthropic: {
    apiKey: Bun.env.ANTHROPIC_API_KEY ?? '',
  },
  llmEnabled: Bun.env.LLM_ENABLED !== 'false',
  llmJournalEnabled: Bun.env.LLM_JOURNAL_ENABLED !== 'false',
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
  bbMultiplier: 1.3,
  rsiPeriod: 14,
  rsiBuyThreshold: 45,
  rsiSellThreshold: 55,
  barsTimeframe: '1Hour',
  barsLimit: 50,
  loopIntervalMs: 5 * 60 * 1000,
  rebalanceIntervalMs: 6 * 60 * 60 * 1000,
} as const;

export const RISK = {
  maxPositionWeight: 0.5,
  trailingStopPct: 0.05,
  minOrderNotional: 10,
  cooldownMs: 5 * 60 * 1000,
  dailyLossLimitPct: 0.08,
  dailyLossPauseMs: 4 * 60 * 60 * 1000,
  rebalanceDriftPct: 0.08,
} as const;

export const MODIFIERS = {
  fearGreed: {
    extremeFearThreshold: 25,
    extremeGreedThreshold: 75,
    rsiBuyAdjust: 5,
    bbMultAdjustFear: -0.2,
    rsiBuyAdjustGreed: -5,
    bbMultAdjustGreed: 0.3,
  },
  funding: {
    negativeThreshold: -0.0001,
    positiveThreshold: 0.0001,
    sizeBullishAdjust: 0.1,
    sizeBearishAdjust: -0.1,
  },
  sentiment: {
    negativeThreshold: -0.3,
    positiveThreshold: 0.3,
    bearishMultiplier: 0.3,
    bullishMultiplier: 0.2,
  },
  regime: {
    trendingUpStopAdjust: 0.02,
    trendingDownStopAdjust: -0.01,
    trendingDownSizeAdjust: -0.15,
    volatileExpansionStopAdjust: -0.015,
    volatileExpansionBbAdjust: 0.3,
    volatileCompressionSizeAdjust: -0.1,
  },
  clamps: {
    rsiBuy: { min: 20, max: 55 },
    rsiSell: { min: 45, max: 80 },
    bbMultiplier: { min: 1.0, max: 3.0 },
    positionSizeMultiplier: { min: 0.3, max: 1.5 },
    trailingStopPct: { min: 0.02, max: 0.12 },
  },
} as const;

export default config;
