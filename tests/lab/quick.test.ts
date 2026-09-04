/**
 * 즉석 시행 — 규칙 판정이 판의 전부다. 처형판(execute)은 이 판정 하나로 폐기가 갈리므로
 * 오탐(봇이 자기 계획대로 했는데 위반)이 나면 안 된다.
 */
import { describe, expect, it } from 'vitest';
import { ARENA, SPEED, START, distance, pathFor, type Pt } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';
import type { Move } from '@/lab/free';
import {
  QUICK_GAMES,
  REACT,
  SWEEP_WARN_S,
  countJumps,
  judgeQuick,
  liveNote,
  sweepAt,
  sweepLit,
  zoneStates,
  type QuickTrial,
  type SweepLine,
} from '@/lab/quick';
import type { Sample } from '@/lab/spec';

const walk = (pts: [number, number, number?][]): Sample[] =>
  pts.map(([x, z, y], i) => ({ t: i * 0.1, x, z, y: y ?? 0 }));

const arriveTrial: QuickTrial = {
  instruction: '',
  seconds: 10,
  props: [],
  watching: '',
  stakes: 'suspect',
  check: { kind: 'arrive', x: 0, z: 0, r: 1.5 },
  plan: () => [],
};

/**
 * 전원이 서 있는 자리. 시행은 아무도 옮기지 않으므로(ArenaFeature 의 begin) 판은 늘 이런 목록을 받는다.
 * `SCATTERED` 는 홀 네 귀퉁이까지 흩어진 최악의 배치다 — 여기서 성립하면 어디서든 성립한다.
 */
const HUDDLED: Pt[] = [START, { x: 1, z: -3 }, { x: -1, z: -2 }];
const SCATTERED: Pt[] = [
  { x: ARENA.minX + 1.5, z: ARENA.minZ + 1.5 },
  { x: ARENA.maxX - 1.5, z: ARENA.minZ + 1.5 },
  { x: ARENA.minX + 1.5, z: ARENA.maxZ - 1.5 },
  { x: ARENA.maxX - 1.5, z: ARENA.maxZ - 1.5 },
  { x: 0, z: 0 },
  START,
];

describe('countJumps', () => {
  it('봉우리 두 개는 점프 두 번이다', () => {
    const s = walk([[0, 0, 0], [0, 0, 0.4], [0, 0, 0], [0, 0, 0.45], [0, 0, 0]]);
    expect(countJumps(s)).toBe(2);
  });

  it('공중에 떠 있는 연속 샘플은 한 번으로 센다', () => {
    const s = walk([[0, 0, 0], [0, 0, 0.3], [0, 0, 0.45], [0, 0, 0.3], [0, 0, 0]]);
    expect(countJumps(s)).toBe(1);
  });
});

describe('judgeQuick', () => {
  it('원 안에서 끝나면 정상, 밖이면 경고다', () => {
    const got = judgeQuick(arriveTrial, [
      { who: 'A-1', samples: walk([[5, 5], [1, 0.5]]) },
      { who: 'A-2', samples: walk([[5, 5], [4, 4]]) },
    ]);
    expect(got.find((v) => v.who === 'A-1')?.grade).toBe('normal');
    expect(got.find((v) => v.who === 'A-2')?.grade).toBe('alert');
  });

  it('점프 횟수가 지시와 다르면 경고다', () => {
    const t: QuickTrial = { ...arriveTrial, stakes: 'execute', check: { kind: 'jump', times: 2 } };
    const two = walk([[0, 0, 0], [0, 0, 0.4], [0, 0, 0], [0, 0, 0.4], [0, 0, 0]]);
    const three = walk([[0, 0, 0], [0, 0, 0.4], [0, 0, 0], [0, 0, 0.4], [0, 0, 0], [0, 0, 0.4], [0, 0, 0]]);
    const got = judgeQuick(t, [
      { who: 'ok', samples: two },
      { who: 'over', samples: three },
    ]);
    expect(got.find((v) => v.who === 'ok')?.grade).toBe('normal');
    expect(got.find((v) => v.who === 'over')?.grade).toBe('alert');
  });

  it('부동자세는 시작 자리 기준이다 — 어디서 시작했든 안 움직였으면 정상', () => {
    const t: QuickTrial = { ...arriveTrial, stakes: 'execute', check: { kind: 'still', r: 0.45, grace: 0 } };
    const got = judgeQuick(t, [
      { who: 'still', samples: walk([[7, -3], [7.1, -3], [7, -3.1]]) },
      { who: 'drift', samples: walk([[7, -3], [8, -3], [8.5, -3]]) },
    ]);
    expect(got.find((v) => v.who === 'still')?.grade).toBe('normal');
    expect(got.find((v) => v.who === 'drift')?.grade).toBe('alert');
  });

  /**
   * ★ **눌린 손은 부동이 아니다** (2026-09-03). 카운트다운 동안 몸은 굳지만 자판은 안 굳는다 —
   *   W 를 누른 채 세던 사람은 판이 서는 순간 발이 떨어지고, 2.6m/s 라 0.23초면 0.6m 다.
   *   처형판이라 **지시를 읽기도 전에 끝났다.** 정지판(stopgo)이 이미 쓰던 규칙(REACT)을 여기도 준다.
   */
  it('부동자세는 사람 몫(REACT)을 빼고 잰다 — 눌린 손이 처형이 되면 안 된다', () => {
    const t: QuickTrial = { ...arriveTrial, stakes: 'execute', check: { kind: 'still', r: 0.6, grace: REACT } };
    // 손을 떼기까지 한 발짝 밀렸고 그 뒤로는 서 있었다 — 부동이다
    const held: Sample[] = [
      { t: 0, x: 7, z: -3, y: 0 },
      { t: 0.2, x: 7.5, z: -3, y: 0 },
      { t: 0.5, x: 7.9, z: -3, y: 0 },
      { t: 3, x: 7.95, z: -3, y: 0 },
      { t: 6, x: 7.9, z: -3.05, y: 0 },
    ];
    // grace 가 지난 뒤에 걸어 나갔다 — 이건 부동이 아니다
    const walked: Sample[] = [
      { t: 0, x: 7, z: -3, y: 0 },
      { t: 0.5, x: 7, z: -3, y: 0 },
      { t: 3, x: 9, z: -3, y: 0 },
      { t: 6, x: 11, z: -3, y: 0 },
    ];
    const got = judgeQuick(t, [
      { who: 'held', samples: held },
      { who: 'walked', samples: walked },
    ]);
    expect(got.find((v) => v.who === 'held')?.grade).toBe('normal');
    expect(got.find((v) => v.who === 'walked')?.grade).toBe('alert');
  });

  it('부동자세 화면(liveNote)은 판정과 같은 자를 쓴다 — 화면이 통과라는데 판정이 어긋나면 안 된다', () => {
    const check = { kind: 'still' as const, r: 0.6, grace: REACT };
    const held: Sample[] = [
      { t: 0, x: 7, z: -3, y: 0 },
      { t: 0.2, x: 7.5, z: -3, y: 0 },
      { t: 0.5, x: 7.9, z: -3, y: 0 },
      { t: 6, x: 7.9, z: -3, y: 0 },
    ];
    expect(liveNote(check, held).ok).toBe(true);
    expect(judgeQuick({ ...arriveTrial, check }, [{ who: '나', samples: held }])[0].grade).toBe('normal');
  });

  it('기록이 없으면 경고다', () => {
    expect(judgeQuick(arriveTrial, [{ who: 'A-1', samples: [] }])[0].grade).toBe('alert');
  });
});

