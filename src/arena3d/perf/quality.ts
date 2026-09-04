export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings { dpr: [number, number]; shadows: boolean }

const QUALITY: Record<QualityTier, QualitySettings> = {
  low: { dpr: [0.75, 1], shadows: false },
  medium: { dpr: [1, 1.5], shadows: true },
  high: { dpr: [1, 2], shadows: true },
};

export const qualitySettings = (t: QualityTier) => QUALITY[t];
