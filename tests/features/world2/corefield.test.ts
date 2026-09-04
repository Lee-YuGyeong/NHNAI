/**
 * 코어 동심원 — 값이 문서와 같은가, 경계가 어느 쪽인가, 방향 판정이 오판정을 안 내는가.
 *
 * 여기 있는 숫자는 전부 「누가 듣고 있나」 · 중앙 시설과 「어디서 죽을 것인가」 수치 초안에서 베낀 것이다.
 * 시험이 지키는 것은 값 자체가 아니라 **한 곳에서만 나온다는 약속**이다 — corefield 를 고치면 이 파일도 같이 고친다.
 * 다른 어디에서 같은 숫자를 발견하면 그게 버그다.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSOLE,
  CORE_CENTER,
  CORE_READ_SUSPICION,
  DARK,
  DEATH_ALERT,
  FIELD,
  FLEE_ANGLE_DEG,
  INTERVENE_R,
  interveneRadius,
  isFleeDirection,
  LOCKDOWN,
  OPENER,
  reachCount,
  SHADOW_LINGER,
  STARE_MS,
  witnessesWithin,
  witnessRadius,
  zone,
} from '../../../src/features/world2/corefield';

/** 코어 중심에서 +x 로 d 만큼 떨어진 자리 */
const at = (d: number, center = CORE_CENTER) => ({ x: center.x + d, z: center.z });

describe('zone — 코어 중심 거리로만 판정한다', () => {
  it('6 m · 10 m 경계는 안쪽 구역이다 — 문턱을 밟은 건 아직 안 나간 것', () => {
    expect(zone(at(0))).toBe('core');
    expect(zone(at(5.9))).toBe('core');
    expect(zone(at(6))).toBe('core');
    expect(zone(at(6.1))).toBe('hall');
    expect(zone(at(10))).toBe('hall');
    expect(zone(at(10.1))).toBe('shadow');
    expect(zone(at(40))).toBe('shadow');
  });

  it('방향은 상관없다 — 대각선 거리로 잰다', () => {
    const r = 6 / Math.SQRT2;
    expect(zone({ x: CORE_CENTER.x + r, z: CORE_CENTER.z + r })).toBe('core');
    expect(zone({ x: CORE_CENTER.x + r + 0.1, z: CORE_CENTER.z + r + 0.1 })).toBe('hall');
  });

  it('중심은 인자다 — 모듈이 지도를 모른다', () => {
    const center = { x: 20, z: 5 };
    expect(zone({ x: 20, z: 5 }, center)).toBe('core');
    expect(zone(at(7, center), center)).toBe('hall');
    expect(zone(at(11, center), center)).toBe('shadow');
    // 기본 중심 기준으로는 그늘인 자리가, 다른 중심에서는 코어권
    expect(zone({ x: 20, z: 5 })).toBe('shadow');
  });
});

describe('반경 표 — 목격은 배율대로 갈리고 개입 거리는 안 갈린다', () => {
  it('목격 반경 = 홀 10 m × 배율: 코어 30(방 전체) · 홀 10 · 그늘 4', () => {
    expect(witnessRadius('core')).toBe(30);
    expect(witnessRadius('hall')).toBe(10);
    expect(witnessRadius('shadow')).toBe(4);
  });

  it('개입 거리는 zone 과 무관하게 4 m — 그늘이 조용한 이유는 거리가 아니라 머릿수다', () => {
    expect(interveneRadius('core')).toBe(4);
    expect(interveneRadius('hall')).toBe(4);
    expect(interveneRadius('shadow')).toBe(4);
    expect(INTERVENE_R).toBe(4);
    expect(LOCKDOWN.interveneR).toBe(INTERVENE_R);
  });

  it('개입 가능 인원: 코어 6 · 홀 3 · 그늘 1', () => {
    expect(reachCount('core')).toBe(6);
    expect(reachCount('hall')).toBe(3);
    expect(reachCount('shadow')).toBe(1);
  });
});

