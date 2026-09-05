/**
 * 회전 봉 넘기 — 서버 물리(worker/src/trial/bar/sim.ts) · 기록(stats.ts) · 봇(npc.ts) · 엔진을 고정한다.
 *
 *   ① 발밑 μ 가 견인 상한이다 — 같은 명령이라도 미끄러운 바닥에서는 늦게 붙고 늦게 선다
 *   ② 공중에서는 발이 없다 — 이륙 순간의 속도가 얼어붙고, 명령을 바꿔도 안 먹는다
 *   ③ 점프 포물선 — 기준 몸의 정점 ≈ 0.67m(BAR_JUMP_K 반영), 봉 높이(0.36) 위 체공 창이 넉넉하다
 *   ④ 스침 검출 — 봉이 몸의 각도를 지나는 틱에서만 잡히고, ±π 접힘은 크로싱이 아니다
 *   ⑤ 맞으면 봉이 쓸어 가는 쪽으로 밀리고, 미끄러운 바닥에서 더 멀리 간다 · 가장자리 밖은 낙하 → 제자리 부활
 *   ⑥ 엔진 — 뛰어넘으면 안 맞고, 서 있으면 trial_hit. 스냅샷(trial_bar)에 θ·ω·전원이 실리고 마찰계수는 어디에도 없다 (P8)
 *   ⑦ 봇 — 기계 좌석(precision 1)은 봉을 넘는다. 점프는 사람과 같은 통로다 (P9)
 */
import { describe, expect, it } from 'vitest';
import { BAR_DOWN_MS, BAR_HEIGHT, BAR_JUMP_K, BAR_JUMP_SCALE, BAR_OMEGA_MAX, BAR_R, BAR_RESPAWN_MS, BAR_RESPAWN_R, JUMP_SPEED } from '../../src/world/mp/constants';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { BarEngine } from '../../worker/src/trial/bar/engine';
import { G, clampWalk, crossed, jump, knockDown, makeBarBody, makeSpin, relOf, respawn, stepBarBody, stepSpin, timeToCross, wrap } from '../../worker/src/trial/bar/sim';
import { BarStats } from '../../worker/src/trial/bar/stats';

const DT = 0.05;
const V0 = JUMP_SPEED * BAR_JUMP_SCALE * BAR_JUMP_K;

