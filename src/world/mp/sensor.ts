/**
 * 의심도 감지 — 프레임마다 내 몸(위치·정면·동작·입력)과 남들(remotePlayers·bystanders)을 대조해 mp/suspicion.ts 를 움직인다.
 * scene/WorldScene 의 LocalRig 가 부른다. three 타입은 안 쓰고 숫자만 받는다.
 *
 * ★ **보는 것으로는 오르지 않는다** (2026-09-01 사용자: "시선 쳐다보는 거나 이런 걸로 의심도를 올리지 마 —
 *   너무 어이없게 죽는 경우가 많아"). 예전엔 셋이 더 있었다:
 *     응시   — AI 를 1.6초 넘게 쳐다보면 초당 +3.2
 *     관심   — 콘솔·관찰창 같은 '인간 전용 물건' 을 가까이서 보면 초당 +2.4
 *     급회전 — 1.2초 안에 시야를 한 바퀴 넘게 돌리면 +6
 *   셋 다 **마우스를 움직이는 것만으로** 찼다. 길을 찾느라 둘러보고, 말하는 상대를 보고, 어디로 가야 하나 두리번거리는
 *   동안 게이지가 올라 100 에서 사살당했다. 면제 규칙(질문 중에는 안 센다·재검실에서는 안 센다)을 곳곳에 덧대며
 *   버텨 왔지만, 덧댈수록 "언제 봐도 되는지"를 아무도 모르게 됐다. 그래서 규칙 자체를 걷어낸다.
 *
 * 지금 남은 감지는 **내가 단추를 눌러서 하는 짓**뿐이다:
 *   뒷걸음 — 남이 정면 가까이(BACK_DIST) 있는데 뒤로 걷는다(moveZ<0) → 그 **한 장면**을 모아 판정에 넘긴다.
 *            얼마나 오래·얼마나 멀리 물러섰나, 그때 그 개체는 다가오고 있었나. 값은 여기서 정하지 않는다 (아래 ★★).
 *   감정   — 이모트(화남·동의)가 켜지는 순간 +. 화남이 더 크다.
 *   돌발   — 점프하는 순간 +(10초 안에 거듭하면 더). AI 는 이유 없이 뛰지 않는다.
 *   그 밖에 말투(judgeLine)와 검문·재검 판정이 의심도를 움직인다 — 그쪽은 여기가 아니라 각 챕터가 부른다.
 *   ★ 가만히 있는다고 내려가지 않는다 (2026-08-29 사용자 결정) — 내려가는 건 AI 다운 말과 추궁 통과뿐이다.
 *   ★★ 뒷걸음의 크기는 **AI 가 상황을 보고 정한다** (2026-08-30 사용자: "어떤 상황엔 올리고 어떤 상황엔 안 올릴지 AI 판단에 맡기자").
 *     고정 규칙(초당 +5)은 경비가 다가와 비켜 준 것도, 굉음을 피한 것도 전부 공포로 쳤다. 이제 센서는 장면만 모아
 *     `setBackstepJudge()` 로 붙은 판정기(features/world/backstep.ts → LLM)에 넘긴다. 판정기가 없으면 거친 폴백(judgeBackstep)으로 친다.
 *   ★ 의심도는 언제나 **AI 가 보고 있을 때만** 오른다 (2026-08-30 사용자 지적 "아무도 안 보는데 점프해도 올랐다").
 *     돌발·감정은 WITNESS_DIST 안에서 나를 향해 서 있는 개체가 하나라도 있어야 하고(`witnessed`),
 *     뒷걸음은 **그 상대 개체 자신이** 나를 향하고 있어야 한다(`facesMe`) — 등을 돌린 개체 앞에서는 성립하지 않는다.
 *     방향을 모르는 개체(heading 없음)는 보고 있는 것으로 친다 — 모르면 안전하게.
 */

import { judgeBackstep, type BackstepRequest, type BackstepWatcher } from '../../lab/backstep';
import { remotePlayers } from '../net/remote-players';
import { bystanders } from './bystanders';
import type { AnimState } from './protocol';
import { suspicion } from './suspicion';

/** 곁에 있는 개체를 훑는 반경(m) — 뒷걸음 장면이 여기 안에서 이어진다 */
const SEE_DIST = 12;
/** 목격 — 이 거리 안에서 정면(반각 WITNESS_ANGLE)에 내가 든 개체가 있으면 "보고 있다". 방향을 모르는 개체는 거리로만 */
const WITNESS_DIST = 11;
const WITNESS_COS = Math.cos((75 * Math.PI) / 180);
const BACK_DIST = 4.5;
/** 뒷걸음 한 장면 — 이만큼 물러서야 판정에 올린다 / 멈춘 지 이만큼이면 장면이 끝난다 / 길어도 이만큼에서 한 번 끊는다 */
const BACK_MIN_S = 0.5;
const BACK_GRACE_S = 0.35;
const BACK_MAX_S = 3;
const EMOTE_BUMP: Record<AnimState, number> = { idle: 0, walk: 0, angry: 10, agree: 4 };
/** 점프 — 첫 번은 이만큼, 10초 안에 또 뛰면 더 */
const JUMP_BUMP = 10;
const JUMP_AGAIN_BUMP = 14;
const JUMP_AGAIN_MS = 10_000;

