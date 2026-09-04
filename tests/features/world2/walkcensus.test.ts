/**
 * **몸이 자리를 옮기는가** — 휴게 구역과 중앙 시설의 걸음 인구조사.
 *
 * 2026-09-04 사용자: 「world2 시나리오2에서 복도를 제외하고 거의 대부분의 로봇이 한자리에서 정지하고있어
 * 자연스럽게 걸을수있도록 해줘」 → 「휴게랑 중앙시설 개체들만 3 분에 1 정도 걷게해주면 될꺼같아」.
 *
 * 왜 이 시험이 따로 필요한가: 있던 도구(tools/scenario2-anim-check.mjs)는 「걷기 클립이 도는데 안 나아가는 몸」을
 * 잡는 것이라 **애초에 안 걷는 몸은 idle 이라 판정문에 아예 안 들어간다** — 여섯 방이 전부 정지 화면이어도
 * 그 도구는 초록불이었다. 그래서 재는 것을 바꾼다: 「제자리걸음을 하나」가 아니라 **「자리를 옮기기는 하나」**.
 *
 * patrol 은 시계와 사람 자리를 인자로 받는 순수한 상태기라 서버 없이 여기서 통째로 돌릴 수 있다.
 * 무작위는 머무는 시간(dwell) 하나뿐이라 Math.random 만 씨앗으로 고정하면 판이 결정적이다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BEATS, patrol } from '../../../src/features/world2/patrol';
import { UNIT_PLACES } from '../../../src/features/world2/Room2Scene';

/** 사람은 방 밖에 둔다 — 사람이 길 위에 서면 비켜 주기·기다림이 섞여 걸음을 못 잰다 */
const FAR = { x: 999, z: 999 };
const DT = 1 / 30;
/** 3 분 — 이 방들의 가장 긴 머무름(39 초)이 네 번 넘게 돈다 */
const SEC = 180;
/** 이만큼 넘게 처음 자리에서 벗어났으면 「자리를 옮겼다」 — 태도 오프셋도 비킴도 없는 판이라 넉넉히 잡는다 */
const MOVED_M = 1.0;
/** 몸 둘이 이보다 가까우면 겹친 것 (몸 반지름 0.42 의 두 배) */
const OVERLAP_M = 0.84;

interface Row {
  id: string;
  /** 처음 자리에서 벗어난 최대 폭(m) */
  span: number;
  /** 걷다가 선 횟수 — 0 이면 **못 서고 영영 걷는 몸**이다 */
  stops: number;
  /** 한 번에 쉬지 않고 걸은 최장 시간(초) */
  maxRun: number;
}

interface Census {
  rows: Row[];
  bodies: number;
  /** 아무도 안 걷는 프레임의 비율 */
  idleFrames: number;
  /** 한 프레임에 동시에 걸은 최대 몸 수 */
  peak: number;
  overlaps: number;
}

function census(room: 'rest' | 'central2'): Census {
  patrol.reset(room, UNIT_PLACES[room]);
  const ids = UNIT_PLACES[room].map((p) => p.id);
  const start = new Map<string, { x: number; z: number }>();
  const span = new Map<string, number>();
  const stops = new Map<string, number>();
  const run = new Map<string, number>();
  const maxRun = new Map<string, number>();
  const wasStill = new Map<string, boolean>();
  let frames = 0;
  let noWalk = 0;
  let peak = 0;
  let overlaps = 0;

  for (let i = 0; i < SEC * 30; i += 1) {
    patrol.tick(DT, FAR, 1000 + i * DT * 1000);
    const now = ids.map((id) => ({ id, m: patrol.of(id) })).filter((u) => u.m) as { id: string; m: NonNullable<ReturnType<typeof patrol.of>> }[];
    let walking = 0;
    for (const { id, m } of now) {
      if (!start.has(id)) {
        start.set(id, { x: m.x, z: m.z });
        span.set(id, 0);
        stops.set(id, 0);
        run.set(id, 0);
        maxRun.set(id, 0);
        wasStill.set(id, m.still);
      }
      const s = start.get(id)!;
      span.set(id, Math.max(span.get(id)!, Math.hypot(m.x - s.x, m.z - s.z)));
      if (!m.still) {
        walking += 1;
        run.set(id, run.get(id)! + DT);
        maxRun.set(id, Math.max(maxRun.get(id)!, run.get(id)!));
      } else {
        // 걷다가 섰다 — 그 순간을 한 번으로 센다
        if (!wasStill.get(id)) stops.set(id, stops.get(id)! + 1);
        run.set(id, 0);
      }
      wasStill.set(id, m.still);
    }
    for (let a = 0; a < now.length; a += 1) {
      for (let b = a + 1; b < now.length; b += 1) {
        if (Math.hypot(now[a].m.x - now[b].m.x, now[a].m.z - now[b].m.z) < OVERLAP_M) overlaps += 1;
      }
    }
    frames += 1;
    if (walking === 0) noWalk += 1;
    peak = Math.max(peak, walking);
  }

  return {
    rows: ids.map((id) => ({ id, span: span.get(id) ?? 0, stops: stops.get(id) ?? 0, maxRun: maxRun.get(id) ?? 0 })),
    bodies: ids.length,
    idleFrames: noWalk / frames,
    peak,
    overlaps,
  };
}

