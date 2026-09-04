/**
 * 중앙 시설 국면 — 밝음 → 락다운 → 어둠이 **시각과 거리만으로** 굴러가는가.
 *
 * 시각은 전부 숫자로 넘긴다(가짜 타이머 없음 · performance.now 없음). 이 파일이 지키는 것은 값이 아니라 약속이다:
 *   락다운은 반드시 온다(코어 8 초 · 늦어도 90 초) · 자리는 한 번 고정되면 0.6 m 다 · 어둠은 2 분이고 문 ② 만 열린다 ·
 *   콘솔은 판에 한 번이고 어둠에서는 무효다 · 그늘 서성임은 30 초째 딱 한 번이다.
 * 수치는 corefield 에서 읽는다 — 여기 적힌 숫자가 corefield 와 다르면 그게 버그다.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CORE_LOCK_MS,
  central2,
  GATE_ALERT_AT,
  GATE_MS,
  GATE_MS_ALERTED,
  gateMs,
  HOLD_BREAK_COOLDOWN_MS,
  LOCK_LATEST_MS,
} from '../../../src/features/world2/central2';
import { CONSOLE, DARK, LOCKDOWN, SHADOW_LINGER } from '../../../src/features/world2/corefield';

const T0 = 1_000_000;
const HALL = { x: 8, z: -10.5 };

/** 밝음 상태로 시작한 뒤 t 까지 홀에서 한 번 틱 — 락다운 직전까지 데려가는 헬퍼 */
function lockdownAt(t: number, me = HALL) {
  return central2.tick(t, me, 'hall');
}

beforeEach(() => {
  central2.reset();
});

describe('입장 — 밝음', () => {
  it('enter → 밝음 · 문 넷이 다 열려 있다', () => {
    central2.enter(T0);
    const s = central2.get();
    expect(s.phase).toBe('bright');
    expect(s.enteredAt).toBe(T0);
    expect(s.doors).toEqual({ d1: true, d2: true, d3: true, d4: true });
    expect(s.holdPos).toBeNull();
  });

  it('enter 전의 tick 은 아무것도 안 한다 — 0 시에 들어온 게 아니다', () => {
    expect(central2.tick(T0 + LOCK_LATEST_MS * 10, HALL, 'hall')).toEqual([]);
    expect(central2.get().phase).toBe('bright');
  });
});

describe('락다운 — 불변점, 반드시 온다', () => {
  it('홀에서 89 초 → 아직 밝음 · 90 초 → lockdown, 문 넷 닫힘, 자리 고정', () => {
    central2.enter(T0);
    expect(lockdownAt(T0 + LOCK_LATEST_MS - 1000)).toEqual([]);
    expect(central2.get().phase).toBe('bright');

    const me = { x: 7.5, z: -12 };
    expect(lockdownAt(T0 + LOCK_LATEST_MS, me)).toEqual(['lockdown']);
    const s = central2.get();
    expect(s.phase).toBe('lockdown');
    expect(s.lockAt).toBe(T0 + LOCK_LATEST_MS);
    expect(s.doors).toEqual({ d1: false, d2: false, d3: false, d4: false });
    expect(s.holdPos).toEqual(me);
    // 고정한 자리는 사본이다 — 넘긴 벡터를 나중에 움직여도 자리가 따라가지 않는다
    expect(s.holdPos).not.toBe(me);
  });

  it('코어권 진입 → coreEnter 한 번 · 8 초 뒤 락다운 (90 초 전이라도)', () => {
    central2.enter(T0);
    const core = { x: 0, z: -10.5 };
    const t = T0 + 5000;
    expect(central2.tick(t, core, 'core')).toEqual(['coreEnter']);
    expect(central2.get().coreEnteredAt).toBe(t);
    expect(central2.tick(t + 100, core, 'core')).toEqual([]);
    expect(central2.tick(t + CORE_LOCK_MS - 1, core, 'core')).toEqual([]);
    expect(central2.get().phase).toBe('bright');
    expect(central2.tick(t + CORE_LOCK_MS, core, 'core')).toEqual(['lockdown']);
    expect(central2.get().phase).toBe('lockdown');
    expect(central2.get().lockAt).toBeLessThan(T0 + LOCK_LATEST_MS);
  });

  it('코어권에서 나와도 8 초는 흐른다 — 밟았으면 당긴 것이다', () => {
    central2.enter(T0);
    central2.tick(T0 + 1000, { x: 0, z: -10.5 }, 'core');
    expect(central2.tick(T0 + 1000 + CORE_LOCK_MS, HALL, 'hall')).toEqual(['lockdown']);
  });
});

