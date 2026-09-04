/**
 * 개체 하나의 몸 — **어디가 닳았는지가 그대로 보인다.**
 *
 * 본판의 AgentRobot 을 안 쓴다. 저건 순찰하고 추궁하고 쏘는 몸이고, 그 판단을 본판의 이야기 저장소에서
 * 읽어 온다 — 여기서 마운트하면 두 판이 한 저장소를 나눠 쓰게 된다. 이 시나리오의 개체가 하는 것은 셋뿐이다:
 * **서 있고, 제 자리들 사이를 걸어 다니고(patrol.ts), 하나는 불 쪽으로 걸어간다.**
 *
 * 대신 **생김새가 다르다.** 몸은 성격마다 따로 뽑은 GLB 열 장이고(CastBody), wear.ts 는 그 위에 색과 기울기만 얹는다.
 * 이 게임의 첫 동작이 말을 거는 것이 아니라 **보는 것**이라서, 여기가 안 읽히면 대화 시스템 전체가 없는 것과 같다.
 *
 * ★ 2026-09-03 — **몸이 하나로 줄었다.** 전에는 둘이었다: 이름 있는 개체는 GLB, 이름 없는 배경은 리깅 아바타에
 *   단색 + 상자 조각. 근접에서 보니 그 아바타는 노출 2.0 아래에서 그냥 검은 덩어리였고, GLB 쪽은 이미 모델링돼 있는
 *   수선 부품 · 얼굴판의 금 · 총 위에 같은 것을 상자로 한 번 더 달고 있었다 (사용자: 「왜 glb 에 상자를 달고 다니는지 이해가 안 돼」).
 *   그래서 조각을 전부 걷고, 몸이 없는 look 은 **닳은 자리가 같은 몸을 빌리게** 했다 (wear.bodyOf) — 빌리는 것은
 *   원래 이 게임의 규칙이다 (cast.ts: 동료 요원 둘과 배경은 개체의 몸을 빌려 쓴다). 아바타 분기는 그래서 없다.
 *
 * ★ 자세도 여기서 그룹으로 낸다 (wear 의 lean · pose): 손을 보는 것은 숙이고, 등을 붙인 것은 자리표에서 0.15 m 벽 쪽으로, 구형은 넓다.
 * ★ 태도는 attitude.ts 가 자리 위에 **오프셋**으로 얹는다 — patrol 의 자리에 더해 그리고, 그 자리를 bystanders 에 올린다.
 *   still 은 patrol 의 것 그대로라 비켜 주는 동안에도 말 걸기 대상이다.
 *
 * `bystanders` 에는 자리를 올린다 — 그걸 안 하면 나는 센서에게 보이지 않는 사람이 되고,
 * 아무도 안 보는 방에서 뭘 해도 의심도가 안 오른다.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import type { AssetId } from '@/world/assets/manifest';
import { bystanders } from '@/world/mp/bystanders';
import type { AnimState } from '@/world/mp/protocol';
import { FIRE_MOUTH_Z } from '@/world2/map/work';

import { attitude } from './attitude';
import { EnforcerBody } from '@/features/world/Enforcer';
import { bubble } from './bubbles';

import { CastBody } from './CastBody';
import type { Look } from './cast';
import { EXECUTIONER_ID, execution } from './execution';
import { patrol } from './patrol';
import { bodyOf, dress } from './wear';
import { EXEC_ROOM, fireWalkActive, scenario2 } from './scenario2';
import { units } from './units';

/** 참가자 아바타의 키(m) — 조각 자리의 기준 */
const BASE_HEIGHT = 1.72;
/** 불로 걸어가는 걸음 — 느리다. 급할 이유가 없는 걸음이라는 것이 이 장면의 전부다 */
const FIRE_WALK = 0.85;
/** 대체 개체가 불로 갈 때 붙는 선(x) — 붙잡혀 선 A-201(x 0.6)의 몸을 스치지 않고 목구멍(±1.5) 안으로 든다 */
const FIRE_SUB_X = -0.6;
/**
 * 고개가 도는 속도(초당 몫) — patrol 이 준 heading 을 그대로 대입하면 돌아보는 것(stare)이 한 프레임에 홱 돈다.
 * 이 값이면 반 바퀴에 0.5 초쯤 — 기계가 사람을 알아보는 속도로 보인다
 */
