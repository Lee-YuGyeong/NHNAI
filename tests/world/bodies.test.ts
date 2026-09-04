/**
 * 몸 배정 — 넷이서 시연하면 넷이 전부 다른 군인이어야 한다 (2026-09-04 사용자). 다섯째부터는 겹쳐도 어쩔 수 없다.
 */
import { describe, expect, it } from 'vitest';

import { BODIES, BODY_IDS, pickBody, type BodyId } from '@/world/mp/bodies';
import { GRAVITY } from '@/world/mp/constants';

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
  it('날씬한 둘의 점프 최고점은 복도와 같다(≈1.05m), 비만은 그 아래', () => {
    expect(peak(BODIES.sol_fit_m.jump)).toBeCloseTo(1.045, 2);
    expect(peak(BODIES.sol_heavy_m.jump)).toBeLessThan(0.8);
  });
});
