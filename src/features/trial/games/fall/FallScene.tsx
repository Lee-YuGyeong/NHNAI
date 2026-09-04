/**
 * 낙하 생존 — 심문소 홀 가운데 마당에서 천장(트러스 아래)에서 떨어지는 공들(무게가 다르다)을 피한다.
 * StopLineScene 과 같은 재료(맵 · 조명 · 후처리 · Remotes) 위에 다리(DodgeRig)와 공(FallingBalls)만 바꿔 끼운다.
 * 물체는 서버 스냅샷대로만 떨어진다 — 중력값은 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import { GlbInstances, type Fit, type InstanceItem } from '@/world/map/corridor/part';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT, FALL_ARENA, FALL_SPAWN_Y } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { AdaptiveFov, Exposure, MouseLook, Remotes } from '@/world/scene/WorldScene';
import { SelfAvatar } from '../common/SelfAvatar';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { DODGE_SPAWN, DodgeRig } from './DodgeRig';
import { DodgerAvatar } from './DodgerAvatar';
import { FallingBalls } from './FallingBalls';

const def = MAPS.interrogation;
const ARENA_W = FALL_ARENA.maxX - FALL_ARENA.minX;
const ARENA_D = FALL_ARENA.maxZ - FALL_ARENA.minZ;
const ARENA_CX = (FALL_ARENA.minX + FALL_ARENA.maxX) / 2;
const ARENA_CZ = (FALL_ARENA.minZ + FALL_ARENA.maxZ) / 2;
const EDGE_MAT = new THREE.MeshBasicMaterial({ color: '#ffca8e', transparent: true, opacity: 0.55 });

/**
 * 천장 배출 호퍼 — 공이 y=11.5 허공에서 갑자기 나타나는 게 별로라(2026-09-04 사용자) 마당 전체를
 * 4×6 호퍼 격자로 덮는다(tools/trial-hopper-glb.py, 정점색 단일 프리미티브라 GlbInstances 드로우콜 하나).
 * 배출구(모델 바닥 y=0)가 스폰 높이보다 0.2m 아래라 공 중심이 **호퍼 안**에서 생겨나 입으로 나온다 —
 * 격자 사이 틈에 걸린 공은 FallingBalls 의 스폰 확대(grow)가 마저 가린다. 지붕 경사(처마 9 · 용마루 13)에
 * 윗부분이 파묻히는 열이 있는데, 천장을 뚫고 설치된 기계로 읽히므로 그대로 둔다.
 */
const HOPPER_FIT: Fit = { x: 2.9, y: 1.15, z: 3.05 };
const HOPPER_MOUTH_Y = FALL_SPAWN_Y - 0.2;
const HOPPER_COLS = 4;
const HOPPER_ROWS = 6;
const HOPPERS: InstanceItem[] = Array.from({ length: HOPPER_COLS * HOPPER_ROWS }, (_, n) => {
  const i = n % HOPPER_COLS;
  const j = Math.floor(n / HOPPER_COLS);
  return {
    position: [FALL_ARENA.minX + ((i + 0.5) * ARENA_W) / HOPPER_COLS, HOPPER_MOUTH_Y, FALL_ARENA.minZ + ((j + 0.5) * ARENA_D) / HOPPER_ROWS],
  };
});

/** 마당 경계 — 바닥에 얇은 앰버 테. 여기 안에만 떨어진다는 걸 몸으로 알게 */
function ArenaEdge() {
  return (
    <group position={[ARENA_CX, 0.02, ARENA_CZ]}>
      <mesh position={[0, 0, -ARENA_D / 2]} material={EDGE_MAT}>
        <boxGeometry args={[ARENA_W, 0.005, 0.08]} />
      </mesh>
      <mesh position={[0, 0, ARENA_D / 2]} material={EDGE_MAT}>
        <boxGeometry args={[ARENA_W, 0.005, 0.08]} />
      </mesh>
      <mesh position={[-ARENA_W / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, ARENA_D]} />
      </mesh>
      <mesh position={[ARENA_W / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, ARENA_D]} />
      </mesh>
    </group>
  );
}

export interface FallSceneProps {
  /** 내 몸 — 3인칭이라 보인다. 있으면 군인(mp/bodies.ts), 없으면 로봇 폴백 */
  myBody?: BodyId | null;
  roster: readonly { id: string }[];
  aiIds: readonly string[];
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function FallScene({ myBody, roster, aiIds, sendMove }: FallSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [DODGE_SPAWN.x, EYE_HEIGHT, DODGE_SPAWN.z], fov: BASE_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <AdaptiveFov />
      <Exposure value={def.exposure} />
      <color attach="background" args={[def.background]} />
      <fogExp2 attach="fog" args={[def.fog[0], def.fog[1]]} />

      <def.Lights flicker />
      <ambientLight intensity={def.ambient.intensity} color={def.ambient.color} />
      {/* 마당 위 작업등 — 홀의 링 조명은 무대에만 떨어져서 마당 가운데가 어둡다. 떨어지는 것이 보여야 피한다 */}
      <pointLight position={[ARENA_CX, 7.5, ARENA_CZ]} color="#dfe9ff" intensity={60} distance={22} decay={2} />
      {/* 천장 틈(11.5m)에서 나오는 공이 트러스 그늘에 묻히지 않게 — 위에서 한 번 더 */}
      <pointLight position={[ARENA_CX, 12.2, ARENA_CZ]} color="#ffe8c4" intensity={40} distance={14} decay={2} />

      <Suspense fallback={null}>
        <def.Scene quality="high" />
        <ArenaEdge />
      </Suspense>
      {/* 공은 홀과 따로 기다린다 — 홀(부품 여럿)이 늦게 와도 떨어지는 것부터 보여야 피한다 */}
      <Suspense fallback={null}>
        <GlbInstances id="trial_hopper" fit={HOPPER_FIT} items={HOPPERS} />
        <FallingBalls />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={0} />
      {aiIds.map((id) => (
        <DodgerAvatar key={id} id={id} />
      ))}

      <DodgeRig body={myBody} sendMove={sendMove} />
      <SelfAvatar body={myBody} />
      <MouseLook />
    </WorldCanvas>
  );
}
