/**
 * 검문소 프롤로그 (features/interrogation/prologue.ts) — 첫 토론에 구역 통신으로 흐르는 대본.
 *
 *   · 피실험자 01·02·03 은 좌석에서 무작위로, 그러나 **같은 씨앗이면 네 화면이 같은 사람**을 본다
 *   · 정부 통제실은 control 결, 무대 지문은 system 결, 피실험자는 보통 chat 줄 — 이름표에 번호와 좌석 이름이 같이 붙는다
 *   · 서버에 가는 것은 없다 — 이 파일은 ChatEntry 만 만든다
 */
import { describe, expect, it } from 'vitest';
import type { GameSeat } from '@/world/mp/game-protocol';
import { CONTROL_NAME, PROLOGUE, PROLOGUE_MS, castSubjects, prologueEntries } from '@/features/interrogation/prologue';

const seat = (id: string, n: number, isolated = false): GameSeat => ({ id, name: `N${n}`, seat: n, isolated });
const SEATS = [seat('a', 1), seat('b', 2), seat('c', 3), seat('d', 4)];

describe('castSubjects — 피실험자 셋을 뽑는다', () => {
  it('같은 씨앗이면 같은 셋, 좌석 배열 순서가 달라도 같다', () => {
    const one = castSubjects(SEATS, 1_700_000_000_000).map((s) => s.id);
    const two = castSubjects([...SEATS].reverse(), 1_700_000_000_000).map((s) => s.id);
    expect(one).toEqual(two);
    expect(new Set(one).size).toBe(3);
  });

  it('씨앗이 다르면 (대개) 다른 셋 — 무작위다', () => {
    const picks = new Set(Array.from({ length: 12 }, (_, i) => castSubjects(SEATS, 1000 + i * 7919).map((s) => s.id).join()));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('격리된 좌석은 뽑지 않고, 둘뿐이면 돌려 쓴다', () => {
    const cast = castSubjects([seat('a', 1), seat('b', 2, true), seat('c', 3)], 5);
    expect(cast).toHaveLength(3);
    expect(cast.every((s) => s.id !== 'b')).toBe(true);
  });

  it('좌석이 없으면 비어 있다', () => {
    expect(castSubjects([], 1)).toEqual([]);
  });
});

describe('prologueEntries — 대본을 채팅 줄로', () => {
  const entries = prologueEntries(SEATS, 42);

  it('대본과 같은 수 · 같은 순서 · 누적 시각이 늘어난다', () => {
    expect(entries).toHaveLength(PROLOGUE.length);
    for (let i = 1; i < entries.length; i++) expect(entries[i].at).toBeGreaterThan(entries[i - 1].at);
    expect(entries[entries.length - 1].at).toBe(PROLOGUE_MS);
  });

  it('정부 통제실은 control, 지문은 system, 피실험자는 chat 이고 이름표에 번호와 좌석 이름이 붙는다', () => {
    const control = entries.filter((e) => e.entry.kind === 'control');
    expect(control.length).toBe(5);
    expect(control.every((e) => e.entry.name === CONTROL_NAME)).toBe(true);
    expect(control[control.length - 1].entry.text).toBe('판별을 시작합니다.');
    const stage = entries.filter((e) => e.entry.kind === 'system').map((e) => e.entry.text);
    expect(stage).toEqual(['천장 스피커가 켜진다.', '잠시 정적.']);
    const first = entries[0].entry;
    expect(first.kind).toBe('chat');
    expect(first.name).toMatch(/^피실험자 01 · N\d$/);
    expect(SEATS.some((s) => s.id === first.id)).toBe(true);
  });

  it('같은 번호는 같은 좌석이 말한다 — 01 이 두 번 말하면 둘 다 같은 id', () => {
    const ones = entries.filter((e) => e.entry.name.startsWith('피실험자 01'));
    expect(ones).toHaveLength(2);
    expect(ones[0].entry.id).toBe(ones[1].entry.id);
  });

  it('대본 전체가 첫 토론 안에 흐른다 — 40초 안', () => {
    expect(PROLOGUE_MS).toBeLessThan(40_000);
  });
});
