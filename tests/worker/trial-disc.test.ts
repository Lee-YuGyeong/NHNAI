/**
 * 회전 원판 생존 — 서버 물리(worker/src/trial/disc/sim.ts) · 기록(stats.ts) · 봇(npc.ts) · 엔진을 고정한다.
 *
 *   ① 가만히 서 있으면 필요한 마찰이 ω²r — 마찰 한계를 넘는 반지름에서만 바깥으로 미끄러진다
 *   ② 회전 반대 방향으로 원판 속도(ωr)로 달리면 마찰이 필요 없다 (코리올리가 원심을 지운다)
 *   ③ 가장자리를 넘으면 떨어지고, 2초 뒤 기둥 근처에 다시 선다 · 기둥 안으로는 못 들어간다
 *   ④ 기록 — 걸은 거리는 원판 기준(실려 간 것은 안 센다), 회전 사건 뒤 걷기 명령 변화가 반응 시간이다
 *   ⑤ 봇 — 계산하는 좌석(p=1)은 사람 같은 좌석(p=0)보다 훨씬 덜 걷고 반지름이 덜 흔들린다
 *   ⑥ 엔진 — 스냅샷(trial_disc)에 전원의 자리와 θ·ω 가 실리고, 마찰계수는 어디에도 없다 (P8)
 */
import { describe, expect, it } from 'vitest';
import { DISC_R, DISC_RESPAWN_MS, DISC_RESPAWN_R, DISC_TOP } from '../../src/world/mp/constants';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { DiscEngine } from '../../worker/src/trial/disc/engine';
import { botSpinEvent, makeDiscBot, makeDiscProfile, stepBot } from '../../worker/src/trial/disc/npc';
import { G, MIN_R, cross, makeBody, respawn, stepBody, worldOf } from '../../worker/src/trial/disc/sim';
import { DiscStats } from '../../worker/src/trial/disc/stats';

const MU = 0.6;
const DT = 0.05;

/** 결정적 난수 — 판마다 같은 회전 스케줄 */
function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sim — 원판 위 몸', () => {
  it('가만히 서면 ω²r 가 μg 아래인 반지름에서는 안 미끄러지고, 넘는 반지름에서는 바깥으로 미끄러진다', () => {
    const omega = 1.4; // ω² = 1.96 → 한계 반지름 μg/ω² = 5.88/1.96 = 3.0m
    const inner = makeBody('a', 0, 2.0);
    const outer = makeBody('b', 0, 4.0);
    for (let t = 0; t < 2; t += DT) {
      stepBody(inner, { x: 0, z: 0 }, omega, 0, MU, DT, t * 1000);
      stepBody(outer, { x: 0, z: 0 }, omega, 0, MU, DT, t * 1000);
    }
    expect(Math.hypot(inner.px, inner.pz)).toBeCloseTo(2.0, 3);
    expect(Math.hypot(outer.px, outer.pz)).toBeGreaterThan(4.3);
    expect(outer.px).toBeGreaterThan(4.0); // 바깥(+x) 으로
  });

  it('회전 반대 방향으로 원판 속도로 달리면 필요한 마찰이 0 이다 — 마찰이 아예 없어도 버틴다', () => {
    const omega = 1.5;
    const b = makeBody('a', 0, 4.5);
    const still = stepBody(makeBody('s', 0, 4.5), { x: 0, z: 0 }, omega, 0, 0, DT, 0);
    expect(still.need).toBeCloseTo(omega * omega * 4.5, 3);
    for (let t = 0; t < 3; t += DT) {
      const t1 = cross(omega, { x: b.px, z: b.pz });
      const out = stepBody(b, { x: -t1.x, z: -t1.z }, omega, 0, 0, DT, t * 1000);
      expect(out.need).toBeLessThan(1e-6);
    }
    expect(Math.hypot(b.px, b.pz)).toBeCloseTo(4.5, 2);
    expect(Math.hypot(b.sx, b.sz)).toBe(0);
  });

  it('미끄러지는 동안 걷기 견인력이 남지 않는다 — 운동 마찰은 s 가 아니라 **실제 미끄럼 u = w + s** 를 되돌린다', () => {
    // 회전이 없는 바닥에서, +x 로 미끄러지는 중에 −x 로 걷는다. 실제 속도 u = −2.6 + 1 = −1.6 (−x 쪽)
    const b = makeBody('a', 0, 3.0);
    b.sx = 1.0;
    b.sz = 0;
    stepBody(b, { x: -2.6, z: 0 }, 0, 0, MU, DT, 0);
    // 마찰은 u 의 반대(+x)로 걸린다 → 걷는 쪽을 **거스르므로** s 가 오히려 커진다.
    // s 반대로만 걸면(옛 식) s 는 0 쪽으로 줄어 걷기가 그대로 다 먹었다 — 그래서 미끄러워도 하나도 안 무서웠다
    expect(b.sx).toBeGreaterThan(1.0);
    expect(b.sx).toBeCloseTo(1.0 + MU * 9.8 * DT, 6);
  });

  it('미끄러지면 명령대로 못 간다 — 안쪽으로 걸어도 원심이 이겨 가장자리로 밀린다', () => {
    // ω²r = 1.5²·4.5 = 10.1 > μg 5.88 — 발이 못 잡는 자리다
    const b = makeBody('a', 0, 4.5);
    for (let i = 0; i < 30 && b.on; i += 1) stepBody(b, { x: -2.6, z: 0 }, 1.5, 0, MU, DT, (i + 1) * DT * 1000);
    // 걷기가 그대로 먹었다면 1.5초 × 2.6m/s 만큼 안으로 들어와 살았을 자리다
    expect(b.on).toBe(false);
  });

  it('각가속도가 있으면 서 있어도 접선 방향으로 밀린다 (오일러 힘)', () => {
    const b = makeBody('a', 0, 3.0);
    // ω 는 아직 0, α 는 크다 — 원심은 0 이고 접선으로만 민다
    stepBody(b, { x: 0, z: 0 }, 0, 4, 0.1, DT, 0);
    expect(Math.abs(b.sz)).toBeGreaterThan(0);
    expect(Math.abs(b.sx)).toBeLessThan(1e-9);
  });

  it('가장자리를 넘으면 떨어지고, 기둥 안으로는 못 들어간다', () => {
    const b = makeBody('a', 0, DISC_R - 0.1);
    let fell = false;
    for (let t = 0; t < 1 && !fell; t += DT) fell = stepBody(b, { x: 3, z: 0 }, 0, 0, MU, DT, t * 1000).fell;
    expect(fell).toBe(true);
    expect(b.on).toBe(false);
    expect(b.falls).toBe(1);
    expect(worldOf(b, 0, { x: 0, z: 0 }).y).toBe(0);
    respawn(b);
    expect(b.on).toBe(true);
    expect(Math.hypot(b.px, b.pz)).toBeCloseTo(DISC_RESPAWN_R, 6);
    expect(worldOf(b, 0, { x: 0, z: 0 }).y).toBe(DISC_TOP);

    const c = makeBody('c', 0, 2.0);
    for (let t = 0; t < 3; t += DT) stepBody(c, { x: -2.6, z: 0 }, 0, 0, MU, DT, t * 1000);
    expect(Math.hypot(c.px, c.pz)).toBeCloseTo(MIN_R, 6);
  });
});

