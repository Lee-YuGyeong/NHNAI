/**
 * 무게 중심 다리 — 서버 물리(worker/src/trial/seesaw/sim.ts) · 기록(stats.ts) · 봇(npc.ts) · 엔진을 고정한다.
 *
 *   ① 판자 — 무게가 +u 쪽에 몰리면 그쪽이 내려간다(φ 감소). 양쪽에 같은 토크면 수평을 지킨다. 무거운 몸은 그만큼 더 기울인다
 *   ② 판자 — 상한에 닿으면 멈춤쇠가 받고, 세게 닿으면 들썩임(jolt)이 난다
 *   ③ 몸 — tan φ ≤ μ 면 발이 잡고, 넘으면 낮은 쪽으로 미끄러진다. 미끄러지는 동안 걷기 견인력이 남지 않는다
 *   ④ 몸 — 끝을 넘으면 떨어지고 축 옆에 다시 선다 · 폭 방향은 난간이 막는다
 *   ⑤ 기록 — 높은 쪽에 서 있던 비율, 사건 뒤 걷기 변화가 반응 시간
 *   ⑥ 봇 — 계산하는 좌석(p=1)은 사람 같은 좌석(p=0)보다 덜 걷고 판을 더 수평으로 지킨다
 *   ⑦ 엔진 — 스냅샷(trial_seesaw)에 전원의 자리와 φ·ω 가 실리고, 마찰계수는 어디에도 없다 (P8)
 */
import { describe, expect, it } from 'vitest';
import { SEESAW_HALF, SEESAW_HALF_W, SEESAW_RESPAWN_U, SEESAW_TILT_MAX } from '../../src/world/mp/constants';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { SeesawEngine } from '../../worker/src/trial/seesaw/engine';
import { makeSeesawBot, makeSeesawProfile, stepBot } from '../../worker/src/trial/seesaw/npc';
import { BODY_R, makeBody, makePlank, respawn, stepBody, stepPlank, torqueOf, type Load } from '../../worker/src/trial/seesaw/sim';
import { SeesawStats } from '../../worker/src/trial/seesaw/stats';

const DT = 0.05;

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sim — 판자', () => {
  it('무게가 +u 쪽에 몰리면 그쪽이 내려간다(φ 감소), 양쫂에 같은 토크면 수평', () => {
    const p = makePlank();
    for (let t = 0; t < 3; t += DT) stepPlank(p, [{ u: 5, mass: 75 }], DT);
    expect(p.phi).toBeLessThan(-0.05);

    const q = makePlank();
    for (let t = 0; t < 3; t += DT) stepPlank(q, [{ u: 5, mass: 75 }, { u: -5, mass: 75 }], DT);
    expect(Math.abs(q.phi)).toBeLessThan(1e-9);
    expect(torqueOf([{ u: 3, mass: 100 }], 0)).toBeCloseTo(-9.8 * 300, 6);
  });

  it('무거운 몸(1.8배)은 같은 자리에서 보통 몸 둘에 가깝게 기울인다', () => {
    const heavy = makePlank();
    const two = makePlank();
    for (let t = 0; t < 2; t += DT) {
      stepPlank(heavy, [{ u: 4, mass: 75 * 1.8 }], DT);
      stepPlank(two, [{ u: 4, mass: 75 }, { u: 4, mass: 75 }], DT);
    }
    expect(heavy.phi).toBeLessThan(0);
    expect(heavy.phi / two.phi).toBeGreaterThan(0.85);
  });

  it('상한에 닿으면 멈춤쇠가 받고, 세게 닿으면 들썩임이 난다', () => {
    const p = makePlank();
    let jolt = 0;
    for (let t = 0; t < 10; t += DT) {
      const out = stepPlank(p, [{ u: 6, mass: 300 }], DT);
      if (out.jolt !== 0) jolt = out.jolt;
      expect(Math.abs(p.phi)).toBeLessThanOrEqual(SEESAW_TILT_MAX + 1e-9);
    }
    expect(p.phi).toBeCloseTo(-SEESAW_TILT_MAX, 6);
    // −φ 상한에 닿았다 → 낮은 쪽은 +u → 들썩임은 +u 로
    expect(jolt).toBeGreaterThan(0);
  });
});

