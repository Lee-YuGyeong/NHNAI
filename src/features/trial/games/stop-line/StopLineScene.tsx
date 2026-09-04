/**
 * 정지선 — **심문소 홀 안**에서 뛴다. WorldScene 과 같은 재료(맵 정의 · 조명 · 후처리 · 원격 플레이어)를
 * 그대로 쓰고, 다리(LocalRig)만 레일 위를 달리는 TrialRig 으로 바꿔 끼운다 (WorldScene.tsx 머리말).
 *
 *   - 실제 사람: 자기 좌표를 보내오므로 Remotes 가 그린다 (WorldScene 과 같다)
 *   - AI 좌석(SUBJECT_nn): 서버가 시뮬레이션한 시행을 runnerState 가 재생, RunnerAvatar 가 그린다
 *   - 트랙 · 게이트 · 비콘: TrackDressing
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS } from '@/world/map';
import { EYE_HEIGHT } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { AdaptiveFov, Exposure, MouseLook, Remotes } from '@/world/scene/WorldScene';
import { SelfAvatar } from '../common/SelfAvatar';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { RunnerAvatar } from './RunnerAvatar';
import { TrackDressing } from './TrackDressing';
import { TrialRig } from './TrialRig';
import { START_Z } from './track';

const def = MAPS.interrogation;

export interface StopLineSceneProps {
  myId: string | null;
  /** 방에 있는 실제 사람들(나 제외) — Remotes 가 remotePlayers 에서 좌표를 찾는다 */
  roster: readonly { id: string }[];
  /** 서버가 시뮬레이션하는 AI 좌석 id 들 */
  aiIds: readonly string[];
  /** 지금 구간(1~3) — 바닥 결만 바뀐다. 마찰값은 여기 없다 */
  phase: number;
  /** 판 시작 시각 — 판이 바뀌면 리그 자세를 처음으로 */
  gameKey: number;
  myAttempts: number;
  onAccel: () => void;
  onBrake: () => void;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function StopLineScene({ myId, roster, aiIds, phase, gameKey, myAttempts, onAccel, onBrake, sendMove }: StopLineSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [0, EYE_HEIGHT, START_Z], fov: BASE_FOV, near: 0.1, far: 60 }}
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
        <TrackDressing phase={phase} />
      </Suspense>
      {def.Effects ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={0} />
      {aiIds.map((id) => (
        <RunnerAvatar key={id} id={id} label={id} />
      ))}

      <TrialRig myId={myId} gameKey={gameKey} myAttempts={myAttempts} onAccel={onAccel} onBrake={onBrake} sendMove={sendMove} />
      <SelfAvatar />
      <MouseLook />
    </WorldCanvas>
  );
}
