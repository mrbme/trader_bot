# Crypto Volatility Capture Bot

**Stack:** Bun · Alpaca Paper API · Render  
**Capital:** $1,000 · **Horizon:** 30 days  
**Strategy:** Bollinger Band Mean Reversion + RSI on high-volatility crypto

---

## 1. Strategy Overview

### Why Crypto Volatility?

Crypto trades 24/7 on Alpaca — no market hours, no PDT restrictions, and significantly higher volatility than equities. A $1,000 position in BTC can swing 3–8% in a single day, creating constant entry/exit opportunities that a bot can capture around the clock while you sleep.

The strategy: **buy fear, sell greed.** When a coin dumps below its lower Bollinger Band and RSI confirms oversold conditions, we buy the dip. When it rips above the upper band with overbought RSI, we trim. Over 30 days of 24/7 operation, even small 1–2% captures compound meaningfully.

### Target Universe

| Symbol     | Name      | Allocation | Why                                                |
| ---------- | --------- | ---------- | -------------------------------------------------- |
| `BTC/USD`  | Bitcoin   | 35% ($350) | Anchor asset, most liquid, reliable mean reversion |
| `ETH/USD`  | Ethereum  | 25% ($250) | Second most liquid, strong vol patterns            |
| `SOL/USD`  | Solana    | 15% ($150) | High beta, large swings = more signals             |
| `DOGE/USD` | Dogecoin  | 15% ($150) | Meme-driven volatility, frequent spikes/crashes    |
| `LINK/USD` | Chainlink | 10% ($100) | Mid-cap volatility, less correlated to BTC         |

### Signal Logic

**Entry (Buy) Signal — all must be true:**

- Price closes below the **lower Bollinger Band** (20-period SMA, 2 standard deviations)
- **RSI(14) < 30** (oversold)
- Position is below target weight (not already overweight)

**Exit (Sell/Trim) Signal — any triggers:**

- Price closes above the **upper Bollinger Band** AND **RSI(14) > 70** (overbought)
- Position exceeds **40% of portfolio** (risk cap)
- **Trailing stop:** 5% drawdown from local high triggers protective sell

**Rebalance Signal:**

- Every 6 hours, check if any position drifts >8% from target weight
- If so, trim overweight and add to underweight positions

### Risk Management Rules

- **Max single position:** 40% of portfolio value
- **Trailing stop loss:** 5% from position high-water mark
- **Min order size:** $10 notional (Alpaca minimum)
- **Cooldown:** 15-minute minimum between trades on same asset (avoid whipsaws)
- **Daily loss limit:** If portfolio drops 8% in 24 hours, pause all new buys for 4 hours

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Render.com                        │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          Bun Background Worker               │   │
│  │                                              │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │  Main    │  │ Strategy │  │  Trade     │  │   │
│  │  │  Loop    │→ │ Engine   │→ │  Executor  │  │   │
│  │  │ (5 min) │  │ (BB+RSI) │  │  (Orders)  │  │   │
│  │  └─────────┘  └──────────┘  └────────────┘  │   │
│  │       │                           │          │   │
│  │       ▼                           ▼          │   │
│  │  ┌─────────┐              ┌────────────┐     │   │
│  │  │  Data   │              │  State     │     │   │
│  │  │ Fetcher │              │ Manager    │     │   │
│  │  │(Bars/   │              │(JSON file) │     │   │
│  │  │ Quotes) │              └────────────┘     │   │
│  │  └─────────┘                                 │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          Bun Web Service (Elysia)            │   │
│  │                                              │   │
│  │  GET /              → Dashboard HTML         │   │
│  │  GET /api/status    → Account + positions    │   │
│  │  GET /api/trades    → Trade history log      │   │
│  │  GET /api/signals   → Current BB/RSI values  │   │
│  │  POST /api/pause    → Pause/resume bot       │   │
│  │  POST /api/liquidate → Emergency liquidate   │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
           │                        │
           ▼                        ▼
   ┌──────────────┐     ┌───────────────────┐
   │ Alpaca Data  │     │ Alpaca Trading    │
   │ API (v1beta3)│     │ API (v2)          │
   │              │     │                   │
   │ • Crypto bars│     │ • Place orders    │
   │ • Quotes     │     │ • Get positions   │
   │ • Snapshots  │     │ • Get account     │
   └──────────────┘     └───────────────────┘
