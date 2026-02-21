export type BollingerBands = {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
};

export const calculateBollingerBands = (
  closes: number[],
  period = 20,
  multiplier = 2,
): BollingerBands => {
  const slice = closes.slice(-period);
  if (slice.length < period) {
    return { upper: 0, middle: 0, lower: 0, bandwidth: 0 };
  }

  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((sum, val) => sum + (val - sma) ** 2, 0) / period);

  const upper = sma + multiplier * stdDev;
  const lower = sma - multiplier * stdDev;

  return {
    upper,
    middle: sma,
    lower,
    bandwidth: sma > 0 ? (upper - lower) / sma : 0,
  };
};

export const calculateRSI = (closes: number[], period = 14): number => {
  if (closes.length < period + 1) return 50;

  const deltas = closes.slice(1).map((c, i) => c - closes[i]);

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (deltas[i] > 0) avgGain += deltas[i];
    else avgLoss += Math.abs(deltas[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < deltas.length; i++) {
    const gain = deltas[i] > 0 ? deltas[i] : 0;
    const loss = deltas[i] < 0 ? Math.abs(deltas[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

export const calculateEMA = (values: number[], period: number): number[] => {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
};

export const calculateEMACrossScore = (
  closes: number[],
  fastPeriod: number,
  slowPeriod: number,
): number => {
  if (closes.length < slowPeriod + 1) return 0;

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const currentFast = emaFast[emaFast.length - 1];
  const currentSlow = emaSlow[emaSlow.length - 1];
  const prevFast = emaFast[emaFast.length - 2];
  const prevSlow = emaSlow[emaSlow.length - 2];

  if (currentSlow === 0) return 0;

  const gap = (currentFast - currentSlow) / currentSlow;
  const prevGap = (prevFast - prevSlow) / prevSlow;

  // Fresh crossover gets full score, existing trend gets partial
  if (gap > 0 && prevGap <= 0) return 1;
  if (gap < 0 && prevGap >= 0) return -1;
  if (gap > 0) return Math.min(gap * 100, 1) * 0.7;
  if (gap < 0) return Math.max(gap * 100, -1) * 0.7;
  return 0;
};

export const calculateROC = (closes: number[], period: number): number => {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (past === 0) return 0;
  return (current - past) / past;
};

export const calculateROCScore = (closes: number[], period: number): number => {
  const roc = calculateROC(closes, period);
  // Normalize: ±0.5% maps to ±1
  return Math.max(-1, Math.min(1, roc / 0.005));
};

export const calculateVolumeSpike = (
  volumes: number[],
  avgPeriod: number,
  spikeMultiplier: number,
): { spike: boolean; ratio: number } => {
  if (volumes.length < avgPeriod + 1) return { spike: false, ratio: 1 };

  const avgSlice = volumes.slice(-(avgPeriod + 1), -1);
  const avg = avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length;
  const current = volumes[volumes.length - 1];

  if (avg === 0) return { spike: false, ratio: 1 };

  const ratio = current / avg;
  return { spike: ratio >= spikeMultiplier, ratio };
};

export const calculateVolumeSpikeScore = (
  volumes: number[],
  closes: number[],
  avgPeriod: number,
  spikeMultiplier: number,
): number => {
  const { spike, ratio } = calculateVolumeSpike(volumes, avgPeriod, spikeMultiplier);
  if (!spike) return 0;

  // Determine price direction of latest bar
  if (closes.length < 2) return 0;
  const priceChange = closes[closes.length - 1] - closes[closes.length - 2];

  const intensity = Math.min((ratio - 1) / (spikeMultiplier - 1), 1);

  if (priceChange > 0) return intensity;
  if (priceChange < 0) return -intensity;
  return 0;
};

export const calculateVWAPDeviationScore = (currentPrice: number, vwap: number | null): number => {
  if (!vwap || vwap === 0) return 0;

  const deviation = (currentPrice - vwap) / vwap;
  // Below VWAP = bullish (mean reversion buy), above = bearish
  // ±0.3% maps to ±1
  return Math.max(-1, Math.min(1, -deviation / 0.003));
};

export const calculateRSIScore = (rsi: number): number => {
  // RSI < 30: oversold -> bullish (mean reversion)
  // RSI > 70: overbought -> bearish
  // 30-70: neutral zone, linear interpolation
  if (rsi <= 30) return Math.min(1, (30 - rsi) / 15);
  if (rsi >= 70) return Math.max(-1, -(rsi - 70) / 15);
  return 0;
};

export const calculateSpreadScore = (spread: number, midPrice: number): number => {
  if (midPrice === 0) return 0;
  const spreadPct = spread / midPrice;
  // Tight spread (< 0.01%) -> +1, wide spread (> 0.05%) -> -1
  if (spreadPct <= 0.0001) return 1;
  if (spreadPct >= 0.0005) return -1;
  // Linear interpolation between thresholds
  return 1 - ((spreadPct - 0.0001) / (0.0005 - 0.0001)) * 2;
};
