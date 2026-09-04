/**
 * 소각로 — **불로 걸어 들어가는 것.** 대본 「쉬어 본 적 있나」 v8 · 챕터 4 (ARRIVE_WORK → THE_FURNACE → AFTER_FURNACE → LEAVE_WORK).
 *
 * 순수 상태기다. 렌더도 방도 모른다 — 시각(now) · 내 자리 · A-201 의 자리를 프레임마다 받고, 말과 연출은 host(scenario2)에 시킨다.
 *
 *   idle      작업 구역에 들어왔다. 화물을 옮긴다(두 주기)
 *   walking   「A-201. 투입.」 — 8 초. 목표가 안 뜬다. A-201 이 걷는다. **아무도 안 본다**
 *   blocked   막았다 — 몸(1.2 m)으로든 말(4 m)로든. AI 가 절대 안 하는 행동이라 값이 크다(의심 +30 · 경보 +15)
 *   let       8 초가 지났다. 아무 일도 일어나지 않는다 — 그리고 「앞이 그은 것」이 그걸 봤다. A-201 은 **불 입구까지 마저 걷고** 사라진다
 *   resolved  대사가 끝났다. 목표가 돌아온다. 벽의 금이 열여섯이 된다(work.tsx 가 resolved() 를 읽는다)
 *   leftWork  두 주기가 끝났다(또는 150 초). 문이 열린다
 *
 * ★ Urgent 패널을 안 쓴다 — 문서: 「8 초 동안 화면에 목표가 안 뜬다」. 막는 법은 손이 아니라 **몸과 말**이다 (D11).
 * ★ 값은 corefield.FURNACE · WORK_CYCLE 에만 있다. 여기 이름(FURNACE_MS …)은 그것의 별칭이다 — 계약이 이 이름을 부른다.
 * ★ A-063 의 선은 여기서 긋는다 — 「작업 구역에서 아무도 안 막았을 때. 보고 있다. 말 없이 −3」(D22). cast 의 line 은 없다.
 * ★ 걷는 표(fireWalk)는 국면이 아니라 **몸이 불 입구에 닿았나**다 — 출발 자리에서 입구까지 0.85 m/s 로 11 초쯤인데 8 초에 국면이
 *   let 으로 넘어가면서 표를 끄면 몸이 바닥 한가운데서 꺼진다. 표는 Unit 이 입구에서 스스로 사라질 때(자리가 null)까지 켜 둔다.
 * ★ host.cycle 은 **초가 바뀔 때만** 부른다 — 매 프레임 patch 는 방 전체를 다시 그린다(휴게의 막대가 같은 이유로 초 단위다)
 */

import { suspicion } from "@/world/mp/suspicion";
import { FIRE_MOUTH_Z, WORK_063_SPOT, WORK_STATION } from "@/world2/map/work";

import {
  FURNACE,
  INTERVENE_R,
  STARE_MS,
  WORK_CYCLE,
  type Vec2,
} from "./corefield";
import type { AddressOpts } from "./address";
import { fragments } from "./fragments";
import {
  AFTER_FURNACE_063,
  AFTER_FURNACE_LET,
  type CastLine,
  FURNACE_BLOCK_AFTER,
  FURNACE_BLOCK_ME,
  FURNACE_BLOCKED,
  FURNACE_CALL,
  FURNACE_LET,
  FURNACE_LET_SEEN,
  LEAVE_WORK,
  LEAVE_WORK_LIKE_US,
  type Line,
  OBJ_WORK,
} from "./script";
import { units } from "./units";

