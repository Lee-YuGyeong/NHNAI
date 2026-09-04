/**
 * 걸어오는 것 — 의심도가 오를수록 자리가 달라지는 총 든 개체.
 *
 * **새 모델이 없다.** 복도를 순찰하던 그 개체와 **같은 GLB**(s2_guard21)다 — 무릎이 닳았고 총을 등에 멨다.
 * 판 내내 배경에 있다가 마지막에 나를 향해 도는 것, 그게 이 연출의 힘이다 (집행 설계 「걸어오는 것」).
 *
 *   60 posted    진입점에 선다. **안 쏜다.** 아무 일도 안 일어나는데 저기 서 있는 것이 가장 무섭다
 *   80 watch     같은 방 안으로 몇 걸음 들어와 나를 본다
 *  100 approach  걸어온다. 총은 아직 메고 있다 — 여덟 걸음
 *      unsling   도착. 그 자리에 선다 (총을 내리는 1.5 초 — 판에 한 번뿐인 자리)
 *      blocked   개체가 말로 사이에 섰다(걸음 4–5). 걸어온 자리에서 멈추고 그 개체를 본다
 *      bodyBlock 개체가 몸으로 막았다(걸음 6–7). 같은 그림 — 총구 앞에 선 것이 있다
 *
 * ★ **한 몸이다.** 순찰하던 guard21(Unit)과 이것은 같은 개체라, 이것이 서 있는 동안 순찰 몸은 숨는다(Unit.tsx) —
 *   안 그러면 문가에 하나, 순찰 선에 하나, 총 든 것이 둘 서 있다 (2026-09-03 — 「총 든 glb 가 중앙 시설에 없는 것 같아」의 절반:
 *   문가의 것은 dress 를 안 받아 총도 틴트도 없는 흰 몸이었다). 이 몸은 열(cast)의 guard21 look 을 그대로 입어 **총이 등에 있고**,
 *   자리도 guard21 의 이름으로 올린다(bystanders · scenario2.place) — 센서에게도 곁 판정에게도 「그 개체가 저기 있다」다.
 *   물러나 사라질 때는 순찰 몸에 **이 자리를 돌려준다**(patrol.pin → approach → release): 서 있던 데서 순찰을 잇는다. 순간이동은 나타날 때 한 번뿐이다.
 *
 * ★ **카메라를 안 뺏는다.** 락온도 컷신도 없다 — 플레이어는 고개를 돌려 다른 데를 볼 수 있다.
 *   그리고 대부분 안 돌린다. 강제하지 않는 편이 더 오래 남는다.
 * ★ 경로 탐색이 없다. 방마다 **진입점 하나**를 박아 두고 거기서 플레이어까지 직선이다 (설계의 그 규칙).
 *   꺾인 방(복도의 L)만 EXEC_ROOM.path 로 **모퉁이 점**을 몇 개 박는다 — 진입점 → 모퉁이들 → 플레이어를 잇는 꺾은선이고,
 *   시간은 길이에 비례해 나눈다. 여전히 탐색은 없다: 벽을 뚫지 않게 사람이 찍어 둔 점이다. 중앙 시설은 홀이 트여 있어 path 가 없다.
 *   80 의 「몇 걸음 안」도 **그 꺾은선 위**다 — 진입점과 나를 직선으로 이으면 L 의 모서리 벽 속에 선다.
 * ★ 걸음은 **길 위의 자리를 그대로** 쓴다 — 완화(EASE)는 서 있는 국면(posted · watch)의 자리 옮김에만 건다. 걷는 동안까지 완화하면
 *   빠른 방(작업 구역 25 m / 12 초)에서 몸이 목표에 1 m 넘게 뒤처져, 도착했는데 STOP 보다 멀리 서 있다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { AssetId } from '@/world/assets/manifest';
import { bystanders } from '@/world/mp/bystanders';
import type { AnimState } from '@/world/mp/protocol';

import { EnforcerBody } from '@/features/world/Enforcer';

import { CastBody } from './CastBody';
import { alongRoute, EXECUTIONER_ID, execution, type Pt, routeLength, type Phase } from './execution';
import { patrol } from './patrol';
import { EXEC_ROOM, type Room, scenario2 } from './scenario2';
import { units } from './units';
import { dress } from './wear';

/** 총 든 개체의 키 — 참가자보다 크다 (cast 의 guard21 과 같은 값). 열에 look 이 없을 때의 값 */
const HEIGHT = 2.05;
/** 걸음이 멈추는 거리 — 이만큼 앞에 서서 총을 내린다 */
export const STOP = 2.2;
/** 80 에서 방 안으로 들어오는 몫 — 진입점에서 나에게로 가는 길의 이만큼만 */
export const WATCH_IN = 0.35;
/** 서 있는 국면에서 자리를 옮기는 부드러움 (초당) */
const EASE = 1.6;
/**
 * 개체가 사이에 선 국면들 — 걸음을 **그 자리에서** 멈추고 나선 개체를 본다 (v8 EIGHT_STEPS 걸음 4–5 말로 · 6–7 몸으로).
 * 이름을 집합으로 두는 것은 execution 의 Phase 가 국면을 더 얻어도 여기가 안 깨지게 — 여기는 자리만 그린다
 */