describe('isFleeDirection — 문 방향 ±35° 만 도주다', () => {
  const me = { x: 0, z: 0 };
  const door = { x: 0, z: -10 }; // 정면(−z)에 문
  const heading = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    // 문 방향(−z)에서 deg 만큼 튼 단위 벡터
    return { dx: Math.sin(a), dz: -Math.cos(a) };
  };

  it('문 정면 · 30° 는 도주, 60° · 정반대는 자유 이동', () => {
    expect(isFleeDirection(heading(0), me, door)).toBe(true);
    expect(isFleeDirection(heading(30), me, door)).toBe(true);
    expect(isFleeDirection(heading(-30), me, door)).toBe(true);
    expect(isFleeDirection(heading(60), me, door)).toBe(false);
    expect(isFleeDirection(heading(-60), me, door)).toBe(false);
    expect(isFleeDirection(heading(180), me, door)).toBe(false);
    expect(isFleeDirection(heading(90), me, door)).toBe(false);
  });

  it('경계 35° 는 도주, 36° 는 아니다 — 상수 하나가 선이다', () => {
    expect(isFleeDirection(heading(FLEE_ANGLE_DEG - 0.01), me, door)).toBe(true);
    expect(isFleeDirection(heading(FLEE_ANGLE_DEG + 1), me, door)).toBe(false);
  });

  it('제자리 · 문 위에 서 있음은 판정 불가 → 무죄', () => {
    expect(isFleeDirection({ dx: 0, dz: 0 }, me, door)).toBe(false);
    expect(isFleeDirection(heading(0), door, door)).toBe(false);
  });

  it('속도 크기는 상관없다 — 방향만 본다', () => {
    const slow = { dx: 0.01, dz: -0.05 };
    const fast = { dx: 1, dz: -5 };
    expect(isFleeDirection(slow, me, door)).toBe(isFleeDirection(fast, me, door));
    expect(isFleeDirection(fast, me, door)).toBe(true);
  });

  it('내 자리가 옮겨지면 문 방향도 같이 옮겨진다', () => {
    // 문 오른쪽(+x) 에 서 있으면 문은 −x 쪽 — 그쪽으로 걷는 게 도주
    const side = { x: 10, z: -10 };
    expect(isFleeDirection({ dx: -1, dz: 0 }, side, door)).toBe(true);
    expect(isFleeDirection({ dx: 0, dz: -1 }, side, door)).toBe(false);
  });
});

describe('witnessesWithin — 같은 열 개가 반경대로 3:1:0.4 로 갈린다', () => {
  const me = { x: 3, z: -7 };
  // 나를 중심으로 거리 1 · 2 · 3 · 5 · 7 · 9 · 12 · 15 · 20 · 28 에 열 개. 방향은 섞는다
  const D = [1, 2, 3, 5, 7, 9, 12, 15, 20, 28];
  const LAYOUT = D.map((d, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    return { id: `u${i}`, x: me.x + d * Math.cos(a), z: me.z + d * Math.sin(a) };
  });

  it('코어 30 → 열 전부 · 홀 10 → 여섯 · 그늘 4 → 셋', () => {
    expect(witnessesWithin(LAYOUT, me, witnessRadius('core'))).toHaveLength(10);
    expect(witnessesWithin(LAYOUT, me, witnessRadius('hall'))).toHaveLength(6);
    expect(witnessesWithin(LAYOUT, me, witnessRadius('shadow'))).toHaveLength(3);
  });

  it('id 를 입력 순서대로 돌려준다 — 목격자 명단이 조각 holders 가 된다', () => {
    expect(witnessesWithin(LAYOUT, me, witnessRadius('shadow'))).toEqual(['u0', 'u1', 'u2']);
  });

  it('반경 위는 안쪽 · 빈 명단은 빈 배열 — 목격자가 없으면 아무것도 안 남는다', () => {
    const units = [{ id: 'edge', x: me.x + 4, z: me.z }];
    expect(witnessesWithin(units, me, 4)).toEqual(['edge']);
    expect(witnessesWithin(units, me, 3.99)).toEqual([]);
    expect(witnessesWithin([], me, 30)).toEqual([]);
  });

  it('콘솔 · 어둠은 호출자가 배율을 곱한다 — 홀에서 콘솔을 누르면 그늘 반경이 된다', () => {
    expect(witnessRadius('hall') * CONSOLE.spread).toBe(witnessRadius('shadow'));
    expect(witnessesWithin(LAYOUT, me, witnessRadius('hall') * CONSOLE.spread)).toHaveLength(3);
    expect(witnessRadius('hall') * DARK.spread).toBe(witnessRadius('hall'));
  });
});

