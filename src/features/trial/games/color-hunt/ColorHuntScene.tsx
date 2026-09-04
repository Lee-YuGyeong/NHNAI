/**
 * 색 사냥 — 심문소 홀 가운데, 바닥에 흩어진 70개 구슬. FallScene 과 같은 재료(맵 · 조명 · Remotes) 위에
 * 구슬(HuntOrbs) · 견본판(SampleBoard)만 바꿔 끼운다 — 마당은 낙하 생존과 같다 (HUNT_ARENA = FALL_ARENA).
 * AI 좌석의 걸음도 낙하 생존과 같은 통로(trial_snapshot → fallState → DodgerAvatar)로 온다.
 *
 * 다리는 **1인칭**(HuntRig) — 3인칭은 공 피하기(낙하 생존)뿐이다 (2026-09-04 사용자). 색을 눈으로
 * 비교하는 게임이라 시야를 몸이 가리면 안 되기도 하다.
 *
 * 조명이 바뀐 「느낌」(방이 통째로 물드는 것)은 이 캔버스가 아니라 TrialFeature 의 DOM 오버레이가
 * 낸다 — 구슬·견본판의 색은 서버가 이미 곱한 표시색이라 여기 조명과 무관하다 (HuntObjects 머리말).
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT, HUNT_ARENA } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { AdaptiveFov, Exposure, MouseLook, Remotes } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { selfPose } from '../common/selfPose';
import { DodgerAvatar } from '../fall/DodgerAvatar';
import { HuntOrbs, SampleBoard } from './HuntObjects';
import { HUNT_SPAWN, HuntRig } from './HuntRig';
import { PickKey } from './PickKey';

const def = MAPS.interrogation;
const CX = (HUNT_ARENA.minX + HUNT_ARENA.maxX) / 2;
const CZ = (HUNT_ARENA.minZ + HUNT_ARENA.maxZ) / 2;

export interface ColorHuntSceneProps {
  /** 내 몸 — 밀치기의 몸무게(remotePlayers.pushOut)만 쓴다. 1인칭이라 화면에는 안 보인다 */
  myBody?: BodyId | null;
  roster: readonly { id: string }[];
  aiIds: readonly string[];
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
  onPick: (objectId: number) => void;
}

export function ColorHuntScene({ myBody = null, roster, aiIds, sendMove, onPick }: ColorHuntSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [HUNT_SPAWN.x, EYE_HEIGHT, HUNT_SPAWN.z], fov: BASE_FOV, near: 0.1, far: 60 }}
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
      {/* 마당 위 작업등 — 아바타·견본판 구조물이 보이게 (구슬은 무광이라 조명이 필요 없다) */}
      <pointLight position={[CX, 7.5, CZ]} color="#dfe9ff" intensity={60} distance={22} decay={2} />

      <Suspense fallback={null}>
        <def.Scene quality="high" />
      </Suspense>
      {/* 구슬·견본판은 홀과 따로 — 홀(부품 여럿)이 늦게 와도 게임부터 보여야 한다 */}
      <HuntOrbs />
      <SampleBoard />
      {def.Effects ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={0} />
      {aiIds.map((id) => (
        <DodgerAvatar key={id} id={id} />
      ))}

      <HuntRig body={myBody} sendMove={sendMove} />
      <PickKey getPos={() => ({ x: selfPose.x, z: selfPose.z })} onPick={onPick} />
      <MouseLook />
    </WorldCanvas>
  );
}