describe('DiscStats — 기록', () => {
  it('걸은 거리는 원판 기준이고, 회전 사건 뒤 걷기 명령이 바뀐 시각이 반응 시간이다', () => {
    const s = new DiscStats();
    for (let i = 0; i < 20; i += 1) s.tick(2.0, 0, 2.6, DT, i * 50, [0]);
    s.spinEvent(1000);
    s.walk(0, 0, 1100); // 명령 없음 → 변화 없음(처음 0 에서 0)
    s.walk(2.6, 0, 1400); // 처음 바뀜 — 400ms
    s.spinEvent(3000);
    s.walk(2.6, 0, 3100); // 같은 명령 — 반응 아님
    s.walk(-2.6, 0, 3150); // 바뀜 — 150ms
    const r = s.result('x');
    expect(r.metrics.walked).toBeCloseTo(2.6, 5);
    expect(r.metrics.reactionMs).toBeCloseTo(275, 5);
  });

  it('미끄러짐 에피소드 — 바깥으로 밀리면 +, 안쪽으로 고치면 −. 전환 창 안의 미끄러짐이 transitionError', () => {
    const s = new DiscStats();
    s.tick(2.0, 0, 0, DT, 0, [0]);
    s.tick(2.0, 1.0, 0, DT, 50, [0]); // 에피소드 시작 (창 안: 0~5000)
    s.tick(2.5, 1.0, 0, DT, 100, [0]);
    s.tick(2.6, 0, 0, DT, 150, [0]); // 끝 — 바깥으로 0.6
    s.tick(2.6, 1.0, 0, DT, 8000, [0]); // 창 밖
    s.tick(2.2, 0, 0, DT, 8050, [0]); // 끝 — 안쪽으로 0.4
    const r = s.result('x');
    expect(r.errorDirection).toEqual([1, -1]);
    expect(r.adaptationCurve.length).toBe(2);
    expect(r.metrics.transitionError).toBeCloseTo(0.1, 5);
    expect(r.metrics.slideTotal).toBeCloseTo(0.15, 5);
  });

  it('아무 사건에도 반응이 없으면 NaN — 0 이 「즉답」으로 읽히면 안 된다', () => {
    const s = new DiscStats();
    s.spinEvent(0);
    expect(Number.isNaN(s.result('x').metrics.reactionMs)).toBe(true);
  });
});