/** 지금 이어지고 있는 뒷걸음 한 장면 */
interface BackRun {
  t: number;
  /** 물러서기를 멈춘 뒤 흐른 시간 — BACK_GRACE_S 를 넘으면 장면이 끝난다 */
  idle: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  /** 그때 나를 보고 있던 개체들 — id 별 처음/마지막 거리 */
  watchers: Map<string, { kind: 'ai' | 'player'; from: number; to: number }>;
}

const acc = {
  back: null as BackRun | null,
  lastAnim: 'idle' as AnimState,
  lastJumpAt: -Infinity,
};

export interface SenseInput {
  dt: number;
  x: number;
  z: number;
  /** 정면 단위 벡터 (xz) */
  fx: number;
  fz: number;
  anim: AnimState;
  /** 앞뒤 입력 (−1 뒤) */
  moveZ: number;
  /** 이 프레임에 점프를 시작했다 */
  jumped: boolean;
}

/** 마지막으로 sense() 에 들어온 내 자리 — 캔버스 밖(WorldFeature)에서 "나와 가장 가까운 경비"를 고를 때 쓴다 (무장 AI 출동) */
let lastX = 0;
let lastZ = 0;
export function playerAt(): { x: number; z: number } {
  return { x: lastX, z: lastZ };
}
/** 잠금이 없어 sense() 가 안 도는 프레임에도 자리는 적어 둔다 (LocalRig) — 채팅 말투로 100 을 넘겨도 가까운 경비를 고를 수 있게 */
export function markPlayer(x: number, z: number): void {
  lastX = x;
  lastZ = z;
}

/* ─────────────────────────────── 뒷걸음 장면 ─────────────────────────────── */

/** 한 장면이 끝났다 — 화면(features/world/backstep.ts)이 LLM 에 물어 값을 정한다 */
export type BackstepEpisode = Pick<BackstepRequest, 'seconds' | 'meters' | 'watchers'>;
let onBackstep: ((ep: BackstepEpisode) => void) | null = null;

/**
 * 뒷걸음 판정기를 붙인다 (WorldFeature 가 화면을 열 때). 떼려면 null.
 * 안 붙어 있으면 센서가 폴백(judgeBackstep)으로 스스로 친다 — 규칙이 조용히 죽지 않게
 */
export function setBackstepJudge(fn: ((ep: BackstepEpisode) => void) | null): void {
  onBackstep = fn;
}

/** 장면을 닫아 넘긴다. 너무 짧으면 버린다 (스치듯 한 걸음은 아무것도 아니다) */
function closeBackRun(run: BackRun, now: number): void {
  acc.back = null;
  if (run.t < BACK_MIN_S) return;
  const watchers: BackstepWatcher[] = [...run.watchers.values()]
    .map((w) => ({ kind: w.kind, from: +w.from.toFixed(2), to: +w.to.toFixed(2), approaching: w.to < w.from - 0.3 }))
    .sort((a, b) => a.to - b.to);
  if (!watchers.length) return;
  const ep: BackstepEpisode = { seconds: +run.t.toFixed(2), meters: +Math.hypot(run.x - run.fromX, run.z - run.fromZ).toFixed(2), watchers };
  if (onBackstep) {
    onBackstep(ep);
    return;
  }
  // 판정기가 없다 — 상황을 못 읽는 폴백으로 친다
  const v = judgeBackstep({ kind: 'backstep', ...ep, suspicion: suspicion.get().value, sync: 100, scene: '', recent: [] });
  if (v.delta > 0) suspicion.bump(v.delta, '뒷걸음', now);
}

/**
 * 그 개체(px,pz,heading)가 (x,z) 의 나를 볼 수 있나 — 아바타 정면은 로컬 +z 라 heading h 의 정면 벡터는 (sin h, cos h).
 * 방향을 모르면(heading 없음) 보고 있는 것으로 친다. 잣대는 witnessed 와 같은 WITNESS_COS
 */
function facesMe(px: number, pz: number, heading: number | undefined, x: number, z: number, d: number): boolean {
  if (heading === undefined || Number.isNaN(heading)) return true;
  return ((x - px) * Math.sin(heading) + (z - pz) * Math.cos(heading)) / (d || 1) > WITNESS_COS;
}

/** 지금 (x,z) 의 나를 보고 있는 AI 가 있나 — 돌발·감정의 전제. SYNC 글리치의 "누가 봤나"도 이걸 쓴다 */
export function witnessed(x: number, z: number): boolean {
  let seen = false;
  const check = (px: number, pz: number, heading: number | undefined) => {
    if (seen) return;
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d > WITNESS_DIST) return;
    if (facesMe(px, pz, heading, x, z, d)) seen = true;
  };
  remotePlayers.each((p) => check(p.pose.x, p.pose.z, p.pose.heading));
  bystanders.each((b) => check(b.x, b.z, b.heading));
  return seen;
}

