import { TtlCache } from '@/cache/ttl-cache.ts';
import { llmCompleteJson } from '@/llm/client.ts';
import { REGIME_SYSTEM, buildRegimePrompt } from '@/llm/prompts.ts';
import { logger } from '@/utils/logger.ts';
import type { RegimeClassification, MarketRegime } from '@/llm/types.ts';
import type { RegimePromptInput } from '@/llm/prompts.ts';

const cache = new TtlCache<RegimeClassification>(30 * 60 * 1000);
const CACHE_KEY = 'regime';

const VALID_REGIMES: MarketRegime[] = [
  'trending-up',
  'trending-down',
  'range-bound',
  'volatile-expansion',
  'volatile-compression',
];

export const classifyRegime = async (
  input: RegimePromptInput,
): Promise<RegimeClassification | null> => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const result = await llmCompleteJson<RegimeClassification>(
    'balanced',
    REGIME_SYSTEM,
    buildRegimePrompt(input),
  );

  if (!result) return null;

  if (!VALID_REGIMES.includes(result.regime)) {
    logger.warn(`LLM returned invalid regime: ${result.regime}`);
    return null;
  }

  const classification: RegimeClassification = {
    regime: result.regime,
    confidence: Math.max(0, Math.min(1, result.confidence)),
    reasoning: result.reasoning,
  };

  cache.set(CACHE_KEY, classification);
  logger.info(
    `Regime: ${classification.regime} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`,
  );
  return classification;
};
