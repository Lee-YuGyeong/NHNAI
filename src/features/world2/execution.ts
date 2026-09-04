/**
 * 집행 — **걸어오는 것.** 집행 설계 「걸어오는 것」 그대로다.
 *
 * 의심도가 100 에 닿았을 때 무엇이 일어나는가. 답의 절반은 이미 정해져 있다 — 총 든 개체가 있다.
 * 나머지 절반이 이 파일이다: 그것이 **언제 나타나고, 얼마나 걸어오고, 그 사이에 무엇을 할 수 있는가.**
 *
 * ★ 집행자는 특별한 존재가 아니다. 복도를 순찰하던 그 개체다 — 무릎이 닳았고, 총은 한 번도 쏴 본 적
 *   없는 사람처럼 메고 다니고, 「나도 이거 하고 싶어서 하는 거 아니야」라고 말했던 그것 (cast 의 guard21).
 *   **새 모델을 안 만든다.** 같은 GLB 가 두 역할을 한다 — 판 내내 배경에 있다가 마지막에 나를 향해 돈다.
 *
 * ★ 미터를 안 봐도 안다. 문턱마다 **집행자의 자리가 달라진다**:
 *     40  없다. 방송만 나간다
 *     60  이 구역에 배치된다 — 문가에 선다. 안 쏜다. **아무 일도 안 일어나는데 저기 서 있다**
 *     80  같은 방 안으로 들어온다. 시선이 붙는다
 *    100  걸어온다. 총은 아직 메고 있다 — 여덟 걸음
 *
 * ★ 죽음은 언제나 **설명 가능**해야 한다. 플레이어가 「왜 죽었는지 모르겠다」고 느끼는 순간 이 게임은 끝난다:
 *   의심도는 한 번에 25 를 못 넘고(그래서 60·80 을 못 보고 죽는 판이 없다), 걸어오는 집행은 최소 8 초이며,
 *   죽은 뒤 화면에 **내가 남긴 조각 목록**이 뜬다 — 「저 말 때문이었구나」가 보여야 다음 판이 있다.
 *
 * ★ 모델을 안 부른다. 사람이 죽는 판정에 모델이 개입하는 통로를 만들지 않는다 (AI 아키텍처의 넷째 겹).
 *
 * ★ 개정 3 「여덟 걸음의 이동」 — 걸어오는 동안 **이동은 자유다.** 태도 +2 개체 곁으로 걸어갈 수 있어야 개입 창이
 *   연출에서 플레이가 된다. 도주로 치는 것은 **문 방향 ±FLEE_ANGLE_DEG 만**이다 (corefield.isFleeDirection) — 개체 쪽으로
 *   가는 걸음을 도주로 찍는 오판정이 나오면 그 각을 좁힌다. 타이머는 **불변**: until 은 approach 진입 시각에 방 값으로 박히고
 *   그 뒤 어떤 이동 · 콘솔 · 개입도 그 수를 못 건드린다 — 헌법 14 조 「집행은 걸어온다 · 최소 8 초」.
 *
 * ★ v8 「여덟 걸음」 — 개입은 **개체가 주도한다.** [E] 로 개체 뒤로 가는 손은 없다(개정 3 대로 이동만 자유). 걸음은 walkMs 를
 *   여덟으로 나눈 것이고(stepOf), 어느 걸음에 누가 나서는가는 그 판의 원장이 정한다:
 *     걸음 4–5  4 m 안 태도 ≥2 개체가 **말로 막는다** — 집행자가 3 초 멎고 한 번 더 묻는다. 답하면 의심도 90 으로 내려가 watch 로 물러난다
 *     걸음 6–7  태도 3 개체가 **몸으로 막는다** — 총구 앞에 선다. 3 초. 개체를 쏘는 건 이 구역의 법이 아니다
 *     걸음 8    「나를 위해 나선 적 있다」(units.standsFor) 개체만 **대신 부서진다** — 태도 3 만으로는 안 나선다 (D19)
 *   멎는 3 초는 until 을 못 민다 — 멎은 만큼 뒤가 빨라질 뿐, 도달 시각은 그대로다. 대사는 전부 host(scenario2)가 국면 전이를 보고 튼다.
 *   집행자 자신(guard21)은 곁에 있어도 **나서지 않는다** — 명부에 있어 near 에 실려 와도 tick 이 뺀다. 저것이 저를 막을 수는 없다.
 *   한 번 더 물은 데 대한 답은 **총을 내리기 전**까지다 — unsling 은 판에 한 번뿐인 동작이라, 그 뒤 watch 로 물러났다 다시 100 에
 *   닿으면 같은 동작이 두 번 나온다. 답의 창 = 물음(blocked)부터 until 까지: blocked 는 늦어도 걸음 5 라 남은 걸음이 3/8 ≥ 3 초,
 *   그래서 물음이 BLOCK_MS 안에 걸리기만 하면 언제나 총을 내리기 전에 닿는다 (host 가 물음을 min(대사 길이, BLOCK_MS) 에 건다).
 */