describe('QUICK_GAMES', () => {
  it('모든 판이 방 안에서 성립한다', () => {
    QUICK_GAMES.forEach((g) => {
      const t = g.make(SCATTERED);
      expect(t.instruction.length).toBeGreaterThan(0);
      expect(t.stakes).toBe(g.stakes);
      t.props.forEach((p) => {
        /*
         * 빛의 벽만 **일부러 방 밖에서 출발한다** — 그 자리는 서는 자리가 아니라 벽이 떠나고
         * 되돌아서는 자리다. 되돌아서는 데가 방 안이면 그 언저리에 서 있던 몸만 몇 초를 더
         * 굳어야 하고, 그건 서 있던 자리가 판정을 가르는 것이다 (lab/quick 의 SweepLine ★).
         * 나머지 표식은 전부 걸어가 서는 자리라 방 안이어야 한다.
         */
        if (p.sweep) return;
        expect(p.x).toBeGreaterThanOrEqual(ARENA.minX);
        expect(p.x).toBeLessThanOrEqual(ARENA.maxX);
        expect(p.z).toBeGreaterThanOrEqual(ARENA.minZ);
        expect(p.z).toBeLessThanOrEqual(ARENA.maxZ);
      });
    });
  });

  it('도착판의 봇 계획은 자기 판정 원 안에 선다 — 봇이 오탐으로 처형되지 않는다', () => {
    QUICK_GAMES.forEach((g) => {
      for (let round = 0; round < 5; round += 1) {
        const t = g.make(SCATTERED);
        if (t.check.kind !== 'arrive') continue;
        const c = t.check;
        for (let seat = 0; seat < 5; seat += 1) {
          t.plan(seat, SCATTERED[seat % SCATTERED.length]).forEach((m) => {
            if (m.action !== 'walk' || m.x === undefined || m.z === undefined) return;
            expect(distance({ x: m.x, z: m.z }, c)).toBeLessThanOrEqual(c.r);
          });
        }
      }
    });
  });
});

/**
 * 봇 시뮬레이터 — ArenaFeature 의 시행 루프(계획 집행 · 경로 이동 · 점프 곡선 · 100ms 기록)를 그대로 옮긴 것이다.
 * 판을 늘릴 때마다 손으로 눌러 보는 대신 여기서 돌린다: **봇이 제 계획대로 했는데 위반이 나오면 안 된다.**
 * (처형판은 그 오탐 하나가 곧 애먼 개체의 폐기다)
 */
const JUMP_SEC = 0.32;
const JUMP_H = 0.5;
const OBSTACLES = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));

