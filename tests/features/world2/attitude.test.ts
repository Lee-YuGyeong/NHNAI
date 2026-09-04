/**
 * 태도가 몸으로 나오는가 — attitude.ts. 단계마다 오프셋·고개가 규칙대로고, 0 이면 아무것도 안 하며, 집행 중엔 멎는가.
 * patrol 은 안 건드린다: 자리는 patrol.of 가 준 것 위에 더해지는 것만 본다. 시계는 손으로 돌린다 (now 인자).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { ATTEND_REPLY_MS, ATTEND_TAIL_MS, ATTEND_TALK_MS, attitude, BLOCK_M, BLOCK_R, doorOf, FRONT_M, OFFSET_MAX, STEP_BACK_M, STEP_IN_M, TALK_MARGIN, YIELD_M } from '../../../src/features/world2/attitude';
import { execution } from '../../../src/features/world2/execution';
import { openers } from '../../../src/features/world2/openers';
import { patrol } from '../../../src/features/world2/patrol';
import { UNIT_PLACES } from '../../../src/features/world2/Room2Scene';
import { EXEC_ROOM, TALK_DIST } from '../../../src/features/world2/scenario2';
import { units } from '../../../src/features/world2/units';

const DT = 1 / 30;
const T0 = 1000;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const near = (a: number, b: number, tol = 0.06) => Math.abs(wrap(a - b)) < tol;

/** seconds 동안 돌린다 — me 는 고정이거나 시각의 함수(걷는 나) */
function run(seconds: number, me: { x: number; z: number } | ((t: number) => { x: number; z: number }), room: 'corridor' | 'work' = 'corridor', t0 = T0) {
  let now = t0;
  for (let i = 0; i < seconds * 30; i += 1) {
    now = t0 + i * DT * 1000;
    const t = i * DT;
    const m = typeof me === 'function' ? me(t) : me;
    patrol.tick(DT, m, now);
    attitude.tick(DT, m, now, room);
  }
  return now;
}

/** 그려지는 자리 — patrol 의 자리 + 오프셋 */
function shown(id: string) {
  const p = patrol.of(id)!;
  const o = attitude.offsetOf(id);
  return { x: p.x + o.dx, z: p.z + o.dz };
}

/** 그 몸에서 보는 방향으로 m 앞 — 개체가 보고 있는 쪽에 내가 선다 */
function inFront(id: string, m: number) {
  const p = patrol.of(id)!;
  return { x: p.x + Math.sin(p.heading) * m, z: p.z + Math.cos(p.heading) * m };
}

beforeEach(() => {
  units.reset();
  execution.reset();
  openers.reset();
  attitude.stop();
  patrol.reset('corridor', UNIT_PLACES.corridor);
});

describe('단계 0 — 아무것도 안 한다 (기존 자리·고개 계약 보존)', () => {
  it('곁에 서 있어도, 앞을 지나가도 오프셋 0 · 고개 null', () => {
    const p = patrol.of('u137')!;
    run(3, inFront('u137', 1.2));
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
    expect(attitude.faceOf('u137')).toBeNull();
    run(4, (t) => ({ x: p.x + 0.3, z: p.z + 3.5 - t }));
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
    expect(attitude.faceOf('u137')).toBeNull();
  });
});

describe('+1 눈을 마주친다', () => {
  it('3 m 안이면 나를 보고, 멀어지면 제 방향으로 돌아간 뒤 손을 뗀다', () => {
    units.shift('u137', 1);
    const me = inFront('u137', 2);
    const p = patrol.of('u137')!;
    run(2, me);
    const f = attitude.faceOf('u137');
    expect(f).not.toBeNull();
    expect(near(f!, Math.atan2(me.x - p.x, me.z - p.z))).toBe(true);
    // 자리는 안 옮긴다
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
    run(3, inFront('u137', 6));
    expect(attitude.faceOf('u137')).toBeNull();
  });
});