const HOLD_PHASES: ReadonlySet<string> = new Set(['blocked', 'bodyBlock']);
/** 길 위에 있는 국면들 — 걷거나(approach), 길 위에서 멎었거나(blocked · bodyBlock), 끝에 서 있다(unsling · aim · dead · spared) */
const ON_ROUTE: ReadonlySet<string> = new Set(['approach', 'blocked', 'bodyBlock', 'unsling', 'aim', 'dead', 'spared']);

const _me = new THREE.Vector3();

/**
 * 총을 겨눈 채로 서 있는 국면들 — 총을 내린 뒤(unsling)부터 끝(dead)까지다. 막힌 동안(blocked · bodyBlock)은
 * 아직 안 겨눴다: 사이에 선 것에게 「…비켜」라고 말하는 자리라 몸도 서 있는 자세여야 한다 (v8 EIGHT_STEPS)
 */
const AIM_PHASES = new Set<Phase>(['unsling', 'aim', 'dead']);

export function Executioner({ room }: { room: Room }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const spot = EXEC_ROOM[room];
  const at = useRef({
    x: spot?.at.x ?? 0,
    z: spot?.at.z ?? 0,
    heading: 0,
    set: false,
  });

  // 열의 guard21 그대로 — 총 · 틴트 · 키. 순찰 몸(Unit)과 같은 값을 같은 함수로 뽑는다
  const look = units.def(EXECUTIONER_ID)?.look;
  const skin = useMemo(() => (look ? dress(look) : null), [look]);
  const asset = (look?.asset ?? 's2_guard21') as AssetId;
  const height = look?.height ?? HEIGHT;
  const lean = skin?.lean ?? { pitch: 0, roll: 0 };

  useEffect(() => {
    if (!spot) return;
    at.current = { x: spot.at.x, z: spot.at.z, heading: 0, set: false };
  }, [spot]);

  /**
   * 한 발이 나간 시각 — 총구 섬광이 이걸 본다 (execution.shotAt, dead · spared 로 넘어간 프레임에 박힌다).
   * 매 프레임 물어본다: 값으로 받으면 마운트할 때의 −Infinity 가 굳어 영영 안 핀다 (getAnim 과 같은 규약)
   */
  const getShotAt = useMemo(() => () => execution.get().shotAt, []);
  /** 이번 프레임의 걸음 속도(m/s) — 심문 AI 의 걸음 자세가 보폭을 이걸로 맞춘다 */
  const speed = useRef(0);

  /** 걷고 있나 — 몸이 그린다 (CastBody 의 클립) */
  const anim = useRef<AnimState>('idle');
  /** 걸어온 거리(m) — 개체가 사이에 서면 여기서 멈춘다. 시간(progress)은 계속 가지만 다리는 안 간다 */
  const walked = useRef(0);
  /** 걸어오기 시작한 자리(길 위의 m) — 80 에서 들어와 선 데서 출발한다. 진입점으로 되돌아가 출발하면 몸이 뒤로 걷는다 */
  const walkFrom = useRef(0);
  /** 지난 프레임의 국면 — 걸음의 출발 자리를 잡는 전이를 본다 */
  const prevPhase = useRef<string>('none');
  /** 지금 화면에 있나 — 사라지는 프레임에 순찰 몸에 자리를 돌려준다 */
  const shown = useRef(false);

  useEffect(
    () => () => {
      // 방을 나간다 — 이 이름의 자리는 다음 방의 Unit 이 다시 올린다
      if (shown.current) bystanders.drop(EXECUTIONER_ID);
      shown.current = false;
    },
    [],
  );

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || !spot) return;
    const st = execution.get();
    const dt = Math.min(delta, 0.1);
    const visible = st.phase !== 'none';
    g.visible = visible;
    const a = at.current;
    if (!visible) {
      if (shown.current) {
        /*
         * 물러났다(relax) — 순찰 몸이 **여기서** 순찰을 잇는다. pin 으로 자리를 옮기고(hold), approach → release('resume') 로
         * 순찰 걸음을 다시 건다: 순찰 선의 옛 자리로 튀어 돌아가는 대신 문가에 섰던 그 자리에서 걸어 나간다
         */
        shown.current = false;
        bystanders.drop(EXECUTIONER_ID);
        scenario2.forget(EXECUTIONER_ID);
        if (patrol.has(EXECUTIONER_ID)) {
          patrol.pin(EXECUTIONER_ID, a.x, a.z, a.heading, true);
          patrol.approach(EXECUTIONER_ID, { x: a.x, z: a.z }, { stopAt: 0, then: 'resume' });
          patrol.release(EXECUTIONER_ID);
        }
      }
      a.set = false;
      walked.current = 0;
      prevPhase.current = st.phase;
      return;
    }
    shown.current = true;

    camera.getWorldPosition(_me);

    /*
     * 어디에 서 있어야 하나. 걸어오는 동안만 **시간으로** 자리를 정한다 —
     * 80 에서 들어와 선 자리에서 내 앞까지를 걸음 진행도로 나눈다. 그래야 방이 정한 8~14 초가 그대로 지켜진다.
     * 꺾은선(path)이 있으면 길이에 비례해 나눈다 — 긴 다리는 오래, 짧은 다리는 잠깐. 걸음 속도가 모퉁이에서 튀지 않는다.
     * 플레이어가 걸어오는 동안 움직여도(개정 3) 마지막 구간의 끝만 따라 옮겨 간다 — 시간은 progress 가 쥐고 있다.
     */
    const route: Pt[] = [spot.at, ...(spot.path ?? []), { x: _me.x, z: _me.z }];
    const len = routeLength(route);
    // 도착하면 내 앞 STOP m
    const goal = Math.max(0, len - STOP);
    let tx = spot.at.x;
    let tz = spot.at.z;
    // 걷는 방향 — 걸어오는 동안만 쓴다. 나머지 단계는 나를 본다
    let travel: { dx: number; dz: number } | null = null;
    // 사이에 선 개체 — 그쪽을 본다 (막힌 동안만)
    let facing: Pt | null = null;
    const held = HOLD_PHASES.has(st.phase);
    const onRoute = ON_ROUTE.has(st.phase);
    if (st.phase === 'posted') {
      walked.current = 0;
    } else if (st.phase === 'watch') {
      // 길의 35 % — 직선이 아니라 꺾은선 위다 (L 복도의 모서리 벽을 안 뚫는다)
      walked.current = Math.min(goal, len * WATCH_IN);
      const p = alongRoute(route, walked.current);
      tx = p.x;
      tz = p.z;
    } else {
      // 걸어오기 시작하는 프레임 — 지금 선 자리가 출발점이다 (막힘에서 풀린 것은 출발점을 안 바꾼다)
      if (st.phase === 'approach' && !ON_ROUTE.has(prevPhase.current)) walkFrom.current = Math.min(walked.current, goal);
      /*
       * 막힌 국면은 **걸어온 만큼에서** 멈춘다 — 걸음 4–5 에 개체가 나서면 총 든 것은 거기 서서 그 개체를 본다.
       * 걸음이 다시 이어지면(watch 로 물러나거나 approach 로) progress 가 그 뒤를 잇는다. 시간은 안 건드린다 (MIN_WALK_MS 불변)
       */
      if (!held) {
        const from = Math.min(walkFrom.current, goal);
        walked.current = st.phase === 'approach' ? from + (goal - from) * execution.progress() : goal;
      }
      const p = alongRoute(route, Math.min(walked.current, goal));
      tx = p.x;
      tz = p.z;
      if (st.phase === 'approach') travel = p;
      if (held && st.cover) {
        const c = patrol.of(st.cover);
        if (c) facing = c;
      }
    }
    prevPhase.current = st.phase;

    const was = { x: a.x, z: a.z };
    if (!a.set) {
      a.x = tx;
      a.z = tz;
      a.set = true;
    } else if (onRoute) {
      // 길 위에서는 길이 곧 자리다 — 완화가 끼면 걸음이 목표에 뒤처져 STOP 보다 멀리 선다
      a.x = tx;
      a.z = tz;
    } else {
      const k = Math.min(1, dt * EASE);
      a.x += (tx - a.x) * k;
      a.z += (tz - a.z) * k;
    }

    // 60 에서는 문가를 지키느라 방을 보고, 걸어오는 동안은 가는 쪽을, 막혔으면 사이에 선 개체를, 그 밖에는 **나를 본다**
    const want =
      st.phase === 'posted'
        ? Math.PI
        : facing
          ? Math.atan2(facing.x - a.x, facing.z - a.z)
          : travel
            ? Math.atan2(travel.dx, travel.dz)
            : Math.atan2(_me.x - a.x, _me.z - a.z);
    let dh = want - a.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    a.heading += dh * Math.min(1, dt * 4);

    // 실제로 나아간 거리로 걸음을 정한다 — 「걸어오는 중」이라는 말이 다리로도 보여야 한다
    const step = Math.hypot(a.x - was.x, a.z - was.z);
    anim.current = step > dt * 0.12 ? 'walk' : 'idle';
    speed.current = dt > 0 ? step / dt : 0;

    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.heading;
    // 센서에게도 곁 판정에게도 보인다 — 순찰 몸이 숨은 동안 **이것이 guard21 이다.** 걷는 몸에는 말을 못 걸고, 겨눈 뒤(aim · dead)로는
    // 곁에 서 있어도 말 상대가 아니다 — 「여기서부터는 아무것도 못 한다」. 안 그러면 죽은 화면 뒤에서 Enter 가 입력줄을 연다
    bystanders.set(EXECUTIONER_ID, a.x, a.z, a.heading);
    scenario2.place(EXECUTIONER_ID, a.x, a.z, anim.current === 'idle' && st.phase !== 'aim' && st.phase !== 'dead');
  });

  if (!spot) return null;

  return (
    // 이름은 확인 도구용 — 헤드리스 스크립트가 이 그룹을 찾아 자리와 총을 본다
    <group ref={group} name="exec" visible={false}>
      <group rotation={[lean.pitch, 0, lean.roll]}>
        <Suspense fallback={null}>
          {look?.enforcer ? (
            /*
             * 본판 중앙 시설의 그 몸이다 — 생김새 · 걸음 · 조준 · 총구 섬광까지 심문 AI 것을 그대로 쓴다 (cast 의 look.enforcer).
             * 자세는 클립이 아니라 enforcerPose 가 뼈로 만든다: 걸어올 때 walk, 총을 내린 뒤(unsling)부터 aim.
             */
            <EnforcerBody
              getMode={() => (AIM_PHASES.has(execution.get().phase) ? 'aim' : anim.current === 'walk' ? 'walk' : 'idle')}
              getSpeed={() => speed.current}
              getFlashAt={getShotAt}
              height={height}
            />
          ) : (
            <CastBody asset={asset} rifle={look?.rifle} getFlashAt={getShotAt} height={height} getAnim={() => anim.current} dress={skin} seed={21} />
          )}
        </Suspense>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