import { suspicion } from "@/world/mp/suspicion";

import { EXEC_LOWER, isFleeDirection, type Zone } from "./corefield";
import { units } from "./units";

/** 집행자의 상태 — 설계 문서의 애니메이션 표 그대로 */
export type Phase =
  /** 아직 없다 (의심도 40 이하) */
  | "none"
  /** 60 — 이 구역에 배치된다. 문가에 선다 */
  | "posted"
  /** 80 — 같은 방 안으로 들어온다. 나를 본다 */
  | "watch"
  /** 100 — 걸어온다. 총은 아직 메고 있다 */
  | "approach"
  /** 걸음 4–5 — 개체가 **말로** 막았다. 3 초 멎고 한 번 더 묻는다 */
  | "blocked"
  /** 걸음 6–7 — 개체가 **몸으로** 막았다. 총구 앞에 선다. 3 초 */
  | "bodyBlock"
  /** 도착. 총을 내린다 — **판에 한 번뿐인 동작.** 이 1.5 초가 마지막 창이다 */
  | "unsling"
  /** 겨눔. 여기서부터는 아무것도 못 한다 */
  | "aim"
  /** 끝 */
  | "dead"
  /** 누가 대신 나섰다 — 나는 산다 */
  | "spared";

/** 총을 내리는 시간 — 마지막 창 */
export const UNSLING_MS = 1500;
/** 겨누는 시간 — 개입 불가 */
export const AIM_MS = 400;
/** 개체가 사이에 서면 이만큼 멎는다 — 말로든 몸으로든 */
export const BLOCK_MS = 3000;
/** 걸어오는 집행은 **최소 8 초**를 보장한다 (안전장치 2) */
export const MIN_WALK_MS = 8000;
/** 여덟 걸음 */
export const STEPS = 8;
/** 어느 걸음에 누가 나서나 — 대본 EIGHT_STEPS 의 자리 */
export const BLOCK_STEPS: readonly [number, number] = [4, 5];
export const BODY_BLOCK_STEPS: readonly [number, number] = [6, 7];
/** 집행자의 id — cast 의 guard21. 개입 후보(말 · 몸 · 대신 나섬)에서 뺀다 */
export const EXECUTIONER_ID = "guard21";

/**
 * 도주 판정에 넘기는 이동 한 조각 — 이번 프레임의 방향, 내 자리, 이 방의 문.
 * 문이 어디인지는 방(scenario2)이 안다. 이 저장소는 각만 잰다
 */
export interface FleeMove {
  dir: { dx: number; dz: number };
  me: { x: number; z: number };
  door: { x: number; z: number };
}

/**
 * 끝난 자리의 기록 — dead · spared 에 이야기가 채운다. 어둠 국면(EMPTY_SEAT)과 아레나가 나중에 읽는다:
 * 코어권에서 처리됐으면 「다들 봤어」, 그늘이면 「…뭐가 있었어? 어두워서」. 조각(fragments)은 모른다 — 위치와 머릿수만
 */
export interface ExecResult {
  zone: Zone;
  /** 그 자리에서 본 개체 수 */
  witnessed: number;
  /** 대신 부서진 개체 — 없으면 null */
  standIn: string | null;
  room: string;
}