/** 걸음표에 자리가 둘 이상인 것 — 「걷기로 되어 있는 몸」 */
const planned = (room: 'rest' | 'central2') =>
  Object.entries(BEATS[room])
    .filter(([, b]) => b.posts.length > 1)
    .map(([id]) => id)
    .sort();

const realRandom = Math.random;
beforeEach(() => {
  // dwell 만 무작위다 — 씨앗을 박으면 판이 결정적이라 이 시험이 깜빡이지 않는다
  let seed = 12345;
  Math.random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
});
afterEach(() => {
  Math.random = realRandom;
});

describe.each(['rest', 'central2'] as const)('%s — 몸이 자리를 옮기는가', (room) => {
  it('★ 걷기로 되어 있는 몸은 전부 실제로 자리를 옮긴다 — 그리고 그 밖의 몸은 안 옮긴다', () => {
    const c = census(room);
    const moved = c.rows.filter((r) => r.span > MOVED_M).map((r) => r.id).sort();
    /*
     * 걸음표에 자리를 줬는데 3 분을 돌려도 안 옮겼다면 그 몸은 **못 서는 게 아니라 못 걷는 것**이다 —
     * postFree 가 둘째 자리를 늘 거절해 첫 자리에 붙박였다는 뜻이라, 자리를 잘못 놓은 것이다.
     */
    expect(moved).toEqual(planned(room));
  });

  it('★ 3 분의 1 안팎이 걷는다 — 정지 화면도 아니고 개미굴도 아니다', () => {
    const c = census(room);
    const moved = c.rows.filter((r) => r.span > MOVED_M).length;
    // 사용자가 정한 비율 — 너무 적으면 「다 멈춰 있다」로 돌아가고, 절반을 넘으면 군중이 아니라 대열이다
    expect(moved / c.bodies).toBeGreaterThanOrEqual(0.2);
    expect(moved / c.bodies).toBeLessThanOrEqual(0.5);
    /*
     * 동시에 걷는 수는 **꼭짓점으로 재지 않는다** — 드문 꼬리 때문에 깜빡이는 시험이 된다.
     * 여기서는 「몸의 절반을 한꺼번에 넘지는 않는다」만 본다.
     */
    expect(c.peak).toBeLessThanOrEqual(Math.ceil(c.bodies / 2));
  });

  it('★ 못 서고 영영 걷는 몸이 없다 — 안 서면 말 걸기 대상에서 통째로 빠진다', () => {
    const c = census(room);
    for (const r of c.rows.filter((x) => x.span > MOVED_M)) {
      /*
       * 곁 판정(scenario2 의 near)은 서 있는 몸만 본다. 순환의 모든 자리가 늘 거절되면 of().still 이 영영 false 라
       * 그 몸에게는 [Enter] 로 말을 걸 수 없다 — 검문 앞줄 둘이 정확히 그 고장이었다 (2026-09-04).
       */
      expect(r.stops, `${r.id} 가 3 분 동안 한 번도 안 섰다`).toBeGreaterThanOrEqual(2);
      // 한 번에 45 초를 넘겨 걸으면 그건 「이따금 자리를 옮긴다」가 아니라 순찰이다
      expect(r.maxRun, `${r.id} 가 ${r.maxRun.toFixed(1)}초를 쉬지 않고 걸었다`).toBeLessThanOrEqual(45);
    }
  });

  it('몸이 서로 겹치지 않는다 — 걷는 몸이 늘면 가장 먼저 깨지는 것이 이것이다', () => {
    expect(census(room).overlaps).toBe(0);
  });
});

/*
 * 안 걷게 두는 몸과 그 이유 — **면제 목록 자체가 이번 변경의 설계 선언이다.**
 * 여기 없는 이름이 자리에 붙박여 있으면 그건 실수지 설계가 아니다.
 */
describe('안 걷는 몸에는 이유가 있다', () => {
  it('휴게 — 자는 것과 빈 벽을 보는 것은 자리를 안 옮긴다', () => {
    const c = census('rest');
    const still = (id: string) => c.rows.find((r) => r.id === id)!.span;
    // 자는 몸 (pose doze · REST_SLEEPER) — 대답하는 순간 「잔다」가 거짓이 된다
    expect(still('u104')).toBe(0);
    // 아무것도 없는 서쪽 벽에 코를 박고 선 것 — 그 자리가 이 몸의 전부다 (rest.tsx 가 그 칸을 일부러 비웠다)
    expect(still('seer')).toBe(0);
  });

  it('중앙 시설 — 검문 앞줄 둘과 줄 뒤의 손끝은 선다', () => {
    const c = census('central2');
    const still = (id: string) => c.rows.find((r) => r.id === id)!.span;
    // 내 앞에 번호를 대는 것들이라 **서 있어야** 말이 걸린다 (2026-09-04 에 자리를 하나로 되돌린 그 둘)
    expect(still('bg-c2-044')).toBe(0);
    expect(still('bg-c2-128')).toBe(0);
    // 「틀릴까 봐 미리 겁을 내는」 개체가 줄에 설 차례를 기다리는 자세
    expect(still('u118')).toBe(0);
  });
});
