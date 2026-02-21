import { RISK, SCALP } from '@/utils/config.ts';

export const calculateScalpSize = (
  equity: number,
  score: number,
  sizeMultiplier: number,
): number => {
  // Score-proportional sizing: higher score = larger position
  // Base: score / entryThreshold ratio, capped at 1.0
  const scoreRatio = Math.min(score / SCALP.entryThreshold, 2.0);
  const basePct = RISK.maxEquityPerScalp * (scoreRatio / 2.0);

  let notional = equity * basePct * sizeMultiplier;

  // Cap at max equity per scalp
  const maxNotional = equity * RISK.maxEquityPerScalp;
  notional = Math.min(notional, maxNotional);

  if (notional < RISK.minOrderNotional) return 0;

  return notional;
};