const TURN_EASE = 6;
/**
 * 자는 몸의 기울기(rad) — 앞으로 숙이고 한쪽으로 처진다. 발은 그대로고 머리가 구석 벽 쪽으로 간다.
 * 이 이상 기울이면 서 있는 몸이 아니라 넘어지는 몸으로 보인다.
 */
const DOZE_LEAN = { pitch: 0.3, roll: 0.14 } as const;
/** 쓰러지는 데 걸리는 시간(초) — 한 발 뒤에 무너지는 몸. 더 느리면 연기가 되고 더 빠르면 안 보인다 */
const FALL_S = 0.5;
/**
 * 걷기 클립이 도는 최소 속도(m/s) — **발이 실제로 나갈 때만 걷는다** (2026-09-03 사용자: 「제자리에서 걷는 봇들이 많다」).
 * patrol 은 자리 사이를 가는 동안(still=false) 벽·사람·다른 몸에 막혀도 「가는 중」이라, 그걸 그대로 클립에 넣으면 제자리걸음이 된다.
 * 순찰 속도 0.9(patrol SPEED) · 불로 가는 걸음 0.85 의 1/3 — 옆걸음으로 비스듬히 새는 것은 걷고, 막혀서 발을 구르는 것은 선다.
 * 속도는 그려지는 자리(태도 오프셋까지 더한)의 프레임 차로 재고 짧게 완화한다(WALK_EASE_S) — 한 프레임 막힌 것으로 클립이 깜빡이지 않게
 */
const WALK_MIN = 0.3;
const WALK_EASE_S = 0.12;

/** 위상 씨앗 — 같은 버릇의 몸 둘이 같은 박자로 숨 쉬면 기계다. id 로 정해 방을 옮겨도 같은 몸은 같은 박자다 */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return h;
}

export interface UnitPlace {
  id: string;
  x: number;
  z: number;
  /** 바라보는 방향(rad). look() 과 같은 규약(atan2(dx, dz))이라 0 은 +z — 들어온 문 쪽이다. 방 안쪽(−z)을 보려면 Math.PI */
  heading?: number;
  /**
   * 'fire'     — 순서가 오면(scenario2.fireWalkActive) 불 쪽으로 걷는다. 붙잡히면 그 자리에 선다
   * 'fire-sub' — 그 하나가 붙잡힌 뒤 대신 불려 가는 것(scenario2.substituteWalkActive). 순찰하다가 그 자리에서 곧장 간다
   * 'doze'     — 자는 것. 클립은 idle/walk 둘뿐이라 앉히지는 못하고, 몸을 보는 쪽(구석)으로 기울여 머리를 벽에 기댄다
   */
  pose?: 'still' | 'fire' | 'fire-sub' | 'doze';
  /** 이름 없는 배경 개체의 생김새 — 열(cast.ts)에 없는 것만 여기서 받는다 */
  look?: Look;
}