/** 한 프레임 감지. 넘긴 문턱이 있으면 돌려준다 (호출자가 시스템 대사를 띄운다) */
/**
 * 점프를 의심의 근거로 세나 — 기본은 센다(본판 그대로). 시나리오 2 는 끈다: 방을 걸어 다니는 조작일 뿐인데
 * 뛰었다고 의심도가 오르면 플레이어가 **조작을 무서워한다** (2026-09-03 사용자). 판을 떠날 때 되돌린다.
 */
let jumpWatched = true;
export function watchJump(on: boolean): void {
  jumpWatched = on;
}

export function sense(inp: SenseInput, now = performance.now()): ReturnType<typeof suspicion.bump> {
  const { dt, x, z, fx, fz } = inp;
  lastX = x;
  lastZ = z;
  let hit: ReturnType<typeof suspicion.bump> = null;

  /*
   * 뒷걸음에 실릴 개체들 — 방에서 온 사람들(remotePlayers)과 맵이 세운 개체들(bystanders)을 함께 훑는다.
   * 앞엣것만 보면 혼자 하는 챕터에서는 명부가 늘 비어 있어 아무 일도 안 일어난다.
   */
  /** 내 앞에서 나를 마주 보고 있는 개체들 (가까우면 장면을 열고, 멀어져도 장면은 이어진다) */
  const front: { id: string; kind: 'ai' | 'player'; d: number }[] = [];
  const look = (id: string, kind: 'ai' | 'player', px: number, pz: number, heading: number | undefined) => {
    const dx = px - x;
    const dz = pz - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3 || d > SEE_DIST) return;
    // 등을 돌린 개체는 내가 물러서는 줄도 모른다 (2026-08-30 사용자)
    if (!facesMe(px, pz, heading, x, z, d)) return;
    if ((dx * fx + dz * fz) / d > 0.6) front.push({ id, kind, d });
  };
  remotePlayers.each((p) => look(p.id, 'player', p.pose.x, p.pose.z, p.pose.heading));
  bystanders.entries((id, b) => look(id, 'ai', b.x, b.z, b.heading));

  /*
   * 뒷걸음 — 값을 여기서 정하지 않는다. 한 장면(얼마나 오래·멀리 물러섰나, 그 개체는 다가오고 있었나)을
   * 모아 판정기에 넘긴다. 길게 이어지면 BACK_MAX_S 마다 한 번씩 끊어 넘긴다.
   *
   * 장면을 **여는** 조건은 가까이(BACK_DIST) 나를 마주 본 개체지만, **잇는** 조건은 그보다 넓다 —
   * 물러서면 당연히 멀어지므로 4.5m 에서 끊으면 어떤 후퇴도 0.8초짜리 토막이 된다. 그러면 "마주 본 채
   * 계속 뒤로 걸었다"는 가장 강한 신호가 통째로 사라진다. 그래서 이미 장면에 든 개체가 시야(SEE_DIST) 안에서
   * 나를 마주 보고 있는 동안은 계속 센다 (3m → 8m 이 한 장면으로 남는다).
   */
  const run0 = acc.back;
  const opens = front.some((f) => f.d < BACK_DIST);
  const keeps = run0 !== null && front.some((f) => run0.watchers.has(f.id));
  if (inp.moveZ < 0 && (opens || keeps)) {
    let run = run0;
    if (!run) {
      run = { t: 0, idle: 0, fromX: x, fromZ: z, x, z, watchers: new Map() };
      acc.back = run;
    }
    run.t += dt;
    run.idle = 0;
    run.x = x;
    run.z = z;
    for (const f of front) {
      const w = run.watchers.get(f.id);
      if (w) w.to = f.d;
      else if (f.d < BACK_DIST) run.watchers.set(f.id, { kind: f.kind, from: f.d, to: f.d });
    }
    if (run.t >= BACK_MAX_S) closeBackRun(run, now);
  } else if (acc.back) {
    acc.back.idle += dt;
    if (acc.back.idle > BACK_GRACE_S) closeBackRun(acc.back, now);
  }

  // 아래 둘(돌발·감정)은 **누가 보고 있을 때만** 센다 — 빈 복도에서 뛰어도 아무도 모른다
  const watched = witnessed(x, z);

  // 돌발 — 점프. 안 보는 판(시나리오 2)에서는 이 채널이 통째로 없다 (watchJump)
  if (inp.jumped && jumpWatched) {
    const again = now - acc.lastJumpAt < JUMP_AGAIN_MS;
    acc.lastJumpAt = now;
    if (watched) hit = suspicion.bump(again ? JUMP_AGAIN_BUMP : JUMP_BUMP, '돌발', now) ?? hit;
  }

  // 감정 — 이모트가 켜지는 순간
  if (inp.anim !== acc.lastAnim) {
    const bump = EMOTE_BUMP[inp.anim];
    if (bump > 0 && watched) hit = suspicion.bump(bump, '감정', now) ?? hit;
    acc.lastAnim = inp.anim;
  }

  return hit;
}

/** 방을 나가거나 다시 들어올 때 */
export function resetSensor(): void {
  acc.back = null;
  acc.lastAnim = 'idle';
  acc.lastJumpAt = -Infinity;
  suspicion.reset();
}