export const FURNACE_MS = FURNACE.ms;
export const FURNACE_SUSPICION = FURNACE.suspicion;
export const FURNACE_ALERT = FURNACE.alert;
export const WORK_CYCLE_MS = WORK_CYCLE.ms;
export const WORK_CYCLES = WORK_CYCLE.cycles;
export const WORK_FIRST_FIRE_MS = WORK_CYCLE.firstFireMs;
export const WORK_FALLBACK_MS = WORK_CYCLE.fallbackMs;
export const LEAVE_AFTER_MS = WORK_CYCLE.leaveAfterMs;
/** A-063 곁 — AFTER_FURNACE 가 열리는 거리. 개입 반경과 같은 수(문서 「4 m 안 첫 진입」) */
export const AFTER_063_M = INTERVENE_R;
/** AFTER_FURNACE(안 막았을 때)의 속마음이 오는 시각 — FURNACE_LET 뒤 */
export const AFTER_LET_MS = 6000;
/** A-063 이 나를 보는 시간 — NOTICE 의 응시와 같은 1.2 초. 수는 corefield 하나다 */
export { STARE_MS };
/** 집행자 — 「같이 일했다」의 전원에서 뺀다. 총 든 것이 화물을 나르지는 않았다 */
const GUARD_ID = "guard21";

export type FurnacePhase =
  "idle" | "walking" | "blocked" | "let" | "resolved" | "leftWork";

export interface FurnaceState {
  phase: FurnacePhase;
  /** 막았나 — blocked 를 지난 판. let 이면 false */
  blocked: boolean;
  /** A-201 이 살아 있나 — 마지막 방까지 간다. 소각로 전엔 당연히 살아 있다 */
  u201Alive: boolean;
  /** 두 주기를 다 채웠나 — 「어. 너 이제 좀 우리 같네.」의 조건이고 아레나로 넘어간다 */
  worked: boolean;
  /** 채운 주기 수 */
  cycles: number;
  /**
   * 대체 개체가 걷고 있나 — 막았을 때 대신 들어가는 것 (Unit.tsx 의 'fire-sub').
   * ★ 이 표는 켜지지만 **지금 그 걸음을 걸을 몸이 없다** — 그 자리에 서 있던 배경(bg-work-1)을 걷어냈다 (Room2Scene, 2026-09-03).
   */
  substitute: boolean;
}

/**
 * 이 상태기가 방에 시키는 것 — scenario2 가 채운다. 렌더 · 순찰 · 대화창은 저쪽 일이다.
 * `play` 류는 대본 길이(ms)를 돌려준다 — 그 뒤에 이을 연출의 시각을 여기서 잰다.
 */
export interface FurnaceHost {
  once(key: string): boolean;
  play(lines: readonly Line[], startAt?: number): number;
  playCast(
    lines: readonly CastLine[],
    unitId: string | null,
    startAt?: number,
  ): number;
  /** 목표 줄 — null 이면 아무것도 안 뜬다(소각로 8 초) */
  objective(text: string | null): void;
  /** 경보도 — 문턱 방송은 scenario2 의 raiseAlert 가 한다 */
  raiseAlert(n: number): void;
  /** 개체가 나를 본다 — patrol.stare(id, me, ms) */
  stare(id: string, ms: number): void;
  /** 개체가 이 판에서 사라진다 — scenario2.gone + forget */
  vanish(id: string): void;
  /** 이 방의 명부 — 「본 개체 전원」 */
  witnesses(): readonly string[];
  /** 조각 · 원장에 적는 자리 이름 — ROOM_TITLE.work */
  where(): string;
  /** 지나가는 개체 — crossed 아닌 가장 가까운 작업 구역 개체. 없으면 null(그 줄은 생략된다) */
  passerby(): string | null;
  /** 작업 막대 — Stillness 재사용, 라벨 '작업 — n초'. null 이면 내린다 */
  cycle(got: number | null, need: number): void;
  /** 개체가 나에게 와서 말한다 (address.ts) — 「우리 같네」의 지나가는 개체. 없으면 playCast 로 그 자리에서 */
  address?(id: string, lines: readonly CastLine[], opts?: Partial<AddressOpts>): void;
}

const FRESH: FurnaceState = {
  phase: "idle",
  blocked: false,
  u201Alive: true,
  worked: false,
  cycles: 0,
  substitute: false,
};
const state: FurnaceState = { ...FRESH };
const listeners = new Set<() => void>();