describe('sim — 경사면 위 몸', () => {
  it('tan φ ≤ μ 면 발이 잡고, 넘으면 낮은 쪽으로 미끄러진다', () => {
    const mu = 0.3; // tan⁻¹ 0.3 = 16.7°
    const hold = makeBody('a', 3);
    for (let t = 0; t < 2; t += DT) stepBody(hold, 0, 0, 0.2, mu, DT, t * 1000); // 11.5°
    expect(hold.u).toBeCloseTo(3, 6);
    expect(hold.s).toBe(0);

    const slip = makeBody('b', 3);
    for (let t = 0; t < 2; t += DT) stepBody(slip, 0, 0, 0.35, mu, DT, t * 1000); // 20°
    expect(slip.s).toBeLessThan(0); // +φ 면 +u 끝이 높다 → −u 쪽으로
    expect(slip.u).toBeLessThan(2.9);
  });

  it('미끄러지는 동안 걷기 견인력이 남지 않는다 — 운동 마찰은 실제 속도(w + s)의 반대로 걸린다', () => {
    const b = makeBody('a', 0);
    b.s = -1.0; // −u 로 미끄러지는 중
    // 수평 바닥에서 +u 로 2.6 걷는다 → 실제 속도 +1.6 → 마찰은 −u 로 → s 가 더 음수
    stepBody(b, 2.6, 0, 0, 0.5, DT, 0);
    expect(b.s).toBeCloseTo(-1.0 - 0.5 * 9.8 * DT, 6);
  });

  it('끝을 넘으면 떨어지고 축 옆에 다시 선다 · 폭 방향은 난간이 막는다', () => {
    const b = makeBody('a', SEESAW_HALF - 0.2);
    let fell = false;
    for (let t = 0; t < 1 && !fell; t += DT) fell = stepBody(b, 2.6, 0, 0, 0.5, DT, t * 1000).fell;
    expect(fell).toBe(true);
    expect(b.on).toBe(false);
    expect(b.falls).toBe(1);
    respawn(b);
    expect(b.on).toBe(true);
    expect(b.u).toBeCloseTo(SEESAW_RESPAWN_U, 6);

    const c = makeBody('c', 0);
    for (let t = 0; t < 3; t += DT) stepBody(c, 0, 2.6, 0, 0.5, DT, t * 1000);
    expect(c.v).toBeCloseTo(SEESAW_HALF_W - BODY_R, 6);
    expect(c.on).toBe(true);
  });
});

describe('SeesawStats — 기록', () => {
  it('기울었을 때 높은 쪽에 서 있던 비율 · 사건 뒤 걷기 변화가 반응 시간', () => {
    const s = new SeesawStats();
    for (let i = 0; i < 10; i += 1) s.tick(3, 0.1, 0, 0, DT, i * 50, [0]); // +φ, +u → 높은 쪽
    for (let i = 0; i < 10; i += 1) s.tick(-3, 0.1, 0, 0, DT, 500 + i * 50, [0]); // 낮은 쪽
    for (let i = 0; i < 10; i += 1) s.tick(-3, 0.0, 0, 2.6, DT, 1000 + i * 50, [0]); // 수평 — 안 센다
    s.loadEvent(2000);
    s.walk(0, 0, 2100);
    s.walk(0, 2.6, 2400); // 400ms
    const r = s.result('x');
    expect(r.metrics.counterRate).toBeCloseTo(0.5, 6);
    expect(r.metrics.walked).toBeCloseTo(2.6 * 0.5, 5);
    expect(r.metrics.reactionMs).toBeCloseTo(400, 5);
    expect(r.metrics.meanLever).toBeCloseTo(3, 6);
  });

  it('미끄러짐 에피소드 — 낮은 쪽으로 밀리면 +, 높은 쪽으로 고치면 −', () => {
    const s = new SeesawStats();
    s.tick(2.0, 0.3, 0, 0, DT, 0, [0]);
    s.tick(2.0, 0.3, 1.0, 0, DT, 50, [0]); // 시작 (+φ: 낮은 쪽은 −u)
    s.tick(1.5, 0.3, 0, 0, DT, 100, [0]); // 끝 — −u 로 0.5 밀렸다 → +
    s.tick(1.5, 0.3, 1.0, 0, DT, 8000, [0]);
    s.tick(2.2, 0.3, 0, 0, DT, 8050, [0]); // 끝 — +u 로 고쳤다 → −
    const r = s.result('x');
    expect(r.errorDirection).toEqual([1, -1]);
    expect(r.metrics.transitionError).toBeCloseTo(0.05, 5);
  });
});