describe('+2 자리를 비켜 준다', () => {
  it('내 가는 선이 몸 1.15 m 안을 지나면 그 선의 법선으로 0.6 m 비켰다가 돌아온다 — still 은 그대로', () => {
    units.shift('u137', 2);
    const p = patrol.of('u137')!;
    // 몸에서 x 로 0.3 비킨 선을 따라 −z 로 걸어온다 (1 m/s)
    const walk = (t: number) => ({ x: p.x + 0.3, z: p.z + 3.5 - t });
    run(1.6, walk);
    const o = attitude.offsetOf('u137');
    expect(Math.hypot(o.dx, o.dz)).toBeCloseTo(YIELD_M, 1);
    // 내 선(x = p.x + 0.3)에서 멀어지는 쪽으로 — 몸이 선의 −x 쪽이니 −x 로
    expect(o.dx).toBeLessThan(-0.5);
    expect(Math.abs(o.dz)).toBeLessThan(0.05);
    expect(patrol.of('u137')!.still).toBe(true);
    // 지나간 뒤 돌아온다
    run(6, { x: p.x + 0.3, z: p.z - 6 }, 'corridor', T0 + 2000);
    const back = attitude.offsetOf('u137');
    expect(Math.hypot(back.dx, back.dz)).toBeLessThan(0.02);
  });
  it('벽 쪽으로 비켜야 할 때는 반대쪽으로 — patrol 이 받은 solid 로 발을 본다', () => {
    const p0 = UNIT_PLACES.corridor.find((q) => q.id === 'u137')!;
    // 몸의 +x 쪽 0.3 부터가 벽 — 자리 규칙(벽에서 0.75)보다 더 바싹 붙인 벽
    patrol.reset('corridor', UNIT_PLACES.corridor, { solid: (x) => x > p0.x + 0.3 });
    units.shift('u137', 2);
    const p = patrol.of('u137')!;
    // 몸의 −x 쪽 0.3 선으로 걸어온다 — 법선대로면 +x(벽 쪽)로 비킬 자리
    run(1.6, (t) => ({ x: p.x - 0.3, z: p.z + 3.5 - t }));
    const o = attitude.offsetOf('u137');
    expect(Math.hypot(o.dx, o.dz)).toBeCloseTo(YIELD_M, 1);
    expect(o.dx).toBeLessThan(-0.5);
  });
  it('양쪽이 다 막히면 비키지 않는다 — 벽에 박히느니 서 있는다', () => {
    const p0 = UNIT_PLACES.corridor.find((q) => q.id === 'u137')!;
    patrol.reset('corridor', UNIT_PLACES.corridor, { solid: (x) => Math.abs(x - p0.x) > 0.3 });
    units.shift('u137', 2);
    const p = patrol.of('u137')!;
    run(1.6, (t) => ({ x: p.x + 0.3, z: p.z + 3.5 - t }));
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
    expect(patrol.of('u137')!.still).toBe(true);
  });
  it('등을 벽에 붙인 것(stance back · A-063)은 비키지 않는다 — 고개만', () => {
    patrol.reset('work', UNIT_PLACES.work);
    units.shift('u063', 2);
    expect(units.stage('u063')).toBe(2);
    const p = patrol.of('u063')!;
    const me = (t: number) => ({ x: p.x - 0.3, z: p.z + 3.5 - t });
    run(1.6, me, 'work');
    expect(attitude.offsetOf('u063')).toEqual({ dx: 0, dz: 0 });
    // 3 m 안에 든 동안 나를 본다
    const m = me(1.6);
    expect(near(attitude.faceOf('u063')!, Math.atan2(m.x - p.x, m.z - p.z))).toBe(true);
  });
});