describe('벽 그늘 서성임', () => {
  const shadow = { x: 13, z: 2 };

  it('29.9 초 → 아무것도 · 30 초 → shadowLinger 한 번 · 그 뒤로는 안 나온다', () => {
    central2.enter(T0);
    expect(central2.tick(T0, shadow, 'shadow')).toEqual([]);
    expect(central2.get().shadowSince).toBe(T0);
    expect(central2.tick(T0 + SHADOW_LINGER.ms - 100, shadow, 'shadow')).toEqual([]);
    expect(central2.tick(T0 + SHADOW_LINGER.ms, shadow, 'shadow')).toEqual(['shadowLinger']);
    expect(central2.tick(T0 + SHADOW_LINGER.ms + 1000, shadow, 'shadow')).toEqual([]);
    expect(central2.tick(T0 + SHADOW_LINGER.ms * 2, shadow, 'shadow')).toEqual([]);
  });

  it('그늘에서 나오면 shadowSince 가 지워진다 — 다시 들어가면 처음부터 잰다', () => {
    central2.enter(T0);
    central2.tick(T0, shadow, 'shadow');
    central2.tick(T0 + 20_000, HALL, 'hall');
    expect(central2.get().shadowSince).toBeNull();
    central2.tick(T0 + 21_000, shadow, 'shadow');
    expect(central2.get().shadowSince).toBe(T0 + 21_000);
    // 합쳐서 30 초가 넘어도 연속이 아니면 아니다
    expect(central2.tick(T0 + 21_000 + 15_000, shadow, 'shadow')).toEqual([]);
  });

  it('락다운 뒤에는 그늘을 재지 않는다', () => {
    central2.enter(T0);
    lockdownAt(T0 + LOCK_LATEST_MS, shadow);
    expect(central2.tick(T0 + LOCK_LATEST_MS + SHADOW_LINGER.ms, shadow, 'shadow')).toEqual([]);
    expect(central2.get().shadowSince).toBeNull();
  });
});

describe('자리 고수 — 0.6 m', () => {
  const t1 = T0 + LOCK_LATEST_MS;

  it('0.59 m 는 허용 · 0.61 m 는 holdBreak, 자리가 다시 잡힌다', () => {
    central2.enter(T0);
    lockdownAt(t1, HALL);
    expect(central2.tick(t1 + 100, { x: HALL.x + 0.59, z: HALL.z }, 'hall')).toEqual([]);
    expect(central2.get().holdPos).toEqual(HALL);

    const moved = { x: HALL.x + 0.61, z: HALL.z };
    expect(central2.tick(t1 + 200, moved, 'hall')).toEqual(['holdBreak']);
    expect(central2.get().holdPos).toEqual(moved);
    expect(LOCKDOWN.holdM).toBe(0.6);
  });

  it('판정 뒤 3 초는 다시 재지 않는다 · 3 초 뒤엔 새 자리 기준으로 다시 잰다', () => {
    central2.enter(T0);
    lockdownAt(t1, HALL);
    const a = { x: HALL.x + 1, z: HALL.z };
    expect(central2.tick(t1 + 100, a, 'hall')).toEqual(['holdBreak']);
    // 냉각 중 — 더 멀리 가도 조용하다
    const b = { x: HALL.x + 3, z: HALL.z };
    expect(central2.tick(t1 + 100 + HOLD_BREAK_COOLDOWN_MS - 1, b, 'hall')).toEqual([]);
    expect(central2.get().holdPos).toEqual(a);
    // 냉각이 끝나면 a 기준 — b 는 2 m 떨어져 있으니 다시 판정
    expect(central2.tick(t1 + 100 + HOLD_BREAK_COOLDOWN_MS, b, 'hall')).toEqual(['holdBreak']);
    expect(central2.get().holdPos).toEqual(b);
    // 냉각이 끝났고 제자리면 조용하다
    expect(central2.tick(t1 + 100 + HOLD_BREAK_COOLDOWN_MS * 2, b, 'hall')).toEqual([]);
  });

  it('밝음에서는 얼마를 움직여도 자리 판정이 없다', () => {
    central2.enter(T0);
    expect(central2.tick(T0 + 1000, HALL, 'hall')).toEqual([]);
    expect(central2.tick(T0 + 2000, { x: -8, z: 0 }, 'hall')).toEqual([]);
  });
});