describe('npc — precision 이 걸음을 가른다 (P9)', () => {
  function run(precision: number, seed: number): { walked: number; radiusStd: number; falls: number } {
    const rand = seeded(seed);
    const profile = makeDiscProfile(0, precision, rand);
    const body = makeBody('bot', 0, profile.targetR + 0.5);
    const bot = makeDiscBot(body, profile);
    const stats = new DiscStats();
    let need = 0;
    // 회전: 0.9 → 1.5 로 올렸다가 −1.2 로 뒤집는 60초
    for (let i = 0; i < 1200; i += 1) {
      const t = i * DT;
      const omega = t < 20 ? 0.9 : t < 40 ? 1.5 : -1.2;
      const alpha = i === 400 || i === 800 ? 1.0 : 0;
      if (i === 400 || i === 800) botSpinEvent(bot, i * 50, rand);
      const out = stepBot(bot, omega, need, i * 50, DT, rand);
      const step = stepBody(body, out.w, omega, alpha, 0.6, DT, i * 50);
      need = step.need;
      if (!body.on) {
        if (i * 50 >= body.fallenUntil) respawn(body);
        continue;
      }
      stats.tick(Math.hypot(body.px, body.pz), Math.hypot(body.sx, body.sz), Math.hypot(out.w.x, out.w.z), DT, i * 50, [0, 20000, 40000]);
    }
    const r = stats.result('bot');
    return { walked: r.metrics.walked, radiusStd: r.metrics.radiusStd, falls: body.falls };
  }

  it('계산하는 좌석(p=1)은 사람 같은 좌석(p=0)보다 훨씬 덜 걷고 자리가 덜 흔들린다', () => {
    const machine = run(1, 3);
    const human = run(0, 3);
    expect(machine.walked).toBeLessThan(human.walked * 0.5);
    expect(machine.radiusStd).toBeLessThan(human.radiusStd);
    expect(machine.falls).toBe(0);
  });
});

describe('DiscEngine', () => {
  function harness() {
    const sent: S2CMessage[] = [];
    let finished = 0;
    const engine = new DiscEngine(seeded(11));
    engine.start(1, ['p1'], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => (finished += 1) });
    engine.stop(); // 실제 타이머는 안 쓴다 — tickAt 으로 돌린다
    return { engine, sent, finished: () => finished };
  }

  it('스냅샷(trial_disc)에 전원의 자리 · θ · ω 가 실리고, 와이어 어디에도 마찰계수가 없다 (P8)', () => {
    const { engine, sent } = harness();
    const t0 = Date.now();
    for (let i = 1; i <= 10; i += 1) engine.tickAt(t0 + i * 50);
    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_disc' }> => m.t === 'trial_disc');
    expect(snaps.length).toBeGreaterThanOrEqual(4);
    const last = snaps[snaps.length - 1];
    expect(last.players.map((p) => p.id).sort()).toEqual(['SUBJECT_01', 'SUBJECT_02', 'p1']);
    for (const p of last.players) expect(p.y).toBe(DISC_TOP);
    // 사람(명령 없음)은 출발 고리(2.4m)에 그대로 실려 돈다 — 봇은 제 목표 반지름으로 걸어갔을 수 있다
    const me = last.players.find((p) => p.id === 'p1')!;
    expect(Math.hypot(me.x - 0, me.z + 1.5)).toBeCloseTo(DISC_RESPAWN_R, 1);
    expect(typeof last.theta).toBe('number');
    expect(typeof last.omega).toBe('number');
    const wire = JSON.stringify(sent);
    // 키 이름으로 본다 — 값('0.35')으로 찾으면 좌표에 우연히 찍힐 때 시각에 따라 실패한다
    expect(wire).not.toMatch(/"(grip|mu|friction|condition)"/);
  });

  it('사람의 걷기 명령이 자리를 옮기고, 가장자리를 넘으면 trial_fell 이 나가고 2초 뒤 다시 선다', () => {
    const { engine, sent } = harness();
    const t0 = Date.now();
    // 바깥(원판 좌표 +x 쪽)으로 계속 달린다 — 초기 자리는 각도 0 이라 월드에서도 +x
    let now = t0;
    for (let i = 1; i <= 60; i += 1) {
      now = t0 + i * 50;
      const b = engine.bodyOf('p1')!;
      const r = Math.hypot(b.px, b.pz);
      const th = engine.spinState().theta;
      // 월드 기준 「바깥」 방향 명령
      const c = Math.cos(th);
      const s = Math.sin(th);
      const ox = (b.px / r) * c + (b.pz / r) * s;
      const oz = -(b.px / r) * s + (b.pz / r) * c;
      engine.onWalk('p1', ox * 4.8, oz * 4.8, now);
      engine.tickAt(now);
    }
    const fell = sent.find((m) => m.t === 'trial_fell');
    expect(fell).toBeDefined();
    const b = engine.bodyOf('p1')!;
    expect(b.falls).toBeGreaterThanOrEqual(1);
    // 떨어진 동안은 바닥(y=0), 다시 서면 원판 위
    if (!b.on) {
      for (let i = 1; i <= Math.ceil(DISC_RESPAWN_MS / 50) + 2; i += 1) {
        now += 50;
        engine.onWalk('p1', 0, 0, now);
        engine.tickAt(now);
      }
    }
    expect(engine.bodyOf('p1')!.on).toBe(true);
  });

  it('1분이 차면 스스로 끝나고, 기록에 이동거리 · 낙하 · 반지름 편차가 남는다', () => {
    const { engine, sent, finished } = harness();
    const t0 = Date.now();
    let now = t0;
    for (let i = 1; now - t0 < 61_000; i += 1) {
      now = t0 + i * 50;
      engine.tickAt(now);
      if (finished()) break;
    }
    expect(finished()).toBe(1);
    expect(engine.done()).toBe(true);
    const results = engine.results();
    expect(results.map((r) => r.id).sort()).toEqual(['SUBJECT_01', 'SUBJECT_02', 'p1']);
    for (const r of results) {
      expect(Number.isFinite(r.metrics.walked)).toBe(true);
      expect(Number.isFinite(r.metrics.falls)).toBe(true);
      expect(Number.isFinite(r.metrics.radiusStd)).toBe(true);
    }
    // 사람(p1)은 명령이 없어 걷지 않았다 — 실려 간 거리는 안 센다
    expect(results.find((r) => r.id === 'p1')!.metrics.walked).toBe(0);
    // 마찰 상수 자체는 결과에도 없다
    expect(JSON.stringify(results)).not.toMatch(/grip/);
    void sent;
    void G;
  });
});

