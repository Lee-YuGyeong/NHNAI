/**
 * 무대 위의 리더 — 홀에 들어오면 링 조명 아래 누가 서 있다. (배경은 창고 3D 맵의 격납고 홀 — ArenaFeature MAP_DEF)
 *
 * 리더는 판에 참가하지 않는다(personas.ts). 지시하고 판정할 뿐이라 명부(roster)에도,
 * 대화에도, 배회에도 없다. 그래서 지금까지 **목소리로만 존재했다** — 빈 무대에 빛만
 * 떨어지고, 방송은 어디서 나오는지 모르는 채로 들렸다. 그 목소리에 몸을 준다.
 *
 * 판의 아바타들(remotePlayers)과 **섞지 않는다.** 그쪽 보관소는 판에 선 몸들의 자리이고,
 * 폐기가 나면 행진이 끝나는 대로 지워진다. 리더를 거기 넣으면 명부에 오르고, 명부에 오르면
 * 게임이 리더를 참가자로 세기 시작한다. 여기서는 제자리에 서 있기만 한다 —
 * 좌표도 상태도 없고, 프레임마다 하는 일은 **가장 뜨거운 개체 쪽으로 몸을 트는 것뿐이다**(getStareAt).
 *
 * 몸집은 참가자보다 크다 — 같은 키면 무대 위에 하나 더 서 있는 것으로 읽힌다.
 * 다만 **얼굴이 보이는 선까지만** 크다 (HEAD_Y 참고).
 *
 * 몸은 격납고 홀(/warehouse)의 리더와 **같은 것**이다 (features/warehouse/LeaderRobot, 리깅 GLB).
 * 서 있기만 하던 자리에 클립이 붙었다 — 판정에 조준하고, 폐기가 나가면 쏘고, 몰이가 서면 화를 낸다.
 * 어느 국면이 어느 동작을 부르는지는 ArenaFeature 의 getLeaderAction 한 곳에 모여 있다.
 */

import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { remotePlayers } from '@/arena3d';
import { LEADER_HEIGHT, LeaderRobot, type LeaderAction } from '@/features/warehouse/LeaderRobot';
import { findObject } from '@/lab/objects';
import { LEADER_NAME } from '@/lab/personas';

/**
 * 자리는 무대 카탈로그에서 끌어온다 — 좌표를 옮겨 적지 않는다.
 * layout.ts 에서 무대를 옮기면 리더도 같이 간다 (objects.ts 와 같은 약속이다).
 */
const STAGE = findObject('무대');

/**
 * 리더만 크다. 판에 끼지 않는 존재라 크기로 위계를 준다.
 *
 * 크기를 정하는 것은 **얼굴**이다. LeaderRobot 이 제 키를 4.3m(참가자 1.72 의 2.5배)로 맞춰
 * 들어오므로, 무대턱 0.45 를 더해 머리끝이 4.75m — 스폰 원(방 가운데, 무대에서 11m)에서
 * 올려다보는 각이 16° 라 시작하자마자 눈이 맞는다.
 * 천장(용마루 13m)까지 늘이면 위계는 세지만 그 각이 38° 가 되어 **얼굴이 화면 위로 나간다.**
 * 링 조명 7.4m · 관찰창 윗변 6.3m 도 여기 걸린다 — 4배(7.33m)면 조명을 뚫는다.
 */
/** 머리끝 높이(m) — 이름표를 거는 자리다 */
const HEAD_Y = LEADER_HEIGHT;
/** 발밑 그림자 반지름(m). 커진 몸에 맞춰 같이 크다 — 안 그러면 무대 위에 떠 보인다 */
const SHADOW_R = 0.85;

/**
 * 가장 뜨거운 개체 쪽으로 몸을 트는 각의 한계(rad). 넘겨서 돌면 방에 등을 보이게 된다 —
 * 무대 위에서 몸만 살짝 트는 것이 "쳐다본다" 로 읽히는 한계다.
 */
const STARE_LIMIT = 55 * (Math.PI / 180);
/** 시선이 옮겨 붙는 시간 상수(초). 홱 돌면 기계가 아니라 오작동으로 보인다 */
const STARE_TAU = 0.45;