describe('+3 내 앞에 선다 — 집행 중에만, 한 번', () => {
  it('집행자가 서 있고 4 m 안이면 내 앞 1.2 m 로 온다', () => {
    units.shift('u104', 3);
    execution.cross(60, 0);
    expect(execution.get().phase).not.toBe('none');
    const me = inFront('u104', 2.6);
    run(2, me);
    const at = shown('u104');
    expect(Math.hypot(at.x - me.x, at.z - me.z)).toBeCloseTo(FRONT_M, 1);
  });
  it('집행자와 나 사이에 선다 — 제 자리 쪽이 아니라 총구 앞', () => {
    units.shift('u104', 3);
    execution.cross(60, 0);
    const p = patrol.of('u104')!;
    const ex = EXEC_ROOM.corridor!.at;
    /*
     * 나는 그 몸과 집행자 사이 — 제 자리 쪽으로 서면 내 등 뒤다. **자리에서 1 m** 고정이다:
     * 비율(0.3)로 잡으면 방을 넓힐 때 그 거리가 같이 늘어 목표가 오프셋 상한(2.5)을 넘고, 몸이 못 온다
     * (2026-09-03 복도를 10×40 으로 넓히며 자리↔집행자가 3.1 → 9.3 m 가 됐다)
     */
    const dPE = Math.hypot(ex.x - p.x, ex.z - p.z);
    const me = { x: p.x + ((ex.x - p.x) / dPE) * 1.0, z: p.z + ((ex.z - p.z) / dPE) * 1.0 };
    expect(Math.hypot(me.x - p.x, me.z - p.z)).toBeLessThan(4);
    run(2, me);
    const at = shown('u104');
    expect(Math.hypot(at.x - me.x, at.z - me.z)).toBeCloseTo(FRONT_M, 1);
    const dEx = Math.hypot(ex.x - me.x, ex.z - me.z);
    const want = { x: me.x + ((ex.x - me.x) / dEx) * FRONT_M, z: me.z + ((ex.z - me.z) / dEx) * FRONT_M };
    expect(Math.hypot(at.x - want.x, at.z - want.z)).toBeLessThan(0.06);
    // 그리고 나를 본다
    expect(near(attitude.faceOf('u104')!, Math.atan2(me.x - at.x, me.z - at.z))).toBe(true);
  });
  it('내가 그 몸의 자리에서 4 m 밖으로 나가면 따라오지 않고 돌아간다', () => {
    units.shift('u104', 3);
    execution.cross(60, 0);
    const p = patrol.of('u104')!;
    const me = inFront('u104', 2.6);
    run(2, me);
    expect(Math.hypot(attitude.offsetOf('u104').dx, attitude.offsetOf('u104').dz)).toBeGreaterThan(0.5);
    // 자리에서 6 m 로 걸어 나간다 — 그려지는 자리는 자리표 곁으로 돌아온다
    const far = inFront('u104', 6);
    run(4, (t) => ({ x: me.x + (far.x - me.x) * Math.min(1, t / 2), z: me.z + (far.z - me.z) * Math.min(1, t / 2) }), 'corridor', T0 + 2000);
    const at = shown('u104');
    expect(Math.hypot(at.x - p.x, at.z - p.z)).toBeLessThan(0.05);
  });
  it('집행 중 다른 단계는 멎는다 — +1 이 곁에 있어도 안 본다', () => {
    units.shift('u137', 1);
    execution.cross(60, 0);
    run(2, inFront('u137', 2));
    expect(attitude.faceOf('u137')).toBeNull();
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
  });
});

describe('−1 피한다 · −3 앞을 막는다', () => {
  it('−1: 2.6 m 안이면 고개를 반대로', () => {
    units.shift('u089', -1);
    const me = inFront('u089', 2);
    const p = patrol.of('u089')!;
    run(2, me);
    const f = attitude.faceOf('u089');
    expect(f).not.toBeNull();
    expect(near(f!, Math.atan2(p.x - me.x, p.z - me.z))).toBe(true);
  });
  it('−3: 문과 나 사이, 나에게서 1 m 에 선다 — 나를 보고', () => {
    units.cross('u089');
    expect(units.stage('u089')).toBe(-3);
    // 1.2 m 앞 — 문이 내 너머라 「문과 나 사이 1 m」는 자리에서 2.2 m, 상한(2.5) 안이다
    const me = inFront('u089', 1.2);
    const door = doorOf('corridor', me)!;
    run(2, me);
    const at = shown('u089');
    const d = Math.hypot(door.x - me.x, door.z - me.z);
    const want = { x: me.x + ((door.x - me.x) / d) * BLOCK_M, z: me.z + ((door.z - me.z) / d) * BLOCK_M };
    expect(Math.hypot(at.x - want.x, at.z - want.z)).toBeLessThan(0.06);
    // 막는 몸은 나를 본다 — 등을 보이면 가는 몸으로 읽힌다 (−1 의 고개 돌리기는 −3 엔 안 든다)
    expect(near(attitude.faceOf('u089')!, Math.atan2(me.x - at.x, me.z - at.z))).toBe(true);
  });
  it('−3: 거리는 patrol 의 자리에서 잰다 — 4 m 밖으로 걸어 나가면 따라오지 않고 돌아간다', () => {
    units.cross('u089');
    const p = patrol.of('u089')!;
    const me = inFront('u089', 2);
    run(2, me);
    expect(Math.hypot(attitude.offsetOf('u089').dx, attitude.offsetOf('u089').dz)).toBeGreaterThan(0.5);
    const far = inFront('u089', BLOCK_R + 2);
    run(5, (t) => ({ x: me.x + (far.x - me.x) * Math.min(1, t / 2), z: me.z + (far.z - me.z) * Math.min(1, t / 2) }), 'corridor', T0 + 2000);
    const at = shown('u089');
    expect(Math.hypot(at.x - p.x, at.z - p.z)).toBeLessThan(0.05);
  });
  it('−3: 문이 멀어도 오프셋은 2.5 m 까지다', () => {
    units.cross('u089');
    const p = patrol.of('u089')!;
    const door = doorOf('corridor', p)!;
    // 문의 반대쪽 3.9 m — 「문과 나 사이 1 m」는 자리에서 2.9 m 다
    const dd = Math.hypot(door.x - p.x, door.z - p.z);
    const me = { x: p.x - ((door.x - p.x) / dd) * 3.9, z: p.z - ((door.z - p.z) / dd) * 3.9 };
    run(3, me);
    const o = attitude.offsetOf('u089');
    expect(Math.hypot(o.dx, o.dz)).toBeCloseTo(OFFSET_MAX, 1);
  });
});

