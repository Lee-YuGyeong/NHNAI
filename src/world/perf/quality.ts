export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings { dpr: [number, number]; shadows: boolean }

const QUALITY: Record<QualityTier, QualitySettings> = {
  low: { dpr: [0.75, 1], shadows: false },
  medium: { dpr: [1, 1.5], shadows: true },
  /** 상한 2 는 레티나에서 픽셀 4배 — 조명 많은 씬에선 이게 프레임의 절반을 먹는다 */
  high: { dpr: [1, 1.5], shadows: true },
};

export const qualitySettings = (t: QualityTier) => QUALITY[t];
