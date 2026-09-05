/**
 * 심문소 홀 — 판의 3D 무대. WorldScene 과 같은 재료(맵 정의 · 조명 · 후처리 · 원격 아바타)를 쓰고,
 * 국면에 따라 **다리와 바닥**만 바꿔 끼운다. 전부 **3인칭**이다 (2026-09-04 사용자: "그냥 검문소 들어가면
 * 3인칭으로 나오게 해줘") — 몸은 로봇이 아니라 서버가 배정한 군인(SelfAvatar → SoldierAvatar):
 *
 *   토론 · 낙하 생존 · 색 사냥   FreeRig (자유 보행) — 낙하 생존은 마당(FALL_ARENA)이 좁고 낙하물(FallStage)이
 *                              떨어지고, 색 사냥은 마당(HUNT_ARENA)에서 구슬을 줍는다(E, PickKey)
 *   움직이는 플랫폼             FreeRig + PlatformCourse (발판 열)
 *   회전 원판                   DiscRig (걷기 명령만 올리고 자리는 서버 것) + DiscStage — 마당 한가운데 원판이 선다
 *   정지선                      StopRig (레일) + TrackDressing, 남의 몸은 runnerState 타임라인으로 움직인다
 *
 * 남의 몸은 전부 remotePlayers(좌석 id 로 키) → SeatBodies 가 그린다 — **머리 위에 이름표와 의심도 막대**가 붙는다
 * (옛 시행판이 하던 그대로, SeatAvatar.tsx). 실제 사람이든 대역이든 AI 든 같은 길이다 — 어느 좌석이 사람인지
 * 이 파일은 모른다 (game-protocol.ts 머리말). **내 머리 위에도 의심도 막대**가 붙는다 — 이름표 없이 막대만
 * (SelfAvatar.tsx 머리말).
 */
