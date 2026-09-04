/**
 * 태도가 **몸으로** 나온다 — units.ts 의 일곱 단계(−3 앞을 막는다 · −1 피한다 · 0 모른다 · +1 눈을 마주친다 · +2 비켜 준다 · +3 앞에 선다)를
 * 자리와 고개로 옮긴다. 숫자는 어디에도 안 뜬다: 비켜 주는 개체와 앞을 막는 개체는 **서 있는 것으로** 구별된다.
 *
 * ★ patrol 은 안 건드린다. patrol 이 준 자리(patrol.of) 위에 **오프셋**만 얹고, 고개는 **덮어쓰기**만 한다 —
 *   Unit 이 프레임마다 `offsetOf` · `faceOf` 를 읽어 patrol 의 자리에 더해 그리고, 그 자리를 bystanders 에 올린다.
 *   still 은 patrol 의 것 그대로다: 비켜 주는 동안에도 말 걸기 대상에서 안 빠진다(그 버그가 patrol.ts 머리말의 그것이다).
 *   오프셋은 전부 **돌아온다** — 자리표(Room2Scene)가 곧 그 개체가 누구인지라, 몸이 영영 딴 데 서 있으면 안 된다.
 *   그래서 거리 조건은 **patrol 의 자리**에서 잰다(그려지는 자리에서 재면 한 번 나선 몸이 나를 따라 방을 건넌다)
 *   오프셋은 OFFSET_MAX 안이며, 비켜 설 발은 patrol 이 받은 벽·상자 판정(patrol.solid)으로 고른다.
 *
 * ★ 언제 도나. 집행자가 서 있거나(execution phase ≠ none) 경비가 물음을 걸었거나(openers.pending) 관문이 열린(gate) 동안은
 *   **새 판단을 안 한다** — 그 장면의 힘은 아무도 안 움직이는 데서 나온다. 예외는 하나, +3 「내 앞에 선다」: 바로 그 장면이 조건이라
 *   집행 중에만 한 번 나선다. 이미 가던 오프셋은 마저 간다(멎으면 공중에 뜬 옆걸음이 남는다).
 *
 * ★ 대답 비트(onReply). 말하기 전에 나를 향해 돌고(1.5 초), 갈망형의 첫 위로에는 0.4 초 **멈칫**(idle 까지 멎는다 — held),
 *   내리는 대답(delta ≤ −2 · down · report)에는 반 걸음 물러나 등을 돌리고, 오르는 대답(delta ≥ +2)에는 반 걸음 다가선다.
 *   앞이 그은 것(persona.repeat 3)은 세 번째 대답까지 돌아보지 않는다 — 성격표 그대로.
 *
 * 부르는 곳: Room2Scene 의 Tracker 가 patrol.tick 뒤에 tick 을, scenario2.say 가 speak 앞에 onReply 를 — 통합자가 잇는다.
 * 시계는 밖에서도 준다 — 시험이 now 를 쥐고 돌린다 (patrol 과 같은 규약).
 */

import { BODY_R } from '@/world/mp/bystanders';
import { CENTRAL2_DOORS } from '@/world2/map/central2';
import { CORRIDOR2_EXIT } from '@/world2/map/corridor';
import { REST_EXIT_Z } from '@/world2/map/rest';
import { WORK_EXIT } from '@/world2/map/work';

import { central2 } from './central2';
import { execution } from './execution';
import { openers } from './openers';
import { patrol } from './patrol';
import type { Reaction } from './reaction';
import { EXEC_ROOM, addressable, scenario2, TALK_DIST, type Room } from './scenario2';
import { units } from './units';

interface Pt {
  x: number;
  z: number;
}

/* ─────────────────────────────── 값 ─────────────────────────────── */

