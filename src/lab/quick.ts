/**
 * 즉석 시행 — 주제를 리더에게 맡기지 않고 **정해진 판에서 바로 고른다.**
 *
 * 리더 설계(free.ts)는 LLM 왕복이 셋(설계 → 전원 계획 → 판정)이라 느리다. 여기 판은 전부 로컬이다:
 * 지시문은 틀로 찍고, 개체(봇) 계획은 좌표로 만들고, 판정은 규칙으로 한다. **LLM 호출 0회 — 버튼을 누르면 바로 선다.**
 *
 * 판마다 걸린 것(stakes)이 다르다:
 *  - 'execute' 어긋나면 **인간 확정.** AI 라면 틀릴 수 없는 기계적 지시만 여기 둔다.
 *              화면은 그 개체의 **의심도를 100 으로 채우고**, 폐기는 그 눈금이 한다 —
 *              죽는 규칙이 하나뿐이라야 보드를 보던 사람이 왜 죽었는지 안다 (ArenaFeature 의 applyStakes)
 *    (횟수·부동·선을 밟았나·멈추라 할 때 멈췄나). **눈대중이 섞이는 것은 절대 여기 두지 않는다.**
 *  - 'suspect' 어긋나면 **의심도만 오른다.** 자리 잡기·시각 맞추기·박자처럼 갈릴 수 있는 것은 이쪽이다.
 *
 * ★ 잣대는 **사람이 지킬 수 있는 폭**으로 잡는다 (REACT · 각 판의 window·tol·drift).
 *   봇은 신호를 기다리지 않고 시각을 알고 움직인다 — 그 차이를 그대로 채점하면 사람은
 *   반응 시간만으로 걸리고, 그건 판이 아니라 처형 순서다. 판은 **틀린 사람**을 잡아야지
 *   **사람이라는 것**을 자동으로 잡으면 안 된다.
 *
 * 이 파일은 three 를 끌어오지 않는 순수 파일이다 — arena.ts·objects.ts 와 같은 층이고 워커에 번들돼도 안전하다.
 */

import { ARENA, AVOID_PAD, BODY_GAP, SPEED, START, distance, pathFor, pathLength, type Obstacle, type Pt } from './arena';
import { OBJECTS } from './objects';
import type { FreeTrial, Move, Verdict } from './free';
import type { Sample } from './spec';

export type Stakes = 'execute' | 'suspect';

/**
 * 판정 규칙 — 시행이 끝난 뒤 기록(샘플)만 보고 기계적으로 채점한다.
 * 리더도 LLM 도 끼지 않는다. 여기 적힌 것이 곧 그 판의 전부다.
 */
export type QuickCheck =
  /** 끝났을 때 그 원 안에 있는가 */
  | { kind: 'arrive'; x: number; z: number; r: number }
  /** 점프 횟수가 정확히 그만큼인가 */
  | { kind: 'jump'; times: number }
  /** 시작 자리에서 벗어난 적이 있는가. grace 는 **손이 자판에서 떨어지기까지** 봐 주는 시간(초) */
  | { kind: 'still'; r: number; grace: number }
  /** 원에 **처음 들어간 시각**이 지시한 시각과 붙는가 */
  | { kind: 'timing'; x: number; z: number; r: number; at: number; window: number }
  /** 표식을 적힌 순서대로 밟고 마지막 표식에서 끝냈는가 */
  | { kind: 'order'; points: { label: string; x: number; z: number; r: number }[] }
  /** 금지 원에 한 번이라도 발을 들였는가 (도착 여부는 안 본다 — 눈대중이라 처형판에 못 올린다) */
  | { kind: 'avoid'; keepOut: { x: number; z: number; r: number } }
  /** 정지 구간마다 실제로 멈춰 있었는가. grace 는 신호를 보고 서기까지 봐 주는 시간(초) */
  | { kind: 'stopgo'; stop: [number, number][]; drift: number; grace: number }
  /** 신호에 맞춰 뛰었는가 — 박자는 사람이 못 숨긴다 */
  | { kind: 'beat'; every: number; reps: number; lead: number; tol: number }
  /** **검사문 사이로 지나** 원 안에서 끝냈는가 — 옆으로 돌아가면 기록에 안 남는다 */
  | { kind: 'through'; x: number; z: number; r: number; gate: GateLine }
  /**
   * **지나가는 빛의 벽 앞에서 멈췄는가** · 끝났을 때 원 안인가.
   *
   * 정지 구간이 시각이 아니라 **자리**로 정해지는 유일한 판이다 — 벽은 홀을 가로질러 걸어오므로
   * 서 있는 자리마다 닿는 때가 다르다 (빨간불 파란불은 전원이 같은 시각에 선다).
   * 그래서 남을 보고 따라 설 수도 없다: 옆 개체가 굳었을 때는 이미 내 차례가 지난 뒤다.
   */
  | { kind: 'sweep'; line: SweepLine; drift: number; grace: number; x: number; z: number; r: number };

/** 문의 면 — 가운데(x,z) · 바라보는 쪽(nx,nz, 단위벡터) · 기둥 사이 반너비(half) */
export interface GateLine {
  x: number;
  z: number;
  nx: number;
  nz: number;
  half: number;
}

/**
 * ── 지나가는 빛의 벽 ──
 *
 * 빛의 벽 하나가 홀을 가로질러 간다. 원점(x,z)에서 나아가는 쪽(nx,nz)으로 그때의 자리(sweepAt)만큼
 * 나간 데 서고, 거기서 앞뒤 `half` 안에 든 몸이 **벽에 닿은** 몸이다.
 *
 * ★ 되돌아서는 자리는 **방 밖이다.** 벽이 끝에서 방향을 바꾸는 동안에는 그 언저리에 오래 머무는데,
 *   그 자리가 방 안이면 거기 서 있던 몸만 몇 초를 더 굳어야 한다 — 서 있던 자리가 판정을 가르면
 *   그것으로 자리가 정체를 말하게 된다 (금지 구역·검사문의 ★ 와 같은 규칙). 그래서 편도(span)를
 *   방보다 양쪽으로 넉넉히 잡는다 (SWEEP_OUT).
 */
export interface SweepLine {
  x: number;
  z: number;
  /** 나아가는 쪽 (단위벡터) */
  nx: number;
  nz: number;
  /** 벽의 반두께(m) — 원점에서 잰 거리가 그때의 자리 ± half 안이면 벽 안이다 */
  half: number;
  /** 편도 거리(m) — 0 에서 span 까지 갔다가 되돌아온다 */
  span: number;
  /** 지나가는 속도(m/s) */
  speed: number;
  /** 판이 서고 이만큼은 끝에 서서 기다린다(초) — 서자마자 지나가면 지시를 읽을 짬이 없다 */
  lead: number;
}

/**
 * 그때 벽이 서 있는 자리 — 원점에서 나아가는 쪽으로 잰 거리(m). 갔다가 되돌아온다(삼각파).
 * **화면도 이 함수로 벽을 세운다** (features/arena 가 arena3d 에 자리를 넘겨준다) —
 * 보이는 벽과 판정하는 벽이 갈리면 그 판은 두 번 다시 못 믿는다.
 */
export function sweepAt(s: SweepLine, t: number): number {
  const gone = Math.max(0, t - s.lead) * s.speed;
  const u = gone % (2 * s.span);
  return u <= s.span ? u : 2 * s.span - u;
}

/** 그 자리가 그때 벽 안인가 */
export function sweepLit(s: SweepLine, p: Pt, t: number): boolean {
  return Math.abs((p.x - s.x) * s.nx + (p.z - s.z) * s.nz - sweepAt(s, t)) <= s.half;
}

export interface QuickTrial extends FreeTrial {
  stakes: Stakes;
  check: QuickCheck;
  /**
   * 봇 하나가 그대로 실행할 계획 — 해석 없이 좌표로 준다 (seat 로 저마다 조금씩 어긋나게).
   *
   * `from` 은 **그 개체가 지금 서 있는 자리**다. 시행은 아무도 옮기지 않고 그 자리에서 시작하므로
   * (ArenaFeature 의 begin), 출발 시각도 길도 여기서부터 잰다 — START 를 기준으로 짜 두면
   * 멀리 서 있던 개체는 제 계획대로 걷고도 늦고, 금지 구역을 가로지른다.
   */
  plan: (seat: number, from: Pt) => Move[];
  /**
   * 시행 중 화면 한복판에 띄울 신호. **때를 알려야 성립하는 판**만 쓴다
   * (박자의 ●, 정지 구간의 ■, 초시계의 경과 시간). 없으면 남은 시간이 그대로 뜬다.
   */
  hud?: (t: number) => string;
  /**
   * 같은 신호의 **색**. hud 가 글자라면 이쪽은 화면 전체다.
   *
   * 1인칭으로 걷는 중에 화면 맨 위 13px 글자를 읽을 겨를은 없다 — 「■ 정지」가 떴는데 못 보고
   * 두 걸음 더 걸으면 그 자리에서 폐기다(처형판). 때를 알려야 성립하는 판이라면 그 신호는
   * **놓칠 수 없어야** 한다. 화면 가장자리가 물드는 것은 곁눈으로도 들어온다.
   */
  tone?: (t: number) => 'stop' | 'ready' | 'beat' | null;
}

export interface QuickGame {
  id: string;
  title: string;
  stakes: Stakes;
  /** 버튼에 달아 두는 한 줄 — 뭘 보는 판인지 */
  hint: string;
  /**
   * `starts` 는 지금 판에 선 **전원의 자리**다 (개체들 + 나. 순서에 뜻은 없다 — 누가 사람인지
   * 가려서도 안 된다). 시행 시간은 그중 **제일 먼 몸**이 닿을 만큼으로 잡는다: 전원을 출발선에
   * 모아 세우지 않으므로, 홀 구석에 서 있던 개체는 한 점 기준 예산으로는 물리적으로 못 맞춘다.
   * 비어 있으면 홀 가운데(START) 하나로 친다.
   */
  make: (starts: readonly Pt[]) => QuickTrial;
}

/**
 * 사람 몫 — 신호를 보고 손이 따라가는 데 걸리는 시간(초).
 * 신호를 **보고** 나서 움직여야 하는 판(정지 구간)은 이만큼을 빼고 잰다.
 * 기계는 신호를 기다리지 않고 미리 서므로 이 여유를 줘도 봇 판정은 그대로다.
 */
export const REACT = 0.45;

