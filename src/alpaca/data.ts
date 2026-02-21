import { alpacaFetch } from '@/alpaca/client.ts';
import { SCALP } from '@/utils/config.ts';
import type { Symbol } from '@/utils/config.ts';
import type { QuoteSnapshot } from '@/strategy/scalp-types.ts';

export type Bar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
};

type BarsResponse = {
  bars: Record<string, Bar[]>;
  next_page_token?: string;
};

type QuotesResponse = {
  quotes: Record<string, { bp: number; ap: number; bs: number; as: number; t: string }>;
};

export const getCryptoBars = async (symbols: readonly Symbol[]): Promise<Record<string, Bar[]>> => {
  const results: Record<string, Bar[]> = {};

  const fetches = symbols.map(async (symbol) => {
    // 1Min bars: look back barsLimit minutes
    const start = new Date(Date.now() - SCALP.barsLimit * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      symbols: symbol,
      timeframe: '1Min',
      limit: String(SCALP.barsLimit),
      start,
    });

    const data = await alpacaFetch<BarsResponse>(
      `/v1beta3/crypto/us/bars?${params.toString()}`,
      'data',
    );

    if (data.bars[symbol]) {
      results[symbol] = data.bars[symbol];
    }
  });

  const settled = await Promise.allSettled(fetches);
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === 'rejected') {
      const reason = (settled[i] as PromiseRejectedResult).reason as Error;
      results[symbols[i]] = [];
      console.warn(`Failed to fetch bars for ${symbols[i]}: ${reason.message}`);
    }
  }

  return results;
};

export const getLatestQuotes = async (symbols: readonly Symbol[]) => {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
  });

  const data = await alpacaFetch<QuotesResponse>(
    `/v1beta3/crypto/us/latest/quotes?${params.toString()}`,
    'data',
  );

  return data.quotes;
};

export const getQuoteSnapshots = async (
  symbols: readonly Symbol[],
): Promise<Record<string, QuoteSnapshot>> => {
  const quotes = await getLatestQuotes(symbols);
  const snapshots: Record<string, QuoteSnapshot> = {};

  for (const [symbol, quote] of Object.entries(quotes)) {
    const bid = quote.bp;
    const ask = quote.ap;
    const spread = ask - bid;
    const midPrice = (bid + ask) / 2;

    snapshots[symbol] = {
      symbol: symbol as Symbol,
      bid,
      ask,
      spread,
      midPrice,
      timestamp: quote.t,
    };
  }

  return snapshots;
};

export const getCurrentPrices = async (
  symbols: readonly Symbol[],
): Promise<Record<string, number>> => {
  const quotes = await getLatestQuotes(symbols);
  const prices: Record<string, number> = {};

  for (const [symbol, quote] of Object.entries(quotes)) {
    prices[symbol] = (quote.bp + quote.ap) / 2;
  }

  return prices;
};
