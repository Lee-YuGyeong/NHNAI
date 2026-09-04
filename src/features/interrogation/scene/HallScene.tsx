/**
 * 심문소 홀 — 판의 3D 무대. WorldScene 과 같은 재료(맵 정의 · 조명 · 후처리 · 원격 아바타)를 쓰고,
 * 국면에 따라 **다리와 바닥**만 바꿔 끼운다:
 *
 *   토론 · 낙하 생존 · 색 사냥   FreeRig (자유 보행) — 낙하 생존은 마당이 좁고 낙하물(FallObjects)이 떨어진다
 *   정지선                      StopRig (레일) + TrackDressing, 남의 몸은 runnerState 타임라인으로 움직인다
 *
 * 남의 몸은 전부 remotePlayers(좌석 id 로 키) → SeatBodies 가 그린다 — **머리 위에 이름표와 의심도 막대**가 붙는다
 * (옛 시행판이 하던 그대로, SeatAvatar.tsx). 실제 사람이든 대역이든 AI 든 같은 길이다 — 어느 좌석이 사람인지
 * 이 파일은 모른다 (game-protocol.ts 머리말).
 */
import { Suspense, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS, type MapDef } from '@/world/map';
import { EYE_HEIGHT, FALL_ARENA } from '@/world/mp/constants';
import type { BodyId } from '@/world/mp/bodies';
import type { AnimState, TrialGame } from '@/world/mp/protocol';
import { remotePlayers } from '@/world/net/remote-players';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SeatBodies } from './SeatAvatar';
import { Executioner } from './Executioner';
import { FallObjects } from './FallObjects';
import { FreeRig, type Teleport } from './FreeRig';
import { StopRig } from './stopline/StopRig';
import { TrackDressing } from './stopline/TrackDressing';
import { runnerState } from './stopline/runnerState';
import { laneX, zAt } from './stopline/track';

/**
 * 배경은 **특수인공지능대응센터 홀**(map/govcenter) — 노원상이 올린 참고 이미지대로 지은 방이다
 * (2026-09-04 사용자: "노원상이 올린 배경에 내가 만든거 해야하는데"). 옛 심문소 맵(MAPS.interrogation,
 * 검정 철골 천장 + 링 조명)에서 갈아끼웠다 — **게임은 그대로, 맵만.**
 *
 * ★ 갈아끼워도 판이 안 흔들리는 이유: govcenter 의 발자국·충돌 목록이 격납고 홀(warehouse/layout.ts)을
 *   그대로 재수출하고, 그 치수가 옛 심문소 홀과 앞뒤로 같다 — z 12 → −20, 무대 앞면 −14.
 *   그래서 좌석 원(spawn.ts, (0,−2.5) 반지름 3.4) · 정지선 트랙(track.ts, 출발 z 10 → 끝 −14) ·
 *   낙하 마당(FALL_ARENA ±6)이 한 줄도 안 바뀐다. 좌우만 좁다 (±15 → ±12) — 레인 아홉이 ±8.8 이라 안에 든다.
 * ★ FreeRig 도 **같은 맵**을 봐야 한다 (FreeRig.tsx 의 map). 한쪽만 바꾸면 보이는 벽과 막는 벽이 3m 어긋난다.
 */
/** MapDef 로 받는다 — 맵마다 있는 칸(Effects · Furniture)이 달라서, 리터럴로 받으면 없는 맵에서 컴파일이 막힌다 */
const def: MapDef = MAPS.govcenter;

export interface HallSceneProps {
  mySeatId: string | null;
  /** 내 몸 — 달리기 속도·점프 높이 (mp/bodies.ts). 없으면 기본값 */
  myBody: BodyId | null;
  /** 내 레인(좌석 번호 − 1). 좌석이 없으면 0 */
  myLane: number;
  /** 남의 좌석 id 들 (나 제외, 격리된 몸은 빠진다) */
  others: readonly { id: string }[];
  /** 머리 위 막대가 프레임마다 묻는다 — 값으로 주면 눈금이 바뀔 때마다 아바타가 전부 다시 그려진다 */
  getSuspicion: (id: string) => number;
  /** 지금 내가 지목하고 있는 좌석 — 그 몸의 이름표에 👉 가 붙는다 */
  markId: string | null;
  bubbleTick: number;
  /** 지금 도는 테스트 — 없으면 토론 */
  test: { game: TrialGame; round: number } | null;
  myAttempts: number;
  spawn: { x: number; z: number };
  teleport: Teleport | null;
  composing: boolean;
  paused: boolean;
  onAccel: () => void;
  onBrake: () => void;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function HallScene(p: HallSceneProps) {
  const stopline = p.test?.game === 'stopline';
  const fall = p.test?.game === 'fall';

  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [p.spawn.x, EYE_HEIGHT, p.spawn.z], fov: BASE_FOV, near: 0.1, far: 60 }}
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
        {stopline && p.test ? <TrackDressing round={p.test.round} /> : null}
      </Suspense>
      {def.Effects ? <def.Effects /> : null}
      {fall ? <FallObjects /> : null}

      <SeatBodies seats={p.others} getSuspicion={p.getSuspicion} markId={p.markId} bubbleTick={p.bubbleTick} />
      {/* 무대 위의 처형자 — 격리되는 몸을 쏜다 (executionerStore). 판이 서기 전(로비)에도 서 있다 */}
      <Suspense fallback={null}>
        <Executioner />
      </Suspense>
      {stopline ? <StopRunners others={p.others} /> : null}

      {stopline && p.mySeatId ? (
        <StopRig myId={p.mySeatId} lane={p.myLane} myAttempts={p.myAttempts} onAccel={p.onAccel} onBrake={p.onBrake} sendMove={p.sendMove} />
      ) : (
        <FreeRig spawn={p.spawn} body={p.myBody} teleport={p.teleport} bounds={fall ? FALL_ARENA : null} composing={p.composing} paused={p.paused} sendMove={p.sendMove} />
      )}
      <MouseLook />
    </WorldCanvas>
  );
}

/**
 * 정지선 동안 남의 몸 — 서버가 보낸 시행 타임라인(runnerState)에서 프레임마다 자리를 뽑아 remotePlayers 에 밀어 넣는다.
 * 실제 사람도 여기서 같은 레일 위에 그린다 — player_moved 로도 오지만, 같은 시행을 두 출처로 그리면 몸이 두 자리를 오간다.
 */
function StopRunners({ others }: { others: readonly { id: string }[] }) {
  const step = useCallback(() => {
    const now = Date.now();
    const at = performance.now();
    for (const o of others) {
      const lane = runnerState.laneOf(o.id);
      const f = runnerState.frameAt(o.id, now);
      remotePlayers.move(o.id, laneX(lane), zAt(f.x), 0, Math.PI, f.anim, at);
    }
  }, [others]);
  useFrame(step);
  return null;
}