describe('대답 비트 — onReply', () => {
  it('갈망형의 첫 위로: 0.4 초 멈칫한 뒤 나를 본다', () => {
    const me = inFront('u104', 1.5);
    const now = run(0.5, me);
    attitude.onReply('u104', { reaction: 'comfort', delta: 0, pauseMs: 400 }, now);
    expect(attitude.held('u104', now + 100)).toBe(true);
    expect(attitude.held('u104', now + 500)).toBe(false);
    run(1, me, 'corridor', now);
    const p = patrol.of('u104')!;
    expect(near(attitude.faceOf('u104')!, Math.atan2(me.x - p.x, me.z - p.z))).toBe(true);
    expect(attitude.offsetOf('u104')).toEqual({ dx: 0, dz: 0 });
  });
  it('내리는 대답(down): 반 걸음 물러나 등을 돌린다', () => {
    const me = inFront('u089', 1.5);
    const now = run(0.5, me);
    const p = patrol.of('u089')!;
    attitude.onReply('u089', { reaction: 'down', delta: -1, pauseMs: 0 }, now);
    run(1.5, me, 'corridor', now);
    const at = shown('u089');
    const before = Math.hypot(p.x - me.x, p.z - me.z);
    expect(Math.hypot(at.x - me.x, at.z - me.z)).toBeCloseTo(before + STEP_BACK_M, 1);
    expect(near(attitude.faceOf('u089')!, Math.atan2(p.x - me.x, p.z - me.z))).toBe(true);
  });
  it('물러서도 말이 걸리는 거리 안에 남는다 — 2.3 m 에서 들은 내리는 대답', () => {
    const me = inFront('u089', 2.3);
    const now = run(0.5, me);
    attitude.onReply('u089', { reaction: 'down', delta: -2, pauseMs: 0 }, now);
    run(2, me, 'corridor', now);
    const at = shown('u089');
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    expect(d).toBeGreaterThan(2.3 + 0.05);
    expect(d).toBeLessThanOrEqual(TALK_DIST - TALK_MARGIN + 0.02);
  });
  it('오르는 대답(delta +2): 반 걸음 다가서며 나를 본다', () => {
    const me = inFront('u137', 2);
    const now = run(0.5, me);
    const p = patrol.of('u137')!;
    attitude.onReply('u137', { reaction: 'mural', delta: 2, pauseMs: 0 }, now);
    run(1.5, me, 'corridor', now);
    const at = shown('u137');
    const before = Math.hypot(p.x - me.x, p.z - me.z);
    expect(Math.hypot(at.x - me.x, at.z - me.z)).toBeCloseTo(before - STEP_IN_M, 1);
    expect(near(attitude.faceOf('u137')!, Math.atan2(me.x - p.x, me.z - p.z))).toBe(true);
  });
  it('앞이 그은 것은 세 번째 대답까지 돌아보지 않는다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    const me = inFront('u063', 1.5);
    let now = run(0.5, me, 'work');
    attitude.onReply('u063', { reaction: 'flat', delta: 0, pauseMs: 0 }, now);
    now = run(1, me, 'work', now);
    expect(attitude.faceOf('u063')).toBeNull();
    attitude.onReply('u063', { reaction: 'flat', delta: 0, pauseMs: 0 }, now);
    now = run(1, me, 'work', now);
    expect(attitude.faceOf('u063')).toBeNull();
    attitude.onReply('u063', { reaction: 'up', delta: 1, pauseMs: 0 }, now);
    run(1, me, 'work', now);
    const p = patrol.of('u063')!;
    expect(near(attitude.faceOf('u063')!, Math.atan2(me.x - p.x, me.z - p.z))).toBe(true);
  });
});