```

### Two Render Services

1. **Background Worker** — The actual trading bot. Runs a loop every 5 minutes: fetches price data, computes indicators, generates signals, executes trades. No HTTP port needed.

2. **Web Service** — A lightweight Hono dashboard so you can monitor the bot from your phone. Shows portfolio value, open positions, recent signals, trade log, and has an emergency kill switch.

Both services share the same codebase and read from the same environment variables.

---

## 3. Project Structure

```
crypto-vol-bot/
├── src/
│   ├── index.ts              # Entry point — starts bot loop
│   ├── server.ts             # Hono web dashboard
│   ├── alpaca/
│   │   ├── client.ts         # Alpaca API wrapper (fetch-based)
│   │   ├── data.ts           # Market data fetcher (bars, quotes)
│   │   └── trading.ts        # Order placement, positions, account
│   ├── strategy/
│   │   ├── indicators.ts     # Bollinger Bands, RSI calculations
│   │   ├── signals.ts        # Signal generator (buy/sell/hold)
│   │   └── portfolio.ts      # Position sizing, rebalancing logic
│   ├── engine/
│   │   ├── loop.ts           # Main trading loop (5-min interval)
│   │   ├── executor.ts       # Signal → order execution
│   │   └── risk.ts           # Risk checks (stops, limits, cooldowns)
│   ├── state/
│   │   └── store.ts          # In-memory state + JSON persistence
│   └── utils/
│       ├── logger.ts         # Structured logging
│       └── config.ts         # Environment config + constants
├── public/
│   └── index.html            # Dashboard UI (vanilla HTML/JS)
├── package.json
├── tsconfig.json
├── render.yaml               # Render infrastructure-as-code
├── .env.example
└── README.md
```

---

## 4. Key Implementation Details

### 4a. Alpaca API Client (`src/alpaca/client.ts`)

All API calls go through a single wrapper using `fetch` (native in Bun, no dependencies needed).

```ts
// Base URLs
const PAPER_API = 'https://paper-api.alpaca.markets';
const DATA_API = 'https://data.alpaca.markets';

