/**
 * 심문소 홀 바닥에 까는 정지선 트랙 — 레인 · 출발선 · 목표 정지선 · 트랙 끝, 그리고 GLB 소품 둘
 * (레인마다 목표선 게이트, 출발선 비콘 — tools/trial-parts.json). 마찰계수는 여기 어디에도 없다:
 * 20초 구간에 따라 **트랙 표면의 재질**만 바뀐다(콘크리트 · 빙판 · 고무) — 사용자 스펙 "바닥 텍스처로만 암시".
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { Parts } from '@/world/map/parts';
import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { END_Z, LANES, LANE_GAP, START_Z, TARGET_Z, laneX } from './track';

const TRACK_HALF_W = (LANES * LANE_GAP) / 2;
const TRACK_LEN = START_Z - END_Z;
const TRACK_MID_Z = (START_Z + END_Z) / 2;

/** 구간별 표면 — 콘크리트 · 빙판 · 고무. 숫자(마찰계수)는 없다, 결만 다르다 */
const SURFACES = [
  { color: '#6f6a62', roughness: 0.95, metalness: 0.05, opacity: 0.55 },
  { color: '#9fc7e6', roughness: 0.08, metalness: 0.35, opacity: 0.6 },
  { color: '#1d1a17', roughness: 1.0, metalness: 0.0, opacity: 0.85 },
] as const;

const GATE_FIT: Fit = { y: 2.4 };
/** 게이트의 긴 축(빔)은 모델의 z — 레인(z 방향)을 가로지르려면 π/2 돌린다 */
const GATE_ITEMS: InstanceItem[] = Array.from({ length: LANES }, (_, lane) => ({ position: [laneX(lane), 0, TARGET_Z], rotationY: Math.PI / 2 }));

const BEACON_FIT: Fit = { y: 0.75 };
const BEACON_ITEMS: InstanceItem[] = Array.from({ length: LANES }, (_, lane) => ({ position: [laneX(lane) - LANE_GAP / 2 + 0.25, 0, START_Z + 0.5] }));

const LINE_MAT = new THREE.MeshBasicMaterial({ color: '#e8ddcd' });
const TARGET_MAT = new THREE.MeshBasicMaterial({ color: '#ff3320' });
const LANE_MAT = new THREE.MeshBasicMaterial({ color: '#9db4d8', transparent: true, opacity: 0.35 });

export function TrackDressing({ phase }: { phase: number }) {
  const surface = SURFACES[(phase - 1 + SURFACES.length) % SURFACES.length];
  const surfaceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: surface.color,
        roughness: surface.roughness,
        metalness: surface.metalness,
        transparent: true,
        opacity: surface.opacity,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [surface],
  );

  return (
    <group>
      {/* 트랙 표면 — 구간마다 결이 바뀐다 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, TRACK_MID_Z]} material={surfaceMat} receiveShadow>
        <planeGeometry args={[TRACK_HALF_W * 2, TRACK_LEN]} />
      </mesh>

      {/* 레인 경계선 */}
      {Array.from({ length: LANES + 1 }, (_, i) => (
        <mesh key={i} position={[laneX(0) - LANE_GAP / 2 + i * LANE_GAP, 0.02, TRACK_MID_Z]} material={LANE_MAT}>
          <boxGeometry args={[0.05, 0.005, TRACK_LEN]} />
        </mesh>
      ))}

      {/* 출발선 · 목표 정지선 · 트랙 끝 */}
      <mesh position={[0, 0.025, START_Z]} material={LINE_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.12]} />
      </mesh>
      <mesh position={[0, 0.025, TARGET_Z]} material={TARGET_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.18]} />
      </mesh>
      <mesh position={[0, 0.025, END_Z + 0.1]} material={LANE_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.08]} />
      </mesh>

      {/* 목표선 위 붉은 빛 — 게이트의 LED 띠가 바닥에 비치는 느낌 */}
      <pointLight position={[0, 2.2, TARGET_Z]} color="#ff5a3c" intensity={18} distance={9} decay={2} />
      {/* 출발선 조명 — 홀의 링 조명은 무대에만 떨어져서 출발선이 어둡다 */}
      <pointLight position={[0, 4.5, START_Z - 1]} color="#dfe9ff" intensity={30} distance={14} decay={2} />

      <Parts id="trial_gate" fit={GATE_FIT} items={GATE_ITEMS} />
      <Parts id="trial_beacon" fit={BEACON_FIT} items={BEACON_ITEMS} />
    </group>
  );
}
