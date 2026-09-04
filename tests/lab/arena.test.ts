/**
 * 시행(/arena) 로직 검증 — 3D 없이 돌린다.
 *
 * 화면과 조작감은 눈으로 봐야 하지만, **판정과 배치 규칙은 여기서 다 잡힌다.**
 * 특히 "AI 만 정확하면 사람이 첫 판에 드러난다"는 밸런스는 눈으로는 못 본다.
 */

import { describe, expect, it } from 'vitest';
import {
  ARENA,
  ARRIVE_RADIUS,
  PILLARS,
  SPEED,
  START,
  aiStartTime,
  dealSloppiness,
  distance,
  gradeOf,
  pathFor,
  travelTime,
  MOUNT_TIME,
  beatError,
  beatTimes,
  botZoneChoices,
  validateTrial,
  type TrialSpec,
} from '../../src/lab/arena';
import { OBJECTS, targetSpot } from '../../src/lab/objects';
import { JUMP_MAX_Y } from '../../src/world/mp/constants';

/** 리더가 실제로 내놨던 배치 (검증 통과본) */
const GOOD: TrialSpec = {
  atom: 'arrive',
  concept: '거리가 전부 다른 6개 지점에 동시 도착',
  announce: '신호 후 정확히 8초에 전원이 동시에 도착한다.',
  why: '따라 나서면 어긋난다',
  seconds: 8,
  points: [
    { name: 'A', x: -3, z: -1 },
    { name: 'B', x: 5.5, z: 0.5 },
    { name: 'C', x: -7, z: -3 },
    { name: 'D', x: 2, z: -8.5 },
    { name: 'E', x: -8.5, z: -6.5 },
    { name: 'F', x: 6.5, z: -11.5 },
  ],
};

describe('검증 게이트', () => {
  it('리더가 실제로 내놓은 배치는 통과한다', () => {
    expect(validateTrial(GOOD, 6, START)).toEqual([]);
  });

  it('방 밖 좌표를 걷어낸다', () => {
    const bad = { ...GOOD, points: [{ name: 'A', x: 99, z: 0 }, ...GOOD.points.slice(1)] };
    expect(validateTrial(bad, 6, START).join()).toMatch(/방 밖/);
  });

  it('콘솔 옆에 붙인 지점을 걷어낸다', () => {
    // 콘솔은 벽에 붙어 있으므로, 경계 안쪽(0.6 인셋)이면서 콘솔 중심 1.2m 안인 자리를 고른다
    const rack = PILLARS.find((p) => p.x < 0 && p.z === -2)!;
    const near = { name: 'A', x: rack.x + 1.0, z: rack.z };
    const bad = { ...GOOD, points: [near, ...GOOD.points.slice(1)] };
    const found = validateTrial(bad, 6, START).join();
    expect(found).toMatch(/콘솔과 겹친다/);
    expect(found).not.toMatch(/방 밖/);
  });

  it('제한 시간 안에 못 가는 지점을 걷어낸다', () => {
    const bad = { ...GOOD, seconds: 3 };
    expect(validateTrial(bad, 6, START).join()).toMatch(/못 간다/);
  });

  it('거리가 다 비슷하면 걷어낸다 — 남을 따라 출발해도 맞아 버린다', () => {
    // 출발선에서 같은 반지름의 원 위에 6개
    const r = 8;
    const points = GOOD.points.map((p, i) => ({
      name: p.name,
      x: Number((START.x + r * Math.cos((i / 6) * Math.PI)).toFixed(2)),
      z: Number((START.z - r * Math.sin((i / 6) * Math.PI)).toFixed(2)),
    }));
    expect(validateTrial({ ...GOOD, points }, 6, START).join()).toMatch(/비슷한 거리/);
  });

  it('지점 수가 참가자 수와 다르면 걷어낸다', () => {
    expect(validateTrial(GOOD, 5, START).join()).toMatch(/지점이 6개/);
  });

  it('좌표가 전부 방 안이면 경계 검사가 통과한다', () => {
    GOOD.points.forEach((p) => {
      expect(p.x).toBeGreaterThan(ARENA.minX);
      expect(p.x).toBeLessThan(ARENA.maxX);
      expect(p.z).toBeGreaterThan(ARENA.minZ);
      expect(p.z).toBeLessThan(ARENA.maxZ);
    });
  });
});

