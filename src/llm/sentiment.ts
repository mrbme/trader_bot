import { TtlCache } from '@/cache/ttl-cache.ts';
import { llmCompleteJson } from '@/llm/client.ts';
import { SENTIMENT_SYSTEM, buildSentimentPrompt } from '@/llm/prompts.ts';
import { logger } from '@/utils/logger.ts';
import type { SentimentScore } from '@/llm/types.ts';

const cache = new TtlCache<SentimentScore>(15 * 60 * 1000);

type SentimentResponse = {
  score: number;
  summary: string;
};

export const analyzeSentiment = async (
  symbol: string,
  headlines: string[],
): Promise<SentimentScore | null> => {
  if (headlines.length === 0) return null;

  const cached = cache.get(symbol);
  if (cached) return cached;

  const result = await llmCompleteJson<SentimentResponse>(
    'fast',
    SENTIMENT_SYSTEM,
    buildSentimentPrompt(symbol, headlines),
  );

  if (!result) return null;

  const score = Math.max(-1, Math.min(1, result.score));
  const sentimentScore: SentimentScore = {
    symbol,
    score,
    summary: result.summary,
    headlines_analyzed: headlines.length,
  };

  cache.set(symbol, sentimentScore);
  logger.info(`Sentiment [${symbol}]: ${score.toFixed(2)} — ${result.summary}`);
  return sentimentScore;
};