describe('몸 — 무거운 군인은 같은 바닥에서 더 미끄러진다 (2026-09-05 사용자)', () => {
  it('마찰 배율 0.7 이면 같은 반지름·각속도에서 먼저, 더 멀리 바깥으로 밀린다', () => {
    const omega = 1.25; // ω² = 1.5625 → 기준 몸의 한계 반지름 5.88/1.5625 = 3.76m, 무거운 몸은 4.116/1.5625 = 2.63m
    const fit = makeBody('fit', 0, 3.2);
    const heavy = makeBody('heavy', 0, 3.2);
    for (let t = 0; t < 2; t += DT) {
      stepBody(fit, { x: 0, z: 0 }, omega, 0, MU, DT, t * 1000);
      stepBody(heavy, { x: 0, z: 0 }, omega, 0, MU * 0.7, DT, t * 1000);
    }
    expect(Math.hypot(fit.px, fit.pz)).toBeCloseTo(3.2, 3);
    expect(Math.hypot(heavy.px, heavy.pz)).toBeGreaterThan(3.5);
  });

  it('엔진은 ctx.bodyOf 로 몸을 물어 무거운 몸의 μ 를 깎는다 — 같은 자리에서 무거운 쪽이 먼저 떨어진다', () => {
    const sent: S2CMessage[] = [];
    const bodies: Record<string, 'sol_fit_m' | 'sol_heavy_m'> = { fit: 'sol_fit_m', heavy: 'sol_heavy_m' };
    const engine = new DiscEngine(seeded(3));
    engine.start(1, ['fit', 'heavy'], [], { broadcast: (m) => sent.push(m), finish: () => undefined, bodyOf: (id) => bodies[id] });
    engine.stop();
    // 둘을 같은 반지름에 세운다 — 출발 각도만 다르다
    for (const id of ['fit', 'heavy']) {
      const b = engine.bodyOf(id)!;
      const a = Math.atan2(b.pz, b.px);
      b.px = Math.cos(a) * 4.6;
      b.pz = Math.sin(a) * 4.6;
    }
    const t0 = Date.now();
    for (let i = 1; i <= 400; i++) engine.tickAt(t0 + i * 50);
    const fell = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_fell' }> => m.t === 'trial_fell').map((m) => m.id);
    expect(fell.length).toBeGreaterThan(0);
    expect(fell[0]).toBe('heavy');
  });
});
