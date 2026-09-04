/**
 * 태도 저장소의 v8 몫 — 원장(최근 4 + |최대| 1) · 도달점으로 올리기(raiseTo) · 위로 수 · memorial 한 번 · 「나를 위해 나선 적 있다」.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { units , NO_RETURN } from '../../../src/features/world2/units';

beforeEach(() => units.reset());

describe('원장', () => {
  it('최근 넷에 절댓값이 가장 큰 하나를 더한다 — 시간순, 0 은 안 적는다', () => {
    units.note('u104', 3, '제일 센 것', '복도');
    units.note('u104', 0, '없는 줄');
    for (const d of [1, -1, 1, 1, -1]) units.note('u104', d, `d${d}`, '휴게');
    const l = units.ledger('u104');
    expect(l).toHaveLength(5);
    expect(l[0]).toMatchObject({ delta: 3, why: '제일 센 것', where: '복도' });
    expect(l.slice(1).map((x) => x.delta)).toEqual([-1, 1, 1, -1]);
    expect(l.some((x) => x.why === '없는 줄')).toBe(false);
  });

  it('넷 이하면 그대로, 최대가 최근 넷 안이면 더하지 않는다', () => {
    units.note('u089', -1, '쓸데없는 걸 묻는다');
    expect(units.ledger('u089')).toHaveLength(1);
    units.note('u089', 2, 'a');
    units.note('u089', 3, 'b');
    units.note('u089', 1, 'c');
    units.note('u089', 1, 'd');
    expect(units.ledger('u089').map((x) => x.why)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('remember — 움직이지 않은 문장도 그대로 남긴다', () => {
  it('delta 0 으로 원문이 원장에 들고, note 의 0 은 여전히 버려진다', () => {
    units.note('guard21', 0, '버려지는 줄', '복도');
    units.remember('guard21', '나 4 구역이야', '복도');
    expect(units.ledger('guard21')).toEqual([{ delta: 0, why: '나 4 구역이야', where: '복도', at: expect.any(Number) }]);
  });

  it('최근 넷에 들고, 절댓값 최대 줄은 그대로 더해진다', () => {
    units.note('guard21', -2, '센 것', '휴게');
    for (const t of ['a', 'b', 'c', 'd']) units.remember('guard21', t);
    const l = units.ledger('guard21');
    expect(l).toHaveLength(5);
    expect(l[0]).toMatchObject({ delta: -2, why: '센 것' });
    expect(l.slice(1).map((x) => x.why)).toEqual(['a', 'b', 'c', 'd']);
    expect(l.slice(1).every((x) => x.delta === 0)).toBe(true);
  });
});

describe('raiseTo — 도달점으로 올린다', () => {
  it('올리기만 한다: 내리지 않고, cap 과 선 넘음을 지킨다', () => {
    expect(units.raiseTo('u104', 2)).toBe(2);
    expect(units.ups('u104')).toBe(1);
    expect(units.raiseTo('u104', 1)).toBe(2);
    expect(units.ups('u104')).toBe(1);
    // 고치지 않은 것은 +1 을 못 넘는다
    expect(units.raiseTo('u089', 3)).toBe(1);
    // 선을 넘은 개체는 안 열린다
    units.cross('u137');
    expect(units.raiseTo('u137', 3)).toBe(-3);
  });
});

describe('판에 붙는 플래그들', () => {
  it('위로 수는 개체마다, memorial 은 판마다 — reset 이 둘 다 비운다', () => {
    expect(units.bumpComfort('u104')).toBe(1);
    expect(units.bumpComfort('u104')).toBe(2);
    expect(units.comforts('u089')).toBe(0);
    expect(units.memorialUsed()).toBe(false);
    units.useMemorial();
    expect(units.memorialUsed()).toBe(true);
    units.reset();
    expect(units.comforts('u104')).toBe(0);
    expect(units.memorialUsed()).toBe(false);
  });

  it('「나를 위해 나선 적 있다」는 찍어야 생긴다 — 태도 3 만으로는 아니다', () => {
    units.raiseTo('u201', 3);
    expect(units.standsFor('u201')).toBe(false);
    units.markStandsFor('u201');
    expect(units.standsFor('u201')).toBe(true);
    units.reset();
    expect(units.standsFor('u201')).toBe(false);
  });
});

describe('되돌아오지 않는 선 — 태도가 −2 아래로 내려가면 좋은 말로도 안 오른다 (2026-09-03 사용자)', () => {
  beforeEach(() => units.reset());

  it('−2 에 닿은 개체는 올려도 그대로다 — 내려가는 것은 계속 된다', () => {
    units.shift('u104', -2);
    expect(units.stage('u104')).toBe(NO_RETURN);
    units.shift('u104', 1);
    units.shift('u104', 3);
    expect(units.stage('u104')).toBe(NO_RETURN);
    // 더 나빠질 수는 있다
    units.shift('u104', -1);
    expect(units.stage('u104')).toBe(-3);
  });

  it('−1 까지는 아직 되돌릴 수 있다 — 선은 −2 다', () => {
    units.shift('u089', -1);
    units.shift('u089', 1);
    expect(units.stage('u089')).toBe(0);
  });
});
