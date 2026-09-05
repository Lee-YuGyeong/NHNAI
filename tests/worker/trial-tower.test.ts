/**
 * 무너지는 타워 생존 — 공유 격자(mp/tower.ts) · 서버 물리(worker/src/trial/tower/sim.ts) · 기록(stats.ts) · 봇(npc.ts) · 엔진을 고정한다.
 *
 *   ① 발판 — 무게가 한쪽에 서면 그쪽으로 기운다 · 하나는 멎고 셋은 부서진다 · 무거운 몸은 둘 몫이다
 *   ② 몸 — 기울기가 μ 를 넘으면 낮은 쪽으로 미끄러진다 · 발판이 없는 자리로 나가면 떨어지고 바닥에 닿아 눕는다
 *   ③ 밀치기 — 앞의 가까운 몸만, 질량비만큼, 미끄러운 바닥에서 더 멀리
 *   ④ 기록 — 발판 가운데에서 벗어난 거리 · 경고 뒤 반응 · 미끄러짐 방향
 *   ⑤ 봇 — 계산하는 좌석은 발판 가운데에 붙고 경고에 곧장 옮긴다 → 사람 같은 좌석보다 덜 떨어진다
 *   ⑥ 엔진 — 철거가 바깥 고리부터 경고 뒤 떨어지고, 그 위의 몸은 같이 떨어진다 · 스냅샷에 마찰계수가 없다 (P8)
 */
import { describe, expect, it } from 'vitest';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { TOWER_BODY_MASS, TOWER_N, TOWER_SLAB, TOWER_TILT_BREAK, TOWER_TOP, TOWER_WARN_MS, ringOf, slabCenter, slabIndexAt } from '../../src/world/mp/tower';
import { TowerEngine } from '../../worker/src/trial/tower/engine';
import { makeTowerBot, makeTowerProfile, stepBot } from '../../worker/src/trial/tower/npc';
import { impact, jump, makeBody, makeSlabs, respawn, shove, stepBody, stepSlab, type SlabLoad } from '../../worker/src/trial/tower/sim';
import { TowerStats } from '../../worker/src/trial/tower/stats';

const DT = 0.05;
const CENTER = Math.floor((TOWER_N * TOWER_N) / 2);

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sim — 발판', () => {
  it('무게가 +x 끝에 서면 그쪽으로 기울어 멎고(하나) · 셋이면 부서진다 · 무거운 몸은 둘 몫이다', () => {
    const one = makeSlabs()[CENTER];
    const edge = TOWER_SLAB / 2 - 0.1; // 발판 끝에 선 몸
    const load = (n: number, mass = TOWER_BODY_MASS): SlabLoad[] => Array.from({ length: n }, () => ({ dx: edge, dz: 0, mass }));
    let broke = false;
    for (let t = 0; t < 4; t += DT) broke = stepSlab(one, load(1), DT) || broke;
    expect(broke).toBe(false);
    expect(one.tx).toBeGreaterThan(0.1);
    expect(one.tx).toBeLessThan(TOWER_TILT_BREAK);
    expect(Math.abs(one.tz)).toBeLessThan(1e-6);

    const three = makeSlabs()[CENTER];
    broke = false;
    for (let t = 0; t < 4 && !broke; t += DT) broke = stepSlab(three, load(3), DT);
    expect(broke).toBe(true);

    const heavy = makeSlabs()[CENTER];
    const two = makeSlabs()[CENTER];
    for (let t = 0; t < 4; t += DT) {
      stepSlab(heavy, load(1, TOWER_BODY_MASS * 1.8), DT);
      stepSlab(two, load(2), DT);
    }
    expect(heavy.tx / two.tx).toBeGreaterThan(0.85);
  });
});

