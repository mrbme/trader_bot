import { placeOrder } from '@/alpaca/trading.ts';
import { SCALP } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import {
  addTrade,
  updateState,
  addOpenScalp,
  closeScalp,
  incrementDailyScalpCount,
} from '@/state/store.ts';
import { calculateScalpSize } from '@/strategy/portfolio.ts';
import { generateTradeJournal } from '@/llm/journal.ts';
import type { ScalpSignal, ScalpPosition, ScalpExitReason } from '@/strategy/scalp-types.ts';
import type { SignalModifiers, ExecutionContext } from '@/llm/types.ts';

export const executeScalpEntry = async (
  signal: ScalpSignal,
  equity: number,
  modifiers: SignalModifiers,
  context?: ExecutionContext,
): Promise<ScalpPosition | null> => {
  const notional = calculateScalpSize(equity, signal.score, modifiers.positionSizeMultiplier);
  if (notional <= 0) {
    logger.debug(`Scalp too small for ${signal.symbol}: $${notional.toFixed(2)}`);
    return null;
  }

  const entryPrice = signal.price;
  const takeProfitPrice = entryPrice * (1 + modifiers.takeProfitPct);
  const stopLossPrice = entryPrice * (1 - modifiers.stopLossPct);

  logger.info(
    `SCALP ENTRY ${signal.symbol} $${notional.toFixed(2)} @ $${entryPrice.toFixed(2)} | score=${signal.score.toFixed(3)} | TP=$${takeProfitPrice.toFixed(2)} SL=$${stopLossPrice.toFixed(2)}`,
  );

  const order = await placeOrder({
    symbol: signal.symbol,
    side: 'buy',
    notional: notional.toFixed(2),
  });

  const filledPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : entryPrice;
  const filledQty = order.filled_qty ? parseFloat(order.filled_qty) : notional / entryPrice;
  const now = Date.now();

  const scalp: ScalpPosition = {
    id: `scalp_${now}_${Math.random().toString(36).substring(2, 8)}`,
    symbol: signal.symbol,
    direction: 'long',
    entryPrice: filledPrice,
    qty: filledQty,
    notional,
    takeProfitPrice: filledPrice * (1 + modifiers.takeProfitPct),
    stopLossPrice: filledPrice * (1 - modifiers.stopLossPct),
    maxHoldUntil: now + SCALP.maxHoldMs,
    entryScore: signal.score,
    entryTime: now,
  };

  addOpenScalp(scalp);
  incrementDailyScalpCount();

  addTrade({
    timestamp: new Date().toISOString(),
    symbol: signal.symbol,
    side: 'buy',
    qty: order.filled_qty ?? filledQty.toString(),
    notional: notional.toFixed(2),
    price: order.filled_avg_price ?? entryPrice.toString(),
    reason: `Scalp entry | score=${signal.score.toFixed(3)} | spread=$${signal.spread.toFixed(4)}`,
  });

  updateState((s) => {
    s.lastTradeTime[signal.symbol] = now;
  });

  // Fire-and-forget trade journal
  generateTradeJournal({
    symbol: signal.symbol,
    side: 'buy',
    price: filledPrice,
    notional,
    reason: `Scalp entry | score=${signal.score.toFixed(3)}`,
    rsi: 0,
    bbPosition: 'N/A (scalp mode)',
    fearGreed: context?.enrichment.fearGreed ?? null,
    sentiment: context?.enrichment.sentiment ?? null,
    regime: context?.enrichment.regime ?? null,
    fundingRate: context?.enrichment.fundingRate ?? null,
  }).catch(() => {});

  return scalp;
};

export const executeScalpExit = async (
  scalp: ScalpPosition,
  exitPrice: number,
  exitReason: ScalpExitReason,
  context?: ExecutionContext,
): Promise<void> => {
  logger.info(
    `SCALP EXIT ${scalp.symbol} qty=${scalp.qty.toFixed(6)} @ $${exitPrice.toFixed(2)} | reason=${exitReason} | entry=$${scalp.entryPrice.toFixed(2)}`,
  );

  const order = await placeOrder({
    symbol: scalp.symbol,
    side: 'sell',
    qty: scalp.qty.toString(),
  });

  const filledPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : exitPrice;
  const closed = closeScalp(scalp.id, filledPrice, exitReason);

  if (closed) {
    const pnlSign = closed.pnl >= 0 ? '+' : '';
    logger.info(
      `SCALP CLOSED ${scalp.symbol} | PnL: ${pnlSign}$${closed.pnl.toFixed(2)} (${(closed.pnlPct * 100).toFixed(3)}%) | duration=${(closed.durationMs / 1000).toFixed(0)}s | reason=${exitReason}`,
    );
  }

  addTrade({
    timestamp: new Date().toISOString(),
    symbol: scalp.symbol,
    side: 'sell',
    qty: order.filled_qty ?? scalp.qty.toString(),
    notional: (filledPrice * scalp.qty).toFixed(2),
    price: order.filled_avg_price ?? exitPrice.toString(),
    reason: `Scalp exit: ${exitReason} | entry=$${scalp.entryPrice.toFixed(2)}`,
  });

  updateState((s) => {
    s.lastTradeTime[scalp.symbol] = Date.now();
  });

  // Fire-and-forget trade journal
  generateTradeJournal({
    symbol: scalp.symbol,
    side: 'sell',
    price: filledPrice,
    notional: filledPrice * scalp.qty,
    reason: `Scalp exit: ${exitReason} | PnL: ${closed ? `$${closed.pnl.toFixed(2)}` : 'unknown'}`,
    rsi: 0,
    bbPosition: 'N/A (scalp mode)',
    fearGreed: context?.enrichment.fearGreed ?? null,
    sentiment: context?.enrichment.sentiment ?? null,
    regime: context?.enrichment.regime ?? null,
    fundingRate: context?.enrichment.fundingRate ?? null,
  }).catch(() => {});
};
