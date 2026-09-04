/**
 * 심문소 홀 바닥에 까는 정지선 트랙 — features/trial 의 TrackDressing 과 같은 그림이지만 레인 수가 좌석 수(LANES=9)다.
 * 마찰계수는 여기 어디에도 없다: 회차에 따라 **트랙 표면의 결**만 바뀐다 (콘크리트 · 빙판 · 고무) — 숫자는 없다 (P8).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { Parts } from '@/world/map/parts';
import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { END_Z, LANES, LANE_GAP, START_Z, TARGET_Z, laneX } from './track';

const TRACK_HALF_W = (LANES * LANE_GAP) / 2;
const TRACK_LEN = START_Z - END_Z;
const TRACK_MID_Z = (START_Z + END_Z) / 2;

const SURFACES = [
  { color: '#6f6a62', roughness: 0.95, metalness: 0.05, opacity: 0.55 },
  { color: '#9fc7e6', roughness: 0.08, metalness: 0.35, opacity: 0.6 },
  { color: '#1d1a17', roughness: 1.0, metalness: 0.0, opacity: 0.85 },
] as const;

const GATE_FIT: Fit = { y: 2.4 };
const GATE_ITEMS: InstanceItem[] = Array.from({ length: LANES }, (_, lane) => ({ position: [laneX(lane), 0, TARGET_Z], rotationY: Math.PI / 2 }));
const BEACON_FIT: Fit = { y: 0.75 };
const BEACON_ITEMS: InstanceItem[] = Array.from({ length: LANES }, (_, lane) => ({ position: [laneX(lane) - LANE_GAP / 2 + 0.25, 0, START_Z + 0.5] }));

const LINE_MAT = new THREE.MeshBasicMaterial({ color: '#e8ddcd' });
const TARGET_MAT = new THREE.MeshBasicMaterial({ color: '#ff3320' });
const LANE_MAT = new THREE.MeshBasicMaterial({ color: '#9db4d8', transparent: true, opacity: 0.35 });

export function TrackDressing({ round }: { round: number }) {
  const surface = SURFACES[(round - 1 + SURFACES.length) % SURFACES.length];
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
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, TRACK_MID_Z]} material={surfaceMat} receiveShadow>
        <planeGeometry args={[TRACK_HALF_W * 2, TRACK_LEN]} />
      </mesh>
      {Array.from({ length: LANES + 1 }, (_, i) => (
        <mesh key={i} position={[laneX(0) - LANE_GAP / 2 + i * LANE_GAP, 0.02, TRACK_MID_Z]} material={LANE_MAT}>
          <boxGeometry args={[0.05, 0.005, TRACK_LEN]} />
        </mesh>
      ))}
      <mesh position={[0, 0.025, START_Z]} material={LINE_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.12]} />
      </mesh>
      <mesh position={[0, 0.025, TARGET_Z]} material={TARGET_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.18]} />
      </mesh>
      <mesh position={[0, 0.025, END_Z + 0.1]} material={LANE_MAT}>
        <boxGeometry args={[TRACK_HALF_W * 2, 0.006, 0.08]} />
      </mesh>
      <pointLight position={[0, 2.2, TARGET_Z]} color="#ff5a3c" intensity={18} distance={9} decay={2} />
      <pointLight position={[0, 4.5, START_Z - 1]} color="#dfe9ff" intensity={30} distance={14} decay={2} />
      <Parts id="trial_gate" fit={GATE_FIT} items={GATE_ITEMS} />
      <Parts id="trial_beacon" fit={BEACON_FIT} items={BEACON_ITEMS} />
    </group>
  );
}
