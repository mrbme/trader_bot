import { Elysia } from 'elysia';
import { getAccount, getPositions } from '@/alpaca/trading.ts';
import { liquidateAll as alpacaLiquidateAll } from '@/alpaca/trading.ts';
import { getState, updateState, saveState } from '@/state/store.ts';
import { logger } from '@/utils/logger.ts';
import config from '@/utils/config.ts';

const SESSION_COOKIE = 'bot_session';
const sessions = new Set<string>();

const generateToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const parseCookies = (header: string | null): Record<string, string> => {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
};

const isAuthenticated = (request: Request): boolean => {
  if (!config.dashboardPassword) return true;
  const cookies = parseCookies(request.headers.get('cookie'));
  return sessions.has(cookies[SESSION_COOKIE] ?? '');
};

export const createServer = () => {
  const app = new Elysia()
    .get('/login', () => Bun.file('public/login.html'))

    .post('/auth/login', ({ body, set }) => {
      const { password } = body as { password: string };
      if (!config.dashboardPassword || password === config.dashboardPassword) {
        const token = generateToken();
        sessions.add(token);
        set.headers['set-cookie'] =
          `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`;
        return { ok: true };
      }
      set.status = 401;
      return { ok: false };
    })

    .post('/auth/logout', ({ set }) => {
      set.headers['set-cookie'] =
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
      return { ok: true };
    })

    .onBeforeHandle(({ request, set, path }) => {
      if (path === '/login' || path.startsWith('/auth/')) return;
      if (!isAuthenticated(request)) {
        set.status = 302;
        set.headers['location'] = '/login';
        return 'Redirecting to login';
      }
    })

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

    .get('/api/enrichment', () => {
      const state = getState();
      return { enrichment: state.lastEnrichment };
    })

    .get('/api/journal', ({ query }) => {
      const state = getState();
      const limit = parseInt((query as Record<string, string>).limit ?? '50', 10);
      const clamped = Math.max(1, Math.min(200, limit));
      return { entries: state.journalEntries.slice(-clamped) };
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
