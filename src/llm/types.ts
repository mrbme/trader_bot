export type ModelTier = 'fast' | 'balanced' | 'deep';

export type SentimentScore = {
  symbol: string;
  score: number; // -1 to +1
  summary: string;
  headlines_analyzed: number;
};

export type MarketRegime =
  | 'trending-up'
  | 'trending-down'
  | 'range-bound'
  | 'volatile-expansion'
  | 'volatile-compression';

export type RegimeClassification = {
  regime: MarketRegime;
  confidence: number; // 0 to 1
  reasoning: string;
};

export type TradeJournalEntry = {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  notional: number;
  reason: string;
  marketContext: string;
  llmAnalysis: string;
  regime: string | null;
  sentiment: number | null;
  fearGreed: number | null;
};

export type SignalModifiers = {
  positionSizeMultiplier: number;
  takeProfitPct: number;
  stopLossPct: number;
};

export type ExecutionContext = {
  positionSizeMultiplier: number;
  enrichment: {
    fearGreed: number | null;
    sentiment: number | null;
    regime: string | null;
    fundingRate: number | null;
  };
};
