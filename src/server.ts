import { Elysia } from 'elysia';
import { getAccount, getPositions } from '@/alpaca/trading.ts';
import { liquidateAll as alpacaLiquidateAll } from '@/alpaca/trading.ts';
import { getState, updateState, saveState } from '@/state/store.ts';
import { logger } from '@/utils/logger.ts';
import config from '@/utils/config.ts';

export const createServer = () => {
  const app = new Elysia()
    .get('/', () => Bun.file('public/index.html'))

    .get('/api/status', async () => {
      try {
        const [account, positions] = await Promise.all([getAccount(), getPositions()]);

        const state = getState();

        return {
          equity: parseFloat(account.equity),
          cash: parseFloat(account.cash),
          positions: positions.map((p) => ({
            symbol: p.symbol,
            qty: p.qty,
            marketValue: parseFloat(p.market_value),
            unrealizedPl: parseFloat(p.unrealized_pl),
          })),
          signals: state.signals,
          paused: state.paused || (state.pausedUntil !== null && Date.now() < state.pausedUntil),
        };
      } catch (err) {
        logger.error('Status endpoint error', { error: (err as Error).message });
        return {
          equity: 0,
          cash: 0,
          positions: [],
          signals: [],
          paused: false,
          error: (err as Error).message,
        };
      }
    })

    .get('/api/trades', () => {
      const state = getState();
      return { trades: state.tradeLog.slice(-100) };
    })

    .get('/api/signals', () => {
      const state = getState();
      return { signals: state.signals };
    })

    .post('/api/pause', async () => {
      const state = getState();
      updateState((s) => {
        s.paused = !s.paused;
        if (!s.paused) s.pausedUntil = null;
      });
      await saveState();
      const nowPaused = getState().paused;
      logger.info(`Bot ${nowPaused ? 'paused' : 'resumed'} via dashboard`);
      return { paused: nowPaused };
    })

    .post('/api/liquidate', async () => {
      try {
        await alpacaLiquidateAll();
        logger.warn('Emergency liquidation triggered via dashboard');
        updateState((s) => {
          s.paused = true;
        });
        await saveState();
        return { message: 'Liquidation submitted — all positions will be closed' };
      } catch (err) {
        logger.error('Liquidation failed', { error: (err as Error).message });
        return { message: `Liquidation failed: ${(err as Error).message}` };
      }
    })

    .listen(config.port);

  logger.info(`Dashboard running at http://localhost:${config.port}`);
  return app;
};
