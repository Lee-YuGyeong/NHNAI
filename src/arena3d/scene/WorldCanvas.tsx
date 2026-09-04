import { Suspense, type ReactNode } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import { qualitySettings, type QualityTier } from '../perf/quality';

/**
 * 프로젝트 표준 Canvas — 3D 는 전부 이 안에서.
 * 품질 티어가 dpr/그림자를 정하고, 나머지 Canvas 옵션(camera·gl·onCreated…)은 그대로 넘긴다.
 */
export function WorldCanvas({
  quality = 'high',
  children,
  ...rest
}: { quality?: QualityTier; children: ReactNode } & Omit<CanvasProps, 'children' | 'dpr' | 'shadows'>) {
  const q = qualitySettings(quality);
  return (
    <Canvas dpr={q.dpr} shadows={q.shadows} {...rest}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
