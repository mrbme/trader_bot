export const SENTIMENT_SYSTEM = `You are a crypto market sentiment analyzer. Analyze news headlines and return a JSON object with your assessment. Be concise and precise.

Output ONLY valid JSON with this exact structure:
{
  "score": <number from -1.0 to 1.0>,
  "summary": "<one sentence summary>"
}

Score guide:
- -1.0: Extremely bearish (regulatory crackdown, exchange collapse, major hack)
- -0.5: Moderately bearish (whale selling, negative earnings, FUD)
- 0.0: Neutral (routine updates, mixed signals)
- +0.5: Moderately bullish (adoption news, positive regulation, partnerships)
- +1.0: Extremely bullish (ETF approval, major institutional buy, breakthrough tech)`;

export const buildSentimentPrompt = (symbol: string, headlines: string[]): string => {
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
  return `Analyze the sentiment of these recent ${symbol} headlines:\n\n${headlineList}\n\nReturn your JSON assessment.`;
};

export const REGIME_SYSTEM = `You are a crypto market regime classifier. Analyze the provided market data and classify the current market regime. Be precise and data-driven.

Output ONLY valid JSON with this exact structure:
{
  "regime": "<one of: trending-up, trending-down, range-bound, volatile-expansion, volatile-compression>",
  "confidence": <number from 0.0 to 1.0>,
  "reasoning": "<two sentence explanation>"
}

Regime definitions:
- trending-up: Sustained higher highs and higher lows, RSI above 50, positive momentum
- trending-down: Sustained lower highs and lower lows, RSI below 50, negative momentum
- range-bound: Price oscillating within defined support/resistance, RSI near 50
- volatile-expansion: Bollinger bandwidth expanding, large candles, high volume
- volatile-compression: Bollinger bandwidth contracting, small candles, low volume (often precedes breakout)`;

export type RegimePromptInput = {
  prices: Record<string, { current: number; change24h: number }>;
  fearGreed: number | null;
  avgRsi: number;
  avgBandwidth: number;
  fundingRates: Record<string, number>;
};

export const buildRegimePrompt = (input: RegimePromptInput): string => {
  const priceLines = Object.entries(input.prices)
    .map(([sym, p]) => `  ${sym}: $${p.current.toFixed(2)} (${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%)`)
    .join('\n');

  const fundingLines = Object.entries(input.fundingRates)
    .map(([sym, rate]) => `  ${sym}: ${(rate * 100).toFixed(4)}%`)
    .join('\n');

  return `Current market data:

Prices (24h change):
${priceLines}

Fear & Greed Index: ${input.fearGreed ?? 'N/A'}
Average RSI across portfolio: ${input.avgRsi.toFixed(1)}
Average Bollinger Bandwidth: ${input.avgBandwidth.toFixed(4)}

Funding Rates:
${fundingLines || '  N/A'}

Classify the current market regime.`;
};

export const JOURNAL_SYSTEM = `You are a trade journal assistant for a crypto trading bot. After each trade execution, write a brief analytical journal entry. Be concise and insightful.

Output ONLY valid JSON with this exact structure:
{
  "analysis": "<2-3 sentence analysis of why this trade was executed and the market context>"
}`;

export type JournalPromptInput = {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  notional: number;
  reason: string;
  rsi: number;
  bbPosition: string;
  fearGreed: number | null;
  sentiment: number | null;
  regime: string | null;
  fundingRate: number | null;
};

export const buildJournalPrompt = (input: JournalPromptInput): string =>
  `Trade executed:
  Symbol: ${input.symbol}
  Side: ${input.side.toUpperCase()}
  Price: $${input.price.toFixed(2)}
  Notional: $${input.notional.toFixed(2)}
  Signal Reason: ${input.reason}
  RSI: ${input.rsi.toFixed(1)}
  BB Position: ${input.bbPosition}
  Fear & Greed: ${input.fearGreed ?? 'N/A'}
  Sentiment Score: ${input.sentiment?.toFixed(2) ?? 'N/A'}
  Market Regime: ${input.regime ?? 'N/A'}
  Funding Rate: ${input.fundingRate != null ? (input.fundingRate * 100).toFixed(4) + '%' : 'N/A'}

Write a brief journal entry analyzing this trade.`;
