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