// Headers required on every request
const headers = {
  'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
  'Content-Type': 'application/json',
};
```

**Key endpoints used:**

| Purpose       | Method   | Endpoint                                                          |
| ------------- | -------- | ----------------------------------------------------------------- |
| Account info  | `GET`    | `/v2/account`                                                     |
| Positions     | `GET`    | `/v2/positions`                                                   |
| Place order   | `POST`   | `/v2/orders`                                                      |
| Cancel order  | `DELETE` | `/v2/orders/{id}`                                                 |
| Liquidate all | `DELETE` | `/v2/positions`                                                   |
| Crypto bars   | `GET`    | `/v1beta3/crypto/us/bars?symbols=BTC/USD&timeframe=5Min&limit=50` |
| Latest quotes | `GET`    | `/v1beta3/crypto/us/latest/quotes?symbols=BTC/USD,ETH/USD`        |
| Latest trades | `GET`    | `/v1beta3/crypto/us/latest/trades?symbols=BTC/USD`                |

**Crypto order format:**

```ts
// Alpaca crypto orders use notional (dollar amount) for fractional
await fetch(`${PAPER_API}/v2/orders`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    symbol: 'BTC/USD', // Slash format for crypto pairs
    notional: '175.00', // Dollar amount (fractional shares)
    side: 'buy',
    type: 'market',
    time_in_force: 'gtc', // Crypto supports: gtc, ioc
  }),
});
```

### 4b. Indicator Calculations (`src/strategy/indicators.ts`)

**Bollinger Bands** — computed from the last 20 bars of 1-hour candles:

```ts
function bollingerBands(closes: number[], period = 20, multiplier = 2) {
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((sum, val) => sum + (val - sma) ** 2, 0) / period);
  return {
    upper: sma + multiplier * stdDev,
    middle: sma,
    lower: sma - multiplier * stdDev,
    bandwidth: (sma + multiplier * stdDev - (sma - multiplier * stdDev)) / sma,
  };
}
```

**RSI (14-period)** — standard Wilder's smoothing:

```ts
function rsi(closes: number[], period = 14): number {
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0,
    avgLoss = 0;

  // Initial averages
  for (let i = 0; i < period; i++) {
    if (deltas[i] > 0) avgGain += deltas[i];
    else avgLoss += Math.abs(deltas[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining
  for (let i = period; i < deltas.length; i++) {
    const gain = deltas[i] > 0 ? deltas[i] : 0;
    const loss = deltas[i] < 0 ? Math.abs(deltas[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
```

### 4c. Main Trading Loop (`src/engine/loop.ts`)

Runs every 5 minutes. Here is the pseudocode:

```
every 5 minutes:
  1. Fetch 1-hour bars (last 24 bars) for all 5 symbols
  2. Compute Bollinger Bands + RSI for each
  3. Fetch current positions + account equity
  4. For each symbol:
     a. Check trailing stop — if hit, sell immediately
     b. Check daily loss limit — if breached, skip buys
     c. Check cooldown timer — if recent trade, skip
     d. Generate signal: BUY / SELL / HOLD
     e. If BUY: calculate position size, place market order
     f. If SELL: calculate trim size, place market order
  5. Every 6 hours: run full rebalance check
  6. Log all signals, trades, and portfolio state
  7. Persist state to JSON file
```

### 4d. State Persistence (`src/state/store.ts`)

Bun's `Bun.write()` and `Bun.file()` make file I/O trivial. State is stored as JSON and loaded on startup:

```ts
interface BotState {
  startedAt: string;
  initialCapital: number;
  highWaterMarks: Record<string, number>; // Per-symbol HWM for trailing stops
  lastTradeTime: Record<string, number>; // Cooldown tracking
  tradeLog: TradeEntry[]; // Full history
  dailyPnl: { date: string; pnl: number }[];
  paused: boolean;
}
```

On Render, use a **persistent disk** (mount at `/data`) so state survives deploys:

```yaml
# render.yaml
disk:
  name: bot-data
  mountPath: /data
  sizeGB: 1
```

### 4e. Dashboard (`src/server.ts`)

A minimal Elysia web server that serves a single-page dashboard and type-safe JSON API endpoints. Elysia is built specifically for Bun, so it takes advantage of Bun-native optimizations and provides end-to-end type safety across all routes.

```ts
import { Elysia, t } from 'elysia';
import { staticPlugin } from '@elysiajs/static';

const app = new Elysia()
  .use(staticPlugin({ prefix: '/public' }))

  .get('/', () => Bun.file('public/index.html'))

  .get(
    '/api/status',
    async () => {
      // Return: account equity, positions, current signals, bot state
    },
    {
      response: t.Object({
        equity: t.Number(),
        cash: t.Number(),
        positions: t.Array(
          t.Object({
            symbol: t.String(),
            qty: t.String(),
            marketValue: t.Number(),
            unrealizedPl: t.Number(),
          }),
        ),
        signals: t.Record(
          t.String(),
          t.Object({
            rsi: t.Number(),
            bbPosition: t.String(),
            action: t.String(),
          }),
        ),
        paused: t.Boolean(),
      }),
    },
  )

  .get('/api/trades', () => {
    // Return: last 100 trade log entries
  })

  .post('/api/pause', () => {
    // Toggle bot paused state
  })

  .post('/api/liquidate', async () => {
    // DELETE /v2/positions — emergency kill switch
  })

  .listen(process.env.PORT || 3000);

console.log(`Dashboard running at ${app.server?.url}`);
```

---

## 5. Render Deployment

### `render.yaml`

```yaml
services:
  # Web dashboard
  - type: web
    name: crypto-bot-dashboard
    runtime: bun
    buildCommand: bun install
    startCommand: bun run src/server.ts
    envVars:
      - key: ALPACA_KEY_ID
        sync: false
      - key: ALPACA_SECRET_KEY
        sync: false
    plan: starter

  # Background trading bot
  - type: worker
    name: crypto-bot-worker
    runtime: bun
    buildCommand: bun install
    startCommand: bun run src/index.ts
    envVars:
      - key: ALPACA_KEY_ID
        sync: false
      - key: ALPACA_SECRET_KEY
        sync: false
    disk:
      name: bot-data
      mountPath: /data
      sizeGB: 1
    plan: starter
```

### Environment Variables

```bash
ALPACA_KEY_ID=your_paper_api_key
ALPACA_SECRET_KEY=your_paper_secret_key
BOT_MODE=paper                    # paper | live (safety guard)
LOG_LEVEL=info                    # debug | info | warn | error
DASHBOARD_PASSWORD=changeme       # Basic auth for dashboard
```

### Deploy Steps

1. Push repo to GitHub
2. In Render dashboard → **New** → **Blueprint** → connect repo → select `render.yaml`
3. Fill in environment variables (Alpaca paper keys)
4. Deploy — both services spin up automatically
5. Dashboard is live at `https://crypto-bot-dashboard.onrender.com`

---

## 6. `package.json`

```json
{
  "name": "crypto-vol-bot",
  "version": "1.0.0",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "dev:server": "bun run --watch src/server.ts",
    "start": "bun run src/index.ts",
    "start:server": "bun run src/server.ts"
  },
  "dependencies": {
    "elysia": "^1.2.0",
    "@elysiajs/static": "^1.2.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Notably minimal — Bun has native `fetch`, `WebSocket`, file I/O, and TypeScript support. Elysia is the only runtime dependency (for the dashboard API with end-to-end type safety). No Alpaca SDK needed; we use raw `fetch` against the REST API for full control.

---

## 7. 30-Day Timeline

| Day       | Milestone                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| **1**     | Set up repo, Alpaca paper account, environment. Build `client.ts` and verify API connectivity.             |
| **2**     | Build data fetcher — confirm bars and quotes return correctly for all 5 symbols.                           |
| **3**     | Implement Bollinger Bands + RSI indicator functions. Write unit tests with known data.                     |
| **4**     | Build signal generator. Backtest against last 30 days of historical bars (fetch via API).                  |
| **5**     | Build trade executor and risk manager (stops, cooldowns, position limits).                                 |
| **6**     | Wire up main loop. Run locally with `bun run --watch` overnight as a dry run (log signals, don't execute). |
| **7**     | Deploy to Render. Fund paper account. **Go live with the bot.**                                            |
| **8–14**  | Monitor daily. Tune BB period (try 15 vs 20 vs 25) and RSI thresholds based on signal quality.             |
| **15**    | Mid-point review. Analyze win rate, average gain/loss, max drawdown. Adjust if needed.                     |
| **16–28** | Let it run. Check dashboard daily. Intervene only if daily loss limit triggers.                            |
| **29**    | Begin winding down. Set bot to "close-only" mode (no new buys, only exits).                                |
| **30**    | Liquidate all positions. Export full trade log. Calculate final P&L and write post-mortem.                 |

---

## 8. Expected Performance Scenarios

These are rough expectations based on typical crypto volatility, **not guarantees:**

| Scenario            | 30-Day Return               | Notes                                                     |
| ------------------- | --------------------------- | --------------------------------------------------------- |
| **Bull**            | +8% to +15% ($80–$150)      | Frequent dip-buy signals that recover quickly             |
| **Sideways/Choppy** | +2% to +6% ($20–$60)        | Mean reversion thrives here — lots of band touches        |
| **Bear**            | -5% to -12% ($50–$120 loss) | Trailing stops limit damage, but sustained drops hurt     |
| **Black Swan**      | -15% to -25%                | Flash crash overwhelms stops; daily loss limit pauses bot |

The strategy is optimized for **sideways/choppy** markets where price oscillates within a range. That's where Bollinger Band mean reversion historically performs best.

---

## 9. Monitoring Checklist

Daily checks via the dashboard:

- [ ] Bot is running (last heartbeat < 10 min ago)
- [ ] No positions above 40% weight cap
- [ ] No trailing stops triggered (or handled correctly)
- [ ] RSI and BB values look reasonable (no stale data)
- [ ] Equity curve trending in the right direction
- [ ] Trade log shows expected signal frequency (roughly 2–6 trades/day across 5 assets)

---

## 10. Key Risks & Mitigations

| Risk                          | Mitigation                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Flash crash wipes out capital | 5% trailing stops + 8% daily loss pause                                                      |
| API rate limiting             | 5-minute loop interval stays well within Alpaca's 200 req/min limit                          |
| Stale data / API downtime     | Health check pings; skip cycle if data is >10 min old                                        |
| Render worker restarts        | State persisted to disk; bot resumes from last known state                                   |
| Whipsaw (false signals)       | 15-min cooldown between trades; RSI confirmation required alongside BB                       |
| Over-concentration            | 40% max position cap; 6-hour rebalance check                                                 |
| Paper ≠ live performance      | Paper trading doesn't simulate slippage or real liquidity; treat results as directional only |
