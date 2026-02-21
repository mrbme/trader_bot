import { getCryptoBars, getQuoteSnapshots } from '@/alpaca/data.ts';
import { getAccount, getPositions } from '@/alpaca/trading.ts';
import { generateScalpSignal } from '@/strategy/signals.ts';
import { calculateScalpModifiers } from '@/strategy/signal-modifiers.ts';
import {
  checkCooldown,
  checkDailyLossLimit,
  isPaused,
  canOpenScalp,
  checkScalpExit,
} from '@/engine/risk.ts';
import { executeScalpEntry, executeScalpExit } from '@/engine/executor.ts';
import { getState, saveState, updateState, addSignals, setEnrichment } from '@/state/store.ts';
import { SYMBOLS, SCALP, RISK } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';
import { fetchFearGreed } from '@/data-sources/fear-greed.ts';
import { fetchFundingRates, getFundingRate } from '@/data-sources/binance-funding.ts';
import { fetchAllNews, getHeadlinesForSymbol } from '@/data-sources/alpaca-news.ts';
import { extractAllVwaps } from '@/data-sources/vwap.ts';
import { isLlmAvailable } from '@/llm/client.ts';
import { analyzeSentiment } from '@/llm/sentiment.ts';
import { classifyRegime } from '@/llm/regime.ts';
import { calculateBollingerBands, calculateRSI } from '@/strategy/indicators.ts';
import type { Symbol } from '@/utils/config.ts';
import type { ScalpSignalSnapshot } from '@/state/store.ts';
import type { RegimeClassification, ExecutionContext } from '@/llm/types.ts';

let loopTimer: ReturnType<typeof setInterval> | null = null;