export interface ExecState {
  phase: Phase;
  /** 지금 단계가 끝나는 시각 (performance.now). approach·unsling 이 이걸로 굴러간다 */
  until: number;
  /** 걸어오기 시작한 시각 — 화면이 남은 걸음을 그린다 */
  from: number;
  /** 지금 사이에 선 개체 — 말로 막은 것(blocked) · 몸으로 막은 것(bodyBlock) · 대신 나선 것(spared). 걷는 동안엔 null */
  cover: string | null;
  /** 멎음이 풀리는 시각 — blocked · bodyBlock 만 쓴다. until(도달 시각)과 따로 두는 것이 헌법 14 조다 */
  pauseUntil: number;
  /** 집행자가 한 번 더 물었고 아직 답을 못 들었다 — answered() 가 이걸 본다 */
  asked: boolean;
  /** 이 판에서 말로 막기 · 몸으로 막기를 이미 썼나 — 걸음마다 한 번뿐이다 */
  usedBlock: boolean;
  usedBodyBlock: boolean;
  /** 이 판에서 「대신 나섬」을 이미 썼나 — 판에 한 번뿐이다 */
  usedStandIn: boolean;
  /** 도망치려 해 봤나 — 시도 자체가 인간의 증거다 */
  fled: boolean;
  /** 어디서 어떻게 끝났나 — dead · spared 뒤에만 채워진다 */
  result: ExecResult | null;
  /**
   * **한 발이 나간 시각** (performance.now). dead · spared 로 넘어가는 그 프레임에 박힌다.
   * 총구 섬광(Executioner → CastBody 의 Rifle → world/muzzle)이 이 수를 보고 핀다 — 소리는 이야기(scenario2)가 낸다.
   * −Infinity 면 아직 안 쐈다. 국면과 따로 두는 이유: dead 는 화면이 남아 있는 내내 dead 지만 섬광은 110 ms 다
   */
  shotAt: number;
}

const FRESH: ExecState = {
  phase: "none",
  until: 0,
  from: 0,
  cover: null,
  pauseUntil: 0,
  asked: false,
  usedBlock: false,
  usedBodyBlock: false,
  usedStandIn: false,
  fled: false,
  result: null,
  shotAt: -Infinity,
};
const state: ExecState = { ...FRESH };
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<ExecState>) {
  Object.assign(state, p);
  notify();
}

/**
 * 「관측 수준 하향」 — 의심도를 target 까지 **내린다.** 걸음은 100 에서 시작하므로 닿는 길마다 이건 내리는 값이고,
 * 이미 그 아래면 아무것도 안 한다 — 올리는 쪽으로 쓰면 단일 증가 25 상한(헌법 13)이 깨진다
 */
function lowerTo(target: number): void {
  const v = suspicion.get().value;
  if (v > target) suspicion.bump(target - v, "침착");
}

/** 걸어온 몫 0~1 — approach 와 그 안의 멎음(blocked · bodyBlock)이 같은 자로 잰다 */
function walked(now: number): number {
  const span = state.until - state.from;
  return span <= 0 ? 1 : Math.min(1, (now - state.from) / span);
}