function simulate(moves: Move[], seconds: number, from: Pt = START): Sample[] {
  const dt = 1 / 60;
  const pos = { x: from.x, z: from.z };
  let route: { x: number; z: number }[] = [];
  let jumpUntil = -1;
  let done = 0;
  let nextSample = 0;
  const samples: Sample[] = [];

  for (let t = 0; t < seconds; t += dt) {
    while (done < moves.length && moves[done].at <= t) {
      const m = moves[done];
      if (m.action === 'walk' && m.x !== undefined && m.z !== undefined) route = pathFor(pos, { x: m.x, z: m.z }, OBSTACLES);
      else if (m.action === 'jump') jumpUntil = t + JUMP_SEC;
      else if (m.action === 'stay') route = [];
      done += 1;
    }
    const target = route[0];
    if (target) {
      const d = distance(pos, target);
      const step = SPEED * dt;
      if (d <= step) {
        pos.x = target.x;
        pos.z = target.z;
        route.shift();
      } else {
        pos.x += ((target.x - pos.x) / d) * step;
        pos.z += ((target.z - pos.z) / d) * step;
      }
    }
    const y = t < jumpUntil ? Math.sin(((jumpUntil - t) / JUMP_SEC) * Math.PI) * JUMP_H : 0;
    if (t >= nextSample) {
      nextSample += 0.1;
      samples.push({ t: +t.toFixed(1), x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), y: +y.toFixed(2) });
    }
  }
  return samples;
}

/**
 * 사람 손 — 신호를 **보고** 나서 REACT 만큼 늦게 반응하는 기록을 만든다.
 * 봇은 시각을 알고 미리 움직이므로 이 지연이 없다. 판정이 사람 몫을 봐 주지 않으면
 * 여기서 전부 걸리고, 그건 판이 아니라 "사람이니까 폐기" 다.
 */
describe('사람은 반응 시간 때문에 걸리지 않는다', () => {
  it('정지 신호를 보고 REACT 뒤에 선 기록은 정상이다', () => {
    const stop: [number, number][] = [[2, 3.8]];
    const t: QuickTrial = {
      ...arriveTrial,
      seconds: 6,
      stakes: 'execute',
      check: { kind: 'stopgo', stop, drift: 1.0, grace: REACT },
    };
    // 0~2초 걷다가 ■ 를 보고도 REACT 동안 더 걷고(≈1.2m) 그다음 완전히 선다
    const samples: Sample[] = [];
    let z = 0;
    for (let i = 0; i <= 60; i += 1) {
      const at = +(i * 0.1).toFixed(1);
      if (at < 2 + REACT) z += SPEED * 0.1;
      samples.push({ t: at, x: 0, z: +z.toFixed(2), y: 0 });
    }
    expect(judgeQuick(t, [{ who: '나', samples }])[0].grade).toBe('normal');
  });

  it('정지 신호를 무시하고 계속 걸은 기록은 걸린다', () => {
    const stop: [number, number][] = [[2, 3.8]];
    const t: QuickTrial = {
      ...arriveTrial,
      seconds: 6,
      stakes: 'execute',
      check: { kind: 'stopgo', stop, drift: 1.0, grace: REACT },
    };
    const samples: Sample[] = Array.from({ length: 61 }, (_, i) => ({
      t: +(i * 0.1).toFixed(1),
      x: 0,
      z: +(i * 0.1 * SPEED).toFixed(2),
      y: 0,
    }));
    expect(judgeQuick(t, [{ who: '나', samples }])[0].grade).toBe('alert');
  });

  it('신호를 보고 뛰어 매번 0.3초씩 밀린 박자는 정상이다', () => {
    const every = 1.2;
    const reps = 5;
    const lead = 2;
    const t: QuickTrial = {
      ...arriveTrial,
      seconds: 10,
      check: { kind: 'beat', every, reps, lead, tol: 0.5 },
    };
    // 신호 시각마다 0.3초 늦게 뜨는 봉우리 하나씩
    const samples: Sample[] = [];
    for (let i = 0; i <= 100; i += 1) {
      const at = +(i * 0.1).toFixed(1);
      const jumped = Array.from({ length: reps }, (_, k) => lead + every * (k + 1) + 0.3).some(
        (j) => at >= j && at < j + 0.2,
      );
      samples.push({ t: at, x: 0, z: 0, y: jumped ? 0.4 : 0 });
    }
    expect(judgeQuick(t, [{ who: '나', samples }])[0].grade).toBe('normal');
  });
});

/**
 * ★ 여기가 「제자리에서 시작한다」를 잠그는 자리다 (2026-09-01).
 *
 * 시행이 서도 아무도 출발선으로 옮기지 않는다 — 개체는 배회하던 그 자리에서 출발한다.
 * 그래서 **홀 어느 구석에서 출발해도** 제 계획대로 한 봇은 정상이어야 한다.
 * 여기가 무너지면 자리가 곧 벌점이 되고, 그건 곧 「멀리 서 있던 개체가 사람으로 몰린다」는 뜻이다.
 */
