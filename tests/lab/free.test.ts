/**
 * 자유 시행 — 열거가 없는 대신, 판이 멈추지 않게 하는 것은 상한과 기록 요약이다.
 * 그 둘만 여기서 잠근다 (지시문·판정은 리더 몫이라 고정할 게 없다).
 */

import { describe, expect, it } from 'vitest';
import type { Complete } from '../../src/lab/agent';
import { LIMITS, designFree, replanFrom, summarize, undash, walkSeconds } from '../../src/lab/free';
import { START } from '../../src/lab/arena';
import type { Sample } from '../../src/lab/spec';

/** 걷다 멈추고 뛰는 기록을 만든다 */
function track(steps: { until: number; x: number; z: number; jumpAt?: number[] }[]): Sample[] {
  const out: Sample[] = [];
  let x = START.x;
  let z = START.z;
  let t = 0;
  for (const s of steps) {
    while (t < s.until - 0.001) {
      t = Number((t + 0.1).toFixed(1));
      const k = Math.min(1, 0.1 / Math.max(0.1, s.until - t + 0.1));
      x += (s.x - x) * k;
      z += (s.z - z) * k;
      const jumping = (s.jumpAt ?? []).some((j) => Math.abs(t - j) < 0.15);
      out.push({ t, x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), y: jumping ? 0.4 : 0 });
    }
  }
  return out;
}

describe('기록 요약 — 리더가 이것만 보고 판정한다', () => {
  const props = [{ label: 'A', x: -4, z: -3.4, r: 1.1 }];

  it('출발·도착·정지·점프가 시각과 함께 남는다', () => {
    const s = track([
      { until: 2, x: -4, z: -3.4 },
      { until: 5, x: -4, z: -3.4, jumpAt: [3, 4] },
    ]);
    const line = summarize('민재', s, props);
    expect(line).toMatch(/^민재:/);
    expect(line).toMatch(/출발/);
    expect(line).toMatch(/점프/);
    expect(line).toMatch(/"A"/); // 표식 이름으로 자리를 부른다
  });

  it('정체는 절대 안 들어간다 — 이름과 움직임뿐이다', () => {
    const line = summarize('지우', track([{ until: 2, x: 0, z: -4 }]), props);
    expect(line).not.toMatch(/인간|사람|human|AI/);
  });

  it('기록이 없으면 없다고 말한다', () => {
    expect(summarize('하늘', [], props)).toMatch(/기록 없음/);
  });
});

describe('안전 상한', () => {
  it('한 판이 15초를 넘지 않는다 — 30초로 뒀더니 개체 계획에 127초가 걸렸다', () => {
    expect(LIMITS.seconds).toBeLessThanOrEqual(15);
    expect(LIMITS.waypoints).toBeLessThanOrEqual(6);
  });

  it('걷는 시간은 가구를 피해 도는 경로로 잰다 — 옆벽을 따라 걸으면 콘솔을 돌아간다', () => {
    // 홀 한복판은 빈 바닥이라(무대·콘솔 전부 가장자리) 벽면(콘솔 x −11.65, 폭 0.7)을 따라 걷는 선으로 확인한다
    const from = { x: -11.1, z: -8 };
    const to = { x: -11.1, z: 1 };
    expect(walkSeconds(from, to)).toBeGreaterThan(Math.hypot(0, 9) / 2.6 + 0.01);
  });
});

describe('설계 프롬프트 — 시행이 자료 조회 시험이 되지 않게', () => {
  /** 리더가 받은 시스템 프롬프트를 잡아 둔다 */
  async function designWith(): Promise<string> {
    let system = '';
    const complete: Complete = async (a) => {
      system = a.system;
      return { instruction: '소파2 위에 올라가 3초 동안 멈춘다', seconds: 8, watching: '멈춤', props: [] };
    };
    const got = await designFree({ id: '리더', prompt: '관리 개체다', model: 'claude-opus-5' }, [], 5, complete);
    expect(got.trial?.instruction).toBeTruthy();
    return system;
  }

  it('목록을 훑어 골라내게 하는 지시를 막는다 — 표를 가진 쪽만 풀 수 있는 시행은 판을 한 번에 끝낸다', async () => {
    const system = await designWith();
    expect(system).toContain('자료 조회 시험');
    expect(system).toContain('윗면이 0.9m 를 넘는 것 중 x 가 가장 작은 것'); // 금지 예시로 박아 둔다
  });

  it('물건은 조건이 아니라 이름으로 부르게 한다 — 고르는 일은 리더 몫이다', async () => {
    expect(await designWith()).toContain('이름으로 직접 부른다');
  });

  it('좌표표 자체는 리더에게 그대로 간다 — 이름을 고르려면 봐야 한다', async () => {
    const system = await designWith();
    expect(system).toContain('소파2');
    expect(system).toContain('윗면');
  });
});