describe('홀의 물건을 목표로 삼을 때', () => {
  const objects = OBJECTS.map((o) => ({ id: o.id, mountable: o.mountable, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
  const withObjects = (points: typeof GOOD.points) => validateTrial({ ...GOOD, points }, 6, START, objects).join();

  it('빈 바닥만 쓰면 기각한다 — 말로 시키면 안 하기 때문에 게이트로 막는다', () => {
    expect(withObjects(GOOD.points)).toMatch(/빈 바닥만 썼다/);
  });

  it('물건 두 개를 쓰면 통과한다', () => {
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    const rack = OBJECTS.find((o) => o.id === '콘솔9')!;
    const points = [
      { name: 'A', ...targetSpot(stage, 'stand', START), object: stage.id, mode: 'stand' as const },
      { name: 'B', ...targetSpot(rack, 'stand', START), object: rack.id, mode: 'stand' as const },
      ...GOOD.points.slice(2),
    ];
    expect(validateTrial({ ...GOOD, points }, 6, START, objects)).toEqual([]);
  });

  it('없는 물건을 대면 기각한다', () => {
    const points = [
      { name: 'A', x: 0, z: -3.6, object: '냉장고1' },
      { name: 'B', x: 3, z: -5, object: '무대' },
      ...GOOD.points.slice(2),
    ];
    expect(withObjects(points)).toMatch(/그런 물건이 없다/);
  });

  it('올라설 수 있는 물건 위라면 통과한다 — 무대턱이 낮아 걸어 올라간다', () => {
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    const rack = OBJECTS.find((o) => o.id === '콘솔9')!;
    const points = [
      { name: 'A', ...targetSpot(stage, 'mount', START), object: stage.id, mode: 'mount' as const },
      { name: 'B', ...targetSpot(rack, 'stand', START), object: rack.id, mode: 'stand' as const },
      ...GOOD.points.slice(2),
    ];
    expect(withObjects(points)).toBe('');
  });

  it('한 물건을 두 사람이 같이 쓰면 기각한다', () => {
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    const spot = targetSpot(stage, 'stand', START);
    const points = [
      { name: 'A', ...spot, object: stage.id, mode: 'stand' as const },
      { name: 'B', ...spot, object: stage.id, mode: 'stand' as const },
      ...GOOD.points.slice(2),
    ];
    expect(withObjects(points)).toMatch(/같이 쓴다/);
  });

  it('카탈로그가 충돌 데이터에서 그대로 온다 — 무대 1 + 콘솔 16 + 컨테이너 6', () => {
    expect(OBJECTS.length).toBe(23); // warehouse/layout.ts COLLIDERS 에서 벽·계단·리브를 뺀 전부
    expect(OBJECTS.filter((o) => o.kind === '콘솔')).toHaveLength(16);
    expect(OBJECTS.filter((o) => o.kind === '콘솔').every((o) => o.mountable)).toBe(true);
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    expect(stage.mountable).toBe(true);
    // 앞 계단까지 무대 발자국이다 — 배회하는 개체가 계단을 바닥인 줄 알고 밟지 않게
    expect(stage.hd).toBeGreaterThan(3);
  });

  /**
   * 컨테이너는 **올라설 수 있는 것과 벽이 섞여 있어야** 카탈로그가 어휘가 된다 —
   * 하나뿐이면 리더는 늘 같은 지시를 낸다.
   */
  it('컨테이너 6개 — 1단은 올라서고 2·3단은 벽이다', () => {
    const cargo = OBJECTS.filter((o) => o.kind === '컨테이너');
    expect(cargo).toHaveLength(6);
    expect(cargo.filter((o) => o.mountable).length).toBeGreaterThanOrEqual(2);
    expect(cargo.some((o) => !o.mountable)).toBe(true);
  });

  /**
   * ★ 사람도 올라갈 수 있어야 한다. 개체는 2D 평면 위를 걸어 그냥 올라서지만 사람은 3D 로 뛰어오른다
   * (mp/constants 의 최고점 ≈1.05m). 여기가 어긋나면 **사람만 못 지키는 지시**가 나온다 —
   * 그건 인간을 몸으로 걸러내는 판에서 규칙이 거짓말을 하는 것이다.
   */
  it('올라서라고 할 수 있는 물건은 전부 점프로 닿는다', () => {
    for (const o of OBJECTS.filter((o) => o.mountable)) {
      expect(o.top, `${o.id} 윗면 ${o.top}m 는 점프 최고점보다 높다`).toBeLessThanOrEqual(JUMP_MAX_Y);
    }
  });
});

describe('원자별 검증', () => {
  const objs = OBJECTS.map((o) => ({ id: o.id, mountable: o.mountable, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));

  it('zone: 구역이 겹치면 기각한다', () => {
    const spec = {
      ...GOOD,
      atom: 'zone' as const,
      question: '둘 중 하나 골라',
      zones: [
        { label: '가', x: 0, z: -6, r: 2 },
        { label: '나', x: 1, z: -6, r: 2 },
      ],
    };
    expect(validateTrial(spec, 6, START, objs).join()).toMatch(/겹친다/);
  });

  it('zone: 질문이 없으면 기각한다', () => {
    const spec = {
      ...GOOD,
      atom: 'zone' as const,
      zones: [
        { label: '가', x: -5, z: -6, r: 2 },
        { label: '나', x: 5, z: -6, r: 2 },
      ],
    };
    expect(validateTrial(spec, 6, START, objs).join()).toMatch(/question 이 없다/);
  });

  it('zone: 제대로 잡으면 통과한다 — points 는 안 본다', () => {
    const spec = {
      ...GOOD,
      atom: 'zone' as const,
      points: [],
      question: '2초보다 오래 걸리나',
      zones: [
        { label: '가', x: -5, z: -6, r: 2 },
        { label: '나', x: 5, z: -6, r: 2 },
      ],
    };
    expect(validateTrial(spec, 6, START, objs)).toEqual([]);
  });

  it('beat: 박자와 횟수가 범위를 벗어나면 기각한다', () => {
    const spec = { ...GOOD, atom: 'beat' as const, beatMs: 120, reps: 30 };
    const found = validateTrial(spec, 6, START, objs).join();
    expect(found).toMatch(/박자는 500~2000/);
    expect(found).toMatch(/횟수는 4~12/);
  });

  it('beat: 거리 폭 검사는 안 한다 — 제자리에서 뛰는 게임이다', () => {
    const near = GOOD.points.map((p, i) => ({ name: p.name, x: -2 + i * 0.9, z: -5 }));
    const withObj = [
      { name: 'A', ...targetSpot(OBJECTS[0], 'stand', START), object: OBJECTS[0].id, mode: 'stand' as const },
      { name: 'B', ...targetSpot(OBJECTS[6], 'stand', START), object: OBJECTS[6].id, mode: 'stand' as const },
      ...near.slice(2),
    ];
    const spec = { ...GOOD, atom: 'beat' as const, beatMs: 800, reps: 8, points: withObj };
    expect(validateTrial(spec, 6, START, objs).join()).not.toMatch(/비슷한 거리/);
  });
});

describe('가구를 피해 가는 경로', () => {
  const obstacles = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
  /** 홀 바닥 한가운데는 비어 있다(무대·콘솔 전부 가장자리) — 우회 알고리즘은 가상 상자로 검증한다 */
  const BOX = { id: '가상상자', x: 0, z: -8, hw: 1.2, hd: 1.2 };

  /** 경로가 가구를 뚫는지 촘촘히 밟아 본다 */
  function tunnels(from: { x: number; z: number }, path: { x: number; z: number }[], skipId?: string) {
    let cur = from;
    for (const p of path) {
      const steps = Math.ceil(distance(cur, p) / 0.05);
      for (let i = 0; i <= steps; i += 1) {
        const x = cur.x + ((p.x - cur.x) * i) / steps;
        const z = cur.z + ((p.z - cur.z) * i) / steps;
        for (const o of obstacles) {
          if (o.id === skipId) continue;
          // 가구 안쪽 깊숙이 들어갔으면 뚫은 것이다
          if (Math.abs(x - o.x) < o.hw - 0.05 && Math.abs(z - o.z) < o.hd - 0.05) return o.id;
        }
      }
      cur = p;
    }
    return null;
  }

  it('가구 한가운데를 지나는 직선은 우회한다', () => {
    // 상자 정반대편으로 가는 직선 — 그냥 가면 뚫는다
    const to = { name: 'X', x: BOX.x, z: BOX.z - 4 };
    const withBox = [...obstacles, BOX];
    const check = (path: { x: number; z: number }[]) => {
      let cur: { x: number; z: number } = START;
      for (const q of path) {
        const steps = Math.ceil(distance(cur, q) / 0.05);
        for (let i = 0; i <= steps; i += 1) {
          const x = cur.x + ((q.x - cur.x) * i) / steps;
          const z = cur.z + ((q.z - cur.z) * i) / steps;
          if (Math.abs(x - BOX.x) < BOX.hw - 0.05 && Math.abs(z - BOX.z) < BOX.hd - 0.05) return BOX.id;
        }
        cur = q;
      }
      return null;
    };
    expect(check([to]), '이 배치는 원래 뚫려야 테스트가 성립한다').not.toBeNull();

    const path = pathFor(START, to, withBox);
    expect(path.length).toBe(2); // 경유점이 하나 붙는다
    expect(check(path)).toBeNull();
  });

  /*
   * ★ 우회점이 방 밖에 서던 자리 (2026-09-01 사용자: "로봇이 벽 통과하는 것처럼 사라졌다가 온다").
   *   물건 반지름의 1.25배만큼 옆으로 밀어낸 자리라, 가장자리 물건에서는 그 계산이 벽 너머를 가리켰다.
   *   목적지는 검증·배회가 방 안으로 잡아 두는데 그 사이에 끼는 이 한 점만 아무도 안 보고 있었다.
   *   경로는 곧은 선분이고 방은 볼록한 사각형이라 — **모든 꼭짓점이 안에 있으면 걷는 동안 밖으로 못 나간다.**
   */
  it('우회점이 방 밖으로 안 나간다 — 만 쌍을 돌려 한 번도', () => {
    const outside = (p: { x: number; z: number }) =>
      p.x < ARENA.minX || p.x > ARENA.maxX || p.z < ARENA.minZ || p.z > ARENA.maxZ;
    // 씨앗 고정 난수 — 실패하면 같은 자리에서 다시 재현된다
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const spot = () => ({
      x: ARENA.minX + rnd() * (ARENA.maxX - ARENA.minX),
      z: ARENA.minZ + rnd() * (ARENA.maxZ - ARENA.minZ),
    });
    const bad: { from: unknown; to: unknown; via: unknown }[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      const from = spot();
      const to = spot();
      for (const p of pathFor(from, to, obstacles)) if (outside(p)) bad.push({ from, to, via: p });
    }
    expect(bad.slice(0, 3), `방 밖을 짚은 경로 ${bad.length}개`).toEqual([]);
  });

  it('무대를 옆으로 도는 경로가 뒤벽을 넘지 않는다 — 고치기 전에는 z −25 를 짚었다', () => {
    const from = { x: -3.6, z: -18 };
    const to = { name: 'X', x: 7.25, z: -19.1 };
    for (const p of pathFor(from, to, obstacles)) expect(p.z, `${p.x}, ${p.z}`).toBeGreaterThanOrEqual(ARENA.minZ);
  });

  it('콘솔을 지나는 경로가 옆벽을 넘지 않는다 — 고치기 전에는 x 13.7 을 짚었다', () => {
    const from = { x: 10.78, z: -3.28 };
    const to = { name: 'X', x: 5.53, z: -10.02 };
    for (const p of pathFor(from, to, obstacles)) expect(Math.abs(p.x), `${p.x}, ${p.z}`).toBeLessThanOrEqual(ARENA.maxX);
  });

  /**
   * 접는 것이 **길을 막지는 않는다** — 정당한 목적지는 전부 그대로 닿아야 한다.
   * 시행 지점은 ARENA 에서 0.6, 배회 목적지는 0.9 안쪽인데 접는 선은 0.43 이라 둘 다 바깥에 안 걸린다.
   */
  it('방 안 목적지는 접혀도 그대로 남는다 — 목적지를 옮기는 장치가 아니다', () => {
    for (const p of GOOD.points) {
      const path = pathFor(START, p, obstacles);
      expect(path[path.length - 1]).toEqual(p);
    }
  });

  it('막는 게 없으면 곧장 간다', () => {
    const to = { name: 'X', x: 0, z: -1 };
    expect(pathFor(START, to, obstacles)).toEqual([to]);
  });

  it('목표가 그 가구면 그 가구는 피하지 않는다', () => {
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    const spot = { name: 'X', ...targetSpot(stage, 'stand', START), object: stage.id, mode: 'stand' as const };
    expect(tunnels(START, pathFor(START, spot, obstacles, stage.id), stage.id)).toBeNull();
  });

  it('이동 시간이 직선이 아니라 **도는 경로** 기준이다', () => {
    const to = { name: 'X', x: BOX.x, z: BOX.z - 4 };
    const straight = distance(START, to) / SPEED;
    expect(travelTime(START, to, [...obstacles, BOX])).toBeGreaterThan(straight);
  });

  it('올라서기는 점프 시간이 더 붙는다', () => {
    // 같은 자리로 stand/mount 를 나눠야 거리 차가 안 섞인다 — 콘솔 자리를 빌려 좌표만 같게 잡는다
    const rack = OBJECTS.find((o) => o.id === '콘솔9')!;
    const at = targetSpot(rack, 'stand', START);
    const stand = { name: 'A', ...at, object: rack.id, mode: 'stand' as const };
    const mount = { name: 'B', ...at, object: rack.id, mode: 'mount' as const };
    expect(travelTime(START, mount, obstacles)).toBeGreaterThan(travelTime(START, stand, obstacles) - 0.5 + MOUNT_TIME * 0.9);
  });

  it('올라설 수 없는 물건에 mount 를 걸면 기각한다', () => {
    // 홀의 물건은 전부 올라설 수 있는 높이라, 규칙을 보려고 콘솔 하나를 벽 취급으로 넘긴다
    const rack = OBJECTS.find((o) => o.kind === '콘솔')!;
    const points = [
      { name: 'A', x: 0, z: -3, object: rack.id, mode: 'mount' as const },
      { name: 'B', x: 3, z: -5, object: '무대', mode: 'stand' as const },
      ...GOOD.points.slice(2),
    ];
    const objs = OBJECTS.map((o) => ({ id: o.id, mountable: o.id === rack.id ? false : o.mountable, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
    expect(validateTrial({ ...GOOD, points }, 6, START, objs).join()).toMatch(/올라설 수 없다/);
  });
});

describe('zone — 몸으로 하는 투표', () => {
  it('개체들은 대부분 한 구역으로 몰린다 (기계는 같은 기준으로 판단한다)', () => {
    const runs = Array.from({ length: 200 }, () => botZoneChoices(2, 5));
    const 다수쏠림 = runs.filter((r) => {
      const c = new Map<number, number>();
      r.forEach((z) => c.set(z, (c.get(z) ?? 0) + 1));
      return Math.max(...c.values()) >= 4;
    }).length;
    expect(다수쏠림 / runs.length).toBeGreaterThan(0.6);
  });

  it('그래도 가끔은 개체가 딴 데로 간다 — 없으면 사람만 혼자 소수파가 된다', () => {
    const flat = Array.from({ length: 200 }, () => botZoneChoices(2, 5)).flat();
    const c = new Map<number, number>();
    flat.forEach((z) => c.set(z, (c.get(z) ?? 0) + 1));
    const 소수비율 = Math.min(...c.values()) / flat.length;
    expect(소수비율).toBeGreaterThan(0.1);
  });
});

describe('beat — 박자', () => {
  it('신호는 간격대로 쌓인다', () => {
    expect(beatTimes(800, 4)).toEqual([0.8, 1.6, 2.4, 3.2]);
  });

  it('정확히 맞추면 오차가 0 이다', () => {
    const s = beatTimes(700, 6);
    expect(beatError(s, s)).toBe(0);
  });

  it('빠뜨린 박자는 큰 오차로 친다 — 안 뛴 게 제일 나쁘다', () => {
    const s = beatTimes(700, 6);
    const 조금틀림 = beatError(s, s.map((x) => x + 0.08));
    const 두번빠뜨림 = beatError(s, s.slice(0, 4));
    expect(두번빠뜨림).toBeGreaterThan(조금틀림);
  });

  it('사람처럼 흔들리면 등급이 내려간다', () => {
    const s = beatTimes(800, 8);
    const 기계 = beatError(s, s.map((x, i) => x + (i % 2 ? 0.03 : -0.03)));
    const 사람 = beatError(s, s.map((x, i) => x + (i % 2 ? 0.35 : -0.28)));
    expect(gradeOf(기계, 'beat')).toBe('normal');
    expect(gradeOf(사람, 'beat')).toBe('alert');
  });
});

describe('한 판 시뮬레이션', () => {
  /** 화면의 프레임 루프와 같은 계산을 3D 없이 돌린다 */
  function runTrial(spec: TrialSpec, sloppiness: number[], fps: number) {
    const bots = spec.points.map((point, i) => ({
      point,
      startAt: aiStartTime(spec, point, START, sloppiness[i]),
      x: START.x,
      z: START.z,
      arrivedAt: null as number | null,
    }));

    const dt = 1 / fps;
    for (let t = 0; t <= spec.seconds + 3; t += dt) {
      for (const b of bots) {
        if (t < b.startAt || b.arrivedAt !== null) continue;
        const d = distance(b, b.point);
        const step = SPEED * dt;
        if (d <= step) {
          b.x = b.point.x;
          b.z = b.point.z;
          b.arrivedAt = t;
        } else {
          b.x += ((b.point.x - b.x) / d) * step;
          b.z += ((b.point.z - b.z) / d) * step;
        }
      }
    }
    return bots;
  }

  it('AI 는 전원 도착하고, 오차가 자기 흔들림 안에 들어온다', () => {
    const sloppiness = [0.1, 0.2, 0.3, 0.1, 0.2, 0.3];
    const bots = runTrial(GOOD, sloppiness, 60);
    bots.forEach((b, i) => {
      expect(b.arrivedAt, `${b.point.name} 미도착`).not.toBeNull();
      // 출발 시각 오차가 그대로 도착 오차가 된다 (+ 프레임 반올림)
      expect(Math.abs(b.arrivedAt! - GOOD.seconds)).toBeLessThan(sloppiness[i] + 0.1);
    });
  });

  it('프레임 속도가 달라져도 결과가 같다 — 60Hz 와 120Hz', () => {
    const sloppiness = [0, 0, 0, 0, 0, 0];
    const a = runTrial(GOOD, sloppiness, 60).map((b) => b.arrivedAt!);
    const b = runTrial(GOOD, sloppiness, 120).map((x) => x.arrivedAt!);
    a.forEach((t, i) => expect(Math.abs(t - b[i])).toBeLessThan(0.05));
  });

  it('흔들림 0 이면 전원이 목표 시각에 정확히 도착한다', () => {
    const bots = runTrial(GOOD, [0, 0, 0, 0, 0, 0], 60);
    bots.forEach((b) => expect(Math.abs(b.arrivedAt! - GOOD.seconds)).toBeLessThan(0.06));
  });
});

describe('밸런스 — 사람이 첫 판에 드러나지 않아야 한다', () => {
  it('개체 흔들림이 사람 오차와 겹친다', () => {
    // 사람이 눈대중으로 걸으면 대략 0.3~1.2초쯤 어긋난다고 본다
    const samples = Array.from({ length: 300 }, () => dealSloppiness(5));
    const flat = samples.flat();
    const 흔들리는개체 = flat.filter((s) => s > 0.5).length / flat.length;
    // 넷 중 하나쯤은 눈에 띄게 흔들려야 사람이 숨을 자리가 생긴다
    expect(흔들리는개체).toBeGreaterThan(0.15);
    expect(흔들리는개체).toBeLessThan(0.4);
  });

  it('등급 경계가 의도대로다', () => {
    expect(gradeOf(0.2)).toBe('normal');
    expect(gradeOf(0.8)).toBe('warn');
    expect(gradeOf(2)).toBe('alert');
  });
});

describe('거리·시간 계산', () => {
  it('travelTime 은 거리/속도다', () => {
    const p = { name: 'X', x: START.x, z: START.z - 13 };
    expect(travelTime(START, p)).toBeCloseTo(13 / SPEED, 5);
  });

  it('도착 반경이 사람이 걸어서 밟을 만한 크기다', () => {
    expect(ARRIVE_RADIUS).toBeGreaterThan(0.5);
    expect(ARRIVE_RADIUS).toBeLessThan(1.5);
  });
});