export function Unit({ place }: { place: UnitPlace }) {
  const group = useRef<THREE.Group>(null);
  const st = useRef({ x: place.x, z: place.z, anim: 'idle' as AnimState, gone: false, walkedFire: false, faced: false, alive: true, px: NaN, pz: NaN, speed: 0, down: 0 });

  const def = units.def(place.id);
  const look = def?.look ?? place.look;
  const height = look?.height ?? BASE_HEIGHT;
  const skin = useMemo(() => (look ? dress(look) : null), [look]);
  // 이름 없는 배경도 몸이 있다 — 제 GLB 가 없으면 닳은 자리가 같은 것을 빌린다 (wear.bodyOf). 몸 없는 개체는 없다
  const asset = bodyOf(look) as AssetId;

  useEffect(() => {
    st.current.x = place.x;
    st.current.z = place.z;
    st.current.gone = false;
    st.current.walkedFire = false;
    st.current.faced = false;
    st.current.px = NaN;
    st.current.pz = NaN;
    st.current.speed = 0;
  }, [place.x, place.z]);

  useEffect(() => {
    const id = place.id;
    return () => {
      bystanders.drop(id);
      scenario2.forget(id);
      // DEV 손잡이도 지운다 — 앞 방의 몸이 「걷는 중」으로 남아 헤드리스 확인이 제자리걸음으로 셌다
      if (import.meta.env.DEV && typeof window !== 'undefined') delete (window as unknown as { __s2anim?: Record<string, unknown> }).__s2anim?.[id];
    };
  }, [place.id]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = st.current;
    const dt = Math.min(delta, 0.1);

    /*
     * 집행자와 **한 몸**이다 — 총 든 것이 문가에 선 동안(execution phase ≠ none) 순찰하던 guard21 은 숨고 자리도 안 올린다:
     * 그동안은 Executioner 가 이 이름으로 자리를 올린다. 안 그러면 문가에 하나, 순찰 선에 하나, 같은 개체가 둘이다.
     * 집행이 없는 방(EXEC_ROOM null)에서는 그대로 — 거기엔 저쪽 몸이 없다. 물러나면 Executioner 가 섰던 자리를 patrol 에 돌려준다
     */
    if (place.id === EXECUTIONER_ID && execution.get().phase !== 'none' && EXEC_ROOM[scenario2.get().room]) {
      g.visible = false;
      return;
    }

    let heading = place.heading ?? 0;
    /*
     * 셋 중 하나다 — 불로 걸어 들어가거나, 제 자리들 사이를 돌거나, 그냥 서 있거나.
     * **서 있을 때만 말 걸기 대상이다** (patrol 의 ★): 걷는 몸에 대고 말을 걸면 상대가 매 프레임 바뀐다.
     */
    let still = true;
    // 대신 나서서 처리된 것 — 돌아오지 않는다. 자리표에는 남아 있어도 몸은 없다 (scenario2.gone)
    if (scenario2.gone(place.id)) s.gone = true;
    // 불로 가는 걸음 — 순서가 온 것(fire)과, 그것이 붙잡힌 뒤 대신 불려 가는 것(fire-sub). 어느 id 든 신호는 이야기가 준다
    const fireWalk = !s.gone && (place.pose === 'fire' ? fireWalkActive() : place.pose === 'fire-sub' ? scenario2.substituteWalkActive() : false);
    if (fireWalk) {
      if (!s.walkedFire) {
        // 순찰하던 자리에서 곧장 간다 — 자리표로 되돌아가 출발하면 몸이 순간이동한다.
        // 태도의 오프셋(비켜 섬·대답 물러섬)도 더한 채 출발한다 — 그려지던 자리가 곧 출발 자리다. 그 뒤로는 안 얹는다(아래)
        const p = patrol.of(place.id);
        if (p) {
          const off = attitude.offsetOf(place.id);
          s.x = p.x + off.dx;
          s.z = p.z + off.dz;
        }
        s.walkedFire = true;
      }
      // 불을 향해. 대체 개체는 붙잡혀 선 것의 몸을 비켜 목구멍 안쪽 선으로 옮겨 붙는다
      if (place.pose === 'fire-sub') s.x += Math.max(-0.5 * dt, Math.min(0.5 * dt, FIRE_SUB_X - s.x));
      s.z = Math.max(FIRE_MOUTH_Z, s.z - FIRE_WALK * dt);
      s.anim = 'walk';
      heading = Math.PI;
      still = false;
      if (s.z <= FIRE_MOUTH_Z + 0.02) s.gone = true;
      else patrol.pin(place.id, s.x, s.z, heading, false);
    } else if (s.walkedFire && !s.gone) {
      /*
       * 붙잡혔다(scenario2 가 걸음 신호를 끈다) — **그 자리에 선다.** 자리표(patrol.of)로 돌아가면 붙잡힌 몸이 15 m 뒤로 튄다.
       * 선 자리를 patrol 에 알려 두면 남이 비켜 가고, still 이라 말을 걸 수 있다 — 붙잡은 것에게 처음 말을 거는 자리다
       */
      const p = patrol.of(place.id);
      if (!p?.still) patrol.pin(place.id, s.x, s.z, Math.PI, true);
      s.anim = 'idle';
      heading = p?.heading ?? Math.PI;
    } else {
      const p = patrol.of(place.id);
      if (p) {
        s.anim = p.still ? 'idle' : 'walk';
        s.x = p.x;
        s.z = p.z;
        heading = p.heading;
        still = p.still;
      } else {
        s.anim = 'idle';
      }
    }

    /*
     * 태도의 몸짓 — patrol 의 자리에 오프셋을 더하고 고개를 덮어쓴다 (attitude.ts). 불로 가는 걸음에는 안 얹는다: 그 걸음은 이야기의 것이다.
     * 더한 자리를 bystanders · scenario2 에 올리므로 충돌도 곁 판정도 옮긴 몸을 따라간다. still 은 patrol 의 것 그대로
     */
    let x = s.x;
    let z = s.z;
    if (!fireWalk && !s.gone) {
      const off = attitude.offsetOf(place.id);
      x += off.dx;
      z += off.dz;
      const face = attitude.faceOf(place.id);
      if (face !== null) heading = face;
    }
    /*
     * 걷기 클립은 **몸이 실제로 옮겨질 때만** — patrol 이 「가는 중」이라 해도 막혀서 발이 안 나가면 선다 (WALK_MIN).
     * 첫 프레임(앞 자리 없음)은 재지 않는다. 내려 잡기만 한다: 서 있는 몸(idle)이 튀어서 걷는 일은 없다
     */
    if (Number.isNaN(s.px)) {
      s.speed = 0;
    } else {
      const v = Math.hypot(x - s.px, z - s.pz) / Math.max(dt, 1e-3);
      s.speed += (v - s.speed) * Math.min(1, dt / WALK_EASE_S);
    }
    s.px = x;
    s.pz = z;
    if (s.anim === 'walk' && s.speed < WALK_MIN) s.anim = 'idle';
    // DEV 손잡이 — 헤드리스 확인이 개체마다 클립·속도를 읽는다 (tools/scenario2-anim-check.mjs)
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const w = window as unknown as { __s2anim?: Record<string, { anim: AnimState; speed: number; x: number; z: number; still: boolean }> };
      (w.__s2anim ??= {})[place.id] = { anim: s.anim, speed: s.speed, x, z, still };
    }
    // 절차 idle 이 사는가 — 자는 것 · 불로 가는 것 · 멈칫하는 것은 안 흔들린다
    s.alive = !s.gone && place.pose !== 'doze' && !fireWalk && !attitude.held(place.id);

    /*
     * 대체 개체는 **불려 갈 때까지 없다.** 이름도 사연도 없는 몸이라 서 있으면 그냥 「명부에 없는 로봇 하나」로 보인다
     * (2026-09-03 사용자: 「계획서에 없던 로봇 개체는 없애 달라」). 대본이 부르는 순간(substituteWalkActive) 라인 위에 나타나
     * 소각로로 걸어 들어간다 — v8 THE_FURNACE 의 「투입 취소. 대체 개체 배정.」 · 「이름을 모르는 게 들어갔다」가 그 몸이다.
     */
    const unseen = place.pose === 'fire-sub' && !s.walkedFire;
    g.visible = !s.gone && !unseen;
    g.position.set(x, 0, z);
    /*
     * 고개는 완화해 돌린다 — patrol 의 heading 을 그대로 박으면 자리에 선 것이 돌아보는 것(stare)이 한 프레임에 홱 돈다.
     * 첫 프레임만 그대로 — 안 그러면 방에 들어서는 순간 열이 전부 0 에서 제자리로 도는 것이 보인다
     */
    if (!s.faced) {
      g.rotation.y = heading;
      s.faced = true;
    } else {
      let dh = heading - g.rotation.y;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      g.rotation.y += dh * Math.min(1, dt * TURN_EASE);
    }

    if (s.gone) {
      bystanders.drop(place.id);
      scenario2.forget(place.id);
      patrol.drop(place.id);
      return;
    }
    if (unseen) {
      // 아직 없는 몸이다 — 충돌도 곁 판정도 걸지 않는다
      bystanders.drop(place.id);
      scenario2.forget(place.id);
      return;
    }
    /*
     * 쓰러진 것 (HOLD_BREACH) — 선 자리에서 뒤로 눕는다(발이 축, 0.5 초). 그 뒤로는 자리도 곁도 안 올린다: 몸은 남고 개체는 없다.
     * 숨(절차 idle)도 멎는다
     */
    if (scenario2.fallen(place.id)) {
      s.anim = 'idle';
      s.alive = false;
      s.down = Math.min(1, s.down + dt / FALL_S);
      const e = 1 - (1 - s.down) * (1 - s.down);
      g.rotation.x = -Math.PI / 2 * e;
      g.position.y = 0.06 * e;
      bystanders.drop(place.id);
      scenario2.forget(place.id);
      return;
    }
    bystanders.set(place.id, x, z, g.rotation.y);
    scenario2.place(place.id, x, z, still);
  });

  const scale = height / BASE_HEIGHT;
  // 자는 것은 마모가 준 기울기 대신 자는 기울기 — 둘을 더하면 손끝이 닳은 개체(pitch 0.25)가 코를 박는다
  const lean = place.pose === 'doze' ? DOZE_LEAN : (skin?.lean ?? { pitch: 0, roll: 0 });
  // 등을 붙인 것은 보는 방향의 반대(로컬 −z)로 물러나고, 구형은 x/z 로 넓다 — 자리표와 그림자는 그대로
  const pose = skin?.pose ?? { back: 0, widen: 1 };
  const seed = seedOf(place.id);

  return (
    // 이름은 확인 도구용 — tools/scenario2-shots.mjs --unit 이 이 그룹을 찾아 2 m 앞에 카메라를 세운다
    <group ref={group} name={place.id}>
      {/* 기울기는 몸에만 건다 — 그림자와 자리는 바닥에 붙어 있어야 한다. 마모는 텍스처에 있고 CastBody 가 틴트만 곱한다 */}
      <group position={[0, 0, -pose.back]} scale={[pose.widen, 1, pose.widen]} rotation={[lean.pitch, 0, lean.roll]}>
        <Suspense fallback={null}>
          {look?.enforcer ? (
            /*
             * 총 든 개체(UNIT-21)의 몸 — 본판 중앙 시설의 심문 AI 것을 그대로 빌린다 (cast 의 look.enforcer).
             * **집행자와 한 몸이어야 한다**: 배치되면 이 몸이 숨고 Executioner 가 같은 자리에 서는데, 둘이 다르게 생기면 그 순간 딴것이 된다
             */
            <EnforcerBody
              getMode={() => (scenario2.aiming(place.id) ? 'aim' : st.current.anim === 'walk' ? 'walk' : 'idle')}
              getFlashAt={() => scenario2.flashAt(place.id)}
              getSpeed={() => st.current.speed}
              height={height}
            />
          ) : (
            /* 하던 일(act)은 몸이 든다 — 말을 걸면 attending 이 켜져 손이 0.3 초에 내려온다 (activity.ts). 몸이 도는 것은 위 heading 쪽이다 */
            <CastBody
              asset={asset}
              rifle={look?.rifle}
              height={height}
              getAnim={() => st.current.anim}
              getAlive={() => st.current.alive}
              getAttending={() => attitude.attending(place.id)}
              act={look?.act}
              dress={skin}
              seed={seed}
              tag={place.id}
            />
          )}
        </Suspense>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.34 * scale, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <Bubble id={place.id} y={height + 0.22} />
    </group>
  );
}

