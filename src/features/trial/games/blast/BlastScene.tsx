/**
 * 폭발 충격파 피하기 — 심문소 홀 가운데 마당에 장애물을 세우고(BlastStage) 폭약이 여기저기서 터진다. DiscScene 과 같은 재료(맵 · 조명 · 후처리) 위에
 * 다리(BlastRig)와 무대(BlastStage)만 바꿔 끼운다. 남의 몸은 BlastAvatar — 이 게임은 사람의 자리도 서버 스냅샷으로 온다. 세기는 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT } from '@/world/mp/constants';
import { remotePlayers } from '@/world/net/remote-players';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SelfAvatar } from '../common/SelfAvatar';
import { BlastAvatar, CROUCH_SCALE } from './BlastAvatar';
import { BlastRig } from './BlastRig';
import { BlastStage } from './BlastStage';
import { blastState } from './blastState';

const def = MAPS.interrogation;

export interface BlastSceneProps {
  selfId: string | null;
  myBody?: BodyId | null;
  roster: readonly { id: string; nickname: string }[];
  aiIds: readonly string[];
  sendWalk: (x: number, z: number) => void;
  sendCrouch: (on: boolean) => void;
}

export function BlastScene({ selfId, myBody, roster, aiIds, sendWalk, sendCrouch }: BlastSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [0, EYE_HEIGHT, 4], fov: BASE_FOV, near: 0.1, far: 60 }}
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

      <Suspense fallback={null}>
        <def.Scene quality="high" />
      </Suspense>
      <Suspense fallback={null}>
        <BlastStage />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      {roster.map((r) => (
        <BlastAvatar key={r.id} id={r.id} label={r.nickname} body={remotePlayers.get(r.id)?.body ?? null} />
      ))}
      {aiIds.map((id) => (
        <BlastAvatar key={id} id={id} label={id} />
      ))}

      <BlastRig selfId={selfId} body={myBody} sendWalk={sendWalk} sendCrouch={sendCrouch} />
      {/* 내 몸 — 쓰러지면 눕고, 낮은 자세면 세로로 줄인다. 공중은 selfPose.y > 0 으로 SelfAvatar 가 스스로 안다 */}
      <SelfAvatar body={myBody} pose={() => ({ lie: blastState.selfStance === 2, scaleY: blastState.selfCrouch && blastState.selfStance === 0 ? CROUCH_SCALE : 1 })} />
      <MouseLook />
    </WorldCanvas>
  );
}
