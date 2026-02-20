import config from '@/utils/config.ts';
import { llmCompleteJson } from '@/llm/client.ts';
import { JOURNAL_SYSTEM, buildJournalPrompt } from '@/llm/prompts.ts';
import { addJournalEntry } from '@/state/store.ts';
import { logger } from '@/utils/logger.ts';
import type { JournalPromptInput } from '@/llm/prompts.ts';
import type { TradeJournalEntry } from '@/llm/types.ts';

type JournalResponse = {
  analysis: string;
};

export const generateTradeJournal = async (
  input: JournalPromptInput,
): Promise<void> => {
  if (!config.llmJournalEnabled) return;

  try {
    const result = await llmCompleteJson<JournalResponse>(
      'fast',
      JOURNAL_SYSTEM,
      buildJournalPrompt(input),
    );

    const entry: TradeJournalEntry = {
      id: `tj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      symbol: input.symbol,
      side: input.side,
      price: input.price,
      notional: input.notional,
      reason: input.reason,
      marketContext: `RSI: ${input.rsi.toFixed(1)}, BB: ${input.bbPosition}, F&G: ${input.fearGreed ?? 'N/A'}`,
      llmAnalysis: result?.analysis ?? 'LLM analysis unavailable',
      regime: input.regime,
      sentiment: input.sentiment,
      fearGreed: input.fearGreed,
    };

    addJournalEntry(entry);
    logger.debug(`Trade journal entry created for ${input.symbol} ${input.side}`);
  } catch (err) {
    logger.warn('Failed to generate trade journal', {
      error: (err as Error).message,
    });
  }
};
