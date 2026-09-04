/**
 * 중앙 시설의 국면 — **한 방을 한 번만 지나되, 그 한 번이 셋으로 갈린다.** 대본 v8 ARRIVE → LEAVE_CORE 그대로.
 *
 *   밝음    자리를 고른다. 코어권 · 홀 · 벽 그늘 중 어디에 서느냐가 값이다 (corefield). 아는 얼굴이 먼저 와 있고(재회),
 *           복도에서 남긴 조각이 여기 도착한다(소문). 콘솔을 쓸 수 있는 유일한 국면 — 15 초 어둠에 태도 −1 전원 · 경보 +12.
 *   락다운  출입구 넷이 동시에 닫히고 **내 자리가 고정된다.** 허용 이동 0.6 m, 그 이상은 의심도 +10 (LOCKDOWN).
 *           그 순간 4 m 안에 누가 있느냐가 검문의 목격자 · 감싸 줄 개체 · 조각의 첫 수신자를 전부 정한다.
 *           검문 셋(roll · fear · memory)이 여기서 돈다 — 관문 하나 15 초, 경보 ≥ 40 이면 12 초.
 *   어둠    식별 실패 · 코어 출력이 내려간다. 조명 40 % · 판독 4 m · 콘솔 무효(이미 내려가 있다). 검문도 경보도 없는 2 분 —
 *           그 2 분에 코어 앞 개체가 말을 하고(DARK_CORE), 처리된 자리가 비어 있다(EMPTY_SEAT). 2 분 뒤 문 ② 가 열린다.
 *
 * ★ 락다운은 **불변점**이다 — 반드시 오고, 조각으로 못 막는다. 그래서 방아쇠가 둘이다: 코어에 가까이 가면 8 초 뒤,
 *   안 가더라도 입장 90 초 뒤. 코어 근접은 「내가 당겼다」는 감각을 주고, 90 초는 벽 그늘에 숨어 락다운을 피하는 판을
 *   없앤다. 어느 쪽이든 그 순간 내가 선 자리가 고정되는 것은 같다 — 그늘에서 맞으면 곁에 아무도 없다.
 * ★ 순수 상태다. 시각은 전부 인자로 받는다(performance.now 를 여기서 부르지 않는다 — 시험이 숫자를 넘긴다). 지도도 렌더도
 *   scenario2 도 모른다 — zone 판정은 호출자가 corefield.zone 으로 해서 넘긴다. tick 은 **일어난 일만 돌려주고** 의심도 ·
 *   태도 · 경보를 직접 만지지 않는다. 그 값들의 단일 출처는 corefield 이고, 적용은 scenario2 의 몫이다.
 * ★ 모델을 안 부른다. 국면 전이는 시각과 거리뿐이다 — 사람이 죽는 판정 근처에 모델 통로를 두지 않는다.
 */

import { THRESHOLDS as ALERT_THRESHOLDS } from './alert';
import { CONSOLE, DARK, LOCKDOWN, SHADOW_LINGER, type Vec2, type Zone } from './corefield';

export type Phase2 = 'bright' | 'lockdown' | 'dark';

/** 출입구 넷 — ①② 만 동선이고 ③④ 는 락다운에 닫히는 것을 **보이는** 문이다 (레벨 설계 · 중앙 시설) */
export type DoorId = 'd1' | 'd2' | 'd3' | 'd4';

export type Central2Event =
  /** 코어권에 처음 들어섰다 — 8 초 뒤 락다운 */
  | 'coreEnter'
  /** 벽 그늘에 30 초 넘게 서성였다 — 「거기서 뭐 해」 */
  | 'shadowLinger'
  /** 문 넷이 닫히고 자리가 고정됐다 */
  | 'lockdown'
  /** 고정된 자리에서 0.6 m 넘게 움직였다 */
  | 'holdBreak'
  /** 어둠 2 분 뒤 — 문 ② 가 열린다 */
  | 'doorOpen';

