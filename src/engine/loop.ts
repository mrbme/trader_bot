import { getCryptoBars, getCurrentPrices } from '@/alpaca/data.ts';
import { getAccount, getPositions } from '@/alpaca/trading.ts';
import { generateSignal } from '@/strategy/signals.ts';
import { calculateRebalance } from '@/strategy/portfolio.ts';
import { calculateModifiers } from '@/strategy/signal-modifiers.ts';
import {
  checkCooldown,
  checkDailyLossLimit,
  checkTrailingStop,
  updateHighWaterMark,
  isPaused,
} from '@/engine/risk.ts';
import { executeSignal, executeTrailingStop, executeRebalance } from '@/engine/executor.ts';
import { getState, saveState, updateState, addSignals, setEnrichment } from '@/state/store.ts';
import { SYMBOLS, STRATEGY, RISK } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import { fetchFearGreed } from '@/data-sources/fear-greed.ts';
import { fetchFundingRates, getFundingRate } from '@/data-sources/binance-funding.ts';
import { fetchAllNews, getHeadlinesForSymbol } from '@/data-sources/alpaca-news.ts';
import { isLlmAvailable } from '@/llm/client.ts';
import { analyzeSentiment } from '@/llm/sentiment.ts';
import { classifyRegime } from '@/llm/regime.ts';
import { calculateBollingerBands, calculateRSI } from '@/strategy/indicators.ts';
import type { Symbol } from '@/utils/config.ts';
import type { PositionInfo } from '@/strategy/portfolio.ts';
import type { SignalSnapshot } from '@/state/store.ts';
import type { RegimeClassification } from '@/llm/types.ts';

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

    // Fetch enrichment data in parallel (graceful failure)
    const enrichmentResults = await Promise.allSettled([
      fetchFearGreed(),
      fetchFundingRates(),
      fetchAllNews(),
    ]);

    const fearGreed =
      enrichmentResults[0].status === 'fulfilled' ? enrichmentResults[0].value : null;
    const fundingRates =
      enrichmentResults[1].status === 'fulfilled' ? enrichmentResults[1].value : [];
    const allNews = enrichmentResults[2].status === 'fulfilled' ? enrichmentResults[2].value : {};

    // Classify market regime (Sonnet, cached 30min)
    let regime: RegimeClassification | null = null;
    if (isLlmAvailable()) {
      const priceData: Record<string, { current: number; change24h: number }> = {};
      let totalRsi = 0;
      let totalBandwidth = 0;
      let symbolCount = 0;

      for (const symbol of SYMBOLS) {
        const symbolBars = bars[symbol];
        if (!symbolBars || symbolBars.length < STRATEGY.bbPeriod) continue;

        const closes = symbolBars.map((b) => b.c);
        const currentPrice = prices[symbol] ?? closes[closes.length - 1];
        const firstClose = closes[0];
        const change24h = firstClose > 0 ? ((currentPrice - firstClose) / firstClose) * 100 : 0;

        priceData[symbol] = { current: currentPrice, change24h };
        totalRsi += calculateRSI(closes, STRATEGY.rsiPeriod);
        totalBandwidth += calculateBollingerBands(
          closes,
          STRATEGY.bbPeriod,
          STRATEGY.bbMultiplier,
        ).bandwidth;
        symbolCount++;
      }

      if (symbolCount > 0) {
        const fundingRateMap: Record<string, number> = {};
        for (const rate of fundingRates) {
          fundingRateMap[rate.symbol] = rate.fundingRate;
        }

        regime = await classifyRegime({
          prices: priceData,
          fearGreed: fearGreed?.value ?? null,
          avgRsi: totalRsi / symbolCount,
          avgBandwidth: totalBandwidth / symbolCount,
          fundingRates: fundingRateMap,
        });
      }
    }

    // Store enrichment data for dashboard
    const sentiments: Record<string, number> = {};
    setEnrichment({
      fearGreed,
      fundingRates,
      sentiments,
      regime: regime?.regime ?? null,
      regimeConfidence: regime?.confidence ?? null,
      timestamp: new Date().toISOString(),
    });

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

      // Analyze sentiment for this symbol (Haiku, cached 15min)
      let symbolSentiment: number | null = null;
      if (isLlmAvailable()) {
        const headlines = getHeadlinesForSymbol(allNews, symbol);
        if (headlines.length > 0) {
          const sentimentResult = await analyzeSentiment(symbol, headlines);
          if (sentimentResult) {
            symbolSentiment = sentimentResult.score;
            sentiments[symbol] = sentimentResult.score;
          }
        }
      }

      // Calculate modifiers from enrichment data
      const fundingRate = getFundingRate(fundingRates, symbol);
      const modifiers = calculateModifiers({
        fearGreed: fearGreed?.value ?? null,
        fundingRate,
        sentiment: symbolSentiment,
        regime: regime?.regime ?? null,
        regimeConfidence: regime?.confidence ?? null,
      });

      if (
        pos &&
        pos.qty > 0 &&
        checkTrailingStop(symbol, currentPrice, modifiers.trailingStopPct)
      ) {
        await executeTrailingStop(symbol, pos);
        continue;
      }

      const currentWeight = pos ? pos.marketValue / equity : 0;
      const signal = generateSignal(symbol, closes, currentPrice, currentWeight, modifiers);

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
        await executeSignal(signal, equity, pos, {
          positionSizeMultiplier: modifiers.positionSizeMultiplier,
          enrichment: {
            fearGreed: fearGreed?.value ?? null,
            sentiment: symbolSentiment,
            regime: regime?.regime ?? null,
            fundingRate,
          },
        });
      } catch (err) {
        logger.error(`Failed to execute ${signal.signal} for ${symbol}`, {
          error: (err as Error).message,
        });
      }
    }

    // Update enrichment sentiments now that all symbols have been processed
    setEnrichment({
      fearGreed,
      fundingRates,
      sentiments,
      regime: regime?.regime ?? null,
      regimeConfidence: regime?.confidence ?? null,
      timestamp: new Date().toISOString(),
    });

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
