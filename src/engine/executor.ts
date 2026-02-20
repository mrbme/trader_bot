import { placeOrder } from '@/alpaca/trading.ts';
import { RISK } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import { addTrade, updateState } from '@/state/store.ts';
import { calculatePositionSize } from '@/strategy/portfolio.ts';
import type { SignalResult } from '@/strategy/signals.ts';
import type { PositionInfo } from '@/strategy/portfolio.ts';
import type { Symbol } from '@/utils/config.ts';
import type { RebalanceAction } from '@/strategy/portfolio.ts';
import type { ExecutionContext } from '@/llm/types.ts';
import { generateTradeJournal } from '@/llm/journal.ts';

export const executeSignal = async (
  signal: SignalResult,
  equity: number,
  position: PositionInfo | undefined,
  context?: ExecutionContext,
): Promise<void> => {
  if (signal.signal === 'hold') return;

  const sizeMult = context?.positionSizeMultiplier ?? 1.0;

  if (signal.signal === 'buy') {
    const currentValue = position?.marketValue ?? 0;
    let notional = calculatePositionSize(signal.symbol, equity, currentValue);
    notional = notional * sizeMult;
    if (notional < RISK.minOrderNotional) {
      logger.debug(`Buy too small for ${signal.symbol}: $${notional.toFixed(2)}`);
      return;
    }

    logger.info(`BUY ${signal.symbol} $${notional.toFixed(2)}`, {
      reason: signal.reason,
      sizeMult: sizeMult !== 1.0 ? sizeMult.toFixed(2) : undefined,
    });
    const order = await placeOrder({
      symbol: signal.symbol,
      side: 'buy',
      notional: notional.toFixed(2),
    });

    addTrade({
      timestamp: new Date().toISOString(),
      symbol: signal.symbol,
      side: 'buy',
      qty: order.filled_qty ?? '0',
      notional: notional.toFixed(2),
      price: order.filled_avg_price ?? signal.price.toString(),
      reason: signal.reason,
    });
    updateState((s) => {
      s.lastTradeTime[signal.symbol] = Date.now();
    });

    // Fire-and-forget trade journal
    generateTradeJournal({
      symbol: signal.symbol,
      side: 'buy',
      price: signal.price,
      notional,
      reason: signal.reason,
      rsi: signal.rsi,
      bbPosition: `[${signal.bb.lower.toFixed(2)} - ${signal.bb.upper.toFixed(2)}]`,
      fearGreed: context?.enrichment.fearGreed ?? null,
      sentiment: context?.enrichment.sentiment ?? null,
      regime: context?.enrichment.regime ?? null,
      fundingRate: context?.enrichment.fundingRate ?? null,
    }).catch(() => {});

    return;
  }

  if (signal.signal === 'sell' && position && position.qty > 0) {
    const sellQty = position.qty;
    logger.info(`SELL ${signal.symbol} qty ${sellQty}`, { reason: signal.reason });
    const order = await placeOrder({
      symbol: signal.symbol,
      side: 'sell',
      qty: sellQty.toString(),
    });

    addTrade({
      timestamp: new Date().toISOString(),
      symbol: signal.symbol,
      side: 'sell',
      qty: order.filled_qty ?? sellQty.toString(),
      notional: position.marketValue.toFixed(2),
      price: order.filled_avg_price ?? signal.price.toString(),
      reason: signal.reason,
    });
    updateState((s) => {
      s.lastTradeTime[signal.symbol] = Date.now();
    });

    // Fire-and-forget trade journal
    generateTradeJournal({
      symbol: signal.symbol,
      side: 'sell',
      price: signal.price,
      notional: position.marketValue,
      reason: signal.reason,
      rsi: signal.rsi,
      bbPosition: `[${signal.bb.lower.toFixed(2)} - ${signal.bb.upper.toFixed(2)}]`,
      fearGreed: context?.enrichment.fearGreed ?? null,
      sentiment: context?.enrichment.sentiment ?? null,
      regime: context?.enrichment.regime ?? null,
      fundingRate: context?.enrichment.fundingRate ?? null,
    }).catch(() => {});
  }
};

export const executeTrailingStop = async (
  symbol: Symbol,
  position: PositionInfo,
): Promise<void> => {
  logger.warn(`TRAILING STOP triggered for ${symbol}`, {
    qty: position.qty,
    price: position.currentPrice,
  });

  const order = await placeOrder({
    symbol,
    side: 'sell',
    qty: position.qty.toString(),
  });

  addTrade({
    timestamp: new Date().toISOString(),
    symbol,
    side: 'sell',
    qty: order.filled_qty ?? position.qty.toString(),
    notional: position.marketValue.toFixed(2),
    price: order.filled_avg_price ?? position.currentPrice.toString(),
    reason: 'Trailing stop triggered',
  });

  updateState((s) => {
    s.lastTradeTime[symbol] = Date.now();
    delete s.highWaterMarks[symbol];
  });
};

export const executeRebalance = async (actions: RebalanceAction[]): Promise<void> => {
  for (const action of actions) {
    logger.info(
      `REBALANCE ${action.side.toUpperCase()} ${action.symbol} $${action.notional.toFixed(2)}`,
    );

    try {
      const order = await placeOrder({
        symbol: action.symbol,
        side: action.side,
        notional: action.notional.toFixed(2),
      });

      addTrade({
        timestamp: new Date().toISOString(),
        symbol: action.symbol,
        side: action.side,
        qty: order.filled_qty ?? '0',
        notional: action.notional.toFixed(2),
        price: order.filled_avg_price ?? '0',
        reason: 'Rebalance',
      });
    } catch (err) {
      logger.error(`Rebalance order failed for ${action.symbol}`, {
        error: (err as Error).message,
      });
    }
  }
};
