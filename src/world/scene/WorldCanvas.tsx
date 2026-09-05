import { Suspense, type ReactNode } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import { qualitySettings, type QualityTier } from '../perf/quality';

/**
 * 프로젝트 표준 Canvas — 3D 는 전부 이 안에서.
 * 품질 티어가 dpr/그림자를 정하고, 나머지 Canvas 옵션(camera·gl·onCreated…)은 그대로 넘긴다.
 *
 * `dpr` 하나만 밖에서 덮어쓸 수 있다 — **화면이 스스로 해상도를 고르는 경우**를 위해서다
 * (HallScene 의 AdaptiveResolution). 그 화면은 프레임을 보고 dpr 을 올렸다 내렸다 하는데, 그동안 티어의
 * 범위([1, 1.5])가 여기 그대로 걸려 있으면 **R3F 가 렌더마다 그 값으로 되돌린다** — configure 가
 * `viewport.dpr !== calculateDpr(dpr)` 이면 setDpr 을 부르고, 그 한 번이 setSize 로 이어져 그리기 버퍼를
 * 통째로 다시 만든다. 고른 쪽과 걸린 쪽이 서로 다른 값을 우기니 렌더마다 그 일이 벌어졌다
 * (2026-09-05 측정: CPU 의 6~21%가 setSize, 300~680ms 짜리 긴 프레임의 원인). 고른 값을 여기로 올려
 * 보내면 둘이 같은 값을 말하게 되고, 되돌리기가 없어진다.
 */
export function WorldCanvas({
  quality = 'high',
  dpr,
  children,
  ...rest
}: { quality?: QualityTier; dpr?: number; children: ReactNode } & Omit<CanvasProps, 'children' | 'dpr' | 'shadows'>) {
  const q = qualitySettings(quality);
  return (
    <Canvas dpr={dpr ?? q.dpr} shadows={q.shadows} {...rest}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