describe('sim — 몸', () => {
  it('기울기가 μ 를 넘으면 낮은 쪽으로 미끄러진다 — μ 아래면 선다', () => {
    const slabs = makeSlabs();
    const c = slabCenter(CENTER);
    slabs[CENTER].tx = 0.3; // +x 쪽이 낮다
    const hold = makeBody('a', c.x, c.z);
    for (let t = 0; t < 1; t += DT) stepBody(hold, slabs, 0, 0, 0.45, DT, t * 1000);
    expect(hold.x).toBeCloseTo(c.x, 6);
    const slip = makeBody('b', c.x, c.z);
    for (let t = 0; t < 1; t += DT) stepBody(slip, slabs, 0, 0, 0.2, DT, t * 1000);
    expect(slip.x).toBeGreaterThan(c.x + 0.1);
    expect(slip.y).toBeLessThan(TOWER_TOP); // 낮은 쪽이라 발 높이도 내려간다
  });

  it('발판이 없는 자리로 걸어 나가면 떨어지고, 바닥에 닿으면 눕고, 다시 세우면 선다', () => {
    const slabs = makeSlabs();
    const c = slabCenter(CENTER);
    slabs[CENTER + 1].state = 3; // 오른쪽 발판이 없다
    const b = makeBody('a', c.x, c.z);
    let fell = false;
    let t = 0;
    for (; t < 3000 && !fell; t += DT * 1000) fell = stepBody(b, slabs, 2.6, 0, 0.45, DT, t).fell;
    expect(fell).toBe(true);
    expect(b.stance).toBe('air');
    expect(b.falls).toBe(1);
    let landed = false;
    for (; t < 8000 && !landed; t += DT * 1000) landed = stepBody(b, slabs, 0, 0, 0.45, DT, t).landed;
    expect(landed).toBe(true);
    expect(b.stance).toBe('down');
    expect(b.y).toBe(0);
    respawn(b, slabs, CENTER);
    expect(b.stance).toBe('stand');
    expect(slabIndexAt(b.x, b.z)).toBe(CENTER);
  });

  it('밀치기 — 앞의 가까운 몸만 밀리고, 질량비만큼, 미끄러운 바닥에서 더 멀리 간다', () => {
    const slabs = makeSlabs();
    const c = slabCenter(CENTER);
    const me = makeBody('me', c.x, c.z);
    const front = makeBody('f', c.x + 0.8, c.z);
    const behind = makeBody('b', c.x - 0.8, c.z);
    const hit = shove(me, [me, front, behind], 1, 0);
    expect(hit?.id).toBe('f');
    expect(front.sx).toBeGreaterThan(3);
    expect(behind.sx).toBe(0);
    // 무거운 몸은 덜 밀린다
    const heavy = makeBody('h', c.x + 0.8, c.z, 1.8);
    shove(makeBody('m2', c.x, c.z), [heavy], 1, 0);
    expect(heavy.sx).toBeCloseTo(front.sx / 1.8, 6);
    // 같은 밀림이 미끄러운 바닥에서 더 멀리 간다 — 발판이 넓다고 치고(없어지지 않게) 1.5초 뒤 자리를 본다
    const wide = makeSlabs();
    const a = makeBody('a', c.x - 0.5, c.z);
    const s = makeBody('s', c.x - 0.5, c.z);
    a.sx = 2.0;
    s.sx = 2.0;
    for (let t = 0; t < 0.4; t += DT) {
      stepBody(a, wide, 0, 0, 0.7, DT, t * 1000);
      stepBody(s, wide, 0, 0, 0.2, DT, t * 1000);
    }
    expect(s.x).toBeGreaterThan(a.x);
  });
});

describe('sim — 점프', () => {
  it('뛰면 떠서 같은 발판에 내려앉고(착지 충격으로 발판이 기운다), 빈 자리로 뛰면 떨어진다', () => {
    const slabs = makeSlabs();
    const c = slabCenter(CENTER);
    const b = makeBody('a', c.x + 0.8, c.z);
    respawn(b, slabs, CENTER, 0.8, 0); // 발판 위에 세운다(y 가 윗면)
    expect(jump(b, 0, 0, 6.8, 0)).toBe(true);
    expect(b.stance).toBe('air');
    let down: { slab: number; speed: number } | null = null;
    let t = 0;
    for (; t < 3000 && !down; t += DT * 1000) down = stepBody(b, slabs, 0, 0, 0.45, DT, t).touchdown;
    expect(down?.slab).toBe(CENTER);
    expect(b.stance).toBe('stand');
    expect(b.jumps).toBe(1);
    expect(b.falls).toBe(0);
    const s = slabs[CENTER];
    impact(s, b.x - c.x, b.z - c.z, 75, down!.speed);
    expect(s.vx).toBeGreaterThan(0.5); // +x 쪽에 내려앉았다 → +x 쪽으로 기울기 시작

    // 달리며 빈 자리(오른쪽 발판 없음)로 뛰면 두 칸 너머까지 못 가고 떨어진다
    slabs[CENTER + 1].state = 3;
    slabs[CENTER + 2].state = 3;
    const r = makeBody('r', c.x + 0.8, c.z);
    respawn(r, slabs, CENTER, 0.8, 0);
    jump(r, 4.8, 0, 6.8, 0);
    let fell = false;
    for (t = 0; t < 4000 && !fell; t += DT * 1000) fell = stepBody(r, slabs, 0, 0, 0.45, DT, t).fell;
    expect(fell).toBe(true);
    expect(r.falls).toBe(1);
  });
});

