/**
 * 무게 중심 다리 — 심문소 홀 가운데 마당에 축 하나로 얹힌 판자(SeesawStage) 위에서 무리의 무게중심을 맞춘다. DiscScene 과 같은 재료
 * (맵 · 조명 · 후처리) 위에 다리(SeesawRig)와 무대(SeesawStage)만 바꿔 끼운다. 남의 몸은 SeesawAvatar — 이 게임은 사람의 자리도
 * 서버 스냅샷으로 온다. 마찰계수는 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT, SEESAW_CENTER, SEESAW_TOP } from '@/world/mp/constants';
import { remotePlayers } from '@/world/net/remote-players';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SelfAvatar } from '../common/SelfAvatar';
import { selfPose } from '../common/selfPose';
import { SeesawAvatar } from './SeesawAvatar';
import { SeesawRig } from './SeesawRig';
import { SeesawStage } from './SeesawStage';

const def = MAPS.interrogation;

export interface SeesawSceneProps {
  selfId: string | null;
  myBody?: BodyId | null;
  roster: readonly { id: string; nickname: string }[];
  aiIds: readonly string[];
  sendWalk: (x: number, z: number) => void;
}

export function SeesawScene({ selfId, myBody, roster, aiIds, sendWalk }: SeesawSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [SEESAW_CENTER.x, SEESAW_TOP + EYE_HEIGHT, SEESAW_CENTER.z + 4], fov: BASE_FOV, near: 0.1, far: 60 }}
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
        <SeesawStage />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      {roster.map((r) => (
        <SeesawAvatar key={r.id} id={r.id} label={r.nickname} body={remotePlayers.get(r.id)?.body ?? null} />
      ))}
      {aiIds.map((id) => (
        <SeesawAvatar key={id} id={id} label={id} />
      ))}

      <SeesawRig selfId={selfId} body={myBody} sendWalk={sendWalk} />
      {/* 발밑 「땅」은 판자 윗면 — 판이 기울어도 몸은 늘 판 위에 있으니 지금 발 높이가 곧 땅이다(점프 없음). 그림자는 몸 바로 밑 */}
      <SelfAvatar body={myBody} groundY={() => selfPose.y} />
      <MouseLook />
    </WorldCanvas>
  );
}
