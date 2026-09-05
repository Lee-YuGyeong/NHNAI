/**
 * 폭발 충격파 피하기 — 공유 모양(mp/blast.ts) · 서버 물리(worker/src/trial/blast/sim.ts) · 기록(stats.ts) · 봇(npc.ts) · 엔진을 고정한다.
 *
 *   ① 가림 — 폭심과 몸 사이에 장애물이 있으면 가려진다. 폭원이 바닥이라 장애물 뒤는 거리와 상관없이 그늘이다
 *   ② 충격 — 가까우면 뜨고 멀면 밀리기만 한다 · 가려지면 · 자세를 낮추면 안 뜬다 · 무거운 몸은 덜 날아간다 · 세기 배율이 곱해진다
 *   ③ 비행 — 포물선으로 날아가 착지하고 쓰러진 뒤 다시 선다 · 장애물에 부딪히면 그 자리에서 떨어진다
 *   ④ 걷기 — 장애물 · 마당 밖으로 못 간다 · 낮은 자세는 느리다
 *   ⑤ 기록 — 엄폐 비율 · 반응 시간 · 비행 방향
 *   ⑥ 봇 — 계산하는 좌석은 그늘로 가고 사람 같은 좌석은 반대로 뛴다 → 계산하는 좌석이 덜 날아간다
 *   ⑦ 엔진 — 놓인 폭약이 도화선 뒤에 터지고 연쇄하며 몸을 띄운다 · 스냅샷에 세기가 없다 (P8)
 */
import { describe, expect, it } from 'vitest';
import { BLAST_COVERS, BLAST_CROUCH_Y, BLAST_FUSE_MS, BLAST_LAUNCH_V, BLAST_STAND_Y, dangerAt, falloff, insideCover, isShielded, pushOut } from '../../src/world/mp/blast';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { BlastEngine } from '../../worker/src/trial/blast/engine';
import { makeBlastBot, makeBlastProfile, stepBot } from '../../worker/src/trial/blast/npc';
import { applyBlast, makeBody, stepBody, type Charge } from '../../worker/src/trial/blast/sim';
import { BlastStats } from '../../worker/src/trial/blast/stats';

const DT = 0.05;

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 첫 방호벽(x −3.6, z −7.5, 절반 1.5 × 0.32, 높이 1.1) */
const WALL = BLAST_COVERS[0];

describe('mp/blast — 가림 · 감쇠', () => {
  it('장애물 바로 뒤는 가려지고, 장애물 없는 쪽은 안 가려진다', () => {
    const cx = WALL.x;
    const cz = WALL.z - 2.5; // 벽 앞
    expect(isShielded(cx, cz, WALL.x, WALL.z + 1.0, BLAST_STAND_Y)).toBe(true); // 벽 바로 뒤
    expect(isShielded(cx, cz, WALL.x + 3.5, WALL.z + 1.0, BLAST_STAND_Y)).toBe(false); // 벽 옆으로 비껴
  });

  it('폭원이 바닥에 있어 장애물 뒤는 거리와 상관없이 그늘이다 — 서든 낮추든', () => {
    const cx = WALL.x;
    const cz = WALL.z - 0.6; // 벽 바로 앞에서 터진다
    const farZ = WALL.z + 6; // 6m 뒤
    expect(isShielded(cx, cz, WALL.x, farZ, BLAST_STAND_Y)).toBe(true);
    expect(isShielded(cx, cz, WALL.x, farZ, BLAST_CROUCH_Y)).toBe(true);
    // 벽과 같은 쪽(폭심 쪽)에 서면 아무것도 가리지 않는다
    expect(isShielded(cx, cz, WALL.x + 1, WALL.z - 1.5, BLAST_STAND_Y)).toBe(false);
  });

  it('감쇠 — 가까울수록 크고 범위 밖은 0. 위험도는 가림 · 자세로 줄어든다', () => {
    expect(falloff(0)).toBeGreaterThan(falloff(1));
    expect(falloff(1)).toBeGreaterThan(falloff(3));
    expect(falloff(7)).toBe(0);
    const cx = WALL.x;
    const cz = WALL.z - 2;
    const open = dangerAt(WALL.x + 4, WALL.z + 1, false, cx, cz);
    const behind = dangerAt(WALL.x, WALL.z + 1, false, cx, cz);
    expect(behind).toBeLessThan(open);
    expect(dangerAt(WALL.x + 4, WALL.z + 1, true, cx, cz)).toBeLessThan(open);
  });

  it('장애물 안으로 못 들어가고 마당 밖으로 못 나간다', () => {
    const p = { x: WALL.x, z: WALL.z };
    pushOut(p);
    expect(insideCover(p.x, p.z)).toBeNull();
    const q = { x: 40, z: -40 };
    pushOut(q);
    expect(q.x).toBeLessThan(7);
    expect(q.z).toBeGreaterThan(-12);
  });
});