export const execution = {
  get(): ExecState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /**
   * 의심도 문턱을 넘었다 — 집행자의 자리가 달라진다.
   * 40 은 아무것도 안 한다: 방송만 나간다.
   */
  cross(t: number, walkMs: number): void {
    if (state.phase === "dead") return;
    if (t === 60 && state.phase === "none") patch({ phase: "posted" });
    else if (t === 80 && (state.phase === "none" || state.phase === "posted"))
      patch({ phase: "watch" });
    else if (
      t === 100 &&
      state.phase !== "approach" &&
      state.phase !== "blocked" &&
      state.phase !== "bodyBlock" &&
      state.phase !== "unsling" &&
      state.phase !== "aim"
    ) {
      // 밀리초로 끊어서 잰다 — 프레임 시각은 소수점이 붙어서, 그대로 더하면 (until - from) 이
      // 8000 에 아주 조금 못 미치는 판이 나온다 (부동소수 오차). 최소 8 초는 **정확히** 8 초여야 한다
      const now = Math.round(performance.now());
      // 방이 아무리 좁아도 8 초를 보장한다 (안전장치 2)
      patch({
        phase: "approach",
        from: now,
        until: now + Math.max(MIN_WALK_MS, walkMs),
        cover: null,
        asked: false,
      });
    }
  },

  /** 의심도가 내려가면 집행자도 물러난다 — 되돌릴 수 있는 자리까지는 되돌린다 */
  relax(value: number): void {
    if (state.phase === "dead" || state.phase === "spared") return;
    if (state.phase === "approach" && value < 100) patch({ phase: "watch" });
    if (state.phase === "watch" && value < 80) patch({ phase: "posted" });
    if (state.phase === "posted" && value < 60) patch({ phase: "none" });
  },

  /**
   * 한 프레임. 걸음이 끝나면 총을 내리고(마지막 창), 그다음은 겨눔이고, 그다음은 없다.
   * `near` 는 지금 곁(4 m 안)에 있는 개체들 — 개입은 **곁에 누가 있느냐**로만 열리고, 개체가 스스로 나선다.
   */
  tick(nearAll: readonly string[]): void {
    const now = performance.now();
    // 집행자는 저를 못 막는다 — 명부째 넘어와도 여기서 뺀다
    const near = nearAll.filter((id) => id !== EXECUTIONER_ID);

    if (state.phase === "approach") {
      if (now >= state.until) {
        /*
         * 도착. **대신 나섬**이 먼저다 — 플레이어가 고르는 것이 아니라 그 개체가 그냥 앞으로 나온다.
         * 나서는 것은 원장에 「나를 위해 나선 적 있다」가 있는 개체뿐이다(D19) — 태도 3 은 몸으로 막을 뿐, 대신 부서지지는 않는다.
         * 마지막 방의 「대신 나섬」과 같은 장치이고, 다른 것은 여기서는 **막을 수 없다**는 점뿐이다.
         */
        const standIn = !state.usedStandIn
          ? near.find((id) => units.standsFor(id) && !units.crossed(id))
          : undefined;
        if (standIn) {
          lowerTo(EXEC_LOWER.spared);
          patch({
            phase: "spared",
            usedStandIn: true,
            cover: standIn,
            asked: false,
            until: now,
            // 대신 부서지는 것에게도 한 발이 나간다 — 나만 안 맞았을 뿐이다
            shotAt: now,
          });
          return;
        }
        patch({ phase: "unsling", until: now + UNSLING_MS, cover: null });
        return;
      }
      const step = execution.stepOf(now);
      // 걸음 4–5 — 태도 ≥2 개체가 말로 막는다. 선을 넘은 개체는 안 나선다. 나선 개체는 원장에 남는다(D19)
      if (
        !state.usedBlock &&
        step >= BLOCK_STEPS[0] &&
        step <= BLOCK_STEPS[1]
      ) {
        const id = near.find((u) => units.stage(u) >= 2 && !units.crossed(u));
        if (id) {
          units.markStandsFor(id);
          patch({
            phase: "blocked",
            cover: id,
            asked: true,
            usedBlock: true,
            pauseUntil: now + BLOCK_MS,
          });
          return;
        }
      }
      // 걸음 6–7 — 태도 3 개체가 몸으로 막는다. 말이 없다
      if (
        !state.usedBodyBlock &&
        step >= BODY_BLOCK_STEPS[0] &&
        step <= BODY_BLOCK_STEPS[1]
      ) {
        const id = near.find((u) => units.stage(u) >= 3);
        if (id) {
          patch({
            phase: "bodyBlock",
            cover: id,
            usedBodyBlock: true,
            pauseUntil: now + BLOCK_MS,
          });
          return;
        }
      }
      return;
    }

    // 멎음이 풀린다 — 걸음이 이어진다. until 은 그대로라 멎은 만큼 뒤가 빠르다
    if (
      (state.phase === "blocked" || state.phase === "bodyBlock") &&
      now >= state.pauseUntil
    ) {
      patch({ phase: "approach", cover: null });
      return;
    }

    if (state.phase === "unsling" && now >= state.until) {
      patch({ phase: "aim", until: now + AIM_MS, cover: null });
      return;
    }

    if (state.phase === "aim" && now >= state.until) patch({ phase: "dead", shotAt: now });
  },

  /**
   * 한 번 더 물은 데 **내가 답했다** — 관측 수준이 내려간다(90). 집행자는 watch 로 물러난다.
   * 물음은 걸음 4–5 의 멎음에서 열리고, 답은 멎음이 풀린 뒤에도 **총을 내리기 전**까지 받는다 — 내리기 시작하면(unsling) 없다:
   * 그 동작은 판에 한 번뿐이라, 내린 뒤 물러났다 다시 걸어오면 두 번 보인다.
   * 답의 내용은 안 본다(모델 없음 · 판정 없음): 답했다는 사실이 값이다. 돌려주는 것은 「받았나」
   */
  answered(): boolean {
    if (!state.asked) return false;
    const p = state.phase;
    if (p !== "blocked" && p !== "bodyBlock" && p !== "approach") return false;
    lowerTo(EXEC_LOWER.answered);
    patch({ phase: "watch", cover: null, asked: false });
    return true;
  },

  /**
   * 지금 몇 걸음째인가 — 1..8. 걷기 전(none · posted · watch)은 0, 도착한 뒤는 8.
   * 걸음 = walkMs 의 8 등분. 멎음(blocked · bodyBlock) 중에도 같은 자로 잰다 — 시간이 멈추지 않으므로
   */
  stepOf(now = performance.now()): number {
    const p = state.phase;
    if (p === "none" || p === "posted" || p === "watch") return 0;
    if (p !== "approach" && p !== "blocked" && p !== "bodyBlock") return STEPS;
    return Math.max(1, Math.min(STEPS, Math.floor(walked(now) * STEPS) + 1));
  },

  /**
   * 개입 ③ — **도망친다.** 못 도망친다. 개체가 더 빠르고, 문 쪽으로 가면 경로를 막는다.
   * 시도 자체가 **인간의 증거**라 본 개체 전원의 태도가 내려간다.
   *
   * `move` 를 주면 **문 방향 ±35° 만** 도주다 — 그 밖의 걸음은 개체 곁으로 가는 것이라 무죄 (개정 3).
   * 안 주면 예전 그대로 「걸어오는 동안 움직이면 도주」다. 어느 쪽도 until 은 안 건드린다
   */
  flee(witnesses: readonly string[], move?: FleeMove): boolean {
    if (state.fled || (state.phase !== "approach" && state.phase !== "unsling"))
      return false;
    if (move && !isFleeDirection(move.dir, move.me, move.door)) return false;
    for (const id of witnesses) units.shift(id, -1);
    patch({ fled: true });
    return true;
  },

  /** 끝난 자리를 적는다 — dead · spared 뒤에 이야기가 부른다. 단계는 안 건드린다 */
  record(r: ExecResult): void {
    patch({ result: r });
  },

  /** 대신 나선 개체 — 그것이 처리되고 나는 산다. 그 개체는 돌아오지 않는다 */
  standIn(): string | null {
    return state.phase === "spared" ? state.cover : null;
  },

  /** 걸어오는 동안 남은 몫 0~1 — 화면이 이걸로 여덟 걸음을 그린다 */
  progress(): number {
    const p = state.phase;
    if (p === "none" || p === "posted" || p === "watch") return 0;
    if (p !== "approach" && p !== "blocked" && p !== "bodyBlock") return 1;
    return walked(performance.now());
  },

  reset(): void {
    Object.assign(state, FRESH);
    notify();
  },
};

