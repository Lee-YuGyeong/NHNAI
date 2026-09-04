/**
 * 낙하 생존 — 심문소 홀 가운데 마당에서 천장(트러스 아래)에서 떨어지는 화물 포드를 피한다.
 * StopLineScene 과 같은 재료(맵 · 조명 · 후처리 · Remotes) 위에 다리(DodgeRig)와 낙하물(FallingPods)만 바꿔 끼운다.
 * 물체는 서버 스냅샷대로만 떨어진다 — 중력값은 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import { EYE_HEIGHT, FALL_ARENA } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { AdaptiveFov, Exposure, MouseLook, Remotes } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { DODGE_SPAWN, DodgeRig } from './DodgeRig';
import { DodgerAvatar } from './DodgerAvatar';
import { FallingPods } from './FallingPods';

const def = MAPS.interrogation;
const ARENA_W = FALL_ARENA.maxX - FALL_ARENA.minX;
const ARENA_D = FALL_ARENA.maxZ - FALL_ARENA.minZ;
const ARENA_CX = (FALL_ARENA.minX + FALL_ARENA.maxX) / 2;
const ARENA_CZ = (FALL_ARENA.minZ + FALL_ARENA.maxZ) / 2;
const EDGE_MAT = new THREE.MeshBasicMaterial({ color: '#ffca8e', transparent: true, opacity: 0.55 });

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
  roster: readonly { id: string }[];
  aiIds: readonly string[];
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function FallScene({ roster, aiIds, sendMove }: FallSceneProps) {
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

      <Suspense fallback={null}>
        <def.Scene quality="high" />
        <ArenaEdge />
      </Suspense>
      {/* 낙하물은 홀과 따로 기다린다 — 홀(부품 여럿)이 늦게 와도 떨어지는 것부터 보여야 피한다 */}
      <Suspense fallback={null}>
        <FallingPods />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={0} />
      {aiIds.map((id) => (
        <DodgerAvatar key={id} id={id} />
      ))}

      <DodgeRig sendMove={sendMove} />
      <MouseLook />
    </WorldCanvas>
  );
}
