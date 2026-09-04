/**
 * 그림 한 장 — 벽에서 조금 띄운 판. 크레용 그림 자체는 본판의 scrawl.ts 가 캔버스에 그린다 (읽기만 한다).
 *
 * 어두운 복도라 발광 재질이되 알파로 눌러 분필 자국처럼 남긴다 — 본판 Chapter1Scene 의 그것과 같은 규칙이다.
 * 같은 손이 그린 것으로 보여야 하므로 값을 새로 정하지 않았다.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { SCRAWL_ASPECT, scrawlTexture, type ScrawlKind } from '@/features/world/scrawl';

export const drawHeight = (w: number) => w / SCRAWL_ASPECT;

/**
 * 그림 위에 다시 그은 금 — memorial 의 「세어 둔 수」. 그림 안의 열다섯은 텍스처에 구워져 있어 늘지 않으므로,
 * 늘어나는 수는 그림 위쪽에 판으로 긋는다: 복도 열다섯 → 기록 복도 열여섯, 작업 구역 벽은 소각로가 끝나면 열여섯.
 * 마지막 금만 기울기가 다르다 — 다른 손이 나중에 그은 것이라는 뜻이다
 */
const TICK_MAT = new THREE.MeshBasicMaterial({ color: '#e8eef8', toneMapped: false, transparent: true, opacity: 0.8 });
const TICK = { w: 0.022, h: 0.26, gap: 0.12, lift: 0.01 } as const;

export interface Drawing {
  kind: ScrawlKind;
  /** +1 = 오른쪽 벽, −1 = 왼쪽 벽 */
  side: 1 | -1;
  z: number;
  y: number;
  w: number;
  tilt?: number;
  /** 이 판 하나만 색이 다르다 — 지난달 요원이 남긴 것 */
  warm?: boolean;
}

export function Scrawl({
  d,
  seed,
  wallX,
  lift = 0.045,
  ticks,
}: {
  d: Drawing;
  seed: number;
  wallX: number;
  lift?: number;
  /** 그림 위에 그은 금의 수 — 안 주면 안 긋는다 (텍스처의 열다섯만) */
  ticks?: number;
}) {
  const mat = useMemo(() => {
    const tex = scrawlTexture(d.kind, seed);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: d.warm ? 0.95 : 0.85,
      // 지난달의 요원이 그린 한 장 — 개체들은 그것도 자기들 것인 줄 안다. 알아보는 것은 플레이어뿐이다
      color: d.warm ? new THREE.Color('#ffd7a8') : new THREE.Color('#ffffff'),
      toneMapped: false,
      depthWrite: false,
    });
  }, [d, seed]);

  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );

  const rotY = d.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const n = ticks ?? 0;
  // 금은 그림 위 한 뼘 — 그림 폭 안에 들게 간격을 좁힌다. 벽을 따라 도는 방향이 z 라 z 로 늘어놓는다
  const gap = Math.min(TICK.gap, d.w * 0.06);
  const tickY = d.y + drawHeight(d.w) / 2 + TICK.h / 2 + TICK.gap;
  const tickZ0 = d.z - ((n - 1) * gap) / 2;

  return (
    <group>
      <mesh position={[d.side * (wallX - lift), d.y, d.z]} rotation={[0, rotY, d.tilt ?? 0]} material={mat} renderOrder={5}>
        <planeGeometry args={[d.w, drawHeight(d.w)]} />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh
          key={i}
          position={[d.side * (wallX - lift - TICK.lift), tickY, tickZ0 + i * gap]}
          rotation={[0, rotY, i === n - 1 && n > 15 ? 0.16 : 0.02]}
          material={TICK_MAT}
          renderOrder={6}
        >
          <planeGeometry args={[TICK.w, TICK.h]} />
        </mesh>
      ))}
    </group>
  );
}
