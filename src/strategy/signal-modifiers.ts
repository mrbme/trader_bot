import { STRATEGY, RISK, MODIFIERS } from '@/utils/config.ts';
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

export const calculateModifiers = (input: ModifierInput): SignalModifiers => {
  let bbMultiplier = STRATEGY.bbMultiplier;
  let rsiBuyThreshold = STRATEGY.rsiBuyThreshold;
  let rsiSellThreshold = STRATEGY.rsiSellThreshold;
  let positionSizeMultiplier = 1.0;
  let trailingStopPct = RISK.trailingStopPct;

  const { fearGreed, fundingRate, sentiment, regime, regimeConfidence } = input;
  const fg = MODIFIERS.fearGreed;
  const fd = MODIFIERS.funding;
  const st = MODIFIERS.sentiment;
  const rg = MODIFIERS.regime;

  // Fear & Greed adjustments
  if (fearGreed !== null) {
    if (fearGreed < fg.extremeFearThreshold) {
      rsiBuyThreshold += fg.rsiBuyAdjust;
      bbMultiplier += fg.bbMultAdjustFear;
    } else if (fearGreed > fg.extremeGreedThreshold) {
      rsiBuyThreshold += fg.rsiBuyAdjustGreed;
      bbMultiplier += fg.bbMultAdjustGreed;
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
      positionSizeMultiplier -= Math.abs(sentiment) * st.bearishMultiplier;
    } else if (sentiment > st.positiveThreshold) {
      positionSizeMultiplier += sentiment * st.bullishMultiplier;
    }
  }

  // Regime adjustments (scaled by confidence)
  if (regime && regimeConfidence !== null && regimeConfidence > 0.3) {
    const scale = regimeConfidence;

    switch (regime) {
      case 'trending-up':
        trailingStopPct += rg.trendingUpStopAdjust * scale;
        break;
      case 'trending-down':
        trailingStopPct += rg.trendingDownStopAdjust * scale;
        positionSizeMultiplier += rg.trendingDownSizeAdjust * scale;
        break;
      case 'volatile-expansion':
        trailingStopPct += rg.volatileExpansionStopAdjust * scale;
        bbMultiplier += rg.volatileExpansionBbAdjust * scale;
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
    bbMultiplier: clamp(bbMultiplier, c.bbMultiplier.min, c.bbMultiplier.max),
    rsiBuyThreshold: clamp(rsiBuyThreshold, c.rsiBuy.min, c.rsiBuy.max),
    rsiSellThreshold: clamp(rsiSellThreshold, c.rsiSell.min, c.rsiSell.max),
    positionSizeMultiplier: clamp(
      positionSizeMultiplier,
      c.positionSizeMultiplier.min,
      c.positionSizeMultiplier.max,
    ),
    trailingStopPct: clamp(trailingStopPct, c.trailingStopPct.min, c.trailingStopPct.max),
  };
};