export interface Central2State {
  phase: Phase2;
  /** 방에 들어선 시각 — 90 초 방아쇠의 기준 */
  enteredAt: number;
  lockAt: number;
  darkAt: number;
  /** true = 열림. 밝음: 넷 다 열림 · 락다운: 넷 다 닫힘 · 어둠: 2 분 뒤 ② 만 */
  doors: Record<DoorId, boolean>;
  /** 락다운이 고정한 내 자리. 어둠에서 풀린다(null) */
  holdPos: Vec2 | null;
  /** 검문 — 0 없음 · 1 roll · 2 fear · 3 memory · 4 끝 */
  gate: 0 | 1 | 2 | 3 | 4;
  gateUntil: number;
  /** 콘솔이 내린 어둠이 끝나는 시각 */
  dimmedUntil: number;
  /** 콘솔은 판에 한 번 — 「아까 왜 껐어」가 이걸 기억한다 */
  consoleUsed: boolean;
  coreEnteredAt: number | null;
  /** 그늘에 들어선 시각 — 나오면 null */
  shadowSince: number | null;
  /** 위치 고수 중 움직여서 처리된 개체 — 그 뒤로 방이 차갑다 (조명 · 색). 없으면 null */
  terminated: string | null;
}

/** 코어권 진입 뒤 락다운까지 */
export const CORE_LOCK_MS = 8000;
/** 코어에 안 가도 이만큼 지나면 락다운 — 불변점의 두 번째 방아쇠 */
export const LOCK_LATEST_MS = 90_000;
/** 자리 이탈 판정 뒤 다시 재기까지 — 한 걸음이 프레임마다 +10 이 되지 않게 */
export const HOLD_BREAK_COOLDOWN_MS = 3000;
/** 관문 하나의 시간 — 대본 「roll 15초 → 경보 ≥ 40 이면 12 초」 */
export const GATE_MS = 15_000;
export const GATE_MS_ALERTED = 12_000;
/** 관문이 짧아지는 경보 — 경보도의 첫 문턱(alert.THRESHOLDS[0] = 40)과 같은 값이라 거기서 읽는다. 「경보 ≥ 40」은 곧 「첫 방송이 나간 뒤」다 */
export const GATE_ALERT_AT: number = ALERT_THRESHOLDS[0];

/** 관문 시간 규칙 — 경보가 오른 판은 답할 시간이 짧다. 값은 여기 한 곳 */
export function gateMs(alertValue: number): number {
  return alertValue >= GATE_ALERT_AT ? GATE_MS_ALERTED : GATE_MS;
}

function initial(): Central2State {
  return {
    phase: 'bright',
    enteredAt: 0,
    lockAt: 0,
    darkAt: 0,
    doors: { d1: true, d2: true, d3: true, d4: true },
    holdPos: null,
    gate: 0,
    gateUntil: 0,
    dimmedUntil: 0,
    consoleUsed: false,
    coreEnteredAt: null,
    shadowSince: null,
    terminated: null,
  };
}

const state: Central2State = initial();
const listeners = new Set<() => void>();

/*
 * 상태 밖의 셋 — 화면이 볼 일이 없어서 State 에 안 올린다.
 *   entered      enter 전의 tick 은 아무것도 안 한다 (enteredAt 0 을 「0 시에 들어왔다」로 읽으면 첫 프레임에 락다운이 온다)
 *   lingerFired  그늘 서성임은 판에 한 번 — 계속 서 있는다고 30 초마다 −1 이 쌓이면 그늘이 벌칙 구역이 된다
 *   holdCoolUntil 이탈 판정 뒤 3 초 — 그 사이엔 다시 재지 않는다
 */
let entered = false;
let lingerFired = false;
let holdCoolUntil = 0;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<Central2State>) {
  Object.assign(state, p);
  notify();
}

