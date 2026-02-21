import { SCALP, MODIFIERS } from '@/utils/config.ts';
import type { SignalModifiers, MarketRegime } from '@/llm/types.ts';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export type ModifierInput = {
  fearGreed: number | null;
  fundingRate: number | null;
  sentiment: number | null;
  regime: MarketRegime | null;
  regimeConfidence: number | null;
};

export const calculateScalpModifiers = (input: ModifierInput): SignalModifiers => {
  let positionSizeMultiplier = 1.0;
  let takeProfitPct = SCALP.takeProfitPct;
  let stopLossPct = SCALP.stopLossPct;

  const { fearGreed, fundingRate, sentiment, regime, regimeConfidence } = input;
  const fg = MODIFIERS.fearGreed;
  const fd = MODIFIERS.funding;
  const st = MODIFIERS.sentiment;
  const rg = MODIFIERS.regime;

  // Fear & Greed adjustments
  if (fearGreed !== null) {
    if (fearGreed < fg.extremeFearThreshold) {
      positionSizeMultiplier += fg.sizeBoostFear;
      takeProfitPct += fg.tpBoostFear;
    } else if (fearGreed > fg.extremeGreedThreshold) {
      positionSizeMultiplier += fg.sizeReduceGreed;
      stopLossPct += fg.slTightenGreed;
    }
  }

  // Funding rate adjustments
  if (fundingRate !== null) {
    if (fundingRate < fd.negativeThreshold) {
      positionSizeMultiplier += fd.sizeBullishAdjust;
    } else if (fundingRate > fd.positiveThreshold) {
      positionSizeMultiplier += fd.sizeBearishAdjust;
    }
  }

  // Sentiment adjustments
  if (sentiment !== null) {
    if (sentiment < st.negativeThreshold) {
      positionSizeMultiplier += st.bearishSizeAdjust;
    } else if (sentiment > st.positiveThreshold) {
      positionSizeMultiplier += st.bullishSizeAdjust;
    }
  }

  // Regime adjustments (scaled by confidence)
  if (regime && regimeConfidence !== null && regimeConfidence > 0.3) {
    const scale = regimeConfidence;

    switch (regime) {
      case 'trending-up':
        positionSizeMultiplier += rg.trendingUpSizeAdjust * scale;
        takeProfitPct += rg.trendingUpTpAdjust * scale;
        break;
      case 'trending-down':
        positionSizeMultiplier += rg.trendingDownSizeAdjust * scale;
        stopLossPct += rg.trendingDownSlAdjust * scale;
        break;
      case 'volatile-expansion':
        stopLossPct += rg.volatileExpansionSlAdjust * scale;
        break;
      case 'volatile-compression':
        positionSizeMultiplier += rg.volatileCompressionSizeAdjust * scale;
        break;
      // range-bound: no adjustments
    }
  }

  // Clamp all values
  const c = MODIFIERS.clamps;
  return {
    positionSizeMultiplier: clamp(
      positionSizeMultiplier,
      c.positionSizeMultiplier.min,
      c.positionSizeMultiplier.max,
    ),
    takeProfitPct: clamp(takeProfitPct, c.takeProfitPct.min, c.takeProfitPct.max),
    stopLossPct: clamp(stopLossPct, c.stopLossPct.min, c.stopLossPct.max),
  };
};