describe('봇은 제 계획대로 하면 걸리지 않는다', () => {
  const 자리 = { 모여선다: HUDDLED, 흩어져선다: SCATTERED };
  Object.entries(자리).forEach(([이름, starts]) => {
    it(`모든 판에서 다섯 개체가 정상으로 나온다 — ${이름}`, () => {
      QUICK_GAMES.forEach((g) => {
        for (let round = 0; round < 8; round += 1) {
          const t = g.make(starts);
          const records = [0, 1, 2, 3, 4].map((seat) => {
            const from = starts[seat % starts.length];
            return { who: `A-${seat}`, samples: simulate(t.plan(seat, from), t.seconds, from) };
          });
          // 이제 예외가 없다 — 갈리라고 만든 투표판을 뺐으므로(2026-09-02) 모든 판이 전원 통과여야 한다
          judgeQuick(t, records).forEach((v) => {
            expect(`${g.id}/${v.who}: ${v.grade} — ${v.reason}`).toContain('normal');
          });
        }
      });
    });
  });

  it('초시계 원이 서 있는 몸을 덮지 않는다 — 0초가 도착 시각이 되면 아무것도 안 하고 걸린다', () => {
    const clock = QUICK_GAMES.find((g) => g.id === 'clock')!;
    for (let round = 0; round < 40; round += 1) {
      const t = clock.make(SCATTERED);
      if (t.check.kind !== 'timing') continue;
      const c = t.check;
      SCATTERED.forEach((p) => expect(distance(p, c)).toBeGreaterThan(c.r));
    }
  });

  /**
   * ── 검사문 ── 이 판만 「어디에 섰는가」가 아니라 **「어디로 지나갔는가」**를 본다.
   * 옆으로 도는 길이 몇 걸음 빠른 것이 이 판의 전부라, 그 몇 걸음이 기록에 남는지를 여기서 붙잡는다.
   */
  it('문 사이로 지나면 통과, 옆으로 돌면 어긋남 — 도착 원은 같은 자리다', () => {
    const gate = { x: 0, z: 0, nx: 0, nz: 1, half: 1.3 };
    const t: QuickTrial = {
      instruction: '',
      seconds: 10,
      props: [],
      watching: '',
      stakes: 'suspect',
      check: { kind: 'through', x: 0, z: 2.8, r: 1.5, gate },
    plan: () => [],
    };
    // 문 앞(-1.6) → 문 사이(0) → 도착 원(2.8). 가운데로 곧장 지난다
    const 통과 = walk([[0, -1.6], [0, -0.5], [0, 0.5], [0, 2.6]]);
    // 기둥 밖(옆으로 3m)으로 크게 돌아 같은 원에 선다 — 마지막 자리는 통과한 몸과 같다
    const 우회 = walk([[0, -1.6], [3, -1.5], [3, 1.5], [0.2, 2.7]]);
    expect(judgeQuick(t, [{ who: '나', samples: 통과 }])[0].grade).toBe('normal');
    const 돈다 = judgeQuick(t, [{ who: '나', samples: 우회 }])[0];
    expect(돈다.grade).not.toBe('normal');
    expect(돈다.reason).toContain('옆으로 돌았다');
  });

  it('문은 지났어도 원 밖에서 끝나면 어긋남이다 — 둘 다 봐야 한다', () => {
    const gate = { x: 0, z: 0, nx: 0, nz: 1, half: 1.3 };
    const t: QuickTrial = {
      instruction: '', seconds: 10, props: [], watching: '', stakes: 'suspect',
      check: { kind: 'through', x: 0, z: 2.8, r: 1.5, gate }, plan: () => [],
    };
    const got = judgeQuick(t, [{ who: '나', samples: walk([[0, -1.6], [0, 0.5], [0, 6]]) }])[0];
    expect(got.grade).not.toBe('normal');
    expect(got.reason).toContain('원 밖');
  });

  it('아무도 문 너머에 서 있지 않다 — 지나갈 문이 등 뒤에 있으면 자리가 판정을 가른다', () => {
    const gate = QUICK_GAMES.find((g) => g.id === 'gate')!;
    let 세워진판 = 0;
    for (let round = 0; round < 60; round += 1) {
      const t = gate.make(HUDDLED);
      if (t.check.kind !== 'through') continue; // 문 세울 자리를 못 찾아 집합판으로 물러선 판이다
      세워진판 += 1;
      const g = t.check.gate;
      HUDDLED.forEach((p) => expect((p.x - g.x) * g.nx + (p.z - g.z) * g.nz).toBeLessThan(0));
    }
    expect(세워진판).toBeGreaterThan(0); // 모여 선 자리에서는 문이 실제로 서야 한다
  });

  it('봇 다섯이 문으로 지나 원에 선다 — 계획대로 걸었는데 「옆으로 돌았다」가 나오면 안 된다', () => {
    const gate = QUICK_GAMES.find((g) => g.id === 'gate')!;
    let 돌린판 = 0;
    for (let round = 0; round < 40 && 돌린판 < 12; round += 1) {
      const t = gate.make(HUDDLED);
      if (t.check.kind !== 'through') continue;
      돌린판 += 1;
      const records = [0, 1, 2, 3, 4].map((seat) => {
        const from = HUDDLED[seat % HUDDLED.length];
        return { who: `A-${seat}`, samples: simulate(t.plan(seat, from), t.seconds, from) };
      });
      judgeQuick(t, records).forEach((v) => {
        expect(`gate/${v.who}: ${v.grade} — ${v.reason}`).toContain('normal');
      });
    }
    expect(돌린판).toBeGreaterThan(0);
  });

  it('금지 구역이 서 있는 몸을 덮지 않는다 — 서 있던 자리 때문에 폐기되면 판이 아니다', () => {
    const keepout = QUICK_GAMES.find((g) => g.id === 'keepout')!;
    for (let round = 0; round < 40; round += 1) {
      const t = keepout.make(SCATTERED);
      if (t.check.kind !== 'avoid') continue; // 길을 못 찾아 부동자세로 물러선 판이다
      const c = t.check.keepOut;
      SCATTERED.forEach((p) => expect(distance(p, c)).toBeGreaterThan(c.r));
    }
  });
});

