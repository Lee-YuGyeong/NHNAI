/**
 * 남의 몸 하나 — **머리 위에 이름표와 의심도 막대**가 붙는다.
 *
 * 옛 시행판(`src/arena3d/scene/WorldScene.tsx` 의 RemoteAvatar)이 하던 그대로다 (2026-09-04 사용자:
 * "의심도 디자인 이런건 원래 로봇 머리위에 보여주게 했잖아? 그런건 그대로 하고싶어"). 그 파일의 결정을
 * 여기로 옮겼고, 옮긴 이유가 있는 것들은 주석도 같이 왔다:
 *
 *   · 막대는 **React 를 거치지 않고** 프레임마다 style 을 직접 고친다 — 의심도는 자주 움직이고,
 *     값으로 넘기면 눈금이 바뀔 때마다 아바타가 memo 를 뚫고 다시 그려진다.
 *   · 이름표·막대는 **말풍선이 떠도 제자리다** — 말풍선을 흐름에서 빼(absolute) 줄의 크기를 고정한다.
 *     안 그러면 <Html center> 가 줄의 한가운데를 머리 위 한 점에 맞추느라, 말할 때마다 이름표가
 *     가슴팍으로 내려간다 (2026-09-01 사용자 지적).
 *   · 막대의 자(60px)는 이름 길이와 무관하게 늘 같다 — 몸마다 자가 다르면 서로 비교가 안 된다.
 *
 * 이 판에서 달라진 것 하나: **어느 몸이 사람인지 이 파일은 모른다.** 실제 사람 · 대역 · AI 가 전부 같은
 * 좌석 id 로 오고 이름은 SUBJECT nn 이다 (game-protocol.ts 머리말). 그래서 옛 판처럼 좌석 색으로 이름을
 * 칠하지 않는다 — 색이 좌석 번호를 말하면 그 번호가 곧 입장 순서로 읽힌다.
 */