import { Suspense, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BASE_FOV } from '@/world/input/input';
import { MAPS, type MapDef } from '@/world/map';
import { EYE_HEIGHT, FALL_ARENA, HUNT_ARENA } from '@/world/mp/constants';
import type { BodyId } from '@/world/mp/bodies';
import type { AnimState, TrialGame } from '@/world/mp/protocol';
import { remotePlayers } from '@/world/net/remote-players';
import { preloadAsset } from '@/world/assets/loader';
import { AdaptiveFov, Exposure, MouseLook } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';
import { SeatBodies } from './SeatAvatar';
import { Executioner } from './Executioner';
import { SelfAvatar } from './SelfAvatar';
import { selfPose } from './selfPose';
import { ARENA_WORK_LIGHTS, FALL_PARTS, FallStage } from './FallStage';
import { PlatformCourse } from './PlatformCourse';
import { PLATFORM_ARENA } from '@/world/mp/platform';
// 색 사냥의 구슬 · 견본판 · E 키는 /trial 과 같은 부품이다 — 상태(huntState)가 하나라 화면도 하나로 그린다
import { HuntOrbs, SampleBoard } from '@/features/trial/games/color-hunt/HuntObjects';
import { PickKey } from '@/features/trial/games/color-hunt/PickKey';
// 회전 원판도 같은 이유로 /trial 의 부품 그대로다 — 원판(무대)과 다리(예측 보정)는 서버 물리와 짝이라 베낄 수 없다
import { DiscRig } from '@/features/trial/games/disc/DiscRig';
import { DiscStage } from '@/features/trial/games/disc/DiscStage';
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
  /** 색 사냥 — E 로 구슬을 청한다. 판정은 서버 (PickKey 머리말) */
  onPick: (objectId: number) => void;
  /** 회전 원판 — 걷기 명령(월드 기준 m/s). 자리는 안 보낸다 (GameConnection.sendWalk 머리말) */
  onWalk: (x: number, z: number) => void;
  /** 낙하 생존 — Space. 몸의 높이는 서버가 그 구간의 숨은 중력으로 적분한다 (FreeRig sendJump) */
  onJump: () => void;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function HallScene(p: HallSceneProps) {
  /*
   * 낙하 생존의 GLB(배출 호퍼 · 공 다섯)를 **호루라기 전에** 받아 둔다.
   * 안 그러면 시험이 열리는 그 프레임에 여섯 개가 한꺼번에 온다 — 받고 · 풀고 · 텍스처를 GPU 로 올리는 일이
   * 첫 공이 떨어지는 순간과 겹쳐서, 피해야 할 바로 그때 화면이 멎는다 (2026-09-05 측정: 전환 순간 GLB 만 240~450ms).
   * 홀 자체의 부품 열여섯 개와 다투지 않게 2초 미룬다 — 호루라기까지는 아직 40초가 넘게 남았다.
   */
  useEffect(() => {
    const id = window.setTimeout(() => FALL_PARTS.forEach(preloadAsset), 2000);
    return () => window.clearTimeout(id);
  }, []);

  const stopline = p.test?.game === 'stopline';
  const fall = p.test?.game === 'fall';
  const hunt = p.test?.game === 'colorhunt';
  const platform = p.test?.game === 'platform';
  const disc = p.test?.game === 'disc';

  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [p.spawn.x, EYE_HEIGHT, p.spawn.z], fov: BASE_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        /*
         * 셰이더 링크가 끝났는지 **묻지 않는다.** 물으면(getProgramInfoLog) 그 자리에서 GPU 를 기다리느라
         * 자바스크립트가 멈춘다 — 시험이 열려 새 재질(공 · 호퍼 · 발판 · 원판)이 처음 그려지는 프레임마다
         * 그 대기가 통째로 얹혔다 (2026-09-05 측정: 낙하 전환에서 링크 대기만 172ms).
         * 안 물으면 드라이버가 뒤에서 링크하고, 화면은 그동안 계속 돈다.
         *
         * 대신 이 홀에서는 셰이더가 깨져도 콘솔에 three 의 친절한 오류가 안 뜬다 — 검은 물체와 WebGL 경고만
         * 남는다. 이 홀은 three 의 기본 재질만 쓰므로(직접 쓴 셰이더는 map/gallery 하나뿐이고 여기 없다)
         * 그 위험을 진다. 재질을 손으로 짜게 되면 이 줄을 잠깐 지우고 보면 된다.
         */
        gl.debug.checkShaderErrors = false;
      }}
    >
      <AdaptiveFov />
      <Exposure value={def.exposure} />
      <color attach="background" args={[def.background]} />
      <fogExp2 attach="fog" args={[def.fog[0], def.fog[1]]} />
      <def.Lights flicker />
      <ambientLight intensity={def.ambient.intensity} color={def.ambient.color} />
      {/* 마당 위 작업등 — 국면이 바뀌어도 **개수가 안 변한다**. 이유는 ArenaWorkLights 머리말 */}
      <ArenaWorkLights fall={fall} hunt={hunt} />

      <Suspense fallback={null}>
        <def.Scene quality="high" />
        {stopline && p.test ? <TrackDressing round={p.test.round} /> : null}
      </Suspense>
      {def.Effects ? <def.Effects /> : null}
      {/* 낙하 생존 — 공(종류별 GLB · 그림자 원반)과 천장 배출 호퍼는 /trial 과 같은 부품이다 (FallStage 머리말) */}
      {fall ? <FallStage /> : null}
      {/* 움직이는 플랫폼 — 발판 열은 platformState 로 프레임마다 자리를 잡는다 (PlatformCourse 머리말) */}
      {platform ? (
        <Suspense fallback={null}>
          <PlatformCourse />
        </Suspense>
      ) : null}
      {/* 회전 원판 — 원판은 서버가 준 각도로 돌고(discState), 그 위의 몸은 스냅샷으로 온다 (InterrogationFeature 의 trial_disc) */}
      {disc ? (
        <Suspense fallback={null}>
          <DiscStage />
        </Suspense>
      ) : null}
      {hunt ? (
        <group>
          <HuntOrbs />
          <SampleBoard />
          {/* 마당 위 작업등은 ArenaWorkLights 가 상시로 들고 있다 — 색 사냥이면 첫 등이 켜진다 */}
        </group>
      ) : null}

      <SeatBodies seats={p.others} getSuspicion={p.getSuspicion} markId={p.markId} bubbleTick={p.bubbleTick} />
      {/* 무대 위의 처형자 — 격리되는 몸을 쏜다 (executionerStore). 판이 서기 전(로비)에도 서 있다 */}
      <Suspense fallback={null}>
        <Executioner />
      </Suspense>
      {stopline ? <StopRunners others={p.others} /> : null}

      {stopline && p.mySeatId ? (
        <StopRig myId={p.mySeatId} lane={p.myLane} myAttempts={p.myAttempts} onAccel={p.onAccel} onBrake={p.onBrake} sendMove={p.sendMove} />
      ) : disc ? (
        /* 원판 위에서는 자리를 안 보낸다 — 서버가 적분해서 스냅샷으로 돌려준다 (DiscRig 머리말) */
        <DiscRig selfId={p.mySeatId} body={p.myBody} sendWalk={p.onWalk} />
      ) : (
        <FreeRig
          spawn={p.spawn}
          body={p.myBody}
          teleport={p.teleport}
          bounds={fall ? FALL_ARENA : hunt ? HUNT_ARENA : platform ? PLATFORM_ARENA : null}
          composing={p.composing}
          paused={p.paused}
          sendMove={p.sendMove}
          sendJump={fall ? p.onJump : undefined}
        />
      )}
      {hunt && p.mySeatId ? <PickKey getPos={() => ({ x: selfPose.x, z: selfPose.z })} onPick={p.onPick} /> : null}
      {/* 서버 welcome 이 오기 전엔 myBody 가 잠깐 null 이다 — 그 사이엔 로봇 대신 아예 안 그린다
          (2026-09-04 사용자: "처음에 딱 누르면 로봇이 1초 나와") */}
      {/* 내 머리 위에도 의심도 막대 — 좌석이 없으면(로비) 남들과 같이 빈 막대 */}
      {p.myBody ? <SelfAvatar body={p.myBody} getSuspicion={() => (p.mySeatId ? p.getSuspicion(p.mySeatId) : 0)} /> : null}
      <MouseLook />
    </WorldCanvas>
  );
}