/**
 * 리더의 몸은 **판이 굴린다** — 동작을 함수로 받아 프레임마다 물어본다 (LeaderRobot 의 규약).
 * 무엇이 어느 동작을 부르는지는 ArenaFeature 의 getLeaderAction 에 있다.
 *
 * 시선도 같은 약속이다 — `getStareAt` 이 지금 쳐다볼 개체의 id 를 돌려주면(없으면 null)
 * 그쪽으로 몸을 튼다. 좌표는 여기서 remotePlayers 에 직접 물어본다: 판이 개체 위치를 들고
 * 있을 이유가 없고, 그 보관소는 프레임마다 갱신되므로 배회하는 개체를 따라가려면 여기가 맞다.
 *
 * ★ 표시가 아니라 **연기**다. 수치는 개체 머리 위 막대(WorldScene 의 getSuspicion)가 말하고,
 *   리더는 누가 걸렸는지를 몸으로만 알려준다.
 */
export function LeaderOnStage({
  getAction,
  getStareAt,
  getStareSpot,
}: {
  getAction: () => LeaderAction;
  getStareAt?: () => string | null;
  /**
   * 이름 없는 자리를 볼 때 — **id 보다 먼저다.**
   *
   * getStareAt 은 개체 id 를 받아 remotePlayers 에서 좌표를 찾는데, 이 방에서 **나만 그 보관소에
   * 없다** (내 몸은 카메라 하나다). 그래서 내가 폐기될 때 리더는 볼 대상을 못 찾아 방만 봤다
   * (2026-09-03 사용자: "나 죽을때 리더가 나 안쐈는데 죽어"). 좌표로 바로 주면 그 자리를 본다.
   */
  getStareSpot?: () => { x: number; z: number } | null;
}) {
  const rig = useRef<THREE.Group>(null);
  /** 지금 튼 각 — 목표각으로 지수적으로 따라간다 */
  const yaw = useRef(0);

  useFrame((_, delta) => {
    const g = rig.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);

    let want = 0;
    // 좌표로 온 자리가 먼저다 (getStareSpot) — 그다음이 이름으로 온 개체다
    const spot = getStareSpot?.() ?? null;
    const id = spot ? null : (getStareAt?.() ?? null);
    const at = spot ?? (id ? (remotePlayers.get(id)?.pose ?? null) : null);
    if (at && STAGE) {
      // 모델은 +z 가 정면이고 무대는 회전 0 이므로, 무대에서 그 자리까지의 방위각이 그대로 목표각이다
      const a = Math.atan2(at.x - STAGE.x, at.z - STAGE.z);
      want = Math.max(-STARE_LIMIT, Math.min(STARE_LIMIT, a));
    }
    yaw.current += (want - yaw.current) * (1 - Math.exp(-dt / STARE_TAU));
    g.rotation.y = yaw.current;
  });

  // 카탈로그에 무대가 없는 맵이면 아무것도 세우지 않는다
  if (!STAGE) return null;

  return (
    // 발은 무대 윗면에. 회전 0 = 로컬 +z 가 곧 정면이라(heading = atan2(dx, dz))
    // 무대(뒷벽 쪽)에서 방을 마주 본다 — 들어오는 사람과 눈이 맞는다.
    <group position={[STAGE.x, STAGE.top, STAGE.z]}>
      {/* 몸만 돈다 — 이름표는 회전축 위라 같이 돌릴 이유가 없다 (돌리면 Html 이 흔들린다) */}
      <group ref={rig}>
        {/* LeaderRobot 이 제 키를 스스로 4.3m 로 맞춘다 — 여기서 배율을 더 걸지 않는다 */}
        <Suspense fallback={null}>
          <LeaderRobot getAction={getAction} />
        </Suspense>

        {/* 판의 아바타와 같은 바닥 그림자 — 없으면 무대 위에 떠 있는 것처럼 보인다 */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[SHADOW_R, 24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </group>

      {/* 이름표는 크기 밖에 둔다 — 같이 키우면 글자만 커져 화면을 덮는다. 머리 위에 남게 높이만 올린다 */}
      <Html position={[0, HEAD_Y + 0.5, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            borderRadius: 999,
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 700,
            // 참가자 이름표는 자리 색(seatColor)을 쓴다. 리더는 자리가 없으니 색으로도 갈린다
            color: '#e04e42',
          }}
        >
          {LEADER_NAME}
        </div>
      </Html>
    </group>
  );
}
