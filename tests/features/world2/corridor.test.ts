/**
 * 복도의 유도 속마음(NUDGES) — **막혔을 때만 든다.**
 *
 * 「막혔다」를 26 초 간격만으로 재면 그림 앞에 선 사람이 막힌 사람으로 잡힌다: 속마음 석 줄을 읽는 동안 시계가 그대로 흘러
 * 마지막 줄이 끝나는 순간 「복도 끝에 격납문이 있다」가 같은 속마음 꼴로 이어 붙었다
 * (2026-09-03 사용자: 「그림을 보고 있었는데 저기가 격납문이겠지 하는 대사가 나온다」).
 * 그래서 tick 이 **무언가 일어나는 프레임마다** 다음 속마음을 NUDGE_AFTER_MS 뒤로 민다.
 *
 * 순수 상태기라 host 를 가짜로 세우고 시각을 손으로 민다. quiet()·state() 를 시험이 직접 쥐고 흔든다 —
 * 진짜 host 에서는 그 둘이 대사·입력줄·시선 판독(probe)을 본다.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { corridor, type Host } from '../../../src/features/world2/corridor';
import { NUDGES } from '../../../src/features/world2/script';
import { CORRIDOR2_EXIT, CORRIDOR2_PATH } from '../../../src/world2/map/corridor';

/** 문에서 먼 자리 — 조건 없는 줄이 덮이지 않게 (DOOR_IN_SIGHT_R 7 m 밖). 꺾임도 피한다 */
const AT_MURAL = { x: CORRIDOR2_PATH[0].x, z: CORRIDOR2_PATH[0].z };
/** 조건 없는 줄 — 배열의 마지막, 「복도 끝에 격납문이 있다…」 */
const DOOR_NUDGE = NUDGES[NUDGES.length - 1].text;

interface Rig {
  host: Host;
  thoughts: string[];
  set: (p: { quiet?: boolean; talking?: boolean; choice?: boolean; stillness?: boolean }) => void;
}

function rig(): Rig {
  const thoughts: string[] = [];
  let quiet = true;
  const st = { choice: null, urgent: null, stillness: null, answer: null, blackout: 0, talking: false } as never;
  const s = st as unknown as { choice: unknown; stillness: unknown; talking: boolean };
  const no = () => undefined;
  const host: Host = {
    once: (() => {
      const seen = new Set<string>();
      return (k: string) => (seen.has(k) ? false : (seen.add(k), true));
    })(),
    emit: no,
    play: (lines) => {
      for (const l of lines as readonly { who: string; text: string }[]) if (l.who === 'thought') thoughts.push(l.text);
      return 0;
    },
    speak: () => 0,
    playCast: () => 0,
    patch: no,
    now: () => 0,
    me: () => AT_MURAL,
    nearest: () => null,
    roomRadius: () => 6,
    room: () => 'corridor',
    state: () => st,
    quiet: () => quiet,
    busyUntil: () => 0,
    later: no,
    afterControl: no,
    // 조작권부터 넉넉히 흘렀다 — NUDGE_FIRST_MS 는 이 시험의 관심이 아니다
    sinceControl: () => 600_000,
    leave: no,
    stare: no,
    approach: no,
    release: no,
    unitPos: () => null,
    witnesses: () => [],
    heard: () => [],
    raiseAlert: no,
    objective: no,
    vanish: no,
    where: () => '복도',
    passerby: () => null,
    cycle: no,
    stillness: no,
    guard: () => null,
    fireWalk: no,
    substituteWalk: no,
    lastSayAt: () => 0,
    guardFree: () => true,
    chatOk: () => true,
    address: no,
  };
  return {
    host,
    thoughts,
    set: (p) => {
      if (p.quiet !== undefined) quiet = p.quiet;
      if (p.talking !== undefined) s.talking = p.talking;
      if (p.choice !== undefined) s.choice = p.choice ? { title: '', yes: '', no: '', onYes: no, onNo: no } : null;
      if (p.stillness !== undefined) s.stillness = p.stillness ? { need: 3, got: 1 } : null;
    },
  };
}

/** ms 만큼 흘리며 프레임을 돌린다 — 진짜 판처럼 잘게 (tick 이 프레임마다 시계를 미는 것을 보려면 한 번에 뛰면 안 된다) */
function run(host: Host, from: number, ms: number, step = 500): number {
  let t = from;
  const end = from + ms;
  while (t < end) {
    t = Math.min(end, t + step);
    corridor.tick(t, AT_MURAL);
  }
  return t;
}

describe('복도 유도 속마음', () => {
  beforeEach(() => corridor.reset());

  it('가만히 있으면 든다', () => {
    const r = rig();
    corridor.start(r.host);
    corridor.enter(0);
    run(r.host, 0, 40_000);
    expect(r.thoughts.length).toBeGreaterThan(0);
  });

  it('그림을 들여다보는 동안에는 안 들고, 다 본 직후에도 바로 안 든다', () => {
    const r = rig();
    corridor.start(r.host);
    corridor.enter(0);
    // 벽 앞에 서서 보는 중 — 진짜 host 는 probe 로 이걸 quiet=false 로 만든다
    r.set({ quiet: false });
    let t = run(r.host, 0, 40_000);
    expect(r.thoughts).toEqual([]);
    // 다 봤다 — 속마음이 끝나고 정적으로 돌아온 순간
    r.set({ quiet: true });
    t = run(r.host, t, 3000);
    expect(r.thoughts).toEqual([]);
    // 한참 뒤에는 든다 — 유도는 사라지는 게 아니라 미뤄지는 것이다
    run(r.host, t, 30_000);
    expect(r.thoughts.length).toBeGreaterThan(0);
  });

  it('물음이 떠 있거나 막대가 도는 동안에는 안 든다', () => {
    for (const on of [{ choice: true }, { stillness: true }, { talking: true }]) {
      corridor.reset();
      const r = rig();
      corridor.start(r.host);
      corridor.enter(0);
      r.set(on);
      run(r.host, 0, 40_000);
      expect(r.thoughts).toEqual([]);
    }
  });

  it('문이 눈앞이면 「복도 끝에 격납문이 있다」는 안 든다', () => {
    const r = rig();
    corridor.start(r.host);
    corridor.enter(0);
    let t = 0;
    // 문에서 먼 자리에서는 결국 그 줄이 나온다
    t = run(r.host, t, 400_000);
    expect(r.thoughts).toContain(DOOR_NUDGE);

    // 문 앞(2 m — 물음이 뜨는 1.6 m 밖, 눈에는 든다)에서는 그 줄이 없다
    corridor.reset();
    const r2 = rig();
    corridor.start(r2.host);
    corridor.enter(0);
    const near = { x: CORRIDOR2_EXIT.x, z: CORRIDOR2_EXIT.z + 2 };
    for (let u = 0; u < 800; u += 1) corridor.tick(u * 500, near);
    expect(r2.thoughts).not.toContain(DOOR_NUDGE);
  });
});