/**
 * 머리 위 말풍선 — 내가 걸어서 저쪽이 답할 때 (bubbles.ts). 생김새는 본판 다인 판의 채팅 말풍선(WorldScene RemoteAvatar)과 같다.
 * 수명이 끝나는 그 시각에 한 번 다시 그린다 — 안 그러면 다음 말까지 영영 떠 있다
 */
function Bubble({ id, y }: { id: string; y: number }) {
  useSyncExternalStore(bubble.subscribe, bubble.version, bubble.version);
  const [, expire] = useReducer((n: number) => n + 1, 0);
  const b = bubble.get(id);
  useEffect(() => {
    if (!b) return undefined;
    const left = b.until - performance.now();
    if (left <= 0) return undefined;
    const t = window.setTimeout(expire, left + 16);
    return () => window.clearTimeout(t);
  }, [b]);
  if (!b) return null;
  return (
    // 본판보다 작게 — distanceFactor 5.5 · 글씨 12 · 여백 6/12 (2026-09-03 사용자: 「말풍선 너무 커, 텍스트도 너무 크지 않게」)
    <Html position={[0, y, 0]} center distanceFactor={5.5} zIndexRange={[10, 0]}>
      <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 'max-content',
            maxWidth: 180,
            borderRadius: 10,
            border: '1px solid #374151',
            background: 'rgba(30,30,30,0.62)',
            padding: '6px 12px',
            boxShadow: '0 6px 10px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ display: 'block', fontSize: 12, fontWeight: 500, lineHeight: 1.3, color: '#fff', wordBreak: 'keep-all' }}>{b.text}</span>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -6,
              left: '50%',
              width: 0,
              height: 0,
              transform: 'translateX(-50%)',
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(30,30,30,0.62)',
            }}
          />
        </div>
      </div>
    </Html>
  );
}