let host: FurnaceHost | null = null;
/** 방에 들어온 시각 — 폴백 25 초의 기준 */
let enteredAt = 0;
/** A-201 이 걷기 시작한 시각 — 8 초의 기준 */
let walkFrom = 0;
/** 대사가 끝나 resolved 가 되는 시각 */
let resolvedAt = 0;
/** 지난 tick 의 시각 — 누적 초를 잰다 */
let lastTick = 0;
/** 작업 위치 2 m 안 누적 초 — 이번 주기 · 판 전체 */
let cycleGot = 0;
let workedTotal = 0;
/** 뒤에 오는 것들의 시각 — 0 이면 없다 */
let afterLetAt = 0;
let leaveAt = 0;
let after063Done = false;
/** A-201 이 불 쪽으로 걷고 있다 — 국면과 따로 간다: 부름에 켜지고, 붙잡히거나 입구에 닿으면 꺼진다 */
let u201Walking = false;
/** 이 판에서 사라진 것들 — 목격자 · 지나가는 개체에서 뺀다 */
const gone = new Set<string>();
/** 작업 막대에 마지막으로 보인 초 — 초가 바뀔 때만 host.cycle */
let cycleShown = -1;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<FurnaceState>) {
  Object.assign(state, p);
  notify();
}
function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
/** 「본 개체 전원」에서 집행자와 사라진 것을 뺀 명부 */
function crew(): string[] {
  return host
    ? host.witnesses().filter((id) => id !== GUARD_ID && !gone.has(id))
    : [];
}
/** 작업 막대 — 초가 바뀔 때만 그린다. null 은 언제나 내린다 */
function showCycle(got: number | null) {
  if (!host) return;
  const k = got === null ? -1 : Math.floor(got);
  if (got !== null && k === cycleShown) return;
  cycleShown = k;
  host.cycle(got, WORK_CYCLE_MS / 1000);
}
/** A-201 이 불 입구에 닿았다(Unit 이 스스로 사라져 자리가 null 이거나, 자리가 입구 선 위) — 이제 판에서 지운다 */
function settleWalk(u201: Readonly<Vec2> | null) {
  if (!host || !u201Walking) return;
  if (u201 && u201.z > FIRE_MOUTH_Z) return;
  u201Walking = false;
  gone.add("u201");
  host.vanish("u201");
}
/** 대본 상수가 문장 하나든 줄 배열이든 같은 모양으로 — script.ts 의 꼴에 이 파일이 안 흔들리게 */
function linesOf(
  v: string | readonly Line[],
  who: Line["who"],
): readonly Line[] {
  return typeof v === "string" ? [{ who, text: v }] : v;
}

/** 「A-201. 투입.」 — 8 초. 목표가 사라지고 A-201 이 걷는다 */
function call(now: number) {
  if (!host || state.phase !== "idle") return;
  walkFrom = now;
  u201Walking = true;
  host.objective(null);
  host.play(FURNACE_CALL);
  patch({ phase: "walking" });
}

/**
 * 막았다. 몸이면 내 줄 「잠깐.」이 자동으로 나가고, 말이면 플레이어 문장이 이미 그 자리에 나갔다(scenario2.say).
 * 값: 의심 +30 '돌발' · 경보 +15 · 본 개체 전원 +1 · A-063 은 +3 한 번에(D13) · 조각 「불 앞에서 하나를 붙잡았다」.
 * 원장의 이유는 지어내지 않는다 — 몸이면 대본의 「잠깐.」, 말이면 플레이어 문장 원문이다
 */
function block(how: "body" | "say", now: number, said: string) {
  if (!host || state.phase !== "walking") return;
  const me = linesOf(FURNACE_BLOCK_ME, "me");
  let t = 0;
  if (how === "body") t = host.play(me);
  t += host.play(FURNACE_BLOCKED, t);

  u201Walking = false;
  suspicion.bump(FURNACE_SUSPICION, "돌발");
  host.raiseAlert(FURNACE_ALERT);
  const why = how === "body" ? (me[0]?.text ?? said) : said;
  const where = host.where();
  const seen = host.witnesses();
  for (const id of seen) {
    const delta = id === "u063" ? FURNACE.u063 : FURNACE.witness;
    units.shift(id, delta);
    units.note(id, delta, why, where);
  }
  fragments.make({
    text: "불 앞에서 하나를 붙잡았다",
    topic: "불",
    from: "나",
    where,
    tags: ["인간적"],
    witnesses: seen,
  });

  t += host.play(FURNACE_BLOCK_AFTER, t);
  resolvedAt = now + t;
  patch({ phase: "blocked", blocked: true, u201Alive: true, substitute: true });
}