describe('TowerStats — 기록', () => {
  it('발판 가운데에서 벗어난 거리 · 경고 뒤 반응 · 미끄러짐 방향', () => {
    const st = new TowerStats();
    for (let i = 0; i < 10; i += 1) st.tick(0.2, 1.0, 0, 2.6 * DT, DT, i * 50, [0]);
    for (let i = 0; i < 10; i += 1) st.tick(0.6, 3.0, 0, 0, DT, 500 + i * 50, [0]);
    st.warned(2000);
    st.walk(0, 0, 2100);
    st.walk(2.6, 0, 2400); // 400ms
    st.tick(0.2, 1, 1.0, 0, DT, 8000, [0]); // 에피소드 시작
    st.tick(0.7, 1, 0, 0, DT, 8050, [0]); // 끝 — 끝 쪽으로
    st.pushed();
    st.gotShoved();
    st.gotShoved();
    const r = st.result('x', 0, 60000);
    // 22틱 — 0.2 × 10 · 0.6 × 10 · 에피소드의 0.2 · 0.7
    expect(r.metrics.slabOffset).toBeCloseTo((2 + 6 + 0.9) / 22, 5);
    expect(r.metrics.centerDist).toBeCloseTo((10 + 30 + 2) / 22, 5);
    expect(r.metrics.reactionMs).toBeCloseTo(400, 5);
    expect(r.metrics.walked).toBeCloseTo(1.3, 5);
    expect(r.metrics.pushes).toBe(1);
    expect(r.metrics.shoved).toBe(2);
    expect(r.errorDirection).toEqual([1]);
    expect(r.metrics.survivalTime).toBeCloseTo(60, 5);
  });
});

describe('npc — precision 이 걸음을 가른다 (P9)', () => {
  /** 봇 하나, 서 있는 발판에 경고가 뜬다. 옮겨 갔나 · 가운데에 섰나 */
  function run(precision: number, seed: number): { moved: boolean; offset: number } {
    const rand = seeded(seed);
    const slabs = makeSlabs();
    const c = slabCenter(CENTER);
    const profile = makeTowerProfile(0, precision, rand);
    const body = makeBody('bot', c.x + 0.3, c.z);
    const bot = makeTowerBot(body, profile, rand);
    // 3초 평온 — 어디에 서나
    for (let t = 0; t < 3000; t += DT * 1000) {
      const out = stepBot(bot, slabs, [body], t, DT, rand);
      stepBody(body, slabs, out.wx, out.wz, 0.45, DT, t);
    }
    const c0 = slabCenter(body.slab);
    const offset = Math.hypot(body.x - c0.x, body.z - c0.z);
    // 경고 — 도화선 안에 옮겼나
    slabs[body.slab].state = 1;
    slabs[body.slab].at = 3000;
    const from = body.slab;
    for (let t = 3000; t < 3000 + TOWER_WARN_MS; t += DT * 1000) {
      const out = stepBot(bot, slabs, [body], t, DT, rand);
      stepBody(body, slabs, out.wx, out.wz, 0.45, DT, t);
    }
    return { moved: body.stance === 'stand' && body.slab !== from, offset };
  }

  it('계산하는 좌석은 발판 가운데에 붙고 경고에 옮겨 간다 · 사람 같은 좌석은 가운데에서 벗어나 선다', () => {
    const machine = run(1, 3);
    const human = run(0, 3);
    expect(machine.offset).toBeLessThan(0.1);
    expect(machine.moved).toBe(true);
    expect(human.offset).toBeGreaterThan(machine.offset);
  });
});