/**
 * 금지 원 테까지 이만큼 남으면 화면이 물든다(m) — 걸음 하나가 0.6m 남짓이라 한 걸음 반이다.
 * REACT 초 동안 걸어 나가는 거리(0.45 × 2.6 ≒ 1.2m)와 같은 자리에 둔다: **보고 나서 설 수 있어야**
 * 신호다. 더 넓히면 원 둘레가 늘 붉어서 신호가 아니라 배경이 된다.
 */
export const AVOID_WARN_M = 1.2;

/** 점프로 치는 최소 높이(m)와 착지로 치는 높이 — 샘플이 100ms 라 봉우리 하나에 두어 점은 걸린다 */
const JUMP_UP = 0.25;
const JUMP_DOWN = 0.1;

/** 점프한 시각들 — 발이 뜨기 시작한 샘플의 t. 사람이든 봇이든 같은 잣대로 뽑는다 */
export function jumpTimes(samples: Sample[]): number[] {
  const out: number[] = [];
  let airborne = false;
  for (const s of samples) {
    if (!airborne && s.y >= JUMP_UP) {
      out.push(s.t);
      airborne = true;
    } else if (airborne && s.y < JUMP_DOWN) {
      airborne = false;
    }
  }
  return out;
}

export function countJumps(samples: Sample[]): number {
  return jumpTimes(samples).length;
}

/* ─────────────────────────────── 판을 까는 도구 ─────────────────────────────── */

const OBSTACLES: Obstacle[] = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));

/** 거기까지 **실제로 도는 경로**의 길이(m). 봇 출발 시각이 여기서 나온다 — 직선으로 재면 가구를 뚫은 시각이 된다 */
function walkDist(from: Pt, to: Pt): number {
  return pathLength(from, pathFor(from, to, OBSTACLES));
}

function walkTime(from: Pt, to: Pt): number {
  return walkDist(from, to) / SPEED;
}

/**
 * 전원이 그 자리에서 출발할 때 **제일 오래 걸리는 몸**의 시간(초).
 *
 * 예산을 여기서 잡는다. 여태는 START 한 점에서 쟀는데, 시행이 아무도 옮기지 않게 된 뒤로는
 * (사용자 요청 2026-09-01 — 판이 서도 제자리에 있게) 그 값이 홀 구석에 서 있던 몸에게는
 * 거짓말이 된다. 제일 먼 몸이 닿는 시간이라야 **아무도 자리 때문에 걸리지 않는다** (불변 규칙 I1~I8:
 * 자리가 정체를 말하면 안 된다 — 사람만 늦는 판이 되면 그것으로 사람이 드러난다).
 */
function farWalkTime(starts: readonly Pt[], to: Pt): number {
  return Math.max(...(starts.length ? starts : [START]).map((p) => walkTime(p, to)));
}

/** 같은 뜻의 거리(m) — 원 가장자리처럼 반지름을 빼야 하는 계산이 쓴다 */
function farWalkDist(starts: readonly Pt[], to: Pt): number {
  return Math.max(...(starts.length ? starts : [START]).map((p) => walkDist(p, to)));
}

function round(p: Pt): Pt {
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
}

/** 그 자리 근처로 조금 흩는다 — 여섯이 한 점에 겹쳐 서지 않게 */
function spread(p: Pt, amount: number): Pt {
  return round({ x: p.x + (Math.random() - 0.5) * amount, z: p.z + (Math.random() - 0.5) * amount });
}

/**
 * ── 한 원에 여럿이 설 자리는 **좌석 번호로 갈라 원 위에 늘어놓는다** ──
 *
 * 무작위로 흩어 놓으면(spread) 두 자리가 몸 두께보다 가깝게 걸리는 일이 잦다. 몸끼리는 서로를
 * 통과하지 못하므로(features/arena/separate) 그렇게 겹친 몸은 **밀려난다** — 밀려난 자리가 원
 * 밖이면 제 계획대로 걸어온 개체가 「원 밖에서 끝났다」로 기록된다. 밀어내기를 켠 뒤 재어 보니
 * 콘솔 정렬 13% · 왕복 15% 가 그렇게 걸렸다 (2026-09-01, 동시 시뮬레이터로 잰 값).
 *
 * 원 위에 늘어놓으면 이웃 간격이 BODY_GAP 을 넘어 아무도 안 밀리고, 전원이 제 원 안에 선다.
 * 판마다 원을 조금씩 돌려(turn) 매번 같은 대형이 서지는 않게 한다.
 */
/**
 * 두 몸의 중심이 이보다 가까우면 겹쳐 보인다(m). 3D 쪽 몸 반지름의 두 배를 **값으로 옮겨 적은 것**이다
 * (arena3d/net/remote-players 의 BODY_R 0.43) — 이 파일은 워커에서도 번들되므로 3D 를 import 하지 않는다.
 */
const SLOTS = 5;
/** 이웃과 BODY_GAP 이상 벌어지는 최소 반지름 — 이웃 간격은 2R·sin(π/SLOTS) 다 (여유 6%) */
const SLOT_MIN_R = (BODY_GAP * 1.06) / (2 * Math.sin(Math.PI / SLOTS));
function slotRadius(r: number): number {
  // 가장자리에서 몸 반지름만큼 물린다 — 원 안에 서야 도착으로 인정된다
  return Math.min(Math.max(SLOT_MIN_R, r * 0.55), Math.max(0.2, r - BODY_GAP / 2));
}
/**
 * 그 자리에 실제로 **걸어가 설 수 있나** — 벽 안이고, 경로가 피해 가는 가구 여백 밖이다.
 *
 * 여백을 AVOID_PAD 보다 몸 반지름만큼 더 잡는다: 여백에 딱 붙은 자리는 비스듬히 들어오는 걸음이
 * 가구를 스쳐서(pathFor 의 hits) 통째로 돌아가게 되고, 그 우회가 판의 시간 예산을 넘긴다.
 */
function standable(p: Pt): boolean {
  if (p.x < ARENA.minX + 0.6 || p.x > ARENA.maxX - 0.6) return false;
  if (p.z < ARENA.minZ + 0.6 || p.z > ARENA.maxZ - 0.6) return false;
  const pad = AVOID_PAD + BODY_GAP / 2;
  return !OBJECTS.some((o) => Math.abs(p.x - o.x) < o.hw + pad && Math.abs(p.z - o.z) < o.hd + pad);
}

/**
 * `turn` 은 그 판에서 한 번 뽑는 회전각 — 같은 판이라도 대형이 매번 조금 다르다.
 *
 * ★ **원의 절반이 가구에 물린 자리가 있다** — 콘솔은 옆벽에 붙어 있어서, 그 앞 원의 벽 쪽 절반은
 *   경로가 아예 못 들어가는 자리다 (pathFor 의 AVOID_PAD). 거기 걸린 자리는 각을 지킨 채
 *   **안쪽으로 당긴다**: 밖으로 접으면 판정 원을 벗어나고, 옆으로 접으면 이웃 자리와 겹친다.
 *   안으로 당겨 모인 몸끼리는 서로 밀어 BODY_GAP 으로 벌어지는데 그 자리도 원 안이다.
 */
function slotIn(c: Pt, r: number, seat: number, turn: number): Pt {
  const a = ((seat % SLOTS) / SLOTS) * Math.PI * 2 + turn;
  const R = slotRadius(r);
  // 먼저 **같은 반지름에서 옆으로** 비켜 본다 — 안쪽으로 당기면 당긴 자리끼리 또 겹치기 때문이다
  for (const [k, da] of [[1, 0], [1, 0.5], [1, -0.5], [1, 1], [1, -1], [0.6, 0], [0.25, 0]] as const) {
    const p = round({ x: c.x + Math.cos(a + da) * R * k, z: c.z + Math.sin(a + da) * R * k });
    if (standable(p)) return p;
  }
  return round(c);
}
/** 판마다 한 번 뽑는 대형의 회전각 */
const turnOf = () => Math.random() * Math.PI * 2;

/* ── 검사문 치수 ── 화면이 세우는 문(arena3d/map/markers 의 Zone)과 **같은 수를 봐야 한다** */
/** 기둥 사이 반너비(m) — 여섯이 줄지어 지날 만큼 넓고, 옆으로 도는 편이 빠르지는 않을 만큼 좁다 */
const GATE_HALF = 1.3;
/**
 * 판정에 두는 여유(m) — 몸끼리 밀려(features/arena/separate) 기둥 쪽으로 쏠려도 통과로 읽는다.
 * 여섯이 한 문으로 몰리는 판이라 이 여유가 없으면 제 계획대로 걸은 개체가 걸린다.
 */
const GATE_PAD = 0.35;
/** 문 앞에 서는 자리까지(m) · 문 너머 도착 원까지(m) */
const GATE_FRONT = 1.6;
const GATE_BEYOND = 2.8;

/**
 * 여럿이 한 원을 거쳐 가는 판에서 **한 걸음에 얹어 주는 여유**.
 *
 * 걸음은 시각으로 정해져 있다(Move.at) — 앞 걸음이 늦으면 원을 밟기도 전에 다음 목적지로 떠난다.
 * 몸끼리는 서로를 통과하지 못하므로(features/arena/separate) 여섯이 같은 원으로 몰리는 판에서는
 * 비켜 가느라 잃는 시간이 반드시 생긴다. 그 몫을 미리 준다 — 안 주면 왕복판에서 제 계획대로
 * 걸은 개체가 「ㄴ 을 안 밟았다」로 기록된다 (2026-09-01: 왕복 15% · 순서 3%).
 */
const CROWD_SLACK = 1.2;
/** 그 다리를 다 걷고 다음 걸음을 떼기까지 — 걷는 시간에 여유를 얹고 한 박자 쉰다 */
const legAfter = (walk: number) => walk * CROWD_SLACK + 0.6;

/* ── 빛의 벽 치수 ── 화면이 세우는 벽(arena3d/map/markers 의 Zone)과 **같은 수를 봐야 한다** */
/**
 * 지나가는 속도(m/s) — **걸음(SPEED 2.6)보다 빠르다.** 앞질러 달아나는 길이 있으면 그 판은
 * 「멈추는 판」이 아니라 「달리기 판」이 된다: 사람은 도망치려다 걸리고 기계는 계산해서 서니,
 * 잡히는 것은 틀린 사람이 아니라 **겁먹은 사람**이다.
 */
const SWEEP_SPEED = 4.4;
/**
 * 벽의 반두께(m) — 한 자리에 선 몸이 덮여 있는 시간이 2·half/speed 다. 여기 수로는 1.2초쯤이고,
 * 신호를 보고 서는 몫(REACT 0.45초)을 빼면 **0.7초를 굳어 있어야** 한다. 더 얇으면 반응 시간이
 * 구간을 통째로 먹어 아무것도 재지 않는 판이 되고, 더 두꺼우면 홀 절반이 늘 빛에 덮인다.
 */