/**
 * 마당 위 작업등 둘 — **판이 서기 전부터 씬에 매달려 있고, 꺼질 때는 세기만 0 이 된다.**
 *
 * 원래는 낙하 생존(FallStage)과 색 사냥이 제 광원을 직접 들고 왔다가 시험이 끝나면 같이 사라졌다. 그런데
 * three 는 **광원 개수를 셰이더 프로그램의 열쇠로 쓴다** — 홀에 이미 스물한 개가 켜져 있는데 거기서 둘이
 * 늘거나 줄면, 그 순간 홀의 **모든** 재질이 프로그램을 다시 링크한다. 호루라기가 울리는 바로 그 프레임에
 * 열여덟 개가 다시 링크됐고(2026-09-05 측정), 링크 결과를 기다리는 동안 화면이 통째로 멎었다 —
 * 처음 여는 판에서는 1.3초였다. 피하라고 만든 게임이 피할 수 없는 순간부터 시작한 셈이다.
 *
 * 그래서 개수를 고정한다. 세기 0 인 점광원은 색 × 0 이라 **화면에 아무 자국도 안 남기고**, 그 대신 프로그램
 * 열쇠가 판이 도는 내내 한 번도 안 바뀐다. `visible={false}` 로 끄면 안 된다 — three 는 안 보이는 광원을
 * 아예 세지 않아서, 개수가 바뀌는 원래 문제로 돌아간다.
 *
 * 색 사냥의 마당은 낙하 마당과 같은 자리다(HUNT_ARENA = FALL_ARENA) — 그래서 첫 등 하나를 같이 쓴다.
 * 구슬은 무광이지만 견본판 구조물과 몸은 빛이 필요하다.
 */
function ArenaWorkLights({ fall, hunt }: { fall: boolean; hunt: boolean }) {
  return (
    <>
      {ARENA_WORK_LIGHTS.map((l, i) => (
        <pointLight
          key={i}
          position={l.position}
          color={l.color}
          /* 첫 등은 낙하·색 사냥 둘 다, 천장 밑 등은 떨어지는 것이 있을 때만 */
          intensity={(i === 0 ? fall || hunt : fall) ? l.intensity : 0}
          distance={l.distance}
          decay={2}
        />
      ))}
    </>
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