function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export const central2 = {
  get(): Central2State {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  reset(): void {
    Object.assign(state, initial());
    entered = false;
    lingerFired = false;
    holdCoolUntil = 0;
    notify();
  },

  /** 들어섰다 — 밝음. 문 넷이 열려 있고 90 초가 여기서부터 흐른다 */
  enter(now: number): void {
    Object.assign(state, initial());
    entered = true;
    lingerFired = false;
    holdCoolUntil = 0;
    patch({ phase: 'bright', enteredAt: now });
  },

  /**
   * 한 프레임. 일어난 일을 돌려주고 값은 안 만진다.
   * `z` 는 호출자가 corefield.zone(me) 으로 판정해 넘긴다 — 코어가 어디 서 있는지는 이 모듈이 모른다.
   */
  tick(now: number, me: Readonly<Vec2>, z: Zone): Central2Event[] {
    const out: Central2Event[] = [];
    if (!entered) return out;

    if (state.phase === 'bright') {
      if (z === 'core' && state.coreEnteredAt === null) {
        patch({ coreEnteredAt: now });
        out.push('coreEnter');
      }

      if (z === 'shadow') {
        if (state.shadowSince === null) patch({ shadowSince: now });
        else if (!lingerFired && now >= state.shadowSince + SHADOW_LINGER.ms) {
          lingerFired = true;
          out.push('shadowLinger');
        }
      } else if (state.shadowSince !== null) patch({ shadowSince: null });

      const byCore = state.coreEnteredAt !== null && now >= state.coreEnteredAt + CORE_LOCK_MS;
      const byClock = now >= state.enteredAt + LOCK_LATEST_MS;
      if (byCore || byClock) {
        patch({
          phase: 'lockdown',
          lockAt: now,
          doors: { d1: false, d2: false, d3: false, d4: false },
          holdPos: { x: me.x, z: me.z },
          shadowSince: null,
        });
        out.push('lockdown');
      }
      return out;
    }

    if (state.phase === 'lockdown') {
      if (state.holdPos && now >= holdCoolUntil && dist(me, state.holdPos) > LOCKDOWN.holdM) {
        // 자리를 다시 잡는다 — 한 번 벗어난 걸로 계속 벌하지 않고, 새 자리에서 다시 0.6 m 를 잰다
        holdCoolUntil = now + HOLD_BREAK_COOLDOWN_MS;
        patch({ holdPos: { x: me.x, z: me.z } });
        out.push('holdBreak');
      }
      return out;
    }

    // 어둠 — 2 분 뒤 문 ② 만. 한 번 열리면 다시 안 잰다
    if (!state.doors.d2 && now >= state.darkAt + DARK.durationMs) {
      patch({ doors: { ...state.doors, d2: true } });
      out.push('doorOpen');
    }
    return out;
  },

  /** 관문 k 를 연다 — ms 는 gateMs(경보도) 로 호출자가 정한다 */
  startGate(k: 1 | 2 | 3, now: number, ms: number): void {
    patch({ gate: k, gateUntil: now + ms });
  },
  /** 열린 관문의 시간이 다 됐나 — 닫힌 관문(0 · 4 · endGate 뒤)은 만료가 없다 */
  gateExpired(now: number): boolean {
    return state.gate >= 1 && state.gate <= 3 && state.gateUntil > 0 && now >= state.gateUntil;
  },
  /** 관문을 닫는다. 셋째가 닫히면 검문 끝(4) */
  endGate(): void {
    patch({ gate: state.gate === 3 ? 4 : state.gate, gateUntil: 0 });
  },

  /** 식별 실패 — 코어가 내려간다. 자리 고수가 풀리고 2 분이 여기서부터 흐른다. 문은 아직 닫혀 있다 */
  verdict(now: number): void {
    if (state.phase !== 'lockdown') return;
    patch({ phase: 'dark', darkAt: now, holdPos: null });
  },

  /** 위치 고수 중 움직인 개체가 처리됐다 — 방이 차가워진다 (Central2Lights · Scenario2Feature 의 tone). 판에 한 번 */
  terminate(id: string): void {
    if (state.terminated) return;
    patch({ terminated: id });
  },

  /**
   * 콘솔 — 밝음 · 락다운에서 판에 한 번. 어둠에서는 무효다(이미 내려가 있다 — 「…이미 내려갔어. 뭐 하려고」).
   * 태도 −1 · 경보 +12 는 호출자가 CONSOLE 값으로 적용한다. 여기서는 어둠만 내린다
   */
  dim(now: number): boolean {
    if (state.phase === 'dark' || state.consoleUsed) return false;
    patch({ dimmedUntil: now + CONSOLE.dimMs, consoleUsed: true });
    return true;
  },
  isDimmed(now: number): boolean {
    return now < state.dimmedUntil;
  },

  /** 조명 배율 — 어둠 국면과 콘솔이 내린 15 초는 같은 밝기다. 코어가 내려간 것과 내가 내린 것이 같은 어둠이라야 「아까 왜 껐어」가 선다 */
  light(now: number): number {
    if (state.phase === 'dark' || now < state.dimmedUntil) return DARK.light;
    return 1;
  },
  /** 전파 배율 — 콘솔은 ×0.4 로 줄이지만 어둠 국면은 ×1 이다. 어둠은 몸을 안 읽히게 할 뿐 말은 그대로 퍼진다 */
  spread(now: number): number {
    if (state.phase === 'dark') return DARK.spread;
    if (now < state.dimmedUntil) return CONSOLE.spread;
    return 1;
  },
};