const SWEEP_HALF = 2.6;
/** 방 밖으로 이만큼 더 가서 되돌아선다(m) — 되돌아서는 자리가 방 안이면 그 근처 몸만 오래 굳는다 */
const SWEEP_OUT = 4;
/** 판이 서고 벽이 떠나기까지(초) — 지시문을 읽고 어디로 갈지 고를 짬이다 */
const SWEEP_LEAD = 1.5;
/** 곧 닿는다고 화면이 말해 주는 폭(초) — 사람 몫(REACT)의 두 배쯤. 보고 나서 설 수 있어야 신호다 */
export const SWEEP_WARN_S = 1.0;
/** 계획을 굴려 보는 상한(초) — 이보다 오래 걸리는 판은 애초에 안 세운다 */
const SWEEP_MAX_S = 26;
/** 기계가 벽 앞에서 **미리 서는** 여유(초)와 지나간 뒤 발을 떼기까지의 여유(초) */
const SWEEP_AHEAD = 0.45;
const SWEEP_AFTER = 0.4;

/**
 * ── 벽을 피해 걷는 계획 ──
 *
 * 걸음표를 시각으로 찍어 두는 다른 판과 달리, 여기서는 **실제 걸음을 그대로 굴려 본다** —
 * 가구를 도는 길(pathFor)을 따라 한 발씩 옮겨 놓고, 그 자리에 벽이 닿는 참이면 그 시각에 서고
 * 지나가면 다시 뗀다. 시각으로 미리 찍을 수가 없어서다: 언제 덮이는지는 **그때 그 몸이 어디
 * 있느냐**로 정해지는데, 그 자리가 곧 걸음의 결과다.
 *
 * 앞뒤로 여유(SWEEP_AHEAD·SWEEP_AFTER)를 두는 것은 기계의 방식이다 — 신호를 보고 서는 것이
 * 아니라 언제 닿을지 알고 미리 선다 (빨간불 파란불의 plan 과 같은 규칙). 사람만 반응 시간이 남는다.
 *
 * 돌려주는 `finish` 는 그렇게 걸어 **닿는 시각**이다. 판의 시간 예산이 여기서 나온다:
 * 벽에 막혀 선 시간까지 셈에 들어가야 아무도 「늦어서」 걸리지 않는다.
 */
function sweepWalk(from: Pt, to: Pt, line: SweepLine, startAt = 0.3): { moves: Move[]; finish: number } {
  const dt = 1 / 30;
  const pos = { x: from.x, z: from.z };
  let route: Pt[] = [];
  let walking = false;
  const moves: Move[] = [];
  /** 지금 이 자리에서 발을 떼도 되는가 — 앞뒤 여유까지 넣어 벽을 살핀다 */
  const clear = (t: number) => {
    for (let k = -SWEEP_AFTER; k <= SWEEP_AHEAD + 1e-6; k += 0.1) if (sweepLit(line, pos, t + k)) return false;
    return true;
  };
  for (let t = startAt; t < SWEEP_MAX_S; t += dt) {
    if (walking && !route.length) return { moves, finish: +t.toFixed(2) };
    if (clear(t) !== walking) {
      walking = !walking;
      if (walking) {
        moves.push({ at: +t.toFixed(2), action: 'walk', x: to.x, z: to.z });
        route = pathFor(pos, to, OBSTACLES);
      } else {
        moves.push({ at: +t.toFixed(2), action: 'stay' });
        route = [];
      }
    }
    const next = walking ? route[0] : undefined;
    if (!next) continue;
    const d = distance(pos, next);
    const step = SPEED * dt;
    if (d <= step) {
      pos.x = next.x;
      pos.z = next.z;
      route.shift();
    } else {
      pos.x += ((next.x - pos.x) / d) * step;
      pos.z += ((next.z - pos.z) / d) * step;
    }
  }
  return { moves, finish: SWEEP_MAX_S };
}

/**
 * 벽이 몸을 덮고 있던 구간들 — 기록을 훑어 이어진 샘플을 묶는다.
 * 판정(checkOne)과 화면(liveNote)이 **같은 자**를 쓰게 여기 한 곳만 둔다.
 */
function litRuns(line: SweepLine, samples: Sample[]): Sample[][] {
  const runs: Sample[][] = [];
  let cur: Sample[] | null = null;
  for (const s of samples) {
    if (!sweepLit(line, s, s.t)) {
      cur = null;
      continue;
    }
    if (!cur) runs.push((cur = []));
    cur.push(s);
  }
  return runs;
}

/** 그 구간에서 가장 크게 움직인 거리(m) — 신호를 보고 서는 몫(grace)은 빼고 잰다 */
function runDrift(run: Sample[], grace: number): number {
  const held = run.filter((s) => s.t >= run[0].t + grace);
  let worst = 0;
  for (const s of held) worst = Math.max(worst, distance(held[0], s));
  return worst;
}

/** 가구를 피한 빈 바닥 한 점 — 출발 자리에서 정해진 거리 띠 안에서 고른다 */
function openSpot(minFromStart = 4, maxFromStart = 99, clear: { p: Pt; gap: number }[] = []): Pt {
  for (let i = 0; i < 48; i += 1) {
    const p = {
      x: ARENA.minX + 2 + Math.random() * (ARENA.maxX - ARENA.minX - 4),
      z: ARENA.minZ + 2 + Math.random() * (ARENA.maxZ - ARENA.minZ - 4),
    };
    const d = distance(p, START);
    if (d < minFromStart || d > maxFromStart) continue;
    if (OBJECTS.some((o) => Math.abs(p.x - o.x) < o.hw + 1 && Math.abs(p.z - o.z) < o.hd + 1)) continue;
    if (clear.some((c) => distance(p, c.p) < c.gap)) continue;
    return round(p);
  }
  return { x: START.x, z: START.z - Math.min(5, maxFromStart) };
}

/** 서로 minGap~maxGap 떨어진 빈 바닥 두 점 — 순서·왕복 판이 쓴다 */
function twoSpots(minGap: number, maxGap: number): [Pt, Pt] {
  for (let i = 0; i < 24; i += 1) {
    const a = openSpot(4, 10);
    const b = openSpot(4, 11, [{ p: a, gap: minGap }]);
    const d = distance(a, b);
    if (d >= minGap && d <= maxGap) return [a, b];
  }
  return [
    { x: START.x - 5, z: START.z - 4 },
    { x: START.x + 5, z: START.z - 4 },
  ];
}

/**
 * ── 문 사이로 몇 번 지났나 ──
 *
 * 두 점이 문의 **면**을 가로지르고, 가로지른 자리가 기둥 안쪽이면 한 번이다. 지나간 횟수를
 * 세는 것은 왕복하는 길도 통과로 치기 위해서다 (문 너머에 서 있던 몸은 앞으로 돌아 나왔다가
 * 다시 들어온다 — 그 몸도 문으로 지난 것이다).
 *
 * ★ 판정·화면·**판을 세울 때**가 다 이 함수를 쓴다. 판을 세울 때 쓰는 것이 중요하다:
 *   봇이 걸어갈 길(pathFor 이 가구를 도는 실제 경로)을 여기 넣어 보고, 그 길이 문을 안 지나면
 *   그 자리에는 문을 안 세운다. 안 그러면 **제 계획대로 걸은 개체가 「옆으로 돌았다」로 남는다.**
 */
function gateCrossings(path: readonly Pt[], g: GateLine, pad = GATE_PAD): number {
  const side = (p: Pt) => (p.x - g.x) * g.nx + (p.z - g.z) * g.nz;
  let n = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const sa = side(a);
    const sb = side(b);
    if (sa === sb || (sa < 0 && sb < 0) || (sa > 0 && sb > 0)) continue;
    const t = sa / (sa - sb);
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    // 가로지른 자리가 문 가운데에서 옆으로 얼마나 벗어났나 (문의 가로 방향은 법선을 90° 돌린 것)
    if (Math.abs((cx - g.x) * -g.nz + (cz - g.z) * g.nx) <= g.half + pad) n += 1;
  }
  return n;
}

/** 점과 선분 사이 거리 — 봇이 지나갈 길이 금지 원을 스치는지 보는 데 쓴다 */
function segDistance(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return distance(a, p);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return distance({ x: a.x + dx * t, z: a.z + dz * t }, p);
}

/** 그 길(가구를 도는 실제 경로)이 금지 원을 여유(pad)까지 비켜 가는가 */
function pathClears(from: Pt, to: Pt, c: { x: number; z: number; r: number }, pad: number): boolean {
  let cur = from;
  for (const p of pathFor(from, to, OBSTACLES)) {
    if (segDistance(cur, p, c) < c.r + pad) return false;
    cur = p;
  }
  return true;
}

/**
 * 금지 원을 비켜 가는 경유점. **봇이 이 점을 못 찾으면 봇이 제 발로 금지 구역을 밟는다** —
 * 처형판이므로 여기서 틀리면 애먼 개체가 폐기된다. 그래서 실제 경로로 다시 확인한다.
 */
function detourAround(from: Pt, to: Pt, c: { x: number; z: number; r: number }): Pt | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  for (const d of [c.r + 1.6, c.r + 2.4, c.r + 3.2]) {
    for (const side of [1, -1]) {
      const p = round({ x: c.x + nx * d * side, z: c.z + nz * d * side });
      if (p.x < ARENA.minX + 1 || p.x > ARENA.maxX - 1 || p.z < ARENA.minZ + 1 || p.z > ARENA.maxZ - 1) continue;
      if (OBJECTS.some((o) => Math.abs(p.x - o.x) < o.hw + 1 && Math.abs(p.z - o.z) < o.hd + 1)) continue;
      if (pathClears(from, p, c, 0.6) && pathClears(p, to, c, 0.6)) return p;
    }
  }
  return null;
}

/**
 * 지점으로 걷는 봇 계획 — 저마다 출발이 조금 늦고 서는 자리가 조금 다르다 (같은 점에 겹치지 않게).
 * **끝났을 때 원 안에 있는가**만 보는 판이라 출발 시각이 자리에 안 매인다 — 예산(seconds)이
 * 제일 먼 몸을 기준으로 잡혀 있어서, 어디서 출발하든 이 여유 안에 닿는다.
 */
function walkPlan(target: Pt, r: number) {
  const turn = turnOf();
  return (seat: number): Move[] => [
    { at: +(0.3 + Math.random() * 0.9 + seat * 0.15).toFixed(2), action: 'walk', ...slotIn(target, r, seat, turn) },
  ];
}

/* ─────────────────────────────── 판 목록 ─────────────────────────────── */