describe('어둠 — 코어가 내려간다', () => {
  const t1 = T0 + LOCK_LATEST_MS;
  const t2 = t1 + 60_000;

  it('verdict → 어둠 · 문은 아직 닫혀 있다 · 자리 고수가 풀린다', () => {
    central2.enter(T0);
    lockdownAt(t1);
    central2.verdict(t2);
    const s = central2.get();
    expect(s.phase).toBe('dark');
    expect(s.darkAt).toBe(t2);
    expect(s.doors).toEqual({ d1: false, d2: false, d3: false, d4: false });
    expect(s.holdPos).toBeNull();
    // 풀렸으니 얼마를 움직여도 holdBreak 가 없다
    expect(central2.tick(t2 + 100, { x: -8, z: 0 }, 'hall')).toEqual([]);
  });

  it('verdict 는 락다운에서만 — 밝음에서 부르면 아무 일도 없다', () => {
    central2.enter(T0);
    central2.verdict(T0 + 1000);
    expect(central2.get().phase).toBe('bright');
  });

  it('darkAt + 2 분에 doorOpen 딱 한 번 · ② 만 열린다', () => {
    central2.enter(T0);
    lockdownAt(t1);
    central2.verdict(t2);
    expect(central2.tick(t2 + DARK.durationMs - 1, HALL, 'hall')).toEqual([]);
    expect(central2.get().doors.d2).toBe(false);
    expect(central2.tick(t2 + DARK.durationMs, HALL, 'hall')).toEqual(['doorOpen']);
    expect(central2.get().doors).toEqual({ d1: false, d2: true, d3: false, d4: false });
    expect(central2.tick(t2 + DARK.durationMs + 1000, HALL, 'hall')).toEqual([]);
    expect(central2.tick(t2 + DARK.durationMs * 3, HALL, 'hall')).toEqual([]);
  });
});

describe('콘솔 — 판에 한 번, 어둠에서는 무효', () => {
  it('밝음 → true 한 번 · 두 번째 → false', () => {
    central2.enter(T0);
    expect(central2.dim(T0 + 1000)).toBe(true);
    expect(central2.get().consoleUsed).toBe(true);
    expect(central2.get().dimmedUntil).toBe(T0 + 1000 + CONSOLE.dimMs);
    expect(central2.dim(T0 + 1000 + CONSOLE.dimMs + 1)).toBe(false);
  });

  it('락다운에서도 한 번은 된다', () => {
    central2.enter(T0);
    lockdownAt(T0 + LOCK_LATEST_MS);
    expect(central2.dim(T0 + LOCK_LATEST_MS + 1)).toBe(true);
  });

  it('어둠 → false — 이미 내려가 있다', () => {
    central2.enter(T0);
    lockdownAt(T0 + LOCK_LATEST_MS);
    central2.verdict(T0 + LOCK_LATEST_MS + 1000);
    expect(central2.dim(T0 + LOCK_LATEST_MS + 2000)).toBe(false);
    expect(central2.get().consoleUsed).toBe(false);
  });

  it('light — 1 · 콘솔 15 초 동안 0.4 · 어둠 0.4', () => {
    central2.enter(T0);
    expect(central2.light(T0)).toBe(1);
    central2.dim(T0 + 1000);
    expect(central2.isDimmed(T0 + 1000)).toBe(true);
    expect(central2.light(T0 + 1000 + CONSOLE.dimMs - 1)).toBe(DARK.light);
    expect(central2.isDimmed(T0 + 1000 + CONSOLE.dimMs)).toBe(false);
    expect(central2.light(T0 + 1000 + CONSOLE.dimMs)).toBe(1);

    lockdownAt(T0 + LOCK_LATEST_MS);
    expect(central2.light(T0 + LOCK_LATEST_MS)).toBe(1);
    central2.verdict(T0 + LOCK_LATEST_MS + 1000);
    expect(central2.light(T0 + LOCK_LATEST_MS + 2000)).toBe(DARK.light);
    expect(DARK.light).toBe(0.4);
  });

  it('spread — 1 · 콘솔 15 초 동안 0.4 · 어둠은 1 (몸만 안 읽히고 말은 그대로 퍼진다)', () => {
    central2.enter(T0);
    expect(central2.spread(T0)).toBe(1);
    central2.dim(T0 + 1000);
    expect(central2.spread(T0 + 2000)).toBe(CONSOLE.spread);
    expect(CONSOLE.spread).toBe(0.4);
    expect(central2.spread(T0 + 1000 + CONSOLE.dimMs)).toBe(1);

    lockdownAt(T0 + LOCK_LATEST_MS);
    central2.verdict(T0 + LOCK_LATEST_MS + 1000);
    expect(central2.spread(T0 + LOCK_LATEST_MS + 2000)).toBe(DARK.spread);
    expect(DARK.spread).toBe(1);
  });
});