/**
 * ── 그 자리에서 출발하는 계획 ──
 *
 * 시행은 아무도 옮기지 않는다 (2026-09-01, ArenaFeature 의 begin). 그런데 개체의 계획은 기준
 * 자리(START) 하나만 보고 짜인다 — 그 어긋남을 흡수하는 것이 replanFrom 이고, 여기가 그 잣대다.
 * 이게 무너지면 **멀리 서 있던 개체가 제 계획대로 걷고도 늦고**, 늦은 기록은 그대로 의심도가 된다.
 */
describe('replanFrom', () => {
  const to = { x: 6, z: -8 };

  it('닿는 시각은 그대로다 — 고치는 것은 출발 시각 하나뿐이다', () => {
    const moves = [{ at: 2, action: 'walk' as const, ...to }];
    for (const from of [START, { x: -10, z: 9 }, { x: 5, z: -9 }]) {
      const [m] = replanFrom(moves, from);
      const 원래도착 = 2 + walkSeconds(START, to);
      const 실제도착 = m.at + walkSeconds(from, to);
      // 0초보다 일찍 출발할 수는 없다 — 너무 멀면 그때만 늦고, 대신 곧장 떠난다
      if (m.at > 0) expect(실제도착).toBeCloseTo(원래도착, 2);
      else expect(실제도착).toBeGreaterThanOrEqual(원래도착 - 0.001);
    }
  });

  it('기준 자리에서 출발하면 계획이 그대로다', () => {
    const moves = [{ at: 1.5, action: 'walk' as const, ...to }];
    expect(replanFrom(moves, START)[0].at).toBeCloseTo(1.5, 2);
  });

  it('멀리 서 있으면 더 일찍 떠난다 — 0초 아래로는 안 내려간다', () => {
    const moves = [{ at: 1, action: 'walk' as const, ...to }];
    const 멀리 = replanFrom(moves, { x: -11, z: 10 })[0].at;
    const 가까이 = replanFrom(moves, { x: 5, z: -8 })[0].at;
    expect(멀리).toBeLessThan(가까이);
    expect(멀리).toBeGreaterThanOrEqual(0);
  });

  it('점프·정지는 손대지 않는다 — 시각 자체가 지시다', () => {
    const moves = [
      { at: 1, action: 'jump' as const },
      { at: 3, action: 'stay' as const },
    ];
    expect(replanFrom(moves, { x: -10, z: 9 })).toEqual(moves);
  });

  it('두 번째 걸음부터는 안 밀린다 — 앞 걸음이 끝난 자리는 계획과 같다', () => {
    const b = { x: -4, z: 3 };
    const moves = [
      { at: 0.5, action: 'walk' as const, ...to },
      { at: 8, action: 'walk' as const, ...b },
    ];
    expect(replanFrom(moves, { x: -10, z: 9 })[1].at).toBeCloseTo(8, 2);
  });
});

/**
 * 줄표 걷기 — 리더가 하는 말에는 「—」가 안 들어간다 (2026-09-02 사용자).
 * 손으로 쓴 문장은 그 자리에서 고쳤고, 여기서 지키는 것은 **리더가 그 자리에서 짓는 지시문**이다.
 */
describe('undash — 리더 말의 줄표', () => {
  it('줄표 자리를 문장 경계로 바꾼다', () => {
    expect(undash('순서다 — 뒤집으면 어긋난 것이다.')).toBe('순서다. 뒤집으면 어긋난 것이다.');
  });

  it('줄표가 여럿이어도 전부 걷는다', () => {
    expect(undash('하나 — 둘 — 셋')).toBe('하나. 둘. 셋');
  });

  it('붙여 쓴 줄표도 걷는다 (앞뒤 공백이 없어도)', () => {
    expect(undash('둘이다—더도 덜도 아니다')).toBe('둘이다. 더도 덜도 아니다');
  });

  it('en dash 도 같이 걷는다 — 모델이 둘을 섞어 쓴다', () => {
    expect(undash('멈춰라 – 3초 동안')).toBe('멈춰라. 3초 동안');
  });

  it('앞이 이미 끝난 문장이면 마침표를 두 번 찍지 않는다', () => {
    expect(undash('멈춰라. — 그리고 서 있어라')).toBe('멈춰라. 그리고 서 있어라');
    expect(undash('몇 번인가? — 숫자만 써라')).toBe('몇 번인가? 숫자만 써라');
  });

  it('끝에 매달린 줄표는 그냥 없앤다', () => {
    expect(undash('원 안으로 들어가라 —')).toBe('원 안으로 들어가라.');
  });

  /* 줄표가 없는 문장은 **한 글자도 안 바뀐다** — 멀쩡한 지시문을 건드리면 그게 더 큰 손해다 */
  it('줄표가 없으면 그대로 둔다', () => {
    const line = '저 원 안으로 들어가라. 정확히 4초다.';
    expect(undash(line)).toBe(line);
  });
});