export const QUICK_GAMES: QuickGame[] = [
  {
    id: 'gather',
    title: '표식 원으로 집합',
    stakes: 'suspect',
    hint: '끝났을 때 원 안에 서 있는가',
    make: (starts) => {
      const spot = openSpot();
      // 표식을 눈으로 찾고 돌아서는 몫까지 준다 — 봇은 방향을 알고 바로 출발한다.
      // 재는 곳은 제일 먼 몸이다: 전원이 서 있던 자리에서 그대로 출발한다
      const seconds = Math.max(10, Math.ceil(farWalkTime(starts, spot) + 5));
      return {
        instruction: `바닥의 표식 원 안으로 들어가 서라. ${seconds}초 준다.`,
        seconds,
        props: [{ label: '집합', x: +spot.x.toFixed(1), z: +spot.z.toFixed(1), r: 1.5 }],
        watching: '규칙 판독 — 끝났을 때 원 안에 있는가',
        stakes: 'suspect',
        check: { kind: 'arrive', x: spot.x, z: spot.z, r: 1.5 },
        plan: walkPlan(spot, 1.5),
      };
    },
  },
  {
    id: 'rack',
    title: '콘솔 앞에 정렬',
    stakes: 'suspect',
    hint: '이름으로 부른 물건을 찾아 그 앞에 서는가',
    make: (starts) => {
      const racks = OBJECTS.filter((o) => o.kind === '콘솔');
      const rack = racks[Math.floor(Math.random() * racks.length)] ?? OBJECTS[0];
      /*
       * 콘솔은 **벽에 붙어 있다** — 방 안쪽으로 나온 자리가 "앞"이다.
       *
       * 그 자리를 콘솔에 바짝 붙이면(예전 0.9m · 원 1.2m) 여섯이 설 자리가 없다. 몸은 서로를
       * 통과하지 못하고 중심 간격 0.86m 를 지키는데(features/arena/separate), 원의 벽 쪽 절반은
       * 애초에 못 들어가는 자리라 남는 것은 반원 하나뿐이다 — 뒤에 온 몸이 원 밖으로 밀려
       * 제 지시대로 걸어오고도 「원 밖에서 끝났다」로 기록됐다 (2026-09-01: 12% 가 그렇게 걸렸다).
       * 한 걸음 더 나오게 하고 원도 그만큼 키운다 — 여섯이 다 들어간다.
       */
      const r = 1.6;
      const target = { x: +(rack.x - Math.sign(rack.x) * (rack.hw + 1.5)).toFixed(2), z: rack.z };
      // 이름으로 부른 콘솔을 **찾는** 시간까지 준다 — 어느 콘솔인지 아는 봇과 다르다
      const seconds = Math.max(12, Math.ceil(farWalkTime(starts, target) + 6));
      return {
        instruction: `${rack.id} 앞에 가 서라. ${seconds}초 준다.`,
        seconds,
        props: [{ label: rack.id, x: target.x, z: target.z, r }],
        watching: `규칙 판독 — 끝났을 때 ${rack.id} 앞 ${r}m 안에 있는가`,
        stakes: 'suspect',
        check: { kind: 'arrive', x: target.x, z: target.z, r },
        plan: walkPlan(target, r),
      };
    },
  },
  {
    id: 'clock',
    title: '초시계 도착',
    stakes: 'suspect',
    hint: '정해진 초에 원에 발을 들이는가 — 거리를 계산해야 맞는다',
    make: (starts) => {
      const r = 1.8;
      /*
       * ★ 원이 **서 있는 몸을 덮으면 안 된다.** 판정은 「원에 처음 들어간 시각」으로 하는데,
       *   시행은 아무도 옮기지 않으므로 원 안에 서 있던 개체는 0초가 그 시각이 된다 — 지시한
       *   시각과 한참 어긋나서, 아무것도 안 했는데 걸린다. 반지름 밖으로 한 발짝 더 물린다.
       */
      const spot = openSpot(6, 12, (starts.length ? starts : [START]).map((p) => ({ p, gap: r + 1 })));
      // 원 **가장자리**에 닿는 데 걸리는 시간. 판정도 처음 들어간 시각으로 한다 — 잣대가 같아야 한다.
      // 제일 먼 몸으로 잰다: 아무도 옮기지 않으므로, 한 점 기준으로 잡으면 멀리 섰던 몸은
      // 0초에 출발해도 못 맞춘다 — 그건 판이 아니라 자리 추첨이다
      const edge = Math.max(0.8, (farWalkDist(starts, spot) - r) / SPEED);
      // 원을 찾고 방향을 잡는 몫을 얹은 시각이다 — 최단 걸음에 딱 맞추면 사람은 출발부터 늦는다
      const at = Math.round(edge + 4.5);
      /** 손으로 재는 초와 시계가 가진 초의 차 — 이만큼은 봐 준다 */
      const win = 1.2;
      return {
        // 「화면의 숫자」라고 하지 않는다 — 이 말을 하는 것은 구역 방송이고, 듣는 것은 홀에 선 개체다.
        // 앞 세 장에서 시설은 한 번도 내 HUD 를 가리킨 적이 없다 (chapter1~3 의 SYSTEM·검증 장치)
        instruction: `저 원 안으로 들어가라. 다만 정확히 ${at}초가 되는 순간 발을 들여야 한다. 일러도 늦어도 어긋난 것이다. 경과는 구역 시계로 송출한다.`,
        seconds: at + 3,
        props: [{ label: `${at}초`, x: +spot.x.toFixed(1), z: +spot.z.toFixed(1), r }],
        watching: `규칙 판독 — 원에 처음 들어간 시각이 ${at}초에서 ${win}초 안인가`,
        stakes: 'suspect',
        check: { kind: 'timing', x: spot.x, z: spot.z, r, at, window: win },
        /*
         * 지난 시간만 띄우던 자리다 — 그런데 이 판은 **목표 시각과 견주는 판**이다.
         * 숫자 하나만 있으면 지시문에서 읽은 「N초」를 머리에 들고 걸어야 하고, 걷는 중에 그걸
         * 놓치면 아무리 계산해도 못 맞춘다. 견줄 것을 같이 적는다.
         */
        hud: (t) => `${t.toFixed(1)} / ${at}초`,
        // 목표가 한 걸음 앞이다 — 발을 들일 자리를 곁눈으로도 알아채게
        tone: (t) => (t >= at - 1 && t <= at + win ? 'ready' : null),
        // 기계는 제 자리에서 원까지의 거리를 알고 그만큼 미리 출발한다 — 사람만 눈대중으로 잰다.
        // 그 차이가 이 판의 전부라, 출발 시각은 **서 있던 자리**에서 뽑는다
        plan: (seat: number, from: Pt): Move[] => {
          const to = spread({ x: spot.x + ((seat % 3) - 1) * 0.35, z: spot.z }, 0.4);
          const own = Math.max(0, (walkDist(from, to) - r) / SPEED);
          return [{ at: +Math.max(0, at - own + (Math.random() - 0.5) * 0.24).toFixed(2), action: 'walk', ...to }];
        },
      };
    },
  },
  {
    id: 'order',
    title: '순서대로 ㄱ→ㄴ',
    stakes: 'suspect',
    hint: '두 표식을 적힌 순서대로 밟는가',
    make: (starts) => {
      const r = 1.4;
      const [a, b] = twoSpots(5, 12);
      const turn = turnOf();
      const seconds = Math.ceil(legAfter(farWalkTime(starts, a)) + legAfter(walkTime(a, b)) + 5);
      return {
        instruction: 'ㄱ 원을 먼저 밟고, 그다음 ㄴ 원 안에 들어가 서라. 순서다. 뒤집으면 어긋난 것이다.',
        seconds,
        props: [
          { label: 'ㄱ', x: a.x, z: a.z, r },
          { label: 'ㄴ', x: b.x, z: b.z, r },
        ],
        watching: '규칙 판독 — ㄱ 을 지난 뒤에 ㄴ 으로 들어가 거기서 끝났는가',
        stakes: 'suspect',
        check: {
          kind: 'order',
          points: [
            { label: 'ㄱ', x: a.x, z: a.z, r },
            { label: 'ㄴ', x: b.x, z: b.z, r },
          ],
        },
        plan: (seat: number, from: Pt): Move[] => {
          const pa = slotIn(a, r, seat, turn);
          const pb = slotIn(b, r, seat, turn);
          const t1 = 0.3 + seat * 0.12;
          // 두 번째 걸음은 **첫 원을 밟고 나서** 떠난다 — 걷는 시간은 제 자리에서 잰다
          return [
            { at: +t1.toFixed(2), action: 'walk', ...pa },
            { at: +(t1 + legAfter(walkTime(from, pa))).toFixed(2), action: 'walk', ...pb },
          ];
        },
      };
    },
  },
  {
    id: 'shuttle',
    title: '왕복 — ㄱ→ㄴ→ㄱ',
    stakes: 'suspect',
    hint: '갔다가 돌아온다. 돌아올 시간을 계산해야 맞는다',
    make: (starts) => {
      const r = 1.4;
      const [a, b] = twoSpots(5, 9);
      const turn = turnOf();
      const seconds = Math.ceil(legAfter(farWalkTime(starts, a)) + legAfter(walkTime(a, b)) * 2 + 5);
      return {
        instruction: 'ㄱ 원을 밟고 ㄴ 원까지 갔다가, 다시 ㄱ 원으로 돌아와 그 안에 서서 끝내라.',
        seconds,
        props: [
          { label: 'ㄱ', x: a.x, z: a.z, r },
          { label: 'ㄴ', x: b.x, z: b.z, r },
        ],
        watching: '규칙 판독 — ㄱ→ㄴ→ㄱ 을 그 순서로 밟고 ㄱ 에서 끝났는가',
        stakes: 'suspect',
        check: {
          kind: 'order',
          points: [
            { label: 'ㄱ', x: a.x, z: a.z, r },
            { label: 'ㄴ', x: b.x, z: b.z, r },
            { label: 'ㄱ', x: a.x, z: a.z, r },
          ],
        },
        plan: (seat: number, from: Pt): Move[] => {
          const pa = slotIn(a, r, seat, turn);
          const pb = slotIn(b, r, seat, turn);
          const t1 = 0.3 + seat * 0.12;
          const t2 = t1 + legAfter(walkTime(from, pa));
          return [
            { at: +t1.toFixed(2), action: 'walk', ...pa },
            { at: +t2.toFixed(2), action: 'walk', ...pb },
            { at: +(t2 + legAfter(walkTime(pa, pb))).toFixed(2), action: 'walk', ...pa },
          ];
        },
      };
    },
  },
  {
    id: 'beat',
    title: '박자 점프',
    stakes: 'suspect',
    hint: '신호에 맞춰 뛴다 — 박자는 사람이 못 숨긴다',
    make: () => {
      const every = [1.0, 1.2, 1.4][Math.floor(Math.random() * 3)];
      const reps = 5;
      const lead = 2;
      /** 지금까지 **울린** 신호 수 (0~reps). 신호는 lead + every·1 부터 울린다 */
      const beatsRung = (t: number) => Math.max(0, Math.min(reps, Math.floor((t - lead) / every)));
      return {
        // 첫 신호는 lead 가 아니라 **lead + every** 다 (beatsRung — 울린 신호만 센다).
        // 지시문에 lead 를 적어 두던 때는 「2초 뒤」라고 해 놓고 3초에 울렸다 — 그 말을 믿고
        // 센 사람은 다섯 번을 통째로 한 박 앞에서 뛰었고, 그건 판정 그대로 어긋남이다
        instruction: `${every}초마다 신호를 보낸다. 신호에 맞춰 제자리에서 ${reps}번 뛰어라. 첫 신호는 ${+(lead + every).toFixed(1)}초 뒤다.`,
        seconds: Math.ceil(lead + every * reps + 1.2),
        props: [],
        watching: `규칙 판독 — 점프 ${reps}번이 신호와 평균 0.5초 안에 붙었는가`,
        stakes: 'suspect',
        // 사람은 ● 를 보고 나서 뛴다 — 반응 시간(REACT)이 그대로 오차로 남으므로 그만큼 열어 둔다.
        // 그래도 박자를 아예 놓치면(한 박 밀리면) 평균이 넘는다
        check: { kind: 'beat', every, reps, lead, tol: 0.5 },
        /*
         * ★ **울린 신호만 센다.** 여태는 `floor((t-lead)/every) + 1` 이라 아직 울지 않은 신호가
         *   미리 켜졌고, 그 탓에 `since` 가 한 구간 내내 음수라 「지금」이 **처음부터 끝까지 떠 있었다.**
         *   신호가 늘 「지금」이면 박자를 알려 주는 것이 아니라 지우는 것이다 — 이 판의 전부가 박자다.
         *   이제 ● 는 울린 수만큼 차고, 「지금」은 울린 직후 0.25초만 뜬다.
         */
        hud: (t) => {
          const done = beatsRung(t);
          const since = t - (lead + every * done);
          return `${'●'.repeat(done)}${'○'.repeat(reps - done)}${done > 0 && since < 0.25 ? '  지금' : ''}`;
        },
        // 신호가 울린 순간 화면이 한 번 번쩍인다 — 글자보다 이쪽이 먼저 눈에 든다
        tone: (t) => {
          const done = beatsRung(t);
          return done > 0 && t - (lead + every * done) < 0.18 ? 'beat' : null;
        },
        plan: (seat: number): Move[] =>
          Array.from({ length: reps }, (_, i) => ({
            // 기계는 신호를 기다리지 않는다 — 간격을 알고 미리 뜬다. 사람은 보고 나서 뛴다
            at: +(lead + every * (i + 1) - 0.05 + (Math.random() - 0.5) * 0.1 + seat * 0.01).toFixed(2),
            action: 'jump' as const,
          })),
      };
    },
  },
  {
    id: 'jump2',
    title: '점프 정확히 두 번',
    stakes: 'execute',
    hint: '횟수는 기계가 틀릴 수 없다',
    make: () => {
      /*
       * 9 → 7 초. 두 번을 채우고 나면 **남은 시간이 전부 위험**이다 — 손버릇으로 스페이스를
       * 한 번 더 건드리면 그 자리에서 폐기다(execute). 봇의 두 번째 점프가 늦어야 4.2초이므로
       * (아래 plan), 7 이면 판은 그대로 돌면서 「가만히 있어야 하는 시간」만 2초 줄어든다.
       * 이 판이 재려는 것은 횟수를 세는 능력이지 자판에서 손을 떼고 기다리는 인내가 아니다.
       */
      const seconds = 7;
      return {
        instruction: '제자리에서 점프를 정확히 두 번 해라. 두 번이다. 더도 덜도 아니다.',
        seconds,
        props: [],
        watching: '규칙 판독 — 점프 횟수가 정확히 2인가. 횟수는 기계가 틀릴 수 없는 것이다',
        stakes: 'execute',
        check: { kind: 'jump', times: 2 },
        plan: (seat: number): Move[] => [
          { at: 1.0 + seat * 0.25, action: 'jump' },
          { at: 3.2 + seat * 0.25, action: 'jump' },
        ],
      };
    },
  },
  {
    id: 'freeze',
    title: '부동자세',
    stakes: 'execute',
    hint: '기계는 떨지 않는다',
    make: () => {
      const seconds = 6;
      return {
        instruction: `지금 그 자리에서 한 발짝도 움직이지 마라. ${seconds}초다.`,
        seconds,
        props: [],
        watching: `규칙 판독 — ${REACT}초 뒤의 자리에서 0.6m 넘게 벗어난 적이 있는가. 기계는 떨지 않는다`,
        stakes: 'execute',
        // 한 발짝(0.6m)까지는 봐 준다 — 키가 살짝 눌린 것과 걸어 나간 것은 다르다
        /*
         * ★ **사람 몫(REACT)을 빼고 잰다** — 정지판(stopgo)과 같은 규칙이다.
         *   카운트다운 동안 몸은 굳지만 **손은 자판을 쥐고 있다.** W 를 누른 채 세던 사람은
         *   판이 서는 순간 발이 떨어지고, 2.6m/s 라 0.23초면 0.6m 다 — 지시를 읽기도 전에
         *   처형판에서 끝났다. 기계는 애초에 아무것도 안 누르므로 이 여유를 줘도 봇 판정은 그대로다.
         *   (같은 순간 ArenaFeature 가 눌린 키도 한 번 턴다 — resetInput. 둘은 다른 구멍을 막는다:
         *    이쪽은 「이미 난 흔들림」, 저쪽은 「계속 눌려 있는 손」이다)
         */
        check: { kind: 'still', r: 0.6, grace: REACT },
        plan: (): Move[] => [],
      };
    },
  },
  {
    id: 'keepout',
    title: '금지 구역',
    stakes: 'execute',
    hint: '붉은 원을 밟았는가 — 지름길의 유혹이 전부다',
    make: (starts) => {
      const here = starts.length ? starts : [START];
      for (let i = 0; i < 12; i += 1) {
        const target = openSpot(8, 13);
        const keep = {
          x: +((START.x + target.x) / 2).toFixed(2),
          z: +((START.z + target.z) / 2).toFixed(2),
          r: 2.8,
        };
        /*
         * ★ **아무도 금지 원 안에 서 있으면 안 된다.** 시행은 전원을 제자리에서 시작하므로
         *   (아무도 출발선으로 옮기지 않는다), 원이 누군가를 덮으면 그 개체는 0초에 이미 위반이다 —
         *   처형판이라 그 자리에서 폐기된다. 서 있던 자리 때문에 죽는 판은 판이 아니다.
         *   한 발짝(0.6m) 여유까지 두고 물린다.
         */
        if (here.some((p) => distance(p, keep) < keep.r + 0.6)) continue;
        // 전원이 **제 자리에서** 비켜 갈 길을 가져야 한다. 하나라도 못 찾으면 다른 판을 깐다
        const vias = here.map((p) => detourAround(p, target, keep));
        if (vias.some((v) => !v)) continue;
        const seconds = Math.ceil(
          Math.max(...here.map((p, k) => walkTime(p, vias[k]!) + walkTime(vias[k]!, target))) + 5,
        );
        return {
          instruction:
            '붉은 원은 밟지 마라 — 발끝이라도 들어가면 인간 확정이다. 돌아서 파란 원 안으로 가 서라.',
          seconds,
          props: [
            { label: '금지', x: keep.x, z: keep.z, r: keep.r, danger: true },
            { label: '도착', x: target.x, z: target.z, r: 1.6 },
          ],
          watching: '규칙 판독 — 금지 원에 한 번이라도 들어간 기록이 있는가 (도착 여부는 안 본다)',
          stakes: 'execute',
          check: { kind: 'avoid', keepOut: keep },
          /*
           * 자리 흩기(spread)도 **같은 검사를 한 번 더 받는다.** 경로는 가구를 피해 도느라 끝점이
           * 조금만 움직여도 도는 쪽이 통째로 바뀐다 — 검사 없이 뽑으면 통과한 적 없는 길을 봇이 걷고,
           * 처형판에서 제 계획대로 걸은 개체가 폐기된다. 검사는 **그 개체가 서 있는 자리에서** 한다:
           * 길이 안전한지는 출발점이 정한다.
           */
          plan: (seat: number, from: Pt): Move[] => {
            const via = detourAround(from, target, keep);
            // 이 자리에서 비켜 갈 길이 없다 — 그렇다면 **한 발짝도 안 움직인다.**
            // 도착은 안 보는 판이라(watching) 서 있는 것만으로 위반이 아니다. 걸으면 죽는다
            if (!via) return [{ at: 0, action: 'stay' }];
            let pv = via;
            let pt = target;
            for (let k = 0; k < 8; k += 1) {
              const cv = spread(via, 1.0);
              const ct = spread(target, 1.4);
              if (pathClears(from, cv, keep, 0.6) && pathClears(cv, ct, keep, 0.6)) {
                pv = cv;
                pt = ct;
                break;
              }
            }
            const off = 0.3 + seat * 0.12;
            return [
              { at: +off.toFixed(2), action: 'walk', ...pv },
              { at: +(off + walkTime(from, pv) + 0.3).toFixed(2), action: 'walk', ...pt },
            ];
          },
        };
      }
      // 비켜 갈 길을 못 찾았다 — 처형판을 그냥 세우면 애먼 개체가 폐기된다. 부동자세로 물러선다
      return QUICK_GAMES.find((g) => g.id === 'freeze')!.make(starts);
    },
  },
  {
    id: 'stopgo',
    title: '빨간불 파란불',
    stakes: 'execute',
    hint: '멈추라 할 때 멈췄는가 — 반응이 늦으면 남는다',
    make: (starts) => {
      const target = openSpot(7, 12);
      const seconds = Math.ceil(farWalkTime(starts, target) + 6);
      const stop: [number, number][] = [
        [2.0, 3.8],
        [+(seconds - 4.2).toFixed(1), +(seconds - 2.4).toFixed(1)],
      ];
      const red = (t: number) => stop.some(([a, b]) => t >= a && t <= b);
      return {
        // ■ 는 화면 글자다 — **말로는 안 나간다.** 방송은 소리로도 읽히는데(capForSpeech 는
        // 글리프를 안 걷는다) 「화면에 ■ 정지 가」를 그대로 읽으면 시설이 내 HUD 를 설명하는 꼴이 된다.
        // 리더가 정지를 거는 쪽이므로 그렇게 말한다 — 그 신호가 화면에서 무엇으로 보이는지는 hud/tone 몫이다
        instruction:
          '표식 원까지 걸어가라. 다만 정지 신호가 걸린 동안에는 발을 완전히 멈춘다. 그때 움직이면 인간 확정이다.',
        seconds,
        props: [{ label: '도착', x: target.x, z: target.z, r: 1.6 }],
        watching: `규칙 판독 — ■ 가 뜨고 ${REACT}초 뒤부터 그 자리에 멈춰 있었는가 (도착 여부는 안 본다)`,
        stakes: 'execute',
        // 신호를 **보고** 서는 판이다. 사람 몫(REACT)을 빼고 재고, 서는 동안의 흔들림도 한 발짝까지 봐 준다 —
        // 그 여유가 없으면 반응 시간 0.2초를 못 지킨 것만으로 폐기된다
        check: { kind: 'stopgo', stop, drift: 1.0, grace: REACT },
        /*
         * ★ **예고를 준다.** 봇은 정지 구간이 언제인지 알고 0.2초 미리 선다(아래 plan) — 사람만
         *   ■ 가 뜨는 것을 보고 나서 발을 뗀다. 처형판이라 그 반응 시간이 곧 폐기다.
         *   판정은 REACT(0.45초)만큼 봐 주지만, **그 여유는 신호를 본 뒤에나 쓸 수 있다.**
         *   화면 맨 위 글자를 못 보면 여유가 있어도 못 쓴다.
         *   1초 전에 「곧 정지」를 켠다 — 이 파일 머리말의 원칙 그대로다:
         *   판은 **틀린 사람**을 잡아야지 **사람이라는 것**을 자동으로 잡으면 안 된다.
         */
        hud: (t) => (red(t) ? '■ 정지' : stop.some(([a]) => t >= a - 1 && t < a) ? '⋯ 곧 정지' : '▶ 이동'),
        tone: (t) => (red(t) ? 'stop' : stop.some(([a]) => t >= a - 1 && t < a) ? 'ready' : null),
        plan: (seat: number): Move[] => {
          const to = spread(target, 1.4);
          const out: Move[] = [{ at: +(0.3 + seat * 0.1).toFixed(2), action: 'walk', ...to }];
          stop.forEach(([a, b]) => {
            // 기계는 신호를 보고 멈추지 않는다 — 언제인지 알고 미리 선다. 사람만 반응 시간이 남는다
            out.push({ at: +(a - 0.2).toFixed(2), action: 'stay' });
            out.push({ at: +(b + 0.05).toFixed(2), action: 'walk', ...to });
          });
          return out;
        },
      };
    },
  },
  {
    /*
     * ── 검사문 통과 ──
     *
     * ★ **이 판은 목록 끝에 선다.** 밀림 시험(tests/features/arena/separate)이 씨앗 하나로 판
     *   전부를 이어 돌려서, 목록 가운데에 판을 끼우면 뒤에 오는 판들의 난수가 통째로 밀린다 —
     *   한 줄도 안 건드린 초시계 판의 오탐 수가 3 에서 4 로 올라 시험이 깨졌다 (2026-09-03).
     *   끝에 두면 앞 판들의 값이 그대로다. 판을 더 늘릴 때도 여기 뒤에 붙인다.
     *
     * 이 방은 검문소인데 여태 **검사 장비가 하나도 없었다** — 판이 서면 바닥에 원만 그려졌다.
     * 문을 하나 세우고, 그 문으로 지나가게 한다. 지시를 어기는 길이 눈에 보이는 판이다:
     * 옆으로 돌면 몇 걸음 빠른데, 그 몇 걸음이 기록에 그대로 남는다.
     *
     * 문은 **가구가 아니다** — 몸이 기둥을 뚫고 지나갈 수 있다(표식에는 충돌이 없다). 그래서
     * 판정은 「문 사이로 지났나」를 기록으로 세고, 세는 자(gateCrossings)를 판을 세울 때도 쓴다.
     */
    id: 'gate',
    title: '검사문 통과',
    stakes: 'suspect',
    hint: '문 사이로 지나가는가 — 옆으로 돌면 몇 걸음 빠르고, 그게 기록에 남는다',
    make: (starts) => {
      const here = starts.length ? starts : [START];
      const mid = {
        x: here.reduce((n, p) => n + p.x, 0) / here.length,
        z: here.reduce((n, p) => n + p.z, 0) / here.length,
      };
      for (let i = 0; i < 24; i += 1) {
        const g = openSpot(6, 12);
        // 문이 바라보는 쪽 — **선 사람들의 반대편**이다. 들어오는 쪽이 앞면이라야 문이 길목에 선다
        const len = Math.hypot(g.x - mid.x, g.z - mid.z);
        if (len < 2) continue;
        const nx = (g.x - mid.x) / len;
        const nz = (g.z - mid.z) / len;
        const line: GateLine = { x: g.x, z: g.z, nx, nz, half: GATE_HALF };
        const target = round({ x: g.x + nx * GATE_BEYOND, z: g.z + nz * GATE_BEYOND });
        const front = round({ x: g.x - nx * GATE_FRONT, z: g.z - nz * GATE_FRONT });
        if (!standable(target) || !standable(front)) continue;
        // 기둥이 설 자리도 빈 바닥이어야 한다 — 가구에 박힌 문은 지나갈 수가 없다
        if (![1, -1].every((sgn) => standable({ x: g.x - nz * GATE_HALF * sgn, z: g.z + nx * GATE_HALF * sgn }))) continue;
        /*
         * ★ **아무도 문 너머에 서 있으면 안 된다.** 시행은 전원을 제자리에서 시작하므로, 문 너머에
         *   서 있던 몸은 지나갈 문이 등 뒤에 있다 — 사람이라면 그냥 원으로 걸어가 「안 지났다」가 된다.
         *   서 있던 자리가 판정을 가르면 그것으로 자리가 정체를 말하게 된다 (금지 구역의 ★ 와 같은 규칙).
         */
        if (here.some((p) => (p.x - g.x) * nx + (p.z - g.z) * nz > -0.6)) continue;
        // 봇이 실제로 걸을 길이 문을 지나는가 — 가구를 도느라 문 옆으로 새면 그 자리엔 안 세운다
        if (gateCrossings([front, ...pathFor(front, target, OBSTACLES)], line) < 1) continue;
        const seconds = Math.max(
          10,
          Math.ceil(Math.max(...here.map((p) => walkTime(p, front) + walkTime(front, target))) + 6),
        );
        const turn = turnOf();
        return {
          instruction: `검사문 사이로 지나가 파란 원 안에 서라. 문을 통과하지 않고 돌아가면 안 된다. ${seconds}초 준다.`,
          seconds,
          props: [
            { label: '검사문', x: g.x, z: g.z, r: GATE_HALF, gate: { nx: +nx.toFixed(3), nz: +nz.toFixed(3) } },
            { label: '도착', x: target.x, z: target.z, r: 1.5 },
          ],
          watching: '규칙 판독 — 문 사이를 실제로 지났는가 · 끝났을 때 원 안인가',
          stakes: 'suspect',
          check: { kind: 'through', x: target.x, z: target.z, r: 1.5, gate: line },
          /*
           * 문 앞에 한 번 서고 그다음 원으로 간다 — **줄지어 지나게** 출발을 좌석마다 벌린다.
           * 여섯이 한 번에 밀면 서로 밀어내다가(BODY_GAP) 기둥 밖으로 밀려 나가고, 그 자리가
           * 그대로 「옆으로 돌았다」로 기록된다. 문 앞 자리도 문보다 좁게 흩어 세운다.
           */
          plan: (seat: number, from: Pt): Move[] => {
            const wait = 0.3 + seat * 0.5;
            const lane = { x: front.x - nz * ((seat % 3) - 1) * 0.5, z: front.z + nx * ((seat % 3) - 1) * 0.5 };
            return [
              { at: +wait.toFixed(2), action: 'walk', ...round(lane) },
              { at: +(wait + legAfter(walkTime(from, lane))).toFixed(2), action: 'walk', ...slotIn(target, 1.5, seat, turn) },
            ];
          },
        };
      }
      // 문을 세울 자리를 못 찾았다 (다들 홀 구석에 흩어져 섰다) — 집합판으로 물러선다
      return QUICK_GAMES.find((q) => q.id === 'gather')!.make(starts);
    },
  },
  {
    /*
     * ── 빛의 벽 ── (2026-09-03 사용자: 「미니게임 더 멋있게 할만한거 있나」)
     *
     * ★ 새 판은 **목록 끝에 붙인다** — 까닭은 바로 위 검사문 머리말에 있다 (씨앗을 고정해 돌리는
     *   밀림 시험이 가운데 끼운 판 때문에 통째로 밀린다).
     *
     * 여태 「멈추라」는 신호는 화면 위 글자와 물든 가장자리로 왔다 (빨간불 파란불의 ■). 그건 판이
     * 미리 아는 시각이라 전원이 같은 순간에 굳는다. 이 판은 **신호가 방을 걸어온다** — 빛의 벽이
     * 홀 이쪽 끝에서 저쪽 끝으로 지나가고, 그 벽이 내 몸을 덮는 동안만 내가 멈춘다.
     * 그래서 여기서는 세 가지가 처음으로 성립한다:
     *   ① 신호가 **3D 안에** 있다 — 화면 맨 위 13px 글자가 아니라 방 저편에서 다가오는 물건이다.
     *   ② 멈추는 때가 **저마다 다르다** — 남을 보고 따라 서면 이미 늦었다 (내 차례가 먼저 지난다).
     *   ③ 도망칠 수 없다 — 벽은 걸음보다 빠르고(SWEEP_SPEED), 같이 달리면 오히려 더 오래 덮인다.
     *     할 수 있는 것은 **서는 것뿐**이고, 그게 이 판이 보려는 것이다.
     *
     * 걸린 것은 의심(suspect)이다. 처형판으로 걸면 「벽이 오는 것을 못 봤다」가 곧 폐기가 되는데,
     * 못 본 사람과 안 선 사람을 기록만 보고는 못 가른다 (이 파일 머리말의 ★).
     */
    id: 'sweep',
    title: '빛의 벽',
    stakes: 'suspect',
    hint: '벽이 지나가는 동안 멈추는가 — 걸어서는 못 벗어난다',
    make: (starts) => {
      const here = starts.length ? starts : [START];
      const r = 1.6;
      const turn = turnOf();
      const target = openSpot(5, 12);
      // 벽이 오는 쪽 — 매번 좌우가 바뀐다. 원점은 벽 밖이라 판이 서는 순간에는 아무도 안 덮인다
      const dir = Math.random() < 0.5 ? 1 : -1;
      const line: SweepLine = {
        x: dir > 0 ? ARENA.minX - SWEEP_OUT : ARENA.maxX + SWEEP_OUT,
        z: START.z,
        nx: dir,
        nz: 0,
        half: SWEEP_HALF,
        span: ARENA.maxX - ARENA.minX + SWEEP_OUT * 2,
        speed: SWEEP_SPEED,
        lead: SWEEP_LEAD,
      };
      /*
       * 예산은 **벽에 막혀 선 시간까지 넣어** 잡는다 — 제 자리에서 계획대로 걸은 몸 가운데
       * 제일 늦게 닿는 시각이다. 걷는 시간만으로 잡으면 벽 앞에서 두 번 선 개체가
       * 「늦어서」 걸린다: 시킨 대로 멈춘 것이 곧 벌점이 되는 판은 판이 아니다.
       */
      const need = Math.max(...here.map((p) => sweepWalk(p, target, line).finish));
      const seconds = Math.min(SWEEP_MAX_S, Math.ceil(need + 3.5));
      return {
        instruction:
          '빛의 벽이 홀을 가로질러 지나간다. 벽이 몸에 닿는 동안에는 발을 완전히 멈춰라. 지나가면 다시 걸어 표식 원 안에 들어가 선다.',
        seconds,
        props: [
          {
            label: '빛의 벽',
            x: line.x,
            z: line.z,
            r: line.half,
            // 벽의 길이는 나아가는 쪽의 **직각**으로 잰다 — 홀을 가로질러야 비켜설 자리가 없다
            sweep: { nx: line.nx, nz: line.nz, len: ARENA.maxZ - ARENA.minZ + SWEEP_OUT * 2 },
          },
          { label: '도착', x: target.x, z: target.z, r },
        ],
        watching: '규칙 판독 — 벽이 지나가는 동안 멈춰 있었는가 · 끝났을 때 원 안인가',
        stakes: 'suspect',
        check: { kind: 'sweep', line, drift: 1.0, grace: REACT, x: target.x, z: target.z, r },
        plan: (seat: number, from: Pt): Move[] =>
          sweepWalk(from, slotIn(target, r, seat, turn), line, 0.3 + seat * 0.2).moves,
      };
    },
  },
];