/* ─────────────────────────────── 걸어오는 길 ─────────────────────────────── */

/** 바닥 위의 한 점 — 집행자의 길은 x·z 뿐이다 */
export interface Pt {
  x: number;
  z: number;
}

/** 꺾은선의 길이(m) — 진입점 → 모퉁이들 → 플레이어 */
export function routeLength(route: readonly Pt[]): number {
  let total = 0;
  for (let i = 0; i + 1 < route.length; i++)
    total += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
  return total;
}

/**
 * 꺾은선 위의 자리 — 진입점에서 `walked` m 만큼 간 점과 그 구간의 진행 방향(단위 벡터).
 * 길이를 넘기면 끝점이다. 마지막 구간 끝(플레이어)에 STOP 을 두는 것은 호출자 몫이라 여기서는 길이만 잰다.
 * 순수 함수라 시험이 방의 길을 넘겨 돌린다 (Executioner 가 프레임마다 쓴다)
 */
export function alongRoute(
  route: readonly Pt[],
  walked: number,
): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, walked);
  let dx = 0;
  let dz = 1;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i];
    const b = route[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const len = Math.hypot(sx, sz);
    if (len > 0) {
      dx = sx / len;
      dz = sz / len;
    }
    if (left <= len) return { x: a.x + dx * left, z: a.z + dz * left, dx, dz };
    left -= len;
  }
  const end = route[route.length - 1];
  return { x: end.x, z: end.z, dx, dz };
}

/**
 * 확인용 손잡이 — 헤드리스로는 의심도를 걸어서 올릴 수가 없다(포인터 잠금이 없어 못 걷고, 말도 못 친다).
 * 본판의 `__probe`·`__backstep` 과 같은 규칙으로 DEV 에서만 연다.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __exec?: unknown; __sus?: unknown }).__exec =
    execution;
  (window as unknown as { __sus?: unknown }).__sus = suspicion;
}
