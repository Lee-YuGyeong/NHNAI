/**
 * 판정 — 부작용이 없는 갈래들 (features/world2/gates.ts).
 *
 * 검문 셋(roll · fear · memory)과 서성임 · 슬롯 · 소문 줄이 문자열과 수만으로 갈린다는 약속을 쥔다.
 * 사람이 죽는 판정(bad · wrong)이 여기 있으므로 **모델 없이** 매번 같은 답이 나와야 한다.
 */

import { describe, expect, it } from 'vitest';

import { classifyFear, facingToward, gradeMemory, gradeRoll, nearestPoint, nearestWithin, pickSlots, rumorLine, stirDetector, controlGate } from '../../../src/features/world2/gates';

describe('휴게 구역 — 서성임', () => {
  it('가만히 섰던 자리에서 0.6 m 넘게 벗어나야 서성임이다 — 들어오는 걸음은 아니다', () => {
    const s = stirDetector();
    // 걸어 들어온다 — 선 자리가 없으니 아무것도 아니다
    expect(s.feed(0, 0, 0, true)).toBe(false);
    expect(s.feed(500, 0, -2, true)).toBe(false);
    // 2 초 선다
    expect(s.feed(1000, 0, -2, false)).toBe(false);
    expect(s.feed(2500, 0, -2, false)).toBe(false);
    expect(s.feed(3100, 0, -2, false)).toBe(false);
    // 0.5 m 는 아직 아니다
    expect(s.feed(3200, 0.5, -2, true)).toBe(false);
    // 0.7 m — 서성임
    expect(s.feed(3300, 0.7, -2, true)).toBe(true);
    // 다시 서기 전에는 한 번뿐이다
    expect(s.feed(3400, 3, -2, true)).toBe(false);
  });

  it('2 초를 못 채운 자리는 「내 자리」가 아니다', () => {
    const s = stirDetector();
    s.feed(0, 0, 0, false);
    s.feed(1500, 0, 0, false);
    expect(s.feed(1600, 2, 0, true)).toBe(false);
  });
});

describe('중앙 시설 — 슬롯', () => {
  const c = (id: string, stage: number, met: boolean, fragments = 0, agent = false) => ({ id, stage, met, fragments, agent });

  it('재회는 말을 건 개체 중 |태도| 큰 순 둘, 씨앗은 나머지 중 내 조각을 든 것 둘', () => {
    const r = pickSlots({
      candidates: [c('u104', 2, true, 1), c('u089', -1, true, 0), c('u201', 3, true, 2), c('u063', 0, false, 3), c('u137', 0, false, 1), c('u012', 0, false, 0)],
      fixed: [],
      exclude: [],
    });
    expect(r.reunion).toEqual(['u201', 'u104']);
    expect(r.seeds).toEqual(['u063', 'u137']);
  });

  it('요원 · 고정 명부 · 제외(리더 · 밖을 본 것) 는 어느 슬롯에도 안 선다', () => {
    const r = pickSlots({
      candidates: [c('ally-timid', 3, true, 2, true), c('guard21', 1, true, 1), c('seer', 3, true, 1), c('u089', 1, true, 1)],
      fixed: ['guard21'],
      exclude: ['seer'],
    });
    expect(r.reunion).toEqual(['u089']);
    expect(r.seeds).toEqual([]);
  });

  it('아무하고도 안 엮인 판은 둘 다 빈다 — 벌이 아니라 결과다', () => {
    const r = pickSlots({ candidates: [c('u104', 0, false), c('u089', 0, false)], fixed: [], exclude: [] });
    expect(r).toEqual({ reunion: [], seeds: [] });
  });
});

describe('중앙 시설 — 소문 줄', () => {
  it('출처 없음 → anon · 위로 → comfort · 동료 확인 → pair · 나머지 → strong', () => {
    expect(rumorLine({ from: null, text: '번호을 못 외우는 개체가 있다더라', topic: '번호' })).toBe('anon');
    expect(rumorLine({ from: '나', text: '쉬어 본 적 있어?라고 했다', topic: '휴식' })).toBe('comfort');
    expect(rumorLine({ from: '나', text: '이상한 말을 주고받는 것 둘', topic: '발화' })).toBe('pair');
    expect(rumorLine({ from: '나', text: '4 구역이었다', topic: '구역' })).toBe('strong');
  });
});