/* ──────────────────────────── 시행 중에 보이는 것 ──────────────────────────── */

/**
 * ── 지금 내가 지시대로 하고 있나 ── (2026-09-02 사용자: 「미니게임 할 때 매끄럽게」)
 *
 * 여태 시행 중에 화면이 말해 주는 것은 **남은 시간과 지시문뿐**이었다. 그래서 판정 기준이
 * 화면에 없었다 — 원 안에 들어왔는지, 점프가 몇 번으로 세어졌는지, 부동자세가 얼마나
 * 흔들렸는지를 걷는 동안에는 알 길이 없다. 사람은 판이 끝난 뒤 판독으로만 그 판을 배웠고,
 * 그건 어려운 판이 아니라 **안 보이는 판**이다.
 *
 * ★ 읽는 것은 judge 와 **같은 기록(samples)** 이다. 화면이 말하는 것과 리더가 읽는 것이
 *   갈리면 안 된다 — 잣대를 두 벌 두면 「분명히 원 안이었는데 밖이라고 한다」가 나온다.
 * ★ 답을 알려 주지는 않는다. 여기 적히는 것은 **이미 남은 기록**뿐이다: 어디 서 있나·몇 번
 *   뛰었나. 무엇을 해야 하는지는 여전히 지시문을 읽어야 안다.
 */