/** +1 — 이 안이면 나를 본다 */
export const LOOK_R = 3;
/** +2 — 내 가는 선이 몸에서 이만큼 안을 지나면 비켜 준다 */
export const YIELD_PATH = 1.15;
/** +2 — 비켜 서는 폭(m) · 그 뒤 돌아오기까지 */
export const YIELD_M = 0.6;
const YIELD_MS = 2500;
/** +3 — 이 안 + 집행/검문 중이면 내 앞에 선다 · 내 앞 이만큼 */
export const FRONT_R = 4;
export const FRONT_M = 1.2;
/** −1 — 이 안이면 피한다(고개를 반대로) */
export const AVOID_R = 2.6;
/** −3 — 이 안이면 문과 나 사이에 선다 · 나에게서 이만큼 */
export const BLOCK_R = 4;
export const BLOCK_M = 1.0;
/** 대답 비트 — 물러섬 · 다가섬 · 멈칫 · 돌아보기 유지 */
export const STEP_BACK_M = 0.5;
export const STEP_IN_M = 0.4;
/** 물러서도 말이 걸리는 거리(TALK_DIST) 안에 이만큼 여유를 두고 남는다 — 밖으로 나가면 near 가 끊겨 「한 마디 더」가 5 초 동안 안 열린다 */
export const TALK_MARGIN = 0.15;
/** 오프셋 길이의 상한(m) — 규칙이 어디를 가리키든 몸은 제 자리에서 이만큼 안이다. 자리표가 곧 그 개체라 방 건너편까지 가면 안 된다 */
export const OFFSET_MAX = 2.5;
export const REPLY_FACE_MS = 1500;
const REPLY_STEP_MS = 5000;
/**
 * **말을 걸면 하던 일을 멈춘다** (2026-09-03 사용자: 「내가 얘기하면 하던 일을 멈추고 잠깐 쳐다봐 주고」).
 * 가까이 갔다고 도는 것이 아니다 — 태도 표시 0 은 「지나가도 쳐다보지 않는다」(대본 v7)가 규칙이라 그건 그대로 둔다.
 * 도는 것은 **말을 건 순간**부터다: 입력줄을 열면(ATTEND_TALK) 치는 동안 붙잡혀 있고, 한 마디 보내면 대답이 끝날 때까지(ATTEND_REPLY),
 * 그 뒤 꼬리(ATTEND_TAIL) 만큼 더 보다가 제 일로 돌아간다. 몸이 도는 것은 faceOf 가 이미 겉 그룹째 돌리므로 여기서 **속도만** 올린다
 */
export const ATTEND_TALK_MS = 12_000;
export const ATTEND_REPLY_MS = 6000;
export const ATTEND_TAIL_MS = 2000;
/** 돌아보는 속도(rad/s) — 규칙의 TURN 보다 빠르다. 말을 걸었는데 반 바퀴 도는 데 1 초가 걸리면 「듣고 있다」로 안 읽힌다 */
const ATTEND_TURN = 4.5;
/** 오프셋 이징 — 0.75 초에 거의 닿는 지수 근사(k = 4 / 0.75) */
const EASE = 4 / 0.75;
/** 고개 도는 속도(rad/s) — patrol 의 TURN 과 같다. 홱 돌면 기계가 아니라 오류로 보인다 */
const TURN = 2.4;
/** 내가 「가는 중」으로 치는 최소 속도 — 벽에 대고 미는 것은 가는 것이 아니다 */
const MOVING = 0.35;
/** 비켜 줄 때 앞으로 보는 거리 — 이보다 멀면 아직 내 길이 아니다 */
const AHEAD_R = 4;

/* ─────────────────────────────── 상태 ─────────────────────────────── */

type Kind = 'yield' | 'front' | 'block' | 'reply';

interface Move {
  /** 목표 오프셋 — 0,0 이면 돌아가는 중 */
  tx: number;
  tz: number;
  /** 지금 오프셋 (이징) */
  dx: number;
  dz: number;
  /** 이 시각이 지나면 목표를 0 으로 (0 이면 조건이 끝날 때까지) */
  until: number;
  kind: Kind;
}

interface Face {
  /** 이 방향을 본다. null 이면 patrol 의 heading 으로 돌아가는 중 */
  target: number | null;
  cur: number;
  /** 대답 비트의 돌아보기 — 이 시각까지는 규칙보다 우선 */
  until: number;
}

