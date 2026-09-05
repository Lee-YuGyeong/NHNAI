/**
 * 회전 봉 넘기 — 심문소 홀 가운데 마당의 무대(BarStage) 위에서 도는 봉을 제때 뛰어넘는다. DiscScene 과 같은 재료
 * (맵 · 조명 · 후처리) 위에 다리(BarRig)와 무대만 바꿔 끼운다. 남의 몸은 BarAvatar 다 — 이 게임은 사람의 자리도
 * 점프도 서버 스냅샷으로 온다. 마찰계수는 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { BAR_CENTER, BAR_STAND_R, BAR_TOP, EYE_HEIGHT } from '@/world/mp/constants';
import { remotePlayers } from '@/world/net/remote-players';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SelfAvatar } from '../common/SelfAvatar';
import { BarAvatar } from './BarAvatar';
import { BarRig } from './BarRig';
import { BarStage } from './BarStage';

const def = MAPS.interrogation;

export interface BarSceneProps {
  selfId: string | null;
  /** 내 몸 — 3인칭이라 보인다. 있으면 군인(mp/bodies.ts), 없으면 로봇 폴백 */
  myBody?: BodyId | null;
  /** 실제 사람 — id → 닉네임 */
  roster: readonly { id: string; nickname: string }[];
  aiIds: readonly string[];
  sendWalk: (x: number, z: number) => void;
  sendJump: () => void;
}

export function BarScene({ selfId, myBody, roster, aiIds, sendWalk, sendJump }: BarSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [BAR_CENTER.x, BAR_TOP + EYE_HEIGHT, BAR_CENTER.z + BAR_STAND_R + 4], fov: BASE_FOV, near: 0.1, far: 60 }}
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
      {/* 무대는 홀과 따로 기다린다 — 홀(부품 여럿)이 늦게 와도 발밑부터 보여야 한다 (DiscScene 과 같다) */}
      <Suspense fallback={null}>
        <BarStage />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      {roster.map((r) => (
        <BarAvatar key={r.id} id={r.id} label={r.nickname} body={remotePlayers.get(r.id)?.body ?? null} />
      ))}
      {aiIds.map((id) => (
        <BarAvatar key={id} id={id} label={id} />
      ))}

      <BarRig selfId={selfId} body={myBody} sendWalk={sendWalk} sendJump={sendJump} />
      <SelfAvatar body={myBody} groundY={BAR_TOP} />
      <MouseLook />
    </WorldCanvas>
  );
}