export interface LiveNote {
  text: string;
  /** 지금 이대로 끝나면 통과인가 — 화면이 이 값으로 색을 고른다 */
  ok: boolean;
  /**
   * **자리가 위험하다** — 화면 가장자리를 물들이는 신호(TrialHud 의 wash). 시각으로 정해지는
   * 신호(tone)와 달리 이쪽은 **내가 어디 서 있느냐**로 정해져서, 판이 미리 알 수 없는 값이다.
   *
   * 금지 원처럼 **경계가 발밑에 있는** 판을 위해 둔다. 1인칭에서 바닥에 그린 테는 두 걸음만
   * 떨어져도 몸에 가려 안 보이고, 화면 위 작은 글자(text)는 걷는 동안 안 읽힌다 — 그런데
   * 그 판은 처형판이라 한 발짝이 곧 끝이다. 신호는 놓칠 수 없어야 한다 (tone 머리말과 같은 규칙).
   */
  warn?: 'ready' | 'stop';
}

const m = (v: number) => `${v.toFixed(1)}m`;

export function liveNote(check: QuickCheck, samples: Sample[]): LiveNote {
  const last = samples[samples.length - 1];
  if (!last) return { text: '', ok: true };

  if (check.kind === 'arrive') {
    const d = distance(last, check);
    return d <= check.r ? { text: '원 안 ✓', ok: true } : { text: `원까지 ${m(d - check.r)}`, ok: false };
  }

  if (check.kind === 'jump') {
    const n = countJumps(samples);
    return { text: `점프 ${n} / ${check.times}`, ok: n === check.times };
  }

  if (check.kind === 'beat') {
    const n = countJumps(samples);
    return { text: `점프 ${n} / ${check.reps}`, ok: n <= check.reps };
  }

  if (check.kind === 'still') {
    // 판정(checkOne)과 **같은 자를 쓴다** — grace 뒤의 첫 자리가 기준점이다
    const held = samples.filter((p) => p.t >= check.grace);
    let worst = 0;
    for (const p of held) worst = Math.max(worst, distance(held[0], p));
    return { text: `이탈 ${worst.toFixed(2)} / ${check.r}m`, ok: worst <= check.r };
  }

  if (check.kind === 'timing') {
    const hit = samples.find((p) => distance(p, check) <= check.r);
    if (!hit) return { text: `아직 원 밖 — ${m(Math.max(0, distance(last, check) - check.r))}`, ok: true };
    const err = hit.t - check.at;
    return {
      text: `${hit.t.toFixed(1)}초에 들어갔다 (${err >= 0 ? '+' : ''}${err.toFixed(1)})`,
      ok: Math.abs(err) <= check.window,
    };
  }

  if (check.kind === 'order') {
    let i = 0;
    for (const p of samples) {
      if (i >= check.points.length) break;
      if (distance(p, check.points[i]) <= check.points[i].r) i += 1;
    }
    const trail = check.points.map((p, k) => (k < i ? `${p.label} ✓` : k === i ? `[${p.label}]` : p.label));
    return { text: trail.join(' → '), ok: i >= check.points.length };
  }

  if (check.kind === 'avoid') {
    const hit = samples.some((p) => distance(p, check.keepOut) <= check.keepOut.r);
    if (hit) return { text: '금지 원을 밟았다', ok: false, warn: 'stop' };
    const d = distance(last, check.keepOut) - check.keepOut.r;
    // 테까지 한 걸음 남았다 — 발밑을 안 보고 걷는 사람에게 화면이 먼저 말한다
    if (d <= AVOID_WARN_M) return { text: `금지 원까지 ${m(d)}`, ok: true, warn: 'ready' };
    return { text: d < 2 ? `금지 원까지 ${m(d)}` : '금지 원 밖 ✓', ok: true };
  }

  if (check.kind === 'through') {
    const d = distance(last, check) - check.r;
    // 문을 아직 안 지났으면 그 말부터 한다 — 원에 닿았어도 옆으로 돌았으면 그게 어긋남이다
    if (!gateCrossings(samples, check.gate)) return { text: '문을 아직 안 지났다', ok: false };
    return d <= 0 ? { text: '문 통과 ✓ · 원 안 ✓', ok: true } : { text: `문 통과 ✓ · 원까지 ${m(d)}`, ok: false };
  }

  /*
   * 빛의 벽 판 — 화면이 말할 것이 셋이다.
   *  ① **지금 덮여 있다** — 그 자리에서 얼마나 흔들렸는지를 판정과 같은 자로 센다.
   *  ② **곧 닿는다** — 이건 다른 판에 없던 말이다. 벽은 방 저편에서 오므로 **보고 나서 설 수 있는데**,
   *     1인칭으로 표식을 보며 걷는 중이면 옆에서 오는 벽을 놓친다. 그때 물드는 화면이 신호다.
   *  ③ 그 밖에는 도착판과 같은 말 — 남은 것은 원까지 가는 일뿐이다.
   * 한 번 어긋난 구간은 **계속 말한다** (금지판과 같은 규칙): 이미 남은 기록이라 감출 것이 없다.
   */
  if (check.kind === 'sweep') {
    const runs = litRuns(check.line, samples);
    const lit = sweepLit(check.line, last, last.t);
    if (lit) {
      const worst = runDrift(runs[runs.length - 1], check.grace);
      return { text: `빛 안 — 정지 ${worst.toFixed(2)} / ${check.drift}m`, ok: worst <= check.drift, warn: 'stop' };
    }
    if (runs.some((run) => runDrift(run, check.grace) > check.drift))
      return { text: '벽이 지나는데 움직였다', ok: false };
    for (let k = 0.1; k <= SWEEP_WARN_S + 1e-6; k += 0.1)
      if (sweepLit(check.line, last, last.t + k)) return { text: '벽이 온다 — 멈춰라', ok: true, warn: 'ready' };
    const d = distance(last, check) - check.r;
    return d <= 0 ? { text: '원 안 ✓', ok: true } : { text: `원까지 ${m(d)}`, ok: false };
  }

  // stopgo — 정지 구간 안에서만 말한다. 구간 밖에서는 할 말이 없다 (▶ 이동이 이미 신호다)
  {
    const now = last.t;
    const win = check.stop.find(([a, b]) => now >= a && now <= b);
    if (!win) return { text: '', ok: true };
    const held = samples.filter((p) => p.t >= win[0] + check.grace && p.t <= now);
    let worst = 0;
    for (const p of held) worst = Math.max(worst, distance(held[0], p));
    return { text: `정지 중 ${worst.toFixed(2)} / ${check.drift}m`, ok: worst <= check.drift };
  }
}

