/**
 * 검문소 프롤로그 (features/interrogation/prologue.ts) — 첫 토론에 비주얼 노벨식 대화창으로 흐르는 대본.
 *
 *   · 피실험자 01·02·03 은 좌석에서 무작위로, 그러나 **같은 씨앗이면 네 화면이 같은 사람**을 본다
 *   · 피실험자의 초상은 그 좌석의 몸(군인) 얼굴, 정부 통제실은 처형자 얼굴, 지문은 이름표 없이 흐린 글씨
 *   · 서버에 가는 것도, 구역 통신에 찍히는 것도 없다 — 이 파일은 대화창 줄(ChatLine)만 만든다
 */
import { describe, expect, it } from 'vitest';
import type { GameSeat } from '@/world/mp/game-protocol';
import { CONTROL_FACE, CONTROL_NAME, FALLBACK_FACE, PROLOGUE, castSubjects, faceOf, prologueLines } from '@/features/interrogation/prologue';

const seat = (id: string, n: number, isolated = false, body?: GameSeat['body']): GameSeat => ({ id, name: `N${n}`, seat: n, isolated, ...(body ? { body } : {}) });
const SEATS = [seat('a', 1, false, 'sol_fit_m'), seat('b', 2, false, 'sol_heavy_f'), seat('c', 3, false, 'sol_fit_f'), seat('d', 4, false, 'sol_heavy_m')];

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

describe('prologueLines — 대본을 대화창 줄로', () => {
  const lines = prologueLines(SEATS, 42);

  it('대본과 같은 수 · 같은 순서 · 열쇠는 씨앗과 번호로 고유하다', () => {
    expect(lines).toHaveLength(PROLOGUE.length);
    expect(new Set(lines.map((l) => l.key)).size).toBe(PROLOGUE.length);
    expect(prologueLines(SEATS, 42).map((l) => l.key)).toEqual(lines.map((l) => l.key));
    expect(lines[lines.length - 1].text).toBe('판별을 시작합니다.');
  });

  it('정부 통제실은 처형자 얼굴, 피실험자는 제 몸의 얼굴, 지문은 이름표 없이 흐린 글씨', () => {
    const control = lines.filter((l) => l.nickname === CONTROL_NAME);
    expect(control).toHaveLength(5);
    expect(control.every((l) => l.portraitSrc === CONTROL_FACE)).toBe(true);
    const stage = lines.filter((l) => l.thought);
    expect(stage.map((l) => l.text)).toEqual(['천장 스피커가 켜진다.', '잠시 정적.']);
    expect(stage.every((l) => l.nickname.trim() === '')).toBe(true);
    const first = lines[0];
    expect(first.nickname).toMatch(/^피실험자 01 · N\d$/);
    const who = SEATS.find((s) => s.id === first.id)!;
    expect(first.portraitSrc).toBe(`/interrogation/face-${who.body}.jpg`);
  });

  it('같은 번호는 같은 좌석이 말한다 — 01 이 두 번 말하면 둘 다 같은 id', () => {
    const ones = lines.filter((l) => l.nickname.startsWith('피실험자 01'));
    expect(ones).toHaveLength(2);
    expect(ones[0].id).toBe(ones[1].id);
  });

  it('몸을 모르는 좌석은 기본 얼굴', () => {
    expect(faceOf(seat('x', 9))).toBe(FALLBACK_FACE);
    expect(faceOf(undefined)).toBe(FALLBACK_FACE);
  });
});