describe('상수 — 문서의 숫자와 같다', () => {
  it('동심원 셋: 코어 6 m ×3 · 홀 10 m ×1 · 그늘 ×0.4', () => {
    expect(FIELD.core).toEqual({ r: 6, spread: 3, read: 'max', light: 'max', reach: 6 });
    expect(FIELD.hall).toEqual({ r: 10, spread: 1, read: 'base', light: 'base', reach: 3 });
    expect(FIELD.shadow).toEqual({ spread: 0.4, read: 'none', light: 'dim', reach: 1 });
  });

  it('콘솔(규칙 04): 15 초 · ×0.4 · 태도 −1 · 경보 +12', () => {
    expect(CONSOLE).toEqual({ dimMs: 15000, spread: 0.4, attitude: -1, alert: 12 });
  });

  it('어둠 국면(08): 조명 40 % · 판독 4 m · 전파 ×1 · 2 분', () => {
    expect(DARK).toEqual({ light: 0.4, read: 4, spread: 1, durationMs: 120000 });
  });

  it('락다운(06): 허용 이동 0.6 m · 의심도 +10 · 개입 4 m', () => {
    expect(LOCKDOWN).toEqual({ holdM: 0.6, suspicion: 10, interveneR: 4 });
  });

  it('그늘 서성임 30 초 → 태도 −1 · 코어권 판독 의심도 +2 · 도주각 35°', () => {
    expect(SHADOW_LINGER).toEqual({ ms: 30000, attitude: -1 });
    expect(CORE_READ_SUSPICION).toBe(2);
    expect(FLEE_ANGLE_DEG).toBe(35);
  });

  it('경보도는 아무도 지목하지 않는다 — 처형 +25 고정, 단일 증가 상한 25 를 안 넘는다 (헌법 9 · 13)', () => {
    expect(DEATH_ALERT).toBe(25);
    expect(DEATH_ALERT).toBeLessThanOrEqual(25);
    expect(CONSOLE.alert).toBeLessThanOrEqual(25);
    expect(LOCKDOWN.suspicion).toBeLessThanOrEqual(25);
  });

  it('코어 중심 약속값 — central2 가 코어를 세울 자리', () => {
    expect(CORE_CENTER).toEqual({ x: 0, z: -10.5 });
  });

  it('경비의 말 걸기(D10): 20 · 잡담 75 초 40 % 3 m · 무응답 18 초 +8 · 수용 −16 · 스캔 3.8 초 0.45 m +16 · 발화 창 5 초 · 응시 3 초', () => {
    expect(OPENER).toEqual({
      at: 20,
      chatMs: 75000,
      chatChance: 0.4,
      chatM: 3,
      silentMs: 18000,
      silent: 8,
      accept: -16,
      standM: 1.8,
      scanM: 2,
      scanMs: 3800,
      scanMoveM: 0.45,
      scanFail: 16,
      sayWindowMs: 5000,
      gazeMs: 3000,
    });
    expect(OPENER.scanFail).toBeLessThanOrEqual(25);
    expect(OPENER.silent).toBeLessThanOrEqual(25);
  });

  it('응시 1.2 초 — 복도의 NOTICE 와 작업 구역의 「앞이 그은 것」이 같은 수 하나를 쓴다', () => {
    expect(STARE_MS).toBe(1200);
  });
});