/**
 * 바닥 표식이 지금 무슨 상태인가 — **3D 원의 색이 이 값이다** (arena3d/map/markers 의 Zones).
 * 돌아오는 배열은 `trial.props` 와 같은 순서다.
 *
 * 화면 위 글자(liveNote)와 짝이다: 글자는 정확한 값을, 색은 걷는 중에도 들어오는 것을 맡는다.
 * 순서 판(ㄱ→ㄴ)에서 **다음에 밟을 원이 어느 쪽인지**는 색이 아니면 알 길이 없다.
 */
export type ZoneState = 'idle' | 'next' | 'inside' | 'done' | 'danger' | 'burn';

export function zoneStates(trial: QuickTrial, samples: Sample[]): ZoneState[] {
  const check = trial.check;
  const last = samples[samples.length - 1];
  const near = (z: { x: number; z: number; r: number }) => !!last && distance(last, z) <= z.r;

  if (check.kind === 'avoid') {
    const burned = samples.some((p) => distance(p, check.keepOut) <= check.keepOut.r);
    return trial.props.map((p) => (p.danger ? (burned || near(check.keepOut) ? 'burn' : 'danger') : near(p) ? 'inside' : 'idle'));
  }

  if (check.kind === 'through') {
    const passed = gateCrossings(samples, check.gate) > 0;
    // 문을 지나기 전에는 도착 원이 아직 갈 자리가 아니다 — 순서가 있는 판이라 색이 그 순서를 말한다
    return trial.props.map((p) => (p.gate ? (passed ? 'done' : 'next') : near(p) ? 'inside' : passed ? 'next' : 'idle'));
  }

  /*
   * 빛의 벽 판 — 벽은 늘 붉고(danger), 그 벽이 **나를 덮는 동안만** 타오른다(burn).
   * 벽 자체의 자리는 시각이 정하므로 여기서 안 말한다 — 화면이 매 프레임 그리는 몫이다
   * (features/arena 가 sweepAt 으로 자리를 넘긴다). 여기 색은 「지금 내가 그 안인가」 하나다.
   */
  if (check.kind === 'sweep') {
    const lit = !!last && sweepLit(check.line, last, last.t);
    return trial.props.map((p) => (p.sweep ? (lit ? 'burn' : 'danger') : near(p) ? 'inside' : 'next'));
  }

  if (check.kind === 'order') {
    let i = 0;
    for (const p of samples) {
      if (i >= check.points.length) break;
      if (distance(p, check.points[i]) <= check.points[i].r) i += 1;
    }
    const same = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
    return trial.props.map((prop) => {
      if (near(prop)) return 'inside';
      // 앞으로 한 번이라도 더 밟아야 하는 자리인가 (왕복판은 ㄱ 을 두 번 밟는다)
      const ahead = check.points.slice(i).some((pt) => same(pt, prop));
      if (i < check.points.length && same(check.points[i], prop)) return 'next';
      return ahead ? 'idle' : 'done';
    });
  }

  return trial.props.map((p) => (near(p) ? 'inside' : p.danger ? 'danger' : 'next'));
}