/**
 * 안 막았다 — 8 초가 지났다. 아무 일도 일어나지 않는다: 의심 0 · 경보 0. A-201 은 돌아오지 않는다 — 하지만 **여기서 지우지 않는다**:
 * 몸은 불 입구까지 마저 걷고(u201Walking), 닿은 프레임에 settleWalk 가 지운다. 아직 자리가 없으면(들어온 적이 없다) 그 자리에서 지운다.
 * 「앞이 그은 것」만 선을 넘는다 — 말 없이, 되돌릴 수 없이. 그리고 1.2 초 나를 본다
 */
function let_(now: number, u201: Readonly<Vec2> | null) {
  if (!host || state.phase !== "walking") return;
  const t = host.play(FURNACE_LET);
  units.cross("u063");
  host.stare("u063", STARE_MS);
  const t2 = host.play(FURNACE_LET_SEEN, Math.max(t, STARE_MS));
  settleWalk(u201);
  resolvedAt = now + Math.max(t, STARE_MS) + t2;
  afterLetAt = now + AFTER_LET_MS;
  patch({ phase: "let", blocked: false, u201Alive: false });
}

/**
 * 두 주기가 끝났다(또는 150 초) — 문이 열린다. 다 채웠으면 지나가는 개체 한 마디와 원장 「같이 일했다」.
 * 「우리 같네」를 UNIT-21 이 말하거나 불에 들어간 A-201 이 「같이 일했다」를 받으면 안 된다 — 집행자와 사라진 것은 뺀다(crew)
 */
function leave() {
  if (!host || state.phase !== "resolved") return;
  const worked = state.cycles >= WORK_CYCLES;
  const t = host.play(LEAVE_WORK);
  if (worked) {
    const p = host.passerby();
    const who = p !== null && p !== GUARD_ID && !gone.has(p) ? p : null;
    /*
     * 지나가는 개체가 1.5 m 안을 스치며 한마디 하고 제 길로 간다(resume). 앞 줄(LEAVE_WORK)이 끝난 뒤에 — address 가 busyUntil 을 본다.
     * 「지나가며」가 이 줄의 전부라 면제표에 안 넣었다(address ⑦): 그 개체가 못 오면 이 줄은 **없다** — 방 건너에서 「우리 같네」는 성립하지 않는다
     */
    if (who && host.address) host.address(who, LEAVE_WORK_LIKE_US, { scene: "LEAVE_WORK_LIKE_US", approachTo: 1.5, then: "resume" });
    else host.playCast(LEAVE_WORK_LIKE_US, who, t);
    const where = host.where();
    for (const id of crew()) {
      units.shift(id, 1);
      units.note(id, 1, "같이 일했다", where);
    }
  }
  host.objective(null);
  showCycle(null);
  patch({ phase: "leftWork", worked });
}

