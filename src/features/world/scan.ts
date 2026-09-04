/**
 * 패턴 스캔 — 의심도가 SCAN_AT 을 넘는 순간, 순찰 중이던 총 든 경비 하나가 다가와 **가만히 서서 나를 훑는다.**
 *
 * 2026-08-30 사용자 요구("의심도가 올라도 세계가 안 변한다"). 20 의 추궁(interrogation.ts)과 100 의 사격(enforcerStore.ts)
 * 사이가 비어 있어 게이지가 장식으로 읽혔다. 그 사이에 **내가 능동적으로 견뎌야 하는 몇 초**를 넣는다:
 *
 *   접근  경비가 걸어온다 (AgentRobot 이 scan.unit 을 보고 움직인다) → 목표 "정지하라"
 *   스캔  앞에 서면 HOLD_MS 동안 훑는다. 그동안 **MOVE_TOL 이상 움직이거나 LOOK_TOL 이상 고개를 돌리면 즉시 실패** —
 *         일찍 끝나기 때문에 더 무섭다. 견디면 통과.
 *   판정  통과 −PASS(의심도) · 실패 +FAIL(의심도) + SYNC 충격. 실패는 곧 다음 문턱(80)을 부른다
 *
 * 견디는 동안 SYNC 가 떨어져 손이 떨리면 그 떨림이 다시 실패를 부른다 — 무서워하면 들킨다. 그게 이 게임의 고리다.
 * 순수 저장소 + 진행. 몸(걸어오기·서기)은 AgentRobot 이, 화면(스캔선·남은 시간)은 ScanHud 가 이 상태를 읽어 그린다.
 */

import { suspicion } from '@/world/mp/suspicion';
import { sync } from '@/world/mp/sync';

import { interrogation } from './interrogation';

export type ScanPhase = 'idle' | 'approach' | 'scan' | 'done';

export interface ScanState {
  phase: ScanPhase;
  /** 맡은 경비 (AgentRobot 의 순번) */
  unit: number | null;
  unitName: string;
  /** 스캔이 끝나는 시각 (performance.now 기준) */
  until: number;
  /** 이번 스캔을 견뎠나 — done 동안만 */
  passed: boolean | null;
}

/** 의심도가 이 위로 **오르는 순간** 걸린다 (문턱은 mp/suspicion.THRESHOLDS 가 알린다) */
export const SCAN_AT = 60;
/** 훑는 시간 */
export const HOLD_MS = 3800;
/** 이만큼 움직이면 실패 (m) */
const MOVE_TOL = 0.45;
/** 이만큼 고개를 돌리면 실패 */
const LOOK_COS = Math.cos((26 * Math.PI) / 180);
const PASS = -12;
const FAIL = 16;
const COOLDOWN_MS = 50_000;
/** 다가오다 길이 막히는 등으로 영영 안 닿을 때의 안전장치 */
const APPROACH_TIMEOUT_MS = 14_000;

const LINE = {
  arrive: '정지. 패턴 스캔.',
  pass: '이상 없음. 가라.',
  fail: '동작 감지. 기록한다.',
  lost: '위치 놓침. 기록한다.',
};

const state: ScanState = { phase: 'idle', unit: null, unitName: 'UNIT-21', until: 0, passed: null };
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string }) => void) | null = null;
let lastEnd = -Infinity;
let timer: number | null = null;
/** 스캔이 시작될 때의 내 자리·정면 — 여기서 벗어나면 실패 */
const base = { x: 0, z: 0, fx: 0, fz: 1 };
/** 프레임마다 들어오는 지금의 내 자리·정면 (CentralChapterScene 의 Triggers 가 준다) */
const pose = { x: 0, z: 0, fx: 0, fz: 1 };

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<ScanState>) {
  Object.assign(state, p);
  notify();
}
function clearTimer() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}
function say(text: string) {
  emit?.({ nickname: state.unitName, text });
}

function finish(passed: boolean, line: string) {
  clearTimer();
  lastEnd = performance.now();
  say(line);
  patch({ phase: 'done', passed });
  // 문턱 연출(80 지목·100 사격)은 저장소가 알린다 — mp/suspicion.bindCross
  if (passed) suspicion.bump(PASS, '침착');
  else {
    sync.shock(9, '긴장');
    suspicion.bump(FAIL, '돌발');
  }
  // 판정 뒤 잠깐 서 있다가 순찰로 돌아간다
  timer = window.setTimeout(() => {
    interrogation.setPaused(false);
    patch({ phase: 'idle', unit: null, passed: null, until: 0 });
  }, 2600);
}

export const scan = {
  get(): ScanState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** feature 가 마운트될 때 — 대사 출구 */
  bind(fn: typeof emit): void {
    emit = fn;
  },
  unbind(): void {
    clearTimer();
    emit = null;
    Object.assign(state, { phase: 'idle', unit: null, passed: null, until: 0 });
    notify();
  },
  reset(): void {
    clearTimer();
    lastEnd = -Infinity;
    Object.assign(state, { phase: 'idle', unit: null, passed: null, until: 0 });
    notify();
  },
  /** 지금 걸 수 있나 — 쉬는 중이고 쿨다운이 지났으면 */
  ready(now = performance.now()): boolean {
    return state.phase === 'idle' && now - lastEnd >= COOLDOWN_MS;
  },
  /** 스캔을 건다 — 이 경비가 걸어온다. 그동안 추궁·잡담은 멈춘다 */
  begin(unit: number, unitName: string): void {
    if (state.phase !== 'idle') return;
    interrogation.setPaused(true);
    patch({ phase: 'approach', unit, unitName, passed: null, until: 0 });
    clearTimer();
    timer = window.setTimeout(() => {
      if (state.phase === 'approach') finish(false, LINE.lost);
    }, APPROACH_TIMEOUT_MS);
  },
  /** 경비가 내 앞에 섰다 (AgentRobot 이 부른다) — 마지막으로 본 내 자세를 기준으로 잡고, 여기서부터 견뎌야 한다 */
  arrived(now = performance.now()): void {
    if (state.phase !== 'approach') return;
    clearTimer();
    base.x = pose.x;
    base.z = pose.z;
    base.fx = pose.fx;
    base.fz = pose.fz;
    say(LINE.arrive);
    patch({ phase: 'scan', until: now + HOLD_MS });
  },
  /** 프레임마다 — 내 자리·정면. 스캔 중이면 벗어나는 순간 실패, 버티면 통과 */
  track(x: number, z: number, fx: number, fz: number, now = performance.now()): void {
    const fl = Math.hypot(fx, fz) || 1;
    pose.x = x;
    pose.z = z;
    pose.fx = fx / fl;
    pose.fz = fz / fl;
    if (state.phase !== 'scan') return;
    const cos = pose.fx * base.fx + pose.fz * base.fz;
    if (Math.hypot(x - base.x, z - base.z) > MOVE_TOL || cos < LOOK_COS) {
      finish(false, LINE.fail);
      return;
    }
    if (now >= state.until) finish(true, LINE.pass);
  },
};