describe('sim — 충격', () => {
  it('가까우면 뜨고(수직 속도) 멀면 밀리기만 한다', () => {
    const near = makeBody('a', 1.2, 0);
    const out = applyBlast(near, 0, 0, 1);
    expect(out.launched).toBe(true);
    expect(near.stance).toBe('air');
    expect(near.vx).toBeGreaterThan(0);
    expect(near.vy).toBeGreaterThan(0);

    const far = makeBody('b', 5.5, 0);
    const o2 = applyBlast(far, 0, 0, 1);
    expect(o2.v).toBeGreaterThan(0);
    expect(o2.v).toBeLessThan(BLAST_LAUNCH_V);
    expect(far.stance).toBe('stand');
    expect(far.vx).toBeGreaterThan(0);
  });

  it('무거운 몸은 같은 자리에서 덜 날아간다 · 세기 배율이 그대로 곱해진다', () => {
    const light = makeBody('l', 1.5, 0, 1);
    const heavy = makeBody('h', 1.5, 0, 1.8);
    const a = applyBlast(light, 0, 0, 1);
    const b = applyBlast(heavy, 0, 0, 1);
    expect(b.v).toBeCloseTo(a.v / 1.8, 6);
    const strong = makeBody('s', 1.5, 0, 1);
    expect(applyBlast(strong, 0, 0, 1.6).v).toBeCloseTo(a.v * 1.6, 6);
  });

  it('벽 뒤에 있거나 자세를 낮추면 같은 거리에서도 안 뜬다', () => {
    const cx = WALL.x;
    const cz = WALL.z - 1.4;
    const open = makeBody('o', WALL.x + 2.4, WALL.z - 1.4); // 폭심 옆 2.4m — 사이에 아무것도 없다
    const behind = makeBody('b', WALL.x, WALL.z + 1.0); // 벽 뒤 2.4m
    const dOpen = Math.hypot(open.x - cx, open.z - cz);
    const dBehind = Math.hypot(behind.x - cx, behind.z - cz);
    expect(Math.abs(dOpen - dBehind)).toBeLessThan(0.01);
    const ro = applyBlast(open, cx, cz, 1);
    const rb = applyBlast(behind, cx, cz, 1);
    expect(ro.launched).toBe(true);
    expect(rb.shielded).toBe(true);
    expect(rb.launched).toBe(false);

    const crouched = makeBody('c', 2.2, 0);
    crouched.crouch = true;
    const standing = makeBody('d', 2.2, 0);
    expect(applyBlast(standing, 0, 0, 1).launched).toBe(true);
    expect(applyBlast(crouched, 0, 0, 1).launched).toBe(false);
  });
});

describe('sim — 비행 · 걷기', () => {
  it('포물선으로 날아가 착지하고, 쓰러진 뒤 다시 선다', () => {
    const b = makeBody('a', 0, 0);
    applyBlast(b, -1.0, 0, 1);
    const from = b.x;
    let landed: number | null = null;
    let t = 0;
    for (; t < 6000 && landed === null; t += DT * 1000) landed = stepBody(b, 0, 0, DT, t).landed;
    expect(landed).not.toBeNull();
    expect(landed!).toBeGreaterThan(3);
    expect(b.x - from).toBeGreaterThan(3);
    expect(b.stance).toBe('down');
    for (; t < 12000 && b.stance === 'down'; t += DT * 1000) stepBody(b, 2.6, 0, DT, t);
    expect(b.stance).toBe('stand');
  });

  it('장애물 · 마당 밖으로 걸어 들어갈 수 없고, 낮은 자세는 느리다', () => {
    const b = makeBody('a', WALL.x, WALL.z - 2);
    for (let t = 0; t < 3000; t += DT * 1000) stepBody(b, 0, 2.6, DT, t); // 벽 쪽으로
    expect(insideCover(b.x, b.z)).toBeNull();
    expect(b.z).toBeLessThan(WALL.z);

    const c = makeBody('c', 0, 0);
    c.crouch = true;
    for (let t = 0; t < 1000; t += DT * 1000) stepBody(c, 4.8, 0, DT, t);
    expect(c.x).toBeLessThan(1.3);
    expect(c.x).toBeGreaterThan(0.9);
  });
});