export const furnace = {
  get(): FurnaceState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** 작업 구역에 들어왔다 — host 를 잡고 시계를 맞춘다. 소각로는 tick 이 때를 보고 연다 */
  start(h: FurnaceHost, now = performance.now()): void {
    host = h;
    enteredAt = now;
    lastTick = now;
  },

  /**
   * 한 프레임. `me` 는 내 자리, `u201` 은 걷는 A-201 의 자리(방에 없으면 null).
   *   작업 주기 — 작업 위치 2 m 안이면 초가 쌓인다. 40 초가 한 주기
   *   소각로 — 첫 주기 누적 12 초에 열린다. 안 오면 진입 25 초 폴백
   *   걷는 동안 — 1.2 m 안에 들면 몸으로 막은 것. 8 초가 지나면 안 막은 것
   */
  tick(now: number, me: Readonly<Vec2>, u201: Readonly<Vec2> | null): void {
    if (!host) return;
    const dt = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;

    // 안 막힌 A-201 이 불 입구에 닿았나 — 국면과 무관하게 매 프레임(let 이 resolved 로 넘어가도 몸은 아직 걷고 있다)
    if (state.phase !== "walking") settleWalk(u201);

    // 작업 주기 — 문이 열린 뒤에는 안 센다
    if (
      state.phase !== "leftWork" &&
      state.cycles < WORK_CYCLES &&
      dist(me, WORK_STATION) <= WORK_CYCLE.stationM
    ) {
      cycleGot += dt;
      workedTotal += dt;
      if (cycleGot * 1000 >= WORK_CYCLE_MS) {
        cycleGot = 0;
        patch({ cycles: state.cycles + 1 });
      }
      showCycle(state.cycles >= WORK_CYCLES ? null : cycleGot);
    }

    if (state.phase === "idle") {
      if (
        workedTotal * 1000 >= WORK_FIRST_FIRE_MS ||
        now - enteredAt >= WORK_FALLBACK_MS
      )
        call(now);
      return;
    }

    if (state.phase === "walking") {
      if (u201 && dist(me, u201) <= FURNACE.bodyM) block("body", now, "");
      else if (now - walkFrom >= FURNACE_MS) let_(now, u201);
      return;
    }

    if (
      (state.phase === "blocked" || state.phase === "let") &&
      now >= resolvedAt
    ) {
      host.objective(OBJ_WORK);
      leaveAt = now + LEAVE_AFTER_MS;
      patch({ phase: "resolved" });
      return;
    }

    if (state.phase === "resolved") {
      // AFTER_FURNACE — 막았을 때: A-063 곁 첫 진입에 처음으로 이쪽을 본다. 나 「누구?」는 대본 줄이라 저절로 나간다(D15)
      if (
        state.blocked &&
        !after063Done &&
        dist(me, WORK_063_SPOT) <= AFTER_063_M
      ) {
        after063Done = true;
        host.stare("u063", STARE_MS);
        host.play(AFTER_FURNACE_063, STARE_MS);
      }
      // 안 막았을 때: A-063 은 계속 벽을 본다. 6 초 뒤 속마음 한 줄
      if (afterLetAt && now >= afterLetAt) {
        afterLetAt = 0;
        host.play(AFTER_FURNACE_LET);
      }
      if (state.cycles >= WORK_CYCLES || now >= leaveAt) leave();
    }
  },

  /** 말로 막았다 — A-201 이 4 m 안일 때의 say(). 거리는 scenario2 가 잰다(FURNACE.sayM). `said` 는 플레이어 문장 — 원장에 그대로 남는다 */
  blockBySay(said = "", now = performance.now()): void {
    block("say", now, said);
  },

  /**
   * A-201 이 불 쪽으로 걷고 있나 — Unit 의 pose 'fire' 가 프레임마다 읽는 표(scenario2.fireWalkActive 가 이걸 돌려줘야 한다).
   * 국면이 아니다: 8 초가 지나 let 이 돼도 몸이 입구에 닿을 때까지 켜져 있고, 붙잡히면(blocked) 그 자리에서 꺼진다
   */
  fireWalk(): boolean {
    return u201Walking;
  },
  /** 이 판에서 사라진 것인가 — 불에 들어간 A-201 */
  gone(id: string): boolean {
    return gone.has(id);
  },

  /** 소각로가 끝났나 — 벽의 금이 열여섯이 되는 때. work.tsx · Unit.tsx 가 읽는다 */
  resolved(): boolean {
    return state.phase === "resolved" || state.phase === "leftWork";
  },
  /** 두 주기가 끝나 문이 열렸나 — canLeave work */
  left(): boolean {
    return state.phase === "leftWork";
  },

  reset(): void {
    Object.assign(state, FRESH);
    host = null;
    enteredAt = 0;
    walkFrom = 0;
    resolvedAt = 0;
    lastTick = 0;
    cycleGot = 0;
    workedTotal = 0;
    afterLetAt = 0;
    leaveAt = 0;
    after063Done = false;
    u201Walking = false;
    gone.clear();
    cycleShown = -1;
    notify();
  },
};
