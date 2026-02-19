import { getCryptoBars, getCurrentPrices } from '@/alpaca/data.ts';
import { getAccount, getPositions } from '@/alpaca/trading.ts';
import { generateSignal } from '@/strategy/signals.ts';
import { calculateRebalance } from '@/strategy/portfolio.ts';
import {
  checkCooldown,
  checkDailyLossLimit,
  checkTrailingStop,
  updateHighWaterMark,
  isPaused,
} from '@/engine/risk.ts';
import { executeSignal, executeTrailingStop, executeRebalance } from '@/engine/executor.ts';
import { getState, saveState, updateState, addSignals } from '@/state/store.ts';
import { SYMBOLS, STRATEGY, RISK } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import type { Symbol } from '@/utils/config.ts';
import type { PositionInfo } from '@/strategy/portfolio.ts';
import type { SignalSnapshot } from '@/state/store.ts';

let loopTimer: ReturnType<typeof setInterval> | null = null;

export const runOnce = async (): Promise<void> => {
  logger.info('--- Loop tick ---');

  try {
    const [account, positions, bars, prices] = await Promise.all([
      getAccount(),
      getPositions(),
      getCryptoBars(SYMBOLS),
      getCurrentPrices(SYMBOLS),
    ]);

    const equity = parseFloat(account.equity);
    logger.info(`Equity: $${equity.toFixed(2)}, Cash: $${account.cash}`);

    if (getState().initialCapital <= 0) {
      updateState((s) => {
        s.initialCapital = equity;
      });
    }

    const positionMap = new Map<string, PositionInfo>();
    for (const pos of positions) {
      positionMap.set(pos.symbol, {
        symbol: pos.symbol as Symbol,
        marketValue: parseFloat(pos.market_value),
        qty: parseFloat(pos.qty),
        currentPrice: parseFloat(pos.current_price),
      });
    }

    const dailyLossHit = checkDailyLossLimit(equity);
    if (dailyLossHit) {
      logger.warn('Daily loss limit breached — pausing buys for 4 hours');
      updateState((s) => {
        s.pausedUntil = Date.now() + RISK.dailyLossPauseMs;
      });
    }

    const paused = isPaused();
    const signalSnapshots: SignalSnapshot[] = [];

    for (const symbol of SYMBOLS) {
      const symbolBars = bars[symbol];
      if (!symbolBars || symbolBars.length < STRATEGY.bbPeriod) {
        logger.warn(`Insufficient bars for ${symbol}: ${symbolBars?.length ?? 0}`);
        continue;
      }

      const closes = symbolBars.map((b) => b.c);
      const currentPrice = prices[symbol] ?? closes[closes.length - 1];
      const pos = positionMap.get(symbol);

      updateHighWaterMark(symbol, currentPrice);

      if (pos && pos.qty > 0 && checkTrailingStop(symbol, currentPrice)) {
        await executeTrailingStop(symbol, pos);
        continue;
      }

      const currentWeight = pos ? pos.marketValue / equity : 0;
      const signal = generateSignal(symbol, closes, currentPrice, currentWeight);

      signalSnapshots.push({
        symbol,
        price: signal.price,
        rsi: signal.rsi,
        bbUpper: signal.bb.upper,
        bbMiddle: signal.bb.middle,
        bbLower: signal.bb.lower,
        action: signal.signal,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `${symbol}: ${signal.signal.toUpperCase()} | RSI ${signal.rsi.toFixed(1)} | Price $${currentPrice.toFixed(2)} | BB [${signal.bb.lower.toFixed(2)} - ${signal.bb.upper.toFixed(2)}]`,
      );

      if (signal.signal === 'hold') continue;

      if (paused && signal.signal === 'buy') {
        logger.info(`Skipping buy for ${symbol} — bot paused`);
        continue;
      }

      if (checkCooldown(symbol)) {
        logger.debug(`Cooldown active for ${symbol}`);
        continue;
      }

      try {
        await executeSignal(signal, equity, pos);
      } catch (err) {
        logger.error(`Failed to execute ${signal.signal} for ${symbol}`, {
          error: (err as Error).message,
        });
      }
    }

    addSignals(signalSnapshots);

    const state = getState();
    const timeSinceRebalance = Date.now() - state.lastRebalanceAt;
    if (timeSinceRebalance >= STRATEGY.rebalanceIntervalMs) {
      logger.info('Running rebalance check');
      const posInfos = Array.from(positionMap.values());
      const rebalanceActions = calculateRebalance(equity, posInfos);

      if (rebalanceActions.length > 0) {
        await executeRebalance(rebalanceActions);
      } else {
        logger.info('No rebalance needed');
      }

      updateState((s) => {
        s.lastRebalanceAt = Date.now();
      });
    }

    await saveState();
    logger.info('--- Loop complete ---');
  } catch (err) {
    logger.error('Loop error', { error: (err as Error).message, stack: (err as Error).stack });
  }
};

export const startLoop = (): void => {
  logger.info(`Starting trading loop (interval: ${STRATEGY.loopIntervalMs / 1000}s)`);
  runOnce();
  loopTimer = setInterval(runOnce, STRATEGY.loopIntervalMs);
};

export const stopLoop = (): void => {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    logger.info('Trading loop stopped');
  }
};