import { Suspense, memo, useCallback, useEffect, useReducer, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import { INTERP_DELAY_MS } from '@/world/mp/constants';
import { sampleAt, type Pose } from '@/world/mp/interp';
import type { AnimState } from '@/world/mp/protocol';
import { remotePlayers, type RemotePlayer } from '@/world/net/remote-players';
import { platformState } from './platformState';
import { SUS_LOOK, SUS_TRACK, susLevel } from './susbar';

export interface SeatBodiesProps {
  /** 그릴 좌석들 (나 제외). 격리된 몸은 목록에서 빠진다 — 그 자리에서 끌려 나갔다 */
  seats: readonly { id: string }[];
  /** 프레임마다 묻는다 — 값으로 주면 눈금이 바뀔 때마다 전부 다시 그려진다 */
  getSuspicion: (id: string) => number;
  /** 지금 내가 지목하고 있는 몸 — 이름표 앞에 👉 가 붙는다 */
  markId: string | null;
  /** 말풍선이 바뀔 때만 오르는 신호 */
  bubbleTick: number;
}

export function SeatBodies({ seats, getSuspicion, markId, bubbleTick }: SeatBodiesProps) {
  return (
    <>
      {seats.map((s) => {
        const p = remotePlayers.get(s.id);
        return p ? <SeatAvatar key={p.id} player={p} getSuspicion={getSuspicion} marked={p.id === markId} bubbleTick={bubbleTick} /> : null;
      })}
    </>
  );
}

const SeatAvatar = memo(function SeatAvatar({
  player,
  getSuspicion,
  marked,
  bubbleTick,
}: {
  player: RemotePlayer;
  getSuspicion: (id: string) => number;
  marked: boolean;
  bubbleTick: number;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  /** 의심도 막대 — React 를 거치지 않고 프레임마다 직접 고친다 */
  const susBar = useRef<HTMLElement>(null);
  /** 마지막으로 쓴 값. 안 바뀌면 DOM 을 안 건드린다 */
  const susLast = useRef(-1);
  const pose = useRef<Pose>({ x: player.pose.x, z: player.pose.z, y: player.pose.y, heading: player.pose.heading });

  // ★ 값이 아니라 함수로 준다. player 는 Map 안에서 제자리 변형되므로 값을 넘기면 입장 시점의 'idle' 이 굳는다
  const getAnim = useCallback((): AnimState => player.anim, [player]);
  // 발판(움직이는 플랫폼) 위에 선 몸은 y 가 0.5 라도 공중이 아니다 — 그 자리 발판 높이보다 떠 있을 때만 점프 클립
  const getAirborne = useCallback(() => player.pose.y > platformState.groundAt(player.pose.x, player.pose.z, player.pose.y) + 0.02, [player]);
  /**
   * 화면에서 실제로 움직이는 속도(m/s, 지수 평활) — 군인 몸은 이 값으로 걸음 클립의 빠르기를 맞추고,
   * 서 있는데 anim 이 walk 로 남아 있으면 걷지 않는다 (2026-09-04 사용자: "제자리에 멈춰서 걷는거").
   */
  const speed = useRef({ v: 0, x: player.pose.x, z: player.pose.z, at: 0 });
  const getSpeed = useCallback(() => speed.current.v, []);

  const bubble = player.bubbleUntil > performance.now() ? player.bubbleText : '';
  void bubbleTick;

  // 말풍선 수명이 끝나는 그 시각에 한 번 다시 그린다 — 안 그러면 다음 채팅까지 영영 떠 있다
  const [, expire] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!bubble) return;
    const left = player.bubbleUntil - performance.now();
    if (left <= 0) return;
    const id = window.setTimeout(expire, left + 16);
    return () => window.clearTimeout(id);
  }, [bubble, player.bubbleUntil, player]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;

    // 150ms 과거를 그린다. 최신 샘플을 바로 그리면 패킷이 한 번 늦을 때마다 튄다
    const now = performance.now();
    if (sampleAt(player.buffer, now - INTERP_DELAY_MS, pose.current)) {
      player.pose.x = pose.current.x;
      player.pose.z = pose.current.z;
      player.pose.y = pose.current.y;
      player.pose.heading = pose.current.heading;
    }

    const y = player.pose.y;
    g.position.set(player.pose.x, y, player.pose.z);
    g.rotation.y = player.pose.heading;

    // 실제 이동 속도 — 프레임 사이 변위 / 시간, 0.15초 시정수로 평활
    const sp = speed.current;
    if (sp.at > 0) {
      const dt = Math.min(0.1, Math.max(1e-3, (now - sp.at) / 1000));
      const v = Math.hypot(player.pose.x - sp.x, player.pose.z - sp.z) / dt;
      sp.v += (v - sp.v) * Math.min(1, dt / 0.15);
    }
    sp.at = now;
    sp.x = player.pose.x;
    sp.z = player.pose.z;

    // 그림자는 늘 바닥에 붙어 있고 멀어질수록 작아진다 — 점프가 "위로 간 것"으로 읽히게
    if (shadow.current) {
      shadow.current.position.y = 0.02 - y;
      const s = Math.max(0.45, 1 - y * 0.35);
      shadow.current.scale.set(s, s, 1);
    }

    // 의심도 막대 — 값이 바뀐 프레임에만 DOM 을 만진다.
    // ★ 0 이어도 **눈금(빈 막대)은 남긴다** — 값이 있을 때만 띄우면 판이 서기 전까지 아무것도 안 보여
    //   막대가 어디서 차오르는지를 알 수가 없다 (susbar.ts 머리말).
    if (susBar.current) {
      const sus = Math.max(0, Math.min(100, Math.round(getSuspicion(player.id))));
      if (sus !== susLast.current) {
        susLast.current = sus;
        susBar.current.style.width = `${sus}%`;
        // 길이만이 아니라 **색이 눈금을 말한다** — 어느 칸인지는 susbar.ts 한 곳이 정한다
        const look = SUS_LOOK[susLevel(sus)];
        susBar.current.style.background = look.fill;
        susBar.current.style.boxShadow = look.glow;
      }
    }
  });

  return (
    <group ref={group}>
      {/*
       * 몸과 그림자는 **한 Suspense 안**이다 — 그림자만 밖에 두면 모델(robot.glb)이 아직 안 왔을 때
       * 바닥에 그림자만 떠 있는 사람이 된다 (world/scene/WorldScene 의 같은 자리 주석).
       */}
      <Suspense fallback={null}>
        {/* 몸은 서버가 준 군인(mp/bodies.ts) — 옛 워커라 몸이 없으면 로봇 */}
        {player.body ? <SoldierAvatar body={player.body} getAnim={getAnim} getAirborne={getAirborne} getSpeed={getSpeed} /> : <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />}
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>

      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div style={{ position: 'relative', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {bubble ? (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                marginBottom: 10,
                transform: 'translateX(-50%)',
                width: 'max-content',
                maxWidth: 220,
                borderRadius: 16,
                border: '1px solid #374151',
                background: 'rgba(30,30,30,0.62)',
                padding: '12px 24px',
                boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
              }}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: '#fff' }}>{bubble}</span>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -8,
                  left: '50%',
                  width: 0,
                  height: 0,
                  transform: 'translateX(-50%)',
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderTop: '8px solid rgba(30,30,30,0.62)',
                }}
              />
            </div>
          ) : null}

          <div
            style={{
              whiteSpace: 'nowrap',
              borderRadius: 999,
              background: marked ? 'rgba(90,40,10,0.75)' : 'rgba(0,0,0,0.6)',
              boxShadow: marked ? '0 0 0 1px #ffd9a0' : undefined,
              padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              // 좌석 번호로 색을 가르지 않는다 (머리말) — 지목한 몸만 호박색으로 튄다
              color: marked ? '#ffd9a0' : '#e8ddcd',
            }}
          >
            {marked ? '👉 ' : ''}
            {player.nickname}
          </div>

          {/* 의심도 — 이름표 바로 아래. 쳐다보는 그 자리에서 눈금이 읽히라고 몸에 붙인다 */}
          <div
            style={{
              width: 60,
              height: 7,
              borderRadius: 3,
              background: SUS_TRACK,
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.16)',
            }}
          >
            <i ref={susBar} style={{ display: 'block', width: '0%', height: '100%', borderRadius: 3, background: SUS_LOOK.calm.fill }} />
          </div>
        </div>
      </Html>
    </group>
  );
});