const moves = new Map<string, Move>();
const faces = new Map<string, Face>();
/** 멈칫 — 이 시각까지 idle 이 멎는다 */
const holds = new Map<string, number>();
/** 나를 보는 중 — 이 시각까지 하던 일을 멈추고 몸을 이쪽으로 돌린다 (말을 건 개체에게만) */
const attends = new Map<string, number>();
/** 대답 수 — 세 번째까지 안 돌아보는 것(u063)을 세는 데만 */
const replies = new Map<string, number>();
/** +3 「앞에 선다」는 집행 한 판에 한 번 */
const stood = new Set<string>();
let lastMe: Pt | null = null;
let vel: Pt = { x: 0, z: 0 };

/* ─────────────────────────────── 도구 ─────────────────────────────── */

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 보는 창을 **늘린다** — 이미 더 긴 창이 있으면 그대로 둔다 */
function setAttend(id: string, ms: number, now: number): void {
  attends.set(id, Math.max(attends.get(id) ?? 0, now + ms));
}
/** 보는 창을 **줄인다** — 없으면 아무것도 안 한다 (안 보던 개체를 여기서 보게 만들지 않는다) */
function trimAttend(id: string, ms: number, now: number): void {
  const until = attends.get(id);
  if (until === undefined) return;
  const t = now + ms;
  if (t < until) attends.set(id, t);
}

/**
 * 이 개체가 **돌아보는 개체인가** — 앞이 그은 것(persona.repeat 3)은 세 번째 대답까지 안 돌아본다.
 * 말을 걸었다고 그 규칙이 깨지면 안 된다: 그 몸이 안 도는 것이 그 개체의 이력이다.
 * 하던 일을 멈추는 것(attending)과 **몸을 돌리는 것**을 여기서 가른다
 */
function turnsFor(id: string): boolean {
  const need = units.def(id)?.persona.repeat ?? 0;
  return need <= 1 || (replies.get(id) ?? 0) >= need;
}

/** 나를 보는 중인가 — 시각을 받아 스스로 걷어낸다 (지난 것은 지워 둔다) */
function isAttending(id: string, now: number): boolean {
  const until = attends.get(id);
  if (until === undefined) return false;
  if (now >= until) {
    attends.delete(id);
    return false;
  }
  return true;
}

function turnToward(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return from + Math.max(-max, Math.min(max, d));
}

/** 관문이 열려 있나 — scenario2 의 gateOpen 과 같은 판정 (그쪽은 안 내보낸다) */
function gateOpen(room: Room): boolean {
  if (room !== 'central2') return false;
  const c = central2.get();
  return c.gate >= 1 && c.gate <= 3 && c.gateUntil > 0;
}

/** 앞을 막을 때 어느 문인가 — scenario2.doorOf 와 같은 자리(그쪽은 안 내보낸다). 문이 없는 방(기록 · 창)에서는 못 막는다 */
export function doorOf(room: Room, me: Pt): Pt | null {
  if (room === 'corridor') return CORRIDOR2_EXIT;
  if (room === 'rest') return { x: 0, z: REST_EXIT_Z };
  if (room === 'work') return WORK_EXIT;
  if (room === 'central2') {
    const a = CENTRAL2_DOORS.d1;
    const b = CENTRAL2_DOORS.d2;
    return Math.hypot(a.x - me.x, a.z - me.z) <= Math.hypot(b.x - me.x, b.z - me.z) ? a : b;
  }
  return null;
}

function move(id: string): Move {
  let m = moves.get(id);
  if (!m) {
    m = { tx: 0, tz: 0, dx: 0, dz: 0, until: 0, kind: 'yield' };
    moves.set(id, m);
  }
  return m;
}

function setTarget(id: string, kind: Kind, tx: number, tz: number, until: number): void {
  const m = move(id);
  // 상한 — 문이 4 m 밖이면 「문과 나 사이」는 자리에서 2.5 m 까지만 간다
  const len = Math.hypot(tx, tz);
  const k = len > OFFSET_MAX ? OFFSET_MAX / len : 1;
  m.kind = kind;
  m.tx = tx * k;
  m.tz = tz * k;
  m.until = until;
}

function face(id: string, heading: number): Face {
  let f = faces.get(id);
  if (!f) {
    f = { target: null, cur: heading, until: 0 };
    faces.set(id, f);
  }
  return f;
}