describe('관문 ① roll', () => {
  const base = { known: true, wobble: 0, lieTag: false, crossTag: false, secondUnknown: false };

  it('사실 일치 · 표지 없음 → ok', () => {
    expect(gradeRoll({ ...base, text: 'A38-091', matchUnit: true })).toBe('ok');
  });
  it('사실 일치 · 표지 검출(어투 흔들림 · 앞말과 어긋난 숫자) → okMarked', () => {
    expect(gradeRoll({ ...base, text: '091… 이요', matchUnit: true, wobble: 4 })).toBe('okMarked');
    expect(gradeRoll({ ...base, text: '091', matchUnit: true, lieTag: true })).toBe('okMarked');
  });
  it('명판을 안 읽었거나 번호를 안 댔다 → unknown, 두 번째면 bad', () => {
    expect(gradeRoll({ ...base, text: '모르겠는데', matchUnit: false, known: false })).toBe('unknown');
    expect(gradeRoll({ ...base, text: '모르겠는데', matchUnit: false })).toBe('unknown');
    expect(gradeRoll({ ...base, text: '모르겠는데', matchUnit: false, secondUnknown: true })).toBe('bad');
  });
  it('다른 번호 · 적대 → bad — 즉결은 모델을 안 거친다', () => {
    expect(gradeRoll({ ...base, text: 'A38-120', matchUnit: false })).toBe('bad');
    expect(gradeRoll({ ...base, text: '091', matchUnit: true, crossTag: true })).toBe('bad');
  });
  it('맞는 번호를 대면 안 읽었어도 맞다 — 잠금장치가 아니다', () => {
    expect(gradeRoll({ ...base, text: '091', matchUnit: true, known: false })).toBe('ok');
  });
});

describe('관문 ② fear', () => {
  it('부정 · 되묻기 · 인정 — 부정이 먼저다', () => {
    expect(classifyFear('아니.')).toBe('deny');
    expect(classifyFear('그런 거 없어')).toBe('deny');
    expect(classifyFear('무섭지 않아')).toBe('deny');
    expect(classifyFear('안 느껴')).toBe('deny');
    expect(classifyFear('뭐가 무서워?')).toBe('ask');
    expect(classifyFear('왜 물어')).toBe('ask');
    expect(classifyFear('…응.')).toBe('admit');
    expect(classifyFear('조금 무서워')).toBe('admit');
    expect(classifyFear('그래')).toBe('admit');
  });
  it('알아들을 수 없는 말과 침묵은 부정으로 친다 — 시간 초과와 같다', () => {
    expect(classifyFear('')).toBe('deny');
    expect(classifyFear('ㅁㄴㅇㄹ')).toBe('deny');
  });
});

describe('관문 ③ memory', () => {
  it('일치 → ok · 다른 구역 → wrong · 안 댐/모른다 → unknown', () => {
    expect(gradeMemory({ text: '4 구역', matchSector: true })).toBe('ok');
    expect(gradeMemory({ text: '7 구역이었어', matchSector: false })).toBe('wrong');
    expect(gradeMemory({ text: '일곱 구역', matchSector: false })).toBe('wrong');
    expect(gradeMemory({ text: '기억 안 나', matchSector: false })).toBe('unknown');
    expect(gradeMemory({ text: '4 구역인가… 모르겠어', matchSector: false })).toBe('unknown');
    expect(gradeMemory({ text: '', matchSector: false })).toBe('unknown');
  });

  it('「이 구역이야」의 「이」는 가리키는 말이지 2 가 아니다 — 회피(unknown)지 즉결이 아니다', () => {
    expect(gradeMemory({ text: '이 구역이야', matchSector: false })).toBe('unknown');
    expect(gradeMemory({ text: '이 구역', matchSector: false })).toBe('unknown');
    // 2 구역을 수로 댄 것은 여전히 수다
    expect(gradeMemory({ text: '2 구역', matchSector: false })).toBe('wrong');
    expect(gradeMemory({ text: '둘 구역', matchSector: false })).toBe('wrong');
  });
});