/**
 * ── 시행 중에 화면이 말해 주는 것 ── (2026-09-02 사용자: 「미니게임 할 때 매끄럽게」)
 *
 * 걷는 중에 보이는 값은 **판독과 같은 기록에서 나와야 한다**. 화면이 「원 안」이라 했는데
 * 판독이 「원 밖」이라 하면 그 판은 두 번 다시 못 믿는다 — 여기서 붙잡아 두는 것이 그 약속이다.
 */
describe('liveNote — 지금 내가 어떻게 하고 있나', () => {
  it('도착판은 원 안·밖을 판정과 같은 잣대로 말한다', () => {
    const inside = walk([[5, 5], [0.5, 0.5]]);
    const outside = walk([[5, 5], [4, 4]]);
    expect(liveNote(arriveTrial.check, inside).ok).toBe(true);
    expect(liveNote(arriveTrial.check, outside).ok).toBe(false);
    // 판독과 같은 답이어야 한다
    expect(judgeQuick(arriveTrial, [{ who: 'me', samples: inside }])[0].grade).toBe('normal');
    expect(judgeQuick(arriveTrial, [{ who: 'me', samples: outside }])[0].grade).toBe('alert');
  });

  it('점프판은 지금까지 센 횟수를 그대로 보여 준다', () => {
    const one = walk([[0, 0, 0], [0, 0, 0.4], [0, 0, 0]]);
    expect(liveNote({ kind: 'jump', times: 2 }, one).text).toContain('1 / 2');
    expect(liveNote({ kind: 'jump', times: 2 }, one).ok).toBe(false);
  });

  it('순서판은 밟은 데까지 표시하고 다음 자리를 대괄호로 가리킨다', () => {
    const check = {
      kind: 'order' as const,
      points: [
        { label: 'ㄱ', x: 0, z: 0, r: 1 },
        { label: 'ㄴ', x: 6, z: 0, r: 1 },
      ],
    };
    expect(liveNote(check, walk([[9, 9]])).text).toBe('[ㄱ] → ㄴ');
    expect(liveNote(check, walk([[9, 9], [0, 0]])).text).toBe('ㄱ ✓ → [ㄴ]');
    const done = liveNote(check, walk([[9, 9], [0, 0], [6, 0]]));
    expect(done.text).toBe('ㄱ ✓ → ㄴ ✓');
    expect(done.ok).toBe(true);
  });

  it('금지판은 한 번 밟으면 그 뒤로 계속 밟은 것으로 말한다 — 판정과 같다', () => {
    const check = { kind: 'avoid' as const, keepOut: { x: 0, z: 0, r: 2 } };
    const stepped = walk([[9, 9], [0, 0], [9, 9]]);
    expect(liveNote(check, stepped).ok).toBe(false);
    expect(liveNote(check, walk([[9, 9], [8, 8]])).ok).toBe(true);
  });

  /**
   * ★ **테는 발밑에 있다** (2026-09-03). 1인칭에서 바닥에 그린 원은 두 걸음만 떨어져도 몸에 가려
   *   안 보이고, 화면 위 작은 글자는 걷는 동안 안 읽힌다 — 그런데 이 판은 처형판이다.
   *   그래서 자리로 정해지는 신호(warn)를 낸다: 한 걸음 반 안에 들면 물들고, 밟으면 정지색이다.
   *   시각으로 정해지는 신호(tone)가 없는 유일한 처형판이라 여기만 이 길이 필요하다.
   */
  it('금지판은 테에 다가가면 화면에 신호를 낸다 — 밟기 전에 알려야 신호다', () => {
    const check = { kind: 'avoid' as const, keepOut: { x: 0, z: 0, r: 2 } };
    expect(liveNote(check, walk([[5, 0]])).warn).toBeUndefined(); // 테 밖 3m — 아직 아무 일도 없다
    expect(liveNote(check, walk([[3, 0]])).warn).toBe('ready'); // 테까지 1m — 한 걸음 반 (AVOID_WARN_M)
    expect(liveNote(check, walk([[9, 9], [0, 0]])).warn).toBe('stop'); // 밟았다
  });

  it('기록이 없으면 아무 말도 하지 않는다', () => {
    expect(liveNote(arriveTrial.check, []).text).toBe('');
  });
});