/*
 * ── 말을 걸면 하던 일을 멈추고 나를 본다 ──
 * 여기서 세는 것은 **언제 도나**다: 곁에 왔다고 도는 것이 아니고(태도 0 은 「지나가도 쳐다보지 않는다」),
 * 말을 건 순간부터 대답이 끝나고 꼬리까지다. 손이 내려오는 것(하던 일)은 activity.test.ts 가 따로 센다
 */
describe('attend — 말을 건 개체만, 그동안만', () => {
  it('아무 일도 없으면 아무도 안 본다 — 곁에 서 있어도 attending 은 거짓이다', () => {
    const me = inFront('u137', 1.2);
    const now = run(3, me);
    expect(attitude.attending('u137', now)).toBe(false);
    expect(attitude.faceOf('u137')).toBeNull();
  });

  it('말을 걸면 단계 0 인 개체도 **몸째** 나를 본다 — 그리고 창이 끝나면 제 방향으로 돌아간다', () => {
    // 자기 그림을 보고 선 것의 옆에 선다 — 벽 쪽 heading 과 내 쪽이 크게 갈리는 자리
    const p = patrol.of('u137')!;
    const me = { x: p.x + 1.4, z: p.z + 1.4 };
    let now = run(1, me);
    expect(attitude.faceOf('u137')).toBeNull();

    attitude.attend('u137', ATTEND_TALK_MS, now);
    expect(attitude.attending('u137', now)).toBe(true);
    // 0.4 초 안에 몸이 이쪽으로 온다 (ATTEND_TURN 4.5 rad/s)
    now = run(0.5, me, 'corridor', now);
    expect(near(attitude.faceOf('u137')!, Math.atan2(me.x - p.x, me.z - p.z), 0.12)).toBe(true);

    // 창이 지나면 제 그림 쪽으로 돌아간다 — 자리는 한 번도 안 옮겼다
    now += ATTEND_TALK_MS;
    expect(attitude.attending('u137', now)).toBe(false);
    now = run(2, me, 'corridor', now);
    expect(attitude.faceOf('u137')).toBeNull();
    expect(attitude.offsetOf('u137')).toEqual({ dx: 0, dz: 0 });
  });

  it('attend 는 늘리기만 · attendTail 은 줄이기만 — 대답이 이어지는 동안 손이 다시 안 올라간다', () => {
    const t = T0;
    attitude.attend('u104', ATTEND_REPLY_MS, t);
    // 더 짧은 창으로는 안 줄어든다
    attitude.attend('u104', 1000, t);
    expect(attitude.attending('u104', t + 5000)).toBe(true);
    // 꼬리로는 줄어든다 (대화창을 닫은 것)
    attitude.attendTail('u104', ATTEND_TAIL_MS, t);
    expect(attitude.attending('u104', t + ATTEND_TAIL_MS + 1)).toBe(false);
    // 안 보던 개체를 꼬리가 보게 만들지는 않는다
    attitude.attendTail('u089', ATTEND_TAIL_MS, t);
    expect(attitude.attending('u089', t)).toBe(false);
  });

  it('한 마디 대답하면 그동안 계속 본다 — onReply 가 창을 민다', () => {
    const me = inFront('u137', 1.5);
    const now = run(0.5, me);
    attitude.onReply('u137', { reaction: 'mural', delta: 2, pauseMs: 0 }, now);
    expect(attitude.attending('u137', now + ATTEND_REPLY_MS - 100)).toBe(true);
    expect(attitude.attending('u137', now + ATTEND_REPLY_MS + 100)).toBe(false);
  });

  it('등을 돌리는 대답에는 더 안 본다 — 물러선 반 걸음이 말을 하게 둔다', () => {
    const me = inFront('u089', 1.5);
    const now = run(0.5, me);
    attitude.attend('u089', ATTEND_TALK_MS, now);
    attitude.onReply('u089', { reaction: 'down', delta: -1, pauseMs: 0 }, now);
    expect(attitude.attending('u089', now + 10)).toBe(false);
  });

  it('앞이 그은 것은 말을 걸어도 세 번째 대답까지 안 돈다 — 하던 일만 멈춘다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    const me = inFront('u063', 1.5);
    const now = run(0.5, me, 'work');
    attitude.attend('u063', ATTEND_TALK_MS, now);
    run(1.5, me, 'work', now);
    expect(attitude.attending('u063', now + 1500)).toBe(true);
    expect(attitude.faceOf('u063')).toBeNull();
  });

  it('방을 옮기면 보던 것도 거둔다 (stop)', () => {
    attitude.attend('u137', ATTEND_TALK_MS, T0);
    attitude.stop();
    expect(attitude.attending('u137', T0)).toBe(false);
  });
});