describe('TowerEngine — 철거 · 낙하 · 스냅샷', () => {
  it('경고가 뜬 발판은 도화선 뒤 떨어지고 그 위의 몸은 같이 떨어진다(trial_fell). 철거는 바깥 고리부터. 스냅샷에 마찰계수가 없다 (P8)', () => {
    const engine = new TowerEngine(seeded(11));
    const sent: S2CMessage[] = [];
    engine.start(1, ['me'], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => {} });
    const t0 = Date.now();
    const me = engine.bodyOf('me')!;
    expect(ringOf(me.slab)).toBe(1);
    // 내 발판에 경고 — 나는 가만히 서 있다(명령 없음)
    engine.warn(me.slab, t0);
    for (let i = 1; i <= Math.ceil(TOWER_WARN_MS / 50) + 2; i += 1) engine.tickAt(t0 + i * 50);
    expect(sent.some((m) => m.t === 'trial_fell' && m.id === 'me')).toBe(true);
    expect(me.stance).toBe('air');
    // 철거 차례 — 8초 뒤부터 바깥 고리(2)에 경고가 뜬다
    for (let i = 40; i <= 200; i += 1) engine.tickAt(t0 + i * 50);
    const warnedOrGone = engine.slabList().filter((s) => s.state >= 1 && ringOf(s.idx) === 2);
    expect(warnedOrGone.length).toBeGreaterThan(0);
    // 가운데 발판은 철거 차례에는 안 든다 — 다만 그 위에 오래 서 있으면 닳아 무너질 수는 있다(wear). 그래서 여기서는 철거만 본다
    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_tower' }> => m.t === 'trial_tower');
    expect(snaps.length).toBeGreaterThan(20);
    const last = snaps.at(-1)!;
    expect(last.players.map((p) => p.id).sort()).toEqual(['SUBJECT_01', 'SUBJECT_02', 'me']);
    expect(last.slabs.length).toBeLessThanOrEqual(TOWER_N * TOWER_N);
    for (const m of sent) expect(JSON.stringify(m)).not.toMatch(/grip|friction|"mu"/);
    const results = engine.results();
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.id === 'me')!.metrics.falls).toBeGreaterThanOrEqual(1);
    engine.stop();
  });

  it('발판이 전부 떨어지면 남은 시간을 기다리지 않고 그 자리에서 닫는다(finish)', () => {
    const engine = new TowerEngine(seeded(3));
    let finished = 0;
    engine.start(1, ['me'], ['SUBJECT_01'], { broadcast: () => {}, finish: () => (finished += 1) });
    const t0 = Date.now();
    for (const s of engine.slabList()) engine.warn(s.idx, t0);
    for (let i = 1; i <= Math.ceil(TOWER_WARN_MS / 50) + 3; i += 1) engine.tickAt(t0 + i * 50);
    expect(finished).toBe(1);
    expect(engine.done()).toBe(true);
    engine.stop();
  });

  it('밀치기 — 앞의 몸을 밀면 trial_hit 이 그 몸에게 가고 기록에 남는다', () => {
    const engine = new TowerEngine(seeded(5));
    const sent: S2CMessage[] = [];
    engine.start(1, ['me', 'you'], [], { broadcast: (m) => sent.push(m), finish: () => {} });
    const t0 = Date.now();
    const me = engine.bodyOf('me')!;
    const you = engine.bodyOf('you')!;
    // 같은 발판 가운데 옆에 세운다
    const c = slabCenter(CENTER);
    for (const [b, dx] of [
      [me, -0.3],
      [you, 0.4],
    ] as const) {
      b.x = c.x + dx;
      b.z = c.z;
      b.slab = CENTER;
    }
    engine.onPush('me', 1, 0, t0);
    expect(sent.some((m) => m.t === 'trial_hit' && m.id === 'you')).toBe(true);
    expect(you.sx).toBeGreaterThan(3);
    engine.tickAt(t0 + 50);
    const r = engine.results();
    expect(r.find((x) => x.id === 'me')!.metrics.pushes).toBe(1);
    expect(r.find((x) => x.id === 'you')!.metrics.shoved).toBe(1);
    expect(TOWER_SLAB).toBeGreaterThan(2);
    engine.stop();
  });
});