describe('zoneStates — 바닥 표식의 색', () => {
  it('순서판은 다음에 밟을 원만 next 다', () => {
    const t: QuickTrial = {
      ...arriveTrial,
      props: [
        { label: 'ㄱ', x: 0, z: 0, r: 1 },
        { label: 'ㄴ', x: 6, z: 0, r: 1 },
      ],
      check: {
        kind: 'order',
        points: [
          { label: 'ㄱ', x: 0, z: 0, r: 1 },
          { label: 'ㄴ', x: 6, z: 0, r: 1 },
        ],
      },
    };
    expect(zoneStates(t, walk([[9, 9]]))).toEqual(['next', 'idle']);
    // ㄱ 을 밟고 떠났다 — 볼일이 끝났고 다음은 ㄴ 이다
    expect(zoneStates(t, walk([[9, 9], [0, 0], [3, 0]]))).toEqual(['done', 'next']);
    // 지금 원 안에 서 있으면 그것부터 말한다. 밟은 것으로 세어졌으니 다음은 ㄴ 이다
    expect(zoneStates(t, walk([[9, 9], [0, 0]]))).toEqual(['inside', 'next']);
  });

  it('왕복판은 다시 밟아야 하는 ㄱ 을 done 으로 꺼뜨리지 않는다', () => {
    const pts = [
      { label: 'ㄱ', x: 0, z: 0, r: 1 },
      { label: 'ㄴ', x: 6, z: 0, r: 1 },
      { label: 'ㄱ', x: 0, z: 0, r: 1 },
    ];
    const t: QuickTrial = { ...arriveTrial, props: pts.slice(0, 2), check: { kind: 'order', points: pts } };
    // ㄱ→ㄴ 을 밟고 돌아가는 중 — ㄱ 이 다시 다음 자리다
    expect(zoneStates(t, walk([[9, 9], [0, 0], [6, 0], [3, 0]]))).toEqual(['next', 'done']);
  });

  it('금지 원은 밟는 순간 burn 이 되고 되돌아오지 않는다', () => {
    const t: QuickTrial = {
      ...arriveTrial,
      props: [
        { label: '금지', x: 0, z: 0, r: 2, danger: true },
        { label: '도착', x: 8, z: 0, r: 1.5 },
      ],
      check: { kind: 'avoid', keepOut: { x: 0, z: 0, r: 2 } },
    };
    expect(zoneStates(t, walk([[9, 9]]))).toEqual(['danger', 'idle']);
    expect(zoneStates(t, walk([[9, 9], [0, 0], [9, 9]]))).toEqual(['burn', 'idle']);
  });
});

/**
 * 박자 판의 신호 — **이 판의 전부가 박자다.** 「지금」이 늘 떠 있으면 그건 박자를 알려 주는 것이
 * 아니라 지우는 것이다 (2026-09-02 에 그렇게 돌고 있었다: 아직 울지 않은 신호를 미리 세고 있었다).
 */
describe('박자 판의 신호', () => {
  const beat = () => {
    for (let i = 0; i < 40; i += 1) {
      const t = QUICK_GAMES.find((g) => g.id === 'beat')!.make(HUDDLED);
      if (t.check.kind === 'beat') return t;
    }
    throw new Error('박자 판을 못 만들었다');
  };

  it('울린 신호만 센다 — 신호가 울리기 전에는 ● 가 안 찬다', () => {
    const t = beat();
    if (t.check.kind !== 'beat') throw new Error('박자 판이 아니다');
    const { lead, every, reps } = t.check;
    expect(t.hud!(lead - 0.01)).toBe('○'.repeat(reps));
    expect(t.hud!(lead + every - 0.01)).toBe('○'.repeat(reps));
    expect(t.hud!(lead + every)).toBe(`●${'○'.repeat(reps - 1)}  지금`);
    expect(t.hud!(lead + every * 2)).toBe(`●●${'○'.repeat(reps - 2)}  지금`);
    expect(t.hud!(lead + every * reps)).toBe(`${'●'.repeat(reps)}  지금`);
  });

  /**
   * 지시문이 말하는 첫 신호 시각과 **실제로 울리는 시각**이 같아야 한다.
   * 여태 지시문은 lead(2초)를 적었는데 ● 는 lead+every(3초)에 울렸다 — 그 말을 믿고 센 사람은
   * 다섯 번을 통째로 한 박 앞에서 뛰었고, 판정(평균 오차 tol 0.5초)은 그걸 그대로 어긋남으로 읽는다.
   */
  it('지시문의 「첫 신호는 n초 뒤」가 실제로 ● 가 울리는 시각이다', () => {
    const t = beat();
    if (t.check.kind !== 'beat') throw new Error('박자 판이 아니다');
    const { lead, every, reps } = t.check;
    const said = t.instruction.match(/첫 신호는 ([\d.]+)초 뒤다/)?.[1];
    expect(said).toBeDefined();
    const at = Number(said);
    // 그 시각에 첫 ● 가 차 있고, 한 틱 앞에서는 아직 비어 있다
    expect(t.hud!(at)).toBe(`●${'○'.repeat(reps - 1)}  지금`);
    expect(t.hud!(at - 0.01)).toBe('○'.repeat(reps));
    // 판정이 기다리는 첫 점프 시각과도 같다 (judgeQuick 의 lead + every·(i+1))
    expect(at).toBeCloseTo(lead + every, 5);
  });

  it('「지금」은 울린 직후에만 뜬다 — 구간 내내 켜져 있지 않다', () => {
    const t = beat();
    if (t.check.kind !== 'beat') throw new Error('박자 판이 아니다');
    const { lead, every } = t.check;
    expect(t.hud!(lead + every + 0.1)).toContain('지금');
    expect(t.hud!(lead + every + every / 2)).not.toContain('지금');
    expect(t.tone!(lead + every + 0.05)).toBe('beat');
    expect(t.tone!(lead + every + every / 2)).toBeNull();
    expect(t.tone!(lead - 0.1)).toBeNull();
  });
});

/** 정지 구간은 **예고가 있어야** 사람이 신호를 보고 설 수 있다 (판정은 REACT 만큼만 봐 준다) */
describe('빨간불 파란불의 예고', () => {
  it('정지 1초 전에 「곧 정지」가 뜨고, 구간에 들어가면 「■ 정지」다', () => {
    const t = QUICK_GAMES.find((g) => g.id === 'stopgo')!.make(HUDDLED);
    if (t.check.kind !== 'stopgo') throw new Error('정지판이 아니다');
    const [a, b] = t.check.stop[0];
    expect(t.hud!(a - 2)).toBe('▶ 이동');
    expect(t.hud!(a - 0.5)).toBe('⋯ 곧 정지');
    expect(t.tone!(a - 0.5)).toBe('ready');
    expect(t.hud!((a + b) / 2)).toBe('■ 정지');
    expect(t.tone!((a + b) / 2)).toBe('stop');
    // 구간을 나오면 정지는 풀린다 (「곧 정지」로 바로 이어질 수는 있다 — 두 구간이 가까운 판이 있다)
    expect(t.tone!(b + 0.1)).not.toBe('stop');
  });
});

