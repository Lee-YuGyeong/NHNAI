/**
 * 마모가 몸에 닿는가 — wear.ts.
 *
 * ★ 2026-09-03 부터 이 파일이 지키는 것이 뒤집혔다. 전에는 「GLB 몸에도 얹을 조각(overlay)이 나온다」를 셌는데,
 *   그 조각이 곧 사용자가 본 상자였다 (「왜 glb 에 상자를 달고 다니는지 이해가 안 돼」) — 열 장이 이미 모델링해 들고 있는
 *   수선 부품 · 얼굴판의 금 · 총을 코드가 한 번 더 그리고 있었다. 그래서 지금 세는 것은 **안 얹는다**는 쪽이다:
 *   dress 는 색과 기울기와 버릇만 내놓고, 몸 없는 look 은 아바타가 아니라 **닳은 자리가 같은 몸을 빌린다**(bodyOf).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CAST, CAST_BY_ID, type Look } from '../../../src/features/world2/cast';
import { bodyOf, dress, idleOf } from '../../../src/features/world2/wear';

const look = (id: string) => CAST_BY_ID.get(id)!.look;

describe('몸에 아무것도 안 붙인다 — 그리는 쪽은 GLB 다', () => {
  it('dress 가 내놓는 것은 색 · 기울기 · 그룹 변형 · 버릇 넷뿐이다 (조각 · 몸 색은 없다)', () => {
    for (const c of CAST) {
      expect(Object.keys(dress(c.look)).sort(), c.id).toEqual(['idle', 'lean', 'pose', 'tint']);
    }
  });
  it('얼굴의 금도 총도 값으로만 남는다 — 얹는 것은 없다. 그 둘은 GLB 에 구워져 있다', () => {
    // 열에 적힌 것(marked · rifle)은 그대로다. 없어진 것은 그것을 상자로 다시 그리던 쪽이다
    expect(look('u137').face).toBe('marked');
    expect(look('guard21').rifle).toBe(true);
    const d = dress(look('u137'));
    expect(d).not.toHaveProperty('overlay');
    expect(d).not.toHaveProperty('patches');
  });
});

describe('몸을 빌린다 — 아무도 단색 아바타로 서지 않는다', () => {
  it('열 전부가 제 몸을 들고 있다 — 검문 앞줄 둘까지', () => {
    for (const c of CAST) expect(c.look.asset, c.id).toBeTruthy();
    // 중앙 시설의 앞줄 둘은 그 홀에 안 오는 몸을 빌린다 — 같은 방에 같은 몸이 둘 서면 배경이 아니라 오류다
    expect(look('bg-c2-044').asset).toBe('s2_u012');
    expect(look('bg-c2-128').asset).toBe('s2_u201');
  });
  it('이름 없는 배경은 닳은 자리가 같은 몸을 빌린다 — 손끝이 닳았다고 적힌 것은 손끝이 닳은 몸으로 선다', () => {
    const bg = (wear: Look['wear']): Look => ({ wear, grade: 2, repair: 'none', face: 'stock', stance: 'idle' });
    expect(bodyOf(bg('shoulder'))).toBe('s2_u104');
    expect(bodyOf(bg('hand'))).toBe('s2_u118');
    expect(bodyOf(bg('front'))).toBe('s2_u063');
    expect(bodyOf(bg('none'))).toBe('s2_u201');
    // 무릎이 경비의 몸으로 안 간다 — 그 몸만 총을 메고 있어서 배경 하나가 무장한 것으로 보인다
    expect(bodyOf(bg('knee'))).not.toBe('s2_guard21');
    // look 자체가 없어도 몸은 있다 (자리표에 look 을 안 적은 자리)
    expect(bodyOf(undefined)).toBeTruthy();
  });
  it('제 몸이 있으면 그것을 쓴다 — 빌리기는 없을 때만이다', () => {
    for (const c of CAST) expect(bodyOf(c.look), c.id).toBe(c.look.asset);
  });
});

describe('틴트 — 몸이 갈리는 유일한 색', () => {
  it('닳을수록 어둡고, 안 닳은 것은 1 이다 — 곱하기라 밝히지는 못한다', () => {
    const fresh = dress(look('u201')).tint;
    expect(fresh.r).toBe(1);
    const worn = dress(look('u012')).tint;
    expect(worn.r).toBeLessThan(fresh.r);
    const half = dress(look('u089')).tint;
    expect(half.r).toBeLessThan(fresh.r);
    expect(half.r).toBeGreaterThan(worn.r);
  });
  it('앞이 그은 것 · 바랜 것 · 구형은 등급과 다른 쪽으로 간다 — 같은 몸을 빌려도 이 셋은 안 겹친다', () => {
    // 등급만으로 깎인 몸은 푸른 쪽이 남는다 — 도장 아래 금속이다
    expect(dress(look('u012')).tint.b).toBeGreaterThan(dress(look('u012')).tint.r);
    // 그을린 몸은 거기서 파랑을 더 깎아 **뒤집는다** — 같은 grade 3 인데 색이 반대편이다
    const burned = dress(look('u063')).tint;
    expect(burned.r).toBeGreaterThan(burned.b);
    // 바랜 몸은 안 깎였는데도 따뜻하다 — 어둡지 않고 노랗다
    const bleached = dress(look('seer')).tint;
    expect(bleached.r).toBeGreaterThan(bleached.b);
    expect(bleached.r).toBeGreaterThan(burned.r * 5);
    // 구형은 보랏빛 — 초록만 빠진다
    const older = dress(look('leader')).tint;
    expect(older.b).toBeGreaterThan(older.g);
  });
  it('같은 몸을 빌린 둘도 색으로 갈린다 — 배경 둘이 한 덩어리로 보이면 안 된다', () => {
    const g = (grade: 0 | 1 | 2 | 3): Look => ({ wear: 'whole', grade, repair: 'none', face: 'stock', stance: 'idle' });
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const one = lum(dress(g(1)).tint);
    const three = lum(dress(g(3)).tint);
    expect(one / three).toBeGreaterThan(3);
  });
});

describe('자세 · 버릇 — 성격표와 같은 이름', () => {
  it('손끝이 닳은 것은 hands · 열하루째는 copy · 앞이 그은 것은 still · 경비는 guard · 먼저 온 것은 leader', () => {
    expect(idleOf(look('u118'))).toBe('hands');
    expect(idleOf(look('u201'))).toBe('copy');
    expect(idleOf(look('u063'))).toBe('still');
    expect(idleOf(look('guard21'))).toBe('guard');
    expect(idleOf(look('leader'))).toBe('leader');
    expect(idleOf(look('u104'))).toBe('default');
  });
  it('버릇 값 — hands 는 손 확인, copy 는 부호 반전, still 은 흔들림 0, guard 는 두 배, leader 는 반·주기 두 배', () => {
    expect(dress(look('u118')).idle.handCheck).toBe(true);
    expect(dress(look('u201')).idle.flip).toBe(true);
    expect(dress(look('u063')).idle.sway).toBe(0);
    expect(dress(look('guard21')).idle.sway).toBeCloseTo(dress(look('u104')).idle.sway * 2, 5);
    const l = dress(look('leader')).idle;
    expect(l.rate).toBe(0.5);
    expect(l.breath).toBeCloseTo(dress(look('u104')).idle.breath / 2, 5);
  });
  it('그룹 변형 — hands pitch 0.25 · back 은 벽 쪽 0.15 m · older 는 1.15 배', () => {
    expect(dress(look('u118')).lean.pitch).toBe(0.25);
    expect(dress(look('u063')).pose.back).toBe(0.15);
    expect(dress(look('u104')).pose.back).toBe(0);
    expect(dress(look('leader')).pose.widen).toBe(1.15);
    expect(dress(look('u201')).lean.roll).toBe(0.04);
  });
});
