export type FearGreedData = {
  value: number;
  classification: string;
  timestamp: string;
};

export type NewsItem = {
  headline: string;
  summary: string;
  source: string;
  createdAt: string;
  symbols: string[];
};

export type NewsData = {
  symbol: string;
  headlines: NewsItem[];
  fetchedAt: string;
};

export type FundingRateData = {
  symbol: string;
  fundingRate: number;
  markPrice: number;
  nextFundingTime: string;
};

export type VwapData = {
  symbol: string;
  vwap: number;
  timestamp: string;
};

export type EnrichmentContext = {
  fearGreed: FearGreedData | null;
  fundingRates: FundingRateData[];
  sentiments: Record<string, number>;
  regime: string | null;
  regimeConfidence: number | null;
  timestamp: string;
};