/** 결정적 난수 — 판마다 같은 배치 */
function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sim — 무대 위 몸', () => {
  it('발밑 μ 가 견인 상한이다 — 미끄러운 바닥에서는 같은 명령에 늦게 붙는다', () => {
    const grip = makeBarBody('a', 0, V0, 3.2);
    const ice = makeBarBody('b', 0, V0, 3.2);
    grip.wx = 2.6;
    ice.wx = 2.6;
    for (let i = 0; i < 8; i += 1) {
      // 정수 루프 — t += 0.05 는 부동소수 누적으로 한 번 더 돈다
      stepBarBody(grip, 0.85, DT, i * 50);
      stepBarBody(ice, 0.3, DT, i * 50);
    }
    expect(grip.vx).toBeCloseTo(2.6, 3); // 0.85·9.8 = 8.3 m/s² — 0.31초면 다 붙는다
    expect(ice.vx).toBeCloseTo(0.3 * G * 0.4, 3); // 0.4초 내내 μg 로만 — 1.18
  });

  it('공중에서는 속도가 얼어붙는다 — 이륙 뒤 명령을 꺾어도 궤도가 안 바뀐다', () => {
    const b = makeBarBody('a', 0, V0, 3.2);
    b.wx = 2.6;
    // 0.5초만 — 1초를 걸으면 가장자리(5.5)까지 가서 점프하다 정말로 떨어진다
    for (let i = 0; i < 10; i += 1) stepBarBody(b, 0.85, DT, i * 50);
    expect(b.vx).toBeCloseTo(2.6, 3);
    expect(jump(b, 1000)).toBe(true);
    b.wx = -2.6; // 공중에서 반대로 민다
    stepBarBody(b, 0.85, DT, 1050);
    expect(b.vx).toBeCloseTo(2.6, 3); // 그대로다
    expect(b.y).toBeGreaterThan(0);
  });

  it('점프 포물선 — 정점 ≈ v0²/2g, 봉 높이 위 체공 창이 넉넉하다', () => {
    const b = makeBarBody('a', 0, V0, 3.2);
    expect(jump(b, 0)).toBe(true);
    expect(jump(b, 10)).toBe(false); // 공중에서는 또 못 뛴다
    let apex = 0;
    let above = 0;
    for (let t = DT; t < 1.2; t += DT) {
      stepBarBody(b, 0.85, DT, t * 1000);
      apex = Math.max(apex, b.y);
      if (b.y > BAR_HEIGHT) above += DT;
    }
    // 이상적 정점은 v0²/2g ≈ 0.67 (BAR_JUMP_K 반영) — 50ms 오일러 적분은 그보다 한 발짝(≈ v0·dt/2) 아래에 선다
    expect(apex).toBeGreaterThan(0.5);
    expect(apex).toBeLessThan((V0 * V0) / (2 * G) + 0.01);
    expect(above).toBeGreaterThan(0.4); // 기준 몸도 봉 위에 0.4초 넘게 떠 있다
    expect(b.y).toBe(0); // 내려와 섰다
  });

  it('스침 검출 — 봉이 몸의 각도를 지나는 순간만, ±π 접힘은 아니다', () => {
    const b = { x: 3.2, z: 0 }; // 몸의 각도 0
    const before = relOf(b, -0.1); // 봉이 조금 못 미쳤다 (ω>0 이면 rel 이 줄며 0 으로 온다)
    const after = relOf(b, 0.1);
    expect(crossed(before, after)).toBe(true);
    expect(crossed(Number.NaN, after)).toBe(false); // 막 선 몸은 다음 틱부터
    expect(crossed(wrap(Math.PI - 0.02), wrap(Math.PI + 0.02))).toBe(false); // 반대편 접힘
    // 봉이 닿기까지 — 방향을 따라 양수다
    expect(timeToCross(0.9, 0.9)).toBeCloseTo(1, 5);
    expect(timeToCross(-0.9, -0.9)).toBeCloseTo(1, 5);
    expect(timeToCross(-0.5, 0.9)).toBeCloseTo((2 * Math.PI - 0.5) / 0.9, 5);
    expect(timeToCross(0.5, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('맞으면 접선으로 밀린다 — 미끄러운 바닥이 더 멀리 보내고, 가장자리 밖은 낙하 → 부활', () => {
    const roll = (mu: number): number => {
      const b = makeBarBody('a', 0, V0, 4.0); // (4, 0) — 접선은 −z 쪽 (ω > 0)
      knockDown(b, 1.0, 2.6, BAR_DOWN_MS, 0);
      expect(b.down).toBe(true);
      for (let t = DT; t < 2; t += DT) stepBarBody(b, mu, DT, t * 1000);
      return Math.abs(b.z);
    };
    expect(roll(0.3)).toBeGreaterThan(roll(1.15) + 0.5);

    // 가장자리 — 몸 중심이 반지름을 넘으면 떨어지고, 시간이 지나면 같은 각도에 다시 선다
    const b = makeBarBody('b', 0, V0, BAR_R - 0.05);
    b.vx = 3;
    const out = stepBarBody(b, 1.15, DT, 1000);
    expect(out.fell).toBe(true);
    expect(b.on).toBe(false);
    expect(b.fallenUntil).toBe(1000 + BAR_RESPAWN_MS);
    respawn(b);
    expect(b.on).toBe(true);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(BAR_RESPAWN_R, 5);
    expect(Number.isNaN(b.prevRel)).toBe(true); // 크로싱 없이 상대각부터 다시 잰다
  });

  it('걷기 명령은 상한으로 잘린다 — 위조돼도 빨리 걷기 이상이 안 된다', () => {
    const w = clampWalk(100, 0, 4.8);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(4.8, 5);
    expect(clampWalk(Number.NaN, 3, 4.8)).toEqual({ x: 0, z: 0 });
  });

  it('봉의 회전 — 목표를 무작위로 뽑아 램프해 가고, 빨라졌다 느려졌다 방향도 뒤집힌다', () => {
    const rand = seeded(9);
    const s = makeSpin(0, rand);
    const seen: number[] = [];
    let retargets = 0;
    for (let i = 1; i <= 1200; i += 1) {
      // 60초 — 유지가 최대 4초쯤이라 목표가 여러 번 새로 뽑힌다
      const { changed } = stepSpin(s, i * 50, DT, rand);
      if (changed !== 0) retargets += 1;
      seen.push(s.omega);
    }
    expect(retargets).toBeGreaterThan(5);
    expect(Math.max(...seen.map(Math.abs))).toBeLessThanOrEqual(BAR_OMEGA_MAX + 1e-9);
    expect(Math.max(...seen)).toBeGreaterThan(0.5); // 한 번은 이쪽으로
    expect(Math.min(...seen)).toBeLessThan(-0.5); // 한 번은 저쪽으로 — 왔다갔다
  });
});

describe('stats — 기록', () => {
  it('전환 창 안의 스침 오차만 transitionError 에 쌓인다', () => {
    const st = new BarStats();
    const starts = [0, 20_000, 40_000];
    st.sweep(false, 0.1, 1, 3000, starts); // 1구간 전환 창 안
    st.sweep(false, 0.2, -1, 10_000, starts); // 창 밖
    st.sweep(true, 1.0, -1, 21_000, starts); // 2구간 전환 창 안 — 맞았다
    const r = st.result('a');
    expect(r.metrics.hits).toBe(1);
    expect(r.metrics.clears).toBe(2);
    expect(r.transitionError).toBeCloseTo(1.1, 5);
    expect(r.errorDirection).toEqual([1, -1, -1]);
    expect(r.metrics.clearRate).toBeCloseTo(2 / 3, 5);
  });
});

describe('engine — 판정과 스냅샷', () => {
  function collect(): { msgs: S2CMessage[]; ctx: { broadcast: (m: S2CMessage) => void; finish: () => void } } {
    const msgs: S2CMessage[] = [];
    return { msgs, ctx: { broadcast: (m) => msgs.push(m), finish: () => {} } };
  }

  it('서 있으면 봉에 맞고(trial_hit · 눕기), 제때 뛰면 안 맞는다', () => {
    const run = (jumpWhenClose: boolean): { hits: number; body: ReturnType<BarEngine['bodyOf']> } => {
      const e = new BarEngine(seeded(3));
      const { msgs, ctx } = collect();
      const t0 = Date.now();
      e.start(1, ['a'], [], ctx);
      e.stop(); // 진짜 타이머는 끄고 tickAt 으로 돈다
      for (let k = 1; k <= 200; k += 1) {
        const now = t0 + k * 50;
        e.tickAt(now);
        const b = e.bodyOf('a')!;
        const spin = e.spinState();
        if (jumpWhenClose && b.on && !b.down && b.y === 0) {
          const t = timeToCross(relOf(b, spin.theta), spin.omega);
          if (t <= b.v0 / G) e.onJump('a', now); // 체공의 절반 앞 — 스침이 한가운데 온다
        }
      }
      return { hits: msgs.filter((m) => m.t === 'trial_hit' && m.id === 'a').length, body: e.bodyOf('a') };
    };
    const still = run(false);
    expect(still.hits).toBeGreaterThan(0); // 10초면 봉이 적어도 한 번 온다
    const jumper = run(true);
    expect(jumper.hits).toBe(0);
    expect(jumper.body!.jumps).toBeGreaterThan(0);
  });

  it('스냅샷(trial_bar)에 θ·ω 와 전원이 실리고, 마찰계수는 어떤 메시지에도 없다 (P8)', () => {
    const e = new BarEngine(seeded(5));
    const { msgs, ctx } = collect();
    const t0 = Date.now();
    e.start(1, ['a'], ['SUBJECT_01'], ctx, { SUBJECT_01: { precision: 1 } });
    e.stop();
    for (let k = 1; k <= 60; k += 1) e.tickAt(t0 + k * 50);
    const snaps = msgs.filter((m): m is Extract<S2CMessage, { t: 'trial_bar' }> => m.t === 'trial_bar');
    expect(snaps.length).toBeGreaterThan(20);
    const last = snaps.at(-1)!;
    expect(Math.max(...snaps.map((s) => Math.abs(s.omega)))).toBeGreaterThan(0.5); // 램프가 붙었다 (목표는 무작위로 다시 뽑힌다)
    expect(last.players.map((p) => p.id).sort()).toEqual(['SUBJECT_01', 'a']);
    expect(JSON.stringify(msgs)).not.toContain('grip'); // μ 는 어디에도 안 실린다
  });

  it('기계 좌석(precision 1)은 봉을 넘는다 — 점프는 사람과 같은 통로다 (P9)', () => {
    const e = new BarEngine(seeded(11));
    const { msgs, ctx } = collect();
    const t0 = Date.now();
    e.start(1, [], ['SUBJECT_01'], ctx, { SUBJECT_01: { precision: 1 } });
    e.stop();
    for (let k = 1; k <= 300; k += 1) e.tickAt(t0 + k * 50); // 15초 — 스침 두어 번
    const bot = e.bodyOf('SUBJECT_01')!;
    expect(bot.jumps).toBeGreaterThan(0);
    expect(msgs.filter((m) => m.t === 'trial_hit').length).toBe(0);
    expect(msgs.filter((m) => m.t === 'trial_fell').length).toBe(0);
  });

  it('봉이 멀리 있는데 뛰면 헛점프로 남는다', () => {
    const e = new BarEngine(seeded(3));
    const { ctx } = collect();
    const t0 = Date.now();
    e.start(1, ['a'], [], ctx);
    e.stop();
    e.tickAt(t0 + 50);
    // 시작 배치는 봉에서 −1.2rad — 램프 직후라 봉이 닿기까지 멀다
    e.onJump('a', t0 + 60);
    const r = e.results().find((p) => p.id === 'a')!;
    expect(r.metrics.unnecessaryJumps).toBe(1);
    expect(r.metrics.jumps).toBe(1);
  });
});