export const runOnce = async (): Promise<void> => {
  logger.info('--- Scalp tick ---');

  try {
    // Fetch core data in parallel
    const [account, positions, bars, quoteSnapshots] = await Promise.all([
      getAccount(),
      getPositions(),
      getCryptoBars(SYMBOLS),
      getQuoteSnapshots(SYMBOLS),
    ]);

    const equity = parseFloat(account.equity);
    logger.info(`Equity: $${equity.toFixed(2)}, Cash: $${account.cash}`);

    if (getState().initialCapital <= 0) {
      updateState((s) => {
        s.initialCapital = equity;
      });
    }

    // Fetch enrichment data in parallel (graceful failure, TTL-cached)
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

    // Extract VWAP from bars
    const vwaps = extractAllVwaps(Object.fromEntries(Object.entries(bars).map(([k, v]) => [k, v])));

    // Classify market regime (cached 30min)
    let regime: RegimeClassification | null = null;
    if (isLlmAvailable()) {
      const priceData: Record<string, { current: number; change24h: number }> = {};
      let totalRsi = 0;
      let totalBandwidth = 0;
      let symbolCount = 0;

      for (const symbol of SYMBOLS) {
        const symbolBars = bars[symbol];
        if (!symbolBars || symbolBars.length < SCALP.bbPeriod) continue;

        const closes = symbolBars.map((b) => b.c);
        const quote = quoteSnapshots[symbol];
        const currentPrice = quote?.midPrice ?? closes[closes.length - 1];
        const firstClose = closes[0];
        const change24h = firstClose > 0 ? ((currentPrice - firstClose) / firstClose) * 100 : 0;

        priceData[symbol] = { current: currentPrice, change24h };
        totalRsi += calculateRSI(closes, SCALP.rsiClassifyPeriod);
        totalBandwidth += calculateBollingerBands(
          closes,
          SCALP.bbPeriod,
          SCALP.bbMultiplier,
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

    const dailyLossHit = checkDailyLossLimit(equity);
    if (dailyLossHit) {
      logger.warn('Daily loss limit breached — pausing buys for 4 hours');
      updateState((s) => {
        s.pausedUntil = Date.now() + RISK.dailyLossPauseMs;
      });
    }

    const paused = isPaused();

    // === EXIT CHECK FIRST ===
    const openScalps = [...getState().openScalps];
    for (const scalp of openScalps) {
      const quote = quoteSnapshots[scalp.symbol];
      if (!quote) continue;

      const currentPrice = quote.midPrice;
      const symbolBars = bars[scalp.symbol];
      const vwap = vwaps[scalp.symbol]?.vwap ?? null;

      // Generate current signal to check for score reversal
      let currentScore = 0;
      if (symbolBars && symbolBars.length >= SCALP.emaSlow + 1) {
        const currentSignal = generateScalpSignal(scalp.symbol, symbolBars, quote, vwap);
        currentScore = currentSignal.score;
      }

      const exitCheck = checkScalpExit(scalp, currentPrice, currentScore);
      if (exitCheck) {
        const fundingRate = getFundingRate(fundingRates, scalp.symbol);
        const symbolSentiment = sentiments[scalp.symbol] ?? null;

        const ctx: ExecutionContext = {
          positionSizeMultiplier: 1,
          enrichment: {
            fearGreed: fearGreed?.value ?? null,
            sentiment: symbolSentiment,
            regime: regime?.regime ?? null,
            fundingRate,
          },
        };

        try {
          await executeScalpExit(scalp, currentPrice, exitCheck.reason, ctx);
        } catch (err) {
          logger.error(`Failed to exit scalp ${scalp.id} for ${scalp.symbol}`, {
            error: (err as Error).message,
          });
        }
      }
    }

    // === THEN ENTRY ===
    const signalSnapshots: ScalpSignalSnapshot[] = [];

    for (const symbol of SYMBOLS) {
      const symbolBars = bars[symbol];
      const quote = quoteSnapshots[symbol];
      if (!quote) continue;
      if (!symbolBars || symbolBars.length < SCALP.emaSlow + 1) {
        logger.warn(`Insufficient bars for ${symbol}: ${symbolBars?.length ?? 0}`);
        continue;
      }

      const vwap = vwaps[symbol]?.vwap ?? null;

      // Analyze sentiment for this symbol (cached 15min)
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
      const modifiers = calculateScalpModifiers({
        fearGreed: fearGreed?.value ?? null,
        fundingRate,
        sentiment: symbolSentiment,
        regime: regime?.regime ?? null,
        regimeConfidence: regime?.confidence ?? null,
      });

      const signal = generateScalpSignal(symbol, symbolBars, quote, vwap);

      signalSnapshots.push({
        symbol,
        direction: signal.direction,
        score: signal.score,
        price: signal.price,
        spread: signal.spread,
        timestamp: signal.timestamp,
      });

      const topIndicators = signal.indicators
        .sort((a, b) => Math.abs(b.weighted) - Math.abs(a.weighted))
        .slice(0, 3)
        .map((i) => `${i.name}=${i.raw.toFixed(2)}`)
        .join(', ');

      logger.info(
        `${symbol}: score=${signal.score.toFixed(3)} | dir=${signal.direction} | spread=$${signal.spread.toFixed(4)} | [${topIndicators}]`,
      );

      if (signal.direction === 'none') continue;

      if (paused) {
        logger.info(`Skipping entry for ${symbol} — bot paused`);
        continue;
      }

      if (checkCooldown(symbol)) {
        logger.debug(`Cooldown active for ${symbol}`);
        continue;
      }

      const capacity = canOpenScalp(symbol);
      if (!capacity.allowed) {
        logger.debug(`${symbol}: ${capacity.reason}`);
        continue;
      }

      const ctx: ExecutionContext = {
        positionSizeMultiplier: modifiers.positionSizeMultiplier,
        enrichment: {
          fearGreed: fearGreed?.value ?? null,
          sentiment: symbolSentiment,
          regime: regime?.regime ?? null,
          fundingRate,
        },
      };

      try {
        await executeScalpEntry(signal, equity, modifiers, ctx);
      } catch (err) {
        logger.error(`Failed to open scalp for ${symbol}`, {
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
    await saveState();
    logger.info('--- Scalp tick complete ---');
  } catch (err) {
    logger.error('Loop error', { error: (err as Error).message, stack: (err as Error).stack });
  }
};

export const startLoop = (): void => {
  logger.info(`Starting scalp loop (interval: ${SCALP.loopIntervalMs / 1000}s)`);
  runOnce();
  loopTimer = setInterval(runOnce, SCALP.loopIntervalMs);
};

export const stopLoop = (): void => {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    logger.info('Scalp loop stopped');
  }
};
