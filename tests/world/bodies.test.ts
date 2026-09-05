/**
 * 몸 배정 — 넷이서 시연하면 넷이 전부 다른 군인이어야 한다 (2026-09-04 사용자). 다섯째부터는 겹쳐도 어쩔 수 없다.
 */
import { describe, expect, it } from 'vitest';

import { BODIES, BODY_IDS, pickBody, type BodyId } from '@/world/mp/bodies';
import { GRAVITY, WALK_SPEED } from '@/world/mp/constants';
import { PAD_GAP, PAD_R, PLATFORM_JUMP_SPEED, START_SLOTS, startSlot } from '@/world/mp/platform';

describe('pickBody — 방 안에서 겹치지 않게', () => {
  it('넷이 차례로 들어오면 넷이 다 다르다 — 난수가 무엇이든', () => {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      const taken: BodyId[] = [];
      for (let i = 0; i < 4; i++) taken.push(pickBody(taken, () => r));
      expect(new Set(taken).size).toBe(4);
    }
  });

  it('다섯째는 남은 몸이 없으니 아무 몸이나 — 던지지 않는다', () => {
    const b = pickBody([...BODY_IDS], () => 0.5);
    expect(BODY_IDS).toContain(b);
  });

  it('빈 자리(undefined)는 쓴 몸으로 안 센다', () => {
    const b = pickBody([undefined, 'sol_fit_m'], () => 0);
    expect(b).not.toBe('sol_fit_m');
  });
});

describe('몸의 물리 — 비만인 둘은 느리고 낮게 뛴다', () => {
  const peak = (v: number) => (v * v) / (2 * GRAVITY);
  it('달리기는 비만이 느리다, 점프는 비만이 낮다', () => {
    for (const heavy of ['sol_heavy_m', 'sol_heavy_f'] as const) {
      for (const fit of ['sol_fit_m', 'sol_fit_f'] as const) {
        expect(BODIES[heavy].run).toBeLessThan(BODIES[fit].run);
        expect(peak(BODIES[heavy].jump)).toBeLessThan(peak(BODIES[fit].jump));
      }
      expect(BODIES[heavy].heavy).toBe(true);
    }
  });
  /*
   * 2026-09-05 사용자: 「점프가 너무 낮게 뛰어진다」 — 복도(1.05m)와 같던 값에서 올렸다. 발판(0.5m) 위에서는 그 높이가
   * 뛴 것 같지 않았고, 걸어서 뛴 거리가 발판 간격에 못 미쳤다. 여기서 못 박는 것은 「높이」가 아니라 **발판을 건널 수
   * 있는가**다 — 날씬한 몸은 걸어서 한 칸(2m)을 넘고, 비만은 걸어서 다음 발판(중심 2m, 반지름 0.8)의 앞쪽에 닿는다.
   */
  it('점프는 발판 한 칸을 건넌다 — 날씬한 몸은 걸어서 넘고, 비만은 걸어서 다음 발판 앞쪽에 닿는다', () => {
    expect(peak(BODIES.sol_fit_m.jump)).toBeGreaterThan(1.2);
    expect(peak(BODIES.sol_heavy_m.jump)).toBeLessThan(1);
    const air = (v: number) => (2 * v) / GRAVITY;
    expect(WALK_SPEED * air(BODIES.sol_fit_m.jump)).toBeGreaterThan(PAD_GAP);
    expect(WALK_SPEED * air(BODIES.sol_heavy_m.jump)).toBeGreaterThan(PAD_GAP - PAD_R);
    expect(WALK_SPEED * air(BODIES.sol_heavy_m.jump)).toBeLessThan(PAD_GAP);
  });
});

describe('움직이는 플랫폼 — 몸과 자리', () => {
  it('봇의 이륙 속도는 날씬한 몸의 것이다 — 사람과 봇이 다른 몸이면 안 된다(P9)', () => {
    expect(PLATFORM_JUMP_SPEED).toBe(BODIES.sol_fit_m.jump);
  });
  it('출발 발판의 네 자리는 전부 발판 안쪽 깊숙이 있다 — 가장자리에 세우면 서로 겹친 채 떨어진다', () => {
    for (const s of START_SLOTS) expect(Math.hypot(s.x, s.z)).toBeLessThan(PAD_R * 0.6);
    // 좌석 번호로 고른 자리와 순번으로 고른 자리가 같은 표다 — 다섯째부터 겹친다
    expect(startSlot(4)).toEqual(startSlot(0));
    expect(new Set(START_SLOTS.map((s) => `${s.x},${s.z}`)).size).toBe(4);
  });
});