describe('검문 — 관문 셋', () => {
  it('startGate(1, now, 15000) → 14999 는 아직 · 15000 은 만료', () => {
    central2.enter(T0);
    central2.startGate(1, T0, GATE_MS);
    expect(central2.get().gate).toBe(1);
    expect(central2.gateExpired(T0 + GATE_MS - 1)).toBe(false);
    expect(central2.gateExpired(T0 + GATE_MS)).toBe(true);
  });

  it('endGate — ① ② 는 번호를 지키고 ③ 뒤에 4(끝) · 닫힌 관문은 만료가 없다', () => {
    central2.enter(T0);
    central2.startGate(1, T0, GATE_MS);
    central2.endGate();
    expect(central2.get().gate).toBe(1);
    expect(central2.gateExpired(T0 + GATE_MS * 10)).toBe(false);
    central2.startGate(2, T0, GATE_MS);
    central2.endGate();
    expect(central2.get().gate).toBe(2);
    central2.startGate(3, T0, GATE_MS);
    expect(central2.get().gate).toBe(3);
    central2.endGate();
    expect(central2.get().gate).toBe(4);
    expect(central2.gateExpired(T0 + GATE_MS * 10)).toBe(false);
  });

  it('gateMs — 경보 40 부터 12 초, 그 아래는 15 초', () => {
    expect(gateMs(0)).toBe(GATE_MS);
    expect(gateMs(GATE_ALERT_AT - 1)).toBe(GATE_MS);
    expect(gateMs(GATE_ALERT_AT)).toBe(GATE_MS_ALERTED);
    expect(gateMs(100)).toBe(GATE_MS_ALERTED);
    expect(GATE_MS).toBe(15_000);
    expect(GATE_MS_ALERTED).toBe(12_000);
  });
});

describe('reset · subscribe', () => {
  it('reset 은 전부 지운다 — 국면 · 문 · 자리 · 관문 · 콘솔 · 그늘', () => {
    central2.enter(T0);
    central2.dim(T0 + 1000);
    central2.tick(T0 + 2000, { x: 13, z: 2 }, 'shadow');
    lockdownAt(T0 + LOCK_LATEST_MS);
    central2.startGate(3, T0 + LOCK_LATEST_MS, GATE_MS);
    central2.endGate();
    central2.verdict(T0 + LOCK_LATEST_MS + 1000);
    central2.tick(T0 + LOCK_LATEST_MS + 1000 + DARK.durationMs, HALL, 'hall');

    central2.reset();
    expect(central2.get()).toEqual({
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
    });
    // 지운 뒤에는 enter 전이라 tick 이 조용하다
    expect(central2.tick(T0 * 2, HALL, 'hall')).toEqual([]);
    // 새 판 — 콘솔도 그늘도 다시 한 번씩
    central2.enter(T0 * 2);
    expect(central2.dim(T0 * 2)).toBe(true);
    central2.tick(T0 * 2, { x: 13, z: 2 }, 'shadow');
    expect(central2.tick(T0 * 2 + SHADOW_LINGER.ms, { x: 13, z: 2 }, 'shadow')).toEqual(['shadowLinger']);
  });

  it('구독자는 전이마다 불리고, 해지하면 조용하다', () => {
    let n = 0;
    const off = central2.subscribe(() => n++);
    central2.enter(T0);
    const a = n;
    expect(a).toBeGreaterThan(0);
    lockdownAt(T0 + LOCK_LATEST_MS);
    expect(n).toBeGreaterThan(a);
    off();
    const b = n;
    central2.verdict(T0 + LOCK_LATEST_MS + 1);
    expect(n).toBe(b);
  });
});