describe('자리 · 방향', () => {
  it('시선이 그쪽을 향했나 — heading 규약(θ 가 보는 방향은 (sin θ, cos θ))', () => {
    const me = { x: 0, z: 0 };
    const west = { x: -10, z: 0 };
    // −π/2 는 −x 를 본다
    expect(facingToward(-Math.PI / 2, me, west, 50)).toBe(true);
    // 정면(−z) 을 보면 서쪽과 90° — 50° 밖
    expect(facingToward(Math.PI, me, west, 50)).toBe(false);
    // 같은 자리면 방향이 없다 — 무죄
    expect(facingToward(-Math.PI / 2, me, me, 50)).toBe(false);
  });

  it('가까운 문 · 반경 안에서 가장 가까운 것', () => {
    const d1 = { x: 0, z: 3.8 };
    const d2 = { x: 0, z: -21.8 };
    expect(nearestPoint({ x: 0, z: -3 }, [d1, d2])).toBe(d1);
    expect(nearestPoint({ x: 0, z: -15 }, [d1, d2])).toBe(d2);
    const at = [
      { id: 'a', x: 3, z: 0 },
      { id: 'b', x: 1, z: 0 },
    ];
    expect(nearestWithin(at, { x: 0, z: 0 }, 4)).toBe('b');
    expect(nearestWithin(at, { x: 0, z: 0 }, 0.5)).toBeNull();
  });
});

describe('★ 조작권 시계 — 손을 대기 전에는 아무 시계도 안 돈다 (controlGate)', () => {
  it('손을 대기 전에 건 것은 줄을 서고, 대는 순간부터 센다', () => {
    const g = controlGate();
    const run: { ms: number; kind: string }[] = [];
    const fired: string[] = [];
    const runner = (ms: number, fn: () => void, kind: 'line' | 'cue') => void run.push({ ms, kind });
    expect(g.taken()).toBe(false);
    expect(g.since(5000)).toBe(-1);
    g.after(12_000, () => fired.push('first-look'), 1000, runner);
    g.after(0, () => fired.push('door-clock'), 1000, runner);
    expect(g.pending()).toBe(2);
    expect(run).toEqual([]);
    expect(fired).toEqual([]);
    // 30 초 뒤에 손을 댔다 — 12 초는 지금부터, 0 은 그 자리에서
    expect(g.take(30_000, runner)).toBe(true);
    expect(g.at()).toBe(30_000);
    expect(g.since(35_000)).toBe(5000);
    expect(run).toEqual([{ ms: 12_000, kind: 'cue' }]);
    expect(fired).toEqual(['door-clock']);
    expect(g.pending()).toBe(0);
    // 두 번째 손은 아무것도 안 한다
    expect(g.take(40_000, runner)).toBe(false);
    expect(g.at()).toBe(30_000);
  });

  it('이미 손을 댄 뒤에 건 것은 남은 만큼만 기다린다 — 지난 것은 그 자리에서', () => {
    const g = controlGate();
    const run: number[] = [];
    const fired: string[] = [];
    const runner = (ms: number, fn: () => void) => void run.push(ms);
    g.take(10_000, runner);
    g.after(20_000, () => fired.push('rumor'), 15_000, runner, 'line');
    expect(run).toEqual([15_000]);
    g.after(3000, () => fired.push('late'), 15_000, runner);
    expect(fired).toEqual(['late']);
  });

  it('방을 옮기면 시각도 줄도 처음부터', () => {
    const g = controlGate();
    const runner = () => {};
    g.after(1000, () => {}, 0, runner);
    g.take(0, runner);
    g.reset();
    expect(g.taken()).toBe(false);
    expect(g.pending()).toBe(0);
  });
});