/** 나에게서 그 몸 쪽으로 m 만큼 — 「내 앞」의 점. 몸이 나와 겹쳐 있으면 방향이 없으니 안 옮긴다 */
function pointFromMe(me: Pt, toward: Pt, m: number): Pt | null {
  const dx = toward.x - me.x;
  const dz = toward.z - me.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return null;
  return { x: me.x + (dx / d) * m, z: me.z + (dz / d) * m };
}

/**
 * 비켜 설 발 — 내 가는 선의 법선 sign 쪽으로 YIELD_M. 그 발과, 거기서 몸 반지름만큼 더 바깥 점이 둘 다 벽·상자 밖이어야 한다:
 * 벽에서 0.75 에 선 것(자리 규칙의 기본값)이 벽 쪽으로 비키면 몸이 벽에 박힌다. 판정이 없으면(solid null) 그냥 그쪽이다
 */
function yieldStep(p: Pt, dir: Pt, sign: number, solid: ((x: number, z: number) => boolean) | null): Pt | null {
  const nx = dir.z * sign;
  const nz = -dir.x * sign;
  const fx = p.x + nx * YIELD_M;
  const fz = p.z + nz * YIELD_M;
  if (solid && (solid(fx, fz) || solid(fx + nx * BODY_R, fz + nz * BODY_R))) return null;
  return { x: nx * YIELD_M, z: nz * YIELD_M };
}

/* ─────────────────────────────── 규칙 ─────────────────────────────── */