describe('BlastStats — 기록', () => {
  it('엄폐 비율 · 반응 시간 · 비행 방향', () => {
    const s = new BlastStats();
    s.exposed(true);
    s.exposed(false);
    s.exposed(true);
    s.armedNear(1000);
    s.walk(0, 0, 1100);
    s.walk(2.6, 0, 1350); // 350ms
    s.armedNear(3000);
    s.crouch(true, 3200); // 200ms
    s.launched(4000, true);
    s.landed(6.5, 4800, [0]);
    s.launched(9000, false);
    s.landed(2.0, 9500, [0]);
    const r = s.result('x', 0, 60000);
    expect(r.metrics.coverRate).toBeCloseTo(2 / 3, 6);
    expect(r.metrics.reactionMs).toBeCloseTo(275, 6);
    expect(r.metrics.flightTotal).toBeCloseTo(8.5, 6);
    expect(r.metrics.maxFlight).toBeCloseTo(6.5, 6);
    expect(r.metrics.launches).toBe(2);
    expect(r.metrics.survivalTime).toBeCloseTo(4, 6);
    expect(r.errorDirection).toEqual([1, -1]);
    expect(r.metrics.transitionError).toBeCloseTo(6.5, 6); // 첫 비행만 전환 창(0~5초) 안
  });
});

describe('npc — precision 이 걸음을 가른다 (P9)', () => {
  /** 봇 하나, 벽 앞 4m 에 폭약. 도화선 동안 어디로 가서 얼마나 날아가나 */
  function run(precision: number, seed: number): { flight: number; nearWall: boolean } {
    const rand = seeded(seed);
    const profile = makeBlastProfile(0, precision, rand);
    const body = makeBody('bot', WALL.x, WALL.z + 3.0);
    const bot = makeBlastBot(body, profile);
    const charge: Charge = { id: 1, x: WALL.x, z: WALL.z + 3.0 + 3.5, armAt: 0, boomAt: BLAST_FUSE_MS };
    let t = 0;
    for (; t < BLAST_FUSE_MS; t += DT * 1000) {
      const out = stepBot(bot, [charge], t, DT, rand);
      body.crouch = out.crouch;
      stepBody(body, out.wx, out.wz, DT, t);
    }
    const nearWall = Math.hypot(body.x - WALL.x, body.z - WALL.z) < 1.6;
    applyBlast(body, charge.x, charge.z, 1);
    const from = { x: body.x, z: body.z };
    for (; t < 8000 && body.stance === 'air'; t += DT * 1000) stepBody(body, 0, 0, DT, t);
    return { flight: Math.hypot(body.x - from.x, body.z - from.z), nearWall };
  }

  it('계산하는 좌석은 벽 뒤 그늘로 가고, 사람 같은 좌석보다 덜 날아간다', () => {
    const machine = run(1, 3);
    const human = run(0, 3);
    expect(machine.nearWall).toBe(true);
    expect(machine.flight).toBeLessThanOrEqual(human.flight);
  });
});

describe('BlastEngine — 도화선 · 연쇄 · 스냅샷', () => {
  it('놓인 폭약은 도화선 뒤에 터져 가까운 몸을 띄우고(trial_hit), 가까운 폭약을 연쇄로 앞당긴다. 스냅샷에 세기는 없다 (P8)', () => {
    const engine = new BlastEngine(seeded(11));
    const sent: S2CMessage[] = [];
    engine.start(1, ['me'], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => {} });
    const t0 = Date.now();
    const me = engine.bodyOf('me')!;
    me.x = 0;
    me.z = 0;
    // 내 발밑 1m 에 폭약, 3m 옆에 또 하나(도화선이 훨씬 길다) — 첫 것이 터지면 둘째가 따라 터져야 한다
    const a = engine.plant(1.0, 0, t0, 500);
    const b = engine.plant(3.5, 0, t0, 5000);
    for (let i = 1; i <= 24; i += 1) engine.tickAt(t0 + i * 50); // 1.2초
    const hits = sent.filter((m) => m.t === 'trial_hit');
    expect(hits.some((m) => m.t === 'trial_hit' && m.id === 'me' && m.objectId === a.id)).toBe(true);
    // 둘째는 원래 5초 뒤였는데 연쇄로 이미 터졌다
    expect(engine.chargeList().find((c) => c.id === b.id)).toBeUndefined();
    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_blast' }> => m.t === 'trial_blast');
    expect(snaps.length).toBeGreaterThan(5);
    const last = snaps.at(-1)!;
    expect(last.players.map((p) => p.id).sort()).toEqual(['SUBJECT_01', 'SUBJECT_02', 'me']);
    expect(snaps.some((s) => s.booms.length > 0)).toBe(true);
    for (const m of sent) expect(JSON.stringify(m)).not.toMatch(/yield|strength|"k"/);
    const results = engine.results();
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.id === 'me')!.metrics.launches).toBeGreaterThanOrEqual(1);
    engine.stop();
  });
});
