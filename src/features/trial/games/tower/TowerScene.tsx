/**
 * 무너지는 타워 생존 — 심문소 홀 가운데 마당에 선 탑(TowerStage) 위에서 버틴다. DiscScene 과 같은 재료(맵 · 조명 · 후처리) 위에
 * 다리(TowerRig)와 무대(TowerStage)만 바꿔 끼운다. 남의 몸은 TowerAvatar — 이 게임은 사람의 자리도 서버 스냅샷으로 온다. 마찰계수는 이 화면 어디에도 없다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT } from '@/world/mp/constants';
import { TOWER_CENTER, TOWER_TOP } from '@/world/mp/tower';
import { remotePlayers } from '@/world/net/remote-players';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SelfAvatar } from '../common/SelfAvatar';
import { selfPose } from '../common/selfPose';
import { TowerAvatar } from './TowerAvatar';
import { TowerRig } from './TowerRig';
import { TowerStage } from './TowerStage';
import { towerState } from './towerState';

const def = MAPS.interrogation;

export interface TowerSceneProps {
  selfId: string | null;
  myBody?: BodyId | null;
  roster: readonly { id: string; nickname: string }[];
  aiIds: readonly string[];
  sendWalk: (x: number, z: number) => void;
  sendPush: (hx: number, hz: number) => void;
}

export function TowerScene({ selfId, myBody, roster, aiIds, sendWalk, sendPush }: TowerSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [TOWER_CENTER.x, TOWER_TOP + EYE_HEIGHT, TOWER_CENTER.z + 4], fov: BASE_FOV, near: 0.1, far: 60 }}
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
        <TowerStage />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      {roster.map((r) => (
        <TowerAvatar key={r.id} id={r.id} label={r.nickname} body={remotePlayers.get(r.id)?.body ?? null} />
      ))}
      {aiIds.map((id) => (
        <TowerAvatar key={id} id={id} label={id} />
      ))}

      <TowerRig selfId={selfId} body={myBody} sendWalk={sendWalk} sendPush={sendPush} />
      {/* 발밑 「땅」은 서 있는 발판의 윗면 — 서 있는 동안 발 높이가 곧 땅이고, 떨어지는 중(f=1)에만 공중이다. 바닥에 누우면(f=2) 눕는다 */}
      <SelfAvatar body={myBody} groundY={() => (towerState.selfStance === 1 ? -100 : selfPose.y)} pose={() => ({ lie: towerState.selfStance === 2, scaleY: 1 })} />
      <MouseLook />
    </WorldCanvas>
  );
}