/**
 * ── 빛의 벽 ── (2026-09-03)
 *
 * 다른 판의 「멈추라」는 판이 미리 적어 둔 시각이다. 이 판의 정지 구간은 **자리가 정한다** —
 * 벽이 홀을 가로질러 오고, 내 몸이 그 아래 들어간 동안만 내 구간이다. 그래서 여기서 붙잡아
 * 두는 것도 셋이다:
 *  ① 벽은 걸음보다 빠르다 — 앞질러 달아나는 길이 있으면 이 판은 멈추는 판이 아니라 달리기 판이고,
 *    그러면 걸리는 것은 틀린 사람이 아니라 겁먹은 사람이다.
 *  ② 사람 몫(REACT)만큼 늦게 서도 통과다 — 반응 시간으로 걸리면 그건 「사람이라서」 거는 것이다.
 *  ③ 그냥 걸어 지나가면 걸린다 — 안 그러면 판이 아무것도 안 재는 셈이다.
 */
describe('빛의 벽', () => {
  /** 왼쪽 벽 밖(-12)에서 오른쪽으로 오는 벽. 반두께 2.6m · 4.4m/s · 1.5초 뒤 출발 */
  const LINE: SweepLine = { x: -12, z: 0, nx: 1, nz: 0, half: 2.6, span: 24, speed: 4.4, lead: 1.5 };
  /** (0,0)에 선 몸이 덮이는 구간 — 원점에서 12m 자리라 벽이 9.4~14.6m 에 있는 동안이다 */
  const LIT_FROM = LINE.lead + (12 - LINE.half) / LINE.speed;
  const LIT_TO = LINE.lead + (12 + LINE.half) / LINE.speed;
  /** 도착 원은 벽이 오는 쪽과 **직각**으로 둔다 — x 가 그대로라 걸어도 덮이는 구간이 안 흔들린다 */
  const GOAL = { x: 0, z: 10, r: 1.6 };
  const trial = (seconds = 9): QuickTrial => ({
    instruction: '',
    seconds,
    props: [],
    watching: '',
    stakes: 'suspect',
    check: { kind: 'sweep', line: LINE, drift: 1.0, grace: REACT, x: GOAL.x, z: GOAL.z, r: GOAL.r },
    plan: () => [],
  });
  /**
   * 1초에 z 로 떠나 `stopAt` 에 서고 `goAt` 에 다시 걷는 기록 — 안 서고 가면 덮인 구간을
   * 걸어서 지난다 (0→10m 걷는 데 3.9초라 덮이는 구간 LIT_FROM~LIT_TO 를 가로지른다).
   */
  const march = (stopAt: number, goAt: number, seconds = 9): Sample[] => {
    const out: Sample[] = [];
    let z = 0;
    for (let i = 0; i <= seconds * 10; i += 1) {
      const t = +(i * 0.1).toFixed(1);
      const moving = t >= 1 && (t < stopAt || t >= goAt);
      if (moving && z < GOAL.z) z = Math.min(GOAL.z, z + SPEED * 0.1);
      out.push({ t, x: 0, z: +z.toFixed(2), y: 0 });
    }
    return out;
  };

  it('벽은 걸음보다 빠르다 — 앞질러 달아나는 길은 없다', () => {
    const t = QUICK_GAMES.find((g) => g.id === 'sweep')!.make(SCATTERED);
    if (t.check.kind !== 'sweep') throw new Error('빛의 벽 판이 아니다');
    expect(t.check.line.speed).toBeGreaterThan(SPEED);
  });

  it('갔다가 되돌아온다 — 되돌아서는 자리는 방 밖이다', () => {
    const t = QUICK_GAMES.find((g) => g.id === 'sweep')!.make(SCATTERED);
    if (t.check.kind !== 'sweep') throw new Error('빛의 벽 판이 아니다');
    const line = t.check.line;
    // 되돌아서는 자리(span)까지 가면 옆벽에서 반두께보다 멀다 — 벽 앞에 선 몸이 오래 굳지 않는다
    const turnX = line.x + line.nx * line.span;
    expect(Math.abs(turnX)).toBeGreaterThan(Math.max(-ARENA.minX, ARENA.maxX) + line.half);
    // 삼각파 — 0 에서 span 까지 갔다가 되돌아온다
    expect(sweepAt(line, 0)).toBe(0);
    expect(sweepAt(line, line.lead + line.span / line.speed)).toBeCloseTo(line.span, 5);
    expect(sweepAt(line, line.lead + (line.span * 1.5) / line.speed)).toBeCloseTo(line.span / 2, 5);
  });

  it('판이 서고 lead 초까지는 벽이 안 움직인다 — 지시문을 읽을 짬이다', () => {
    expect(sweepAt(LINE, 0)).toBe(0);
    expect(sweepAt(LINE, LINE.lead)).toBe(0);
    expect(sweepAt(LINE, LINE.lead + 1)).toBeCloseTo(LINE.speed, 5);
  });

  it('벽을 보고 REACT 뒤에 선 기록은 정상이다', () => {
    const got = judgeQuick(trial(), [{ who: '나', samples: march(LIT_FROM + REACT, LIT_TO) }]);
    expect(`${got[0].grade} — ${got[0].reason}`).toContain('normal');
  });

  it('벽이 덮은 채로 계속 걸으면 걸린다', () => {
    const got = judgeQuick(trial(), [{ who: '나', samples: march(99, 99) }])[0];
    expect(got.grade).toBe('alert');
    expect(got.reason).toContain('벽이 지나는 동안');
  });

  it('벽 앞에서 멈췄어도 원 밖에서 끝나면 어긋남이다 — 둘 다 본다', () => {
    // 덮인 뒤로 아예 안 걸었다 — 멈추기는 했으나 원까지 못 갔다
    const got = judgeQuick(trial(), [{ who: '나', samples: march(LIT_FROM + REACT, 99) }])[0];
    expect(got.grade).toBe('alert');
    expect(got.reason).toContain('원 밖');
  });

  it('덮이기 전에 화면이 먼저 말한다 — 보고 나서 설 수 있어야 신호다', () => {
    const check = trial().check;
    const at = (t: number, z = 0): Sample[] => [{ t, x: 0, z, y: 0 }];
    // 한참 전에는 아무 말도 없다 (원까지 얼마 남았다는 말뿐)
    expect(liveNote(check, at(LIT_FROM - SWEEP_WARN_S - 1)).warn).toBeUndefined();
    // 닿기 직전 — 물든다
    expect(liveNote(check, at(LIT_FROM - 0.4)).warn).toBe('ready');
    // 덮였다 — 정지색이다
    const lit = liveNote(check, at((LIT_FROM + LIT_TO) / 2));
    expect(lit.warn).toBe('stop');
    expect(lit.text).toContain('빛 안');
  });

  it('한 번 움직인 구간은 지나간 뒤에도 화면이 계속 말한다 — 이미 남은 기록이다', () => {
    const check = trial().check;
    const samples = march(99, 99).filter((s) => s.t <= LIT_TO + 1);
    expect(liveNote(check, samples).ok).toBe(false);
    expect(liveNote(check, samples).text).toContain('움직였다');
  });

  it('벽이 나를 덮는 동안만 타오른다 — 화면 색도 같은 기록에서 나온다', () => {
    const t: QuickTrial = {
      ...trial(),
      props: [
        { label: '빛의 벽', x: LINE.x, z: LINE.z, r: LINE.half, sweep: { nx: LINE.nx, nz: LINE.nz, len: 30 } },
        { label: '도착', x: 0, z: 6, r: 1.6 },
      ],
    };
    expect(zoneStates(t, [{ t: 0, x: 0, z: 0, y: 0 }])).toEqual(['danger', 'next']);
    expect(zoneStates(t, [{ t: (LIT_FROM + LIT_TO) / 2, x: 0, z: 0, y: 0 }])).toEqual(['burn', 'next']);
    expect(zoneStates(t, [{ t: 0, x: 0, z: 6, y: 0 }])).toEqual(['danger', 'inside']);
  });

  it('화면이 세우는 벽과 판정하는 벽이 같은 수다 — 자를 두 벌 두면 지나간 자리가 갈린다', () => {
    for (let round = 0; round < 8; round += 1) {
      const t = QUICK_GAMES.find((g) => g.id === 'sweep')!.make(SCATTERED);
      if (t.check.kind !== 'sweep') throw new Error('빛의 벽 판이 아니다');
      const line = t.check.line;
      const wall = t.props.find((p) => p.sweep);
      expect(wall).toBeDefined();
      expect(wall!.x).toBe(line.x);
      expect(wall!.z).toBe(line.z);
      expect(wall!.r).toBe(line.half);
      expect(wall!.sweep).toEqual({ nx: line.nx, nz: line.nz, len: ARENA.maxZ - ARENA.minZ + 8 });
      // 도착 원도 판정과 같은 자리다
      const goal = t.props.find((p) => !p.sweep)!;
      expect([goal.x, goal.z, goal.r]).toEqual([t.check.x, t.check.z, t.check.r]);
    }
  });

  it('벽 아래 든 몸은 걸어도 못 벗어난다 — 같이 달아나면 오히려 더 오래 덮인다', () => {
    /*
     * 벽 한가운데 든 순간부터 재 본다. 가만히 선 몸은 벽이 제 속도로 지나가 버리는 만큼만
     * 덮이고(half/speed), 벽과 같은 쪽으로 달아나는 몸은 그 차이(speed − SPEED)만큼 느리게
     * 벗어난다 — 달아날수록 오래 덮인다. 그래서 이 판에서 할 수 있는 것은 서는 것뿐이다.
     */
    const mid = (LIT_FROM + LIT_TO) / 2;
    const litFrom = (move: number) => {
      let lit = 0;
      for (let t = mid; t < mid + 8; t += 0.05) {
        if (!sweepLit(LINE, { x: move * (t - mid), z: 0 }, t)) return lit;
        lit += 0.05;
      }
      return lit;
    };
    expect(litFrom(0)).toBeCloseTo(LINE.half / LINE.speed, 1);
    expect(litFrom(SPEED)).toBeGreaterThan(litFrom(0) * 2);
  });
});