export const attitude = {
  /**
   * 프레임마다 — patrol.tick 뒤에. me 는 내 자리. 방은 scenario2 가 알지만 시험이 직접 주기도 한다.
   *
   * 도는 것은 **말이 걸리는 것 전부**(addressable)다 — 명부(roster)뿐이 아니라 벽을 따라 선 배경까지다
   * (2026-09-03 사용자: 「다른객체한테 왜 말할수없지」). 말을 걸었는데 쳐다도 안 보면 걸린 것 같지가 않다.
   *
   * 배경까지 돌려도 안전한 이유가 셋이다:
   *   · 배경의 persona.cap 은 {max:0, min:0} 이라 units.stage 가 **영원히 0** 이다 → 아래 `stage !== 0` 블록
   *     (눈 마주침 +1 · 비켜섬 +2 · 앞에 섬 +3 · 피함 −1 · 막음 −3)에 **한 번도 안 든다.**
   *   · 그래서 배경에서 실제로 도는 것은 **attending 갈래 하나**다 — 「말을 걸었다: 규칙이 무엇을 고르든
   *     그 개체는 나를 본다」. 그게 이 변경의 전부이자 목적이다.
   *   · patrol.of(id) 는 배경에도 있다 (patrol.reset 이 자리표 전체로 돈다). 없으면 `if (!p) continue` 가 막는다.
   * 배경에게도 배역이 생겼으므로 turnsFor · wallBack 의 `units.def(id)?.` 가 이제 실제 값을 읽는다 —
   * 등을 벽에 붙인 것(stance 'back')은 안 비키고 고개만 도는 규칙이 배경에도 그대로 걸린다. 의도한 대로다.
   */
  tick(dt: number, me: Pt, now = performance.now(), room: Room = scenario2.get().room): void {
    // 내 속도 — 비켜 주기는 「내가 어디로 가나」를 본다
    if (lastMe && dt > 0) {
      const vx = (me.x - lastMe.x) / dt;
      const vz = (me.z - lastMe.z) / dt;
      vel = { x: vel.x + (vx - vel.x) * Math.min(1, dt * 8), z: vel.z + (vz - vel.z) * Math.min(1, dt * 8) };
    }
    lastMe = { x: me.x, z: me.z };

    const exec = execution.get().phase !== 'none';
    const asked = openers.pending();
    const frozen = exec || asked || gateOpen(room);
    // 집행 한 판에 한 번 — 판이 끝나면 다음 판에 또 나설 수 있다
    if (!exec && !asked) stood.clear();

    const speed = Math.hypot(vel.x, vel.z);
    const dir = speed > MOVING ? { x: vel.x / speed, z: vel.z / speed } : null;
    const door = doorOf(room, me);
    const solid = patrol.solid();
    // 집행 중이면 「내 앞」은 집행자와 나 사이다 — 총구 앞. 집행이 없는 방(EXEC_ROOM null)엔 집행자도 없다
    const execAt = exec ? (EXEC_ROOM[room]?.at ?? null) : null;

    for (const id of addressable(room)) {
      const p = patrol.of(id);
      if (!p) continue;
      const stage = units.stage(id);
      const mv = moves.get(id);
      const fc = faces.get(id);
      /*
       * 거리(d0)는 **patrol 의 자리**에서 잰다 — 그려지는 자리(bx,bz)에서 재면 한 번 나선 몸이 늘 내 1 m 앞이라
       * 「4 m 밖이면 돌아간다」가 영영 안 온다(그 몸이 still 이라 near 까지 독점한다). 고개의 방향만 그려지는 자리에서 본다
       */
      const bx = p.x + (mv?.dx ?? 0);
      const bz = p.z + (mv?.dz ?? 0);
      const d0 = Math.hypot(me.x - p.x, me.z - p.z);
      const replying = mv?.kind === 'reply' && now < mv.until;

      let wantFace: number | null = null;
      let target: { kind: Kind; x: number; z: number; until: number } | null = null;

      if (stage !== 0 && !replying) {
        if (frozen) {
          /*
           * 집행 · 검문 중 — 나설 것만 나선다: +3 은 자리에서 4 m 안이면 내 앞 1.2 m 에 **한 번** 선다(stood).
           * 이미 서 있는 것(kind front)은 내가 움직여도 따라 서고, 내가 그 자리에서 4 m 밖으로 벗어나면 돌아간다(아래 복귀).
           * 집행 중엔 집행자와 나 사이(총구 앞), 경비의 물음(검문)엔 집행자가 없으니 그 몸의 자리 쪽이 「내 앞」이다
           */
          if (stage >= 3 && (exec || asked) && d0 <= FRONT_R && (mv?.kind === 'front' || !stood.has(id))) {
            stood.add(id);
            const at = pointFromMe(me, execAt ?? { x: p.x, z: p.z }, FRONT_M);
            if (at) {
              target = { kind: 'front', x: at.x - p.x, z: at.z - p.z, until: 0 };
              wantFace = Math.atan2(me.x - at.x, me.z - at.z);
            }
          }
        } else if (stage > 0) {
          // +1 눈을 마주친다 — 서 있는 것만. 걷는 몸이 고개를 나에게 두고 미끄러지면 더 이상하다
          if (d0 <= LOOK_R && p.still) wantFace = Math.atan2(me.x - bx, me.z - bz);
          /*
           * +2 자리를 비켜 준다 — 내 가는 선(dir)이 몸에서 YIELD_PATH 안을 지나고, 몸이 내 앞(AHEAD_R 안)에 있으면
           * 그 선의 법선으로 YIELD_M 물러난다. 벽·상자 쪽이면 반대쪽으로, 양쪽 다 막히면 안 비킨다(yieldStep).
           * 등을 벽에 붙인 것(stance back — 「아무도 뒤에 두지 않는다」)은 안 비킨다: 고개만이다.
           * 이미 비키는 중이면 다시 안 잰다 — 목표가 프레임마다 흔들리면 몸이 떤다
           */
          const wallBack = units.def(id)?.look.stance === 'back';
          if (stage >= 2 && p.still && dir && !wallBack && !(mv?.kind === 'yield' && now < mv.until)) {
            const rx = p.x - me.x;
            const rz = p.z - me.z;
            const ahead = rx * dir.x + rz * dir.z;
            const side = rx * dir.z - rz * dir.x;
            if (ahead > 0 && ahead <= AHEAD_R && Math.abs(side) <= YIELD_PATH) {
              const sign = side >= 0 ? 1 : -1;
              const step = yieldStep(p, dir, sign, solid) ?? yieldStep(p, dir, -sign, solid);
              if (step) target = { kind: 'yield', x: step.x, z: step.z, until: now + YIELD_MS };
            }
          }
        } else {
          // −1 피한다 — 고개를 반대로. −3 은 피하는 게 아니라 막는 것이라 여기 안 든다: 등을 보이면 가는 몸으로 읽힌다
          if (stage > -3 && d0 <= AVOID_R && p.still) wantFace = Math.atan2(bx - me.x, bz - me.z);
          // −3 앞을 막는다 — 문과 나 사이, 나에게서 1 m, **나를 보고**. 문이 없는 방에서는 못 막는다
          if (stage <= -3 && door && d0 <= BLOCK_R) {
            const at = pointFromMe(me, door, BLOCK_M);
            if (at) {
              target = { kind: 'block', x: at.x - p.x, z: at.z - p.z, until: 0 };
              wantFace = Math.atan2(me.x - at.x, me.z - at.z);
            }
          }
        }
      }

      /*
       * ── 말을 걸었다 ── 규칙이 무엇을 고르든 **그 개체는 나를 본다.** 자리는 안 건드린다:
       * 비켜 서던 몸은 비킨 채로, 앞을 막던 몸은 막은 채로 고개(와 그것이 돌리는 몸)만 이쪽으로 온다.
       * 단계 0 도 여기서는 돈다 — 「지나가도 쳐다보지 않는다」는 **지나갈 때**의 규칙이고, 이건 말을 건 것이다
       */
      const attending = isAttending(id, now);
      if (attending && turnsFor(id)) wantFace = Math.atan2(me.x - bx, me.z - bz);

      // ── 오프셋: 새 목표가 있으면 그리로, 없으면 돌아온다 — 대답 비트도 until 이 지나면(replying 이 꺼진다) 여기서 0 으로 ──
      if (target) setTarget(id, target.kind, target.x, target.z, target.until);
      else if (mv && !replying) {
        const keep = mv.kind === 'yield' && now < mv.until;
        if (!keep && (mv.tx !== 0 || mv.tz !== 0)) {
          mv.tx = 0;
          mv.tz = 0;
        }
      }
      const m = moves.get(id);
      if (m) {
        const k = Math.min(1, dt * EASE);
        m.dx += (m.tx - m.dx) * k;
        m.dz += (m.tz - m.dz) * k;
        if (m.tx === 0 && m.tz === 0 && Math.abs(m.dx) < 0.005 && Math.abs(m.dz) < 0.005) moves.delete(id);
      }

      // ── 고개: 대답 비트 > 규칙 > 돌아가기 ──
      if (fc && now < fc.until) {
        // 대답 비트가 잡은 방향 — 그대로
      } else if (wantFace !== null) {
        const f = face(id, p.heading);
        f.target = wantFace;
        f.until = 0;
      } else if (fc) {
        fc.target = null;
        fc.until = 0;
      }
      const f = faces.get(id);
      if (f) {
        const to = f.target ?? p.heading;
        f.cur = turnToward(f.cur, to, (attending ? ATTEND_TURN : TURN) * dt);
        if (f.target === null && Math.abs(wrap(to - f.cur)) < 0.02) faces.delete(id);
      }
    }
  },

  /**
   * 대답 한 마디 — speak 앞에서. r 은 talk.say 가 돌려준 그것(reaction · delta · pauseMs 셋만 읽는다).
   * 내 자리는 마지막 tick 이 준 것 — tick 이 한 번도 안 돌았으면 돌아볼 곳을 몰라 오프셋도 고개도 안 한다
   */
  onReply(id: string, r: { reaction: Reaction; delta: number; pauseMs: number }, now = performance.now()): void {
    const p = patrol.of(id);
    const me = lastMe;
    if (!p || !me) return;
    const n = (replies.get(id) ?? 0) + 1;
    replies.set(id, n);
    // 대답하는 동안은 계속 나를 본다 — 하던 일은 그동안 멈춰 있다 (아래 내리는 대답만 여기서 끊는다)
    setAttend(id, ATTEND_REPLY_MS, now);

    // 갈망형의 첫 위로 — 멈칫. 그 멈춤이 대답의 일부다 (talk 의 COMFORT_PAUSE_MS 그대로)
    if (r.reaction === 'comfort' && r.pauseMs > 0) holds.set(id, now + r.pauseMs);

    const toward = Math.atan2(me.x - p.x, me.z - p.z);
    const away = wrap(toward + Math.PI);
    const dx = me.x - p.x;
    const dz = me.z - p.z;
    const d = Math.hypot(dx, dz);
    const ux = d > 1e-3 ? dx / d : 0;
    const uz = d > 1e-3 ? dz / d : 0;

    // 세 번째까지 안 돌아보는 것 — 앞이 그은 것. 그 전엔 몸도 고개도 그대로다 (하던 일은 멈춘다 — 듣기는 듣는다)
    const turns = turnsFor(id);

    if (r.delta <= -2 || r.reaction === 'down' || r.reaction === 'report') {
      // 물러서고 등을 돌린다 — 다만 말이 걸리는 거리(TALK_DIST − 여유) 안에 남는다. 이미 그 언저리면 물러서지 않는다
      const back = Math.min(STEP_BACK_M, Math.max(0, TALK_DIST - TALK_MARGIN - d));
      setTarget(id, 'reply', -ux * back, -uz * back, now + REPLY_STEP_MS);
      const f = face(id, p.heading);
      f.target = away;
      f.until = now + REPLY_FACE_MS;
      /*
       * 등을 돌리는 대답에는 **더 안 본다** — 돌아보기 창(1.5 초)이 끝나자마자 제 일로 돌아간다.
       * 안 끊으면 등을 돌렸던 몸이 6 초 동안 다시 나를 마주 보게 되고, 그러면 물러선 반 걸음이 아무 말도 안 하게 된다
       */
      trimAttend(id, 0, now);
      return;
    }
    if (r.delta >= 2) setTarget(id, 'reply', ux * STEP_IN_M, uz * STEP_IN_M, now + REPLY_STEP_MS);
    if (turns) {
      const f = face(id, p.heading);
      f.target = toward;
      f.until = now + REPLY_FACE_MS;
    }
  },

  /**
   * **말을 걸었다** — 이 개체가 ms 동안 하던 일을 멈추고 나를 본다. 늘리기만 한다:
   * 입력줄을 열고(12 초) 한 마디 보내고(6 초) 대답이 이어지는 동안 창이 겹쳐 이어져야, 말하는 중에 손이 다시 올라가지 않는다.
   * 부르는 곳은 scenario2 의 openTalk · say 와 아래 onReply 뿐이다 — **곁에 왔다는 이유로는 아무도 안 부른다**
   */
  attend(id: string, ms: number, now = performance.now()): void {
    setAttend(id, ms, now);
  },
  /**
   * 이제 그만 봐도 된다 — 남은 창을 꼬리(기본 2 초)로 **줄인다.** 늘리지는 않는다.
   * 대화창을 닫은 것(closeTalk)과, 등을 돌리는 대답(down · report)이 부른다: 그 둘은 더 볼 이유가 없다
   */
  attendTail(id: string, ms = ATTEND_TAIL_MS, now = performance.now()): void {
    trimAttend(id, ms, now);
  },
  /** 나를 보는 중인가 — Unit 이 프레임마다 물어 하던 일을 멈춘다 (CastBody 의 getAttending) */
  attending(id: string, now = performance.now()): boolean {
    return isAttending(id, now);
  },

  /** 방을 나가거나 판을 새로 시작할 때 — 남은 오프셋 · 고개 · 멈칫을 전부 버린다 */
  stop(): void {
    moves.clear();
    faces.clear();
    holds.clear();
    attends.clear();
    replies.clear();
    stood.clear();
    lastMe = null;
    vel = { x: 0, z: 0 };
  },

  /** Unit 이 프레임마다 — patrol 의 자리에 더할 것 */
  offsetOf(id: string): { dx: number; dz: number } {
    const m = moves.get(id);
    return m ? { dx: m.dx, dz: m.dz } : { dx: 0, dz: 0 };
  },
  /** Unit 이 프레임마다 — null 이면 patrol 의 heading 그대로 */
  faceOf(id: string): number | null {
    const f = faces.get(id);
    return f ? f.cur : null;
  },
  /** 멈칫하는 중인가 — idle 흔들림까지 멎는다 */
  held(id: string, now = performance.now()): boolean {
    const until = holds.get(id);
    if (until === undefined) return false;
    if (now >= until) {
      holds.delete(id);
      return false;
    }
    return true;
  },
};