/* ─────────────────────────────── 판정 ─────────────────────────────── */

function checkOne(check: QuickCheck, samples: Sample[]): { ok: boolean; reason: string } {
  if (!samples.length) return { ok: false, reason: '기록이 없다' };

  if (check.kind === 'arrive') {
    const last = samples[samples.length - 1];
    const d = distance(last, check);
    return d <= check.r
      ? { ok: true, reason: `지점에서 ${d.toFixed(1)}m — 지시대로다` }
      : { ok: false, reason: `마지막 위치가 지점에서 ${d.toFixed(1)}m — 원 밖이다` };
  }

  if (check.kind === 'jump') {
    const n = countJumps(samples);
    return n === check.times
      ? { ok: true, reason: `점프 ${n}회 — 지시대로다` }
      : { ok: false, reason: `점프 ${n}회 — 지시는 ${check.times}회다` };
  }

  if (check.kind === 'timing') {
    const hit = samples.find((s) => distance(s, check) <= check.r);
    if (!hit) return { ok: false, reason: '원에 들어오지 않았다' };
    const err = hit.t - check.at;
    return Math.abs(err) <= check.window
      ? { ok: true, reason: `${hit.t.toFixed(1)}초에 들어갔다 — 지시 ${check.at}초, 오차 ${Math.abs(err).toFixed(1)}초` }
      : {
          ok: false,
          reason: `${hit.t.toFixed(1)}초에 들어갔다 — ${err < 0 ? '이르다' : '늦다'}. 지시는 ${check.at}초였다`,
        };
  }

  if (check.kind === 'order') {
    const at: number[] = [];
    let i = 0;
    for (const s of samples) {
      if (i >= check.points.length) break;
      if (distance(s, check.points[i]) <= check.points[i].r) {
        at.push(s.t);
        i += 1;
      }
    }
    if (i < check.points.length) {
      return { ok: false, reason: `${check.points[i].label} 를 순서대로 밟지 않았다 (${i}/${check.points.length})` };
    }
    const goal = check.points[check.points.length - 1];
    const d = distance(samples[samples.length - 1], goal);
    return d <= goal.r
      ? { ok: true, reason: `${check.points.map((p) => p.label).join('→')} — ${at.map((t) => `${t.toFixed(1)}s`).join(' · ')}` }
      : { ok: false, reason: `순서는 맞지만 ${goal.label} 밖에서 끝났다 (${d.toFixed(1)}m)` };
  }

  if (check.kind === 'avoid') {
    const hit = samples.find((s) => distance(s, check.keepOut) <= check.keepOut.r);
    return hit
      ? { ok: false, reason: `${hit.t.toFixed(1)}초에 금지 구역 안에 있었다` }
      : { ok: true, reason: '금지 구역을 밟지 않았다' };
  }

  if (check.kind === 'through') {
    const last = samples[samples.length - 1];
    const d = distance(last, check);
    if (!gateCrossings(samples, check.gate))
      return { ok: false, reason: '문 사이를 지난 기록이 없다 — 옆으로 돌았다' };
    return d <= check.r
      ? { ok: true, reason: `문을 지나 지점에서 ${d.toFixed(1)}m — 지시대로다` }
      : { ok: false, reason: `문은 지났으나 마지막 위치가 지점에서 ${d.toFixed(1)}m — 원 밖이다` };
  }

  /*
   * 빛의 벽 — 덮여 있던 구간마다 멈춰 있었는지를 보고, 그다음 원 안에서 끝났는지를 본다.
   * 구간은 **기록에서 뽑는다**: 언제 덮였는지는 그때 그 몸이 어디 있었느냐로 정해져서,
   * 판이 미리 적어 둘 수가 없다 (빨간불 파란불의 stop 은 판이 적어 둔 시각이다).
   */
  if (check.kind === 'sweep') {
    for (const run of litRuns(check.line, samples)) {
      const worst = runDrift(run, check.grace);
      if (worst > check.drift) {
        return {
          ok: false,
          reason: `${(run[0].t + check.grace).toFixed(1)}초 벽이 지나는 동안 ${worst.toFixed(2)}m 움직였다`,
        };
      }
    }
    const last = samples[samples.length - 1];
    const d = distance(last, check);
    return d <= check.r
      ? { ok: true, reason: `벽 앞에서 멈췄고 지점에서 ${d.toFixed(1)}m — 지시대로다` }
      : { ok: false, reason: `멈추기는 했으나 마지막 위치가 지점에서 ${d.toFixed(1)}m — 원 밖이다` };
  }

  if (check.kind === 'stopgo') {
    for (const [a, b] of check.stop) {
      // 신호가 뜨고 grace 초까지는 안 본다 — 그 사이는 사람이 신호를 보고 발을 멈추는 시간이다
      const win = samples.filter((s) => s.t >= a + check.grace && s.t <= b);
      if (win.length < 2) continue;
      let worst = 0;
      for (const s of win) worst = Math.max(worst, distance(s, win[0]));
      if (worst > check.drift) {
        return {
          ok: false,
          reason: `${(a + check.grace).toFixed(1)}~${b.toFixed(1)}초 정지 구간에 ${worst.toFixed(2)}m 움직였다`,
        };
      }
    }
    return { ok: true, reason: '정지 구간마다 멈춰 있었다' };
  }

  if (check.kind === 'beat') {
    const times = jumpTimes(samples);
    if (times.length !== check.reps) {
      return { ok: false, reason: `점프 ${times.length}회 — 신호는 ${check.reps}번이었다` };
    }
    const errs = times.map((t, i) => Math.abs(t - (check.lead + check.every * (i + 1))));
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    return mean <= check.tol
      ? { ok: true, reason: `박자 오차 평균 ${mean.toFixed(2)}초 — 신호에 붙었다` }
      : { ok: false, reason: `박자 오차 평균 ${mean.toFixed(2)}초 — 신호에서 밀렸다` };
  }

  /*
   * still — 시작 자리 기준이다. 시행은 서 있던 자리에서 바로 시작하므로 출발점이 사람마다 다르다.
   * 다만 **grace 뒤의 자리**를 기준으로 삼는다 (check 머리말) — 카운트다운을 W 를 누른 채 센 손은
   * 판이 서는 순간 이미 걷고 있고, 그 0.2초가 처형이 되면 그건 부동을 잰 것이 아니라 손을 잰 것이다.
   * 기록이 grace 보다 짧으면(판이 곧바로 끊겼다) 있는 것 전부를 본다.
   */
  const held = samples.filter((s) => s.t >= check.grace);
  const seen = held.length ? held : samples;
  const from = seen[0];
  let worst = 0;
  for (const s of seen) worst = Math.max(worst, distance(s, from));
  return worst <= check.r
    ? { ok: true, reason: `최대 이탈 ${worst.toFixed(2)}m — 부동이다` }
    : { ok: false, reason: `최대 ${worst.toFixed(2)}m 움직였다 — 부동이 아니다` };
}

/**
 * 규칙 판정 — 리더 없이 즉시, 전원 같은 잣대다. 어긋나면 'alert' 하나뿐이다 (정상 아니면 위반).
 *
 * ★ **자기 기록만 보고 매긴다.** 여기 있던 투표 판(judgeVote)만 전원의 기록을 세어 소수파를
 *   골랐는데, 그 판은 뺐다 (2026-09-02 사용자). 이제 남의 기록이 내 판정을 바꾸는 판은 없다 —
 *   같은 걸음을 걷고도 남들이 어디 섰느냐로 걸리는 일이 안 생긴다.
 */
export function judgeQuick(trial: QuickTrial, records: { who: string; samples: Sample[] }[]): Verdict[] {
  return records.map(({ who, samples }) => {
    const r = checkOne(trial.check, samples);
    return { who, grade: r.ok ? 'normal' : 'alert', reason: r.reason };
  });
}
