import Anthropic from '@anthropic-ai/sdk';
import config from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import type { ModelTier } from '@/llm/types.ts';

const MODEL_MAP: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-sonnet-4-5-20250929',
  deep: 'claude-opus-4-6',
};

let client: Anthropic | null = null;

const getClient = (): Anthropic | null => {
  if (!config.anthropic.apiKey) {
    return null;
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
};

export const isLlmAvailable = (): boolean => config.llmEnabled && !!config.anthropic.apiKey;

export const llmComplete = async (
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> => {
  if (!config.llmEnabled) return null;

  const anthropic = getClient();
  if (!anthropic) {
    logger.debug('LLM unavailable — no API key configured');
    return null;
  }

  const model = MODEL_MAP[tier];

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text ?? null;
  } catch (err) {
    logger.warn(`LLM call failed (${tier}/${model})`, {
      error: (err as Error).message,
    });
    return null;
  }
};

export const llmCompleteJson = async <T>(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
): Promise<T | null> => {
  const raw = await llmComplete(tier, systemPrompt, userPrompt);
  if (!raw) return null;

  try {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.warn('Failed to parse LLM JSON response', {
      error: (err as Error).message,
      raw: raw.substring(0, 200),
    });
    return null;
  }
};
