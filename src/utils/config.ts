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

export const SCALP = {
  loopIntervalMs: 30 * 1000,
  barsTimeframe: '1Min',
  barsLimit: 100,
  entryThreshold: 0.3,
  exitReversalThreshold: -0.2,
  takeProfitPct: 0.003,
  stopLossPct: 0.002,
  maxHoldMs: 5 * 60 * 1000,
  // Indicator periods
  emaFast: 8,
  emaSlow: 21,
  rsiPeriod: 7,
  rocPeriod: 5,
  volumeAvgPeriod: 20,
  volumeSpikeMultiplier: 2.0,
  // Indicator weights (must sum to 1.0)
  weights: {
    emaCross: 0.25,
    rsi: 0.15,
    roc: 0.15,
    volumeSpike: 0.15,
    vwapDeviation: 0.15,
    spread: 0.15,
  },
  // BB/RSI still used for regime classification
  bbPeriod: 20,
  bbMultiplier: 1.3,
  rsiClassifyPeriod: 14,
} as const;

export const RISK = {
  maxOpenScalps: 3,
  maxPerSymbol: 1,
  maxEquityPerScalp: 0.15,
  minOrderNotional: 10,
  cooldownMs: 15 * 1000,
  dailyLossLimitPct: 0.08,
  dailyLossPauseMs: 4 * 60 * 60 * 1000,
  dailyMaxScalps: 200,
} as const;

export const MODIFIERS = {
  fearGreed: {
    extremeFearThreshold: 25,
    extremeGreedThreshold: 75,
    sizeBoostFear: 0.2,
    sizeReduceGreed: -0.15,
    tpBoostFear: 0.001,
    slTightenGreed: -0.0005,
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
    bearishSizeAdjust: -0.15,
    bullishSizeAdjust: 0.1,
  },
  regime: {
    trendingUpSizeAdjust: 0.1,
    trendingUpTpAdjust: 0.001,
    trendingDownSizeAdjust: -0.2,
    trendingDownSlAdjust: -0.0005,
    volatileExpansionSlAdjust: -0.0005,
    volatileCompressionSizeAdjust: -0.1,
  },
  clamps: {
    positionSizeMultiplier: { min: 0.3, max: 1.5 },
    takeProfitPct: { min: 0.001, max: 0.008 },
    stopLossPct: { min: 0.001, max: 0.005 },
  },
} as const;

export default config;