describe('npc — precision 이 걸음을 가른다 (P9)', () => {
  /** 봇 하나와 상자 하나 — 3초마다 상자가 다른 쪽에 놓인다. 봇이 판을 얼마나 수평으로 지키고 얼마나 걸었나 */
  function run(precision: number, seed: number): { walked: number; tiltAbs: number } {
    const rand = seeded(seed);
    const profile = makeSeesawProfile(0, precision, rand);
    const body = makeBody('bot', 1, 0, 75);
    const bot = makeSeesawBot(body, profile);
    const plank = makePlank();
    let walked = 0;
    let tiltAbs = 0;
    let n = 0;
    for (let ms = 0; ms < 30000; ms += DT * 1000) {
      const side = Math.floor(ms / 6000) % 2 === 0 ? 1 : -1;
      const crate: Load = { u: side * 4, mass: 120 };
      const loads: Load[] = body.on ? [crate, { u: body.u, mass: body.mass }] : [crate];
      const out = stepPlank(plank, loads, DT);
      const w = stepBot(bot, plank.phi, plank.omega, [crate], ms, DT, rand);
      const res = stepBody(body, w.wu, 0, plank.phi, 0.5, DT, ms, out.jolt);
      walked += Math.abs(res.wu) * DT;
      tiltAbs += Math.abs(plank.phi);
      n += 1;
    }
    return { walked, tiltAbs: tiltAbs / n };
  }

  it('계산하는 좌석은 판을 더 수평으로 지키고 덜 걷는다', () => {
    const machine = run(1, 3);
    const human = run(0, 3);
    expect(machine.tiltAbs).toBeLessThan(human.tiltAbs);
    expect(machine.walked).toBeLessThan(human.walked);
  });

  it('계산하는 좌석은 상자를 지우는 자리로 간다 — 상자 120kg·4m ↔ 몸 75kg·6.4m', () => {
    const profile = makeSeesawProfile(0, 1);
    const body = makeBody('bot', 0, 0, 75);
    const bot = makeSeesawBot(body, profile);
    for (let ms = 0; ms < 5000; ms += DT * 1000) {
      const w = stepBot(bot, 0, 0, [{ u: 4, mass: 120 }], ms, DT);
      stepBody(body, w.wu, 0, 0, 0.5, DT, ms);
    }
    expect(body.u).toBeCloseTo(-6.4, 1);
  });
});

describe('SeesawEngine — 스냅샷', () => {
  it('trial_seesaw 에 전원의 자리와 φ·ω · 상자가 실리고, 마찰계수는 어디에도 없다 (P8)', () => {
    const engine = new SeesawEngine(seeded(11));
    const sent: S2CMessage[] = [];
    engine.start(1, ['me'], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => {} });
    const t0 = Date.now();
    engine.onWalk('me', 0, 2.6, t0);
    for (let i = 1; i <= 200; i += 1) engine.tickAt(t0 + i * 50); // 10초 — 상자가 적어도 하나 내려온다
    engine.stop();
    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_seesaw' }> => m.t === 'trial_seesaw');
    expect(snaps.length).toBeGreaterThan(50);
    const last = snaps.at(-1)!;
    expect(last.players.map((p) => p.id).sort()).toEqual(['SUBJECT_01', 'SUBJECT_02', 'me']);
    expect(snaps.some((s) => s.crates.length > 0)).toBe(true);
    expect(typeof last.phi).toBe('number');
    expect(typeof last.omega).toBe('number');
    // 사람은 +z(+u) 로 걷고 있었다 — 서버가 적분해 자리가 움직였다
    const me = last.players.find((p) => p.id === 'me')!;
    expect(me.u).toBeGreaterThan(1.2);
    for (const m of sent) {
      const json = JSON.stringify(m);
      expect(json).not.toMatch(/grip|friction|"mu"/);
    }
    const results = engine.results();
    expect(results).toHaveLength(3);
    for (const r of results) expect(Number.isFinite(r.metrics.walked)).toBe(true);
  });
});
