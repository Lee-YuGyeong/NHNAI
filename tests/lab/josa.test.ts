/**
 * 조사 — 화면에는 숫자와 알파벳으로 적히지만 읽을 때는 한국어다 (공이사 · 삼 · 에프).
 * 여기서 틀리면 제일 큰 글자에서 티가 난다 — 리더의 방송이다.
 */
import { describe, expect, it } from 'vitest';
import { eulReul, eunNeun, euRo, iGa } from '@/lab/josa';

describe('한글', () => {
  it('받침으로 고른다', () => {
    expect(`통신구역${eulReul('통신구역')}`).toBe('통신구역을');
    expect(`관리개체${eulReul('관리개체')}`).toBe('관리개체를');
    expect(`정지신호${iGa('정지신호')}`).toBe('정지신호가');
    expect(`폐기명령${iGa('폐기명령')}`).toBe('폐기명령이');
  });

  it('ㄹ 받침은 「로」다 — 「으로」가 아니다', () => {
    expect(`검증실${euRo('검증실')}`).toBe('검증실로');
    expect(`구역${euRo('구역')}`).toBe('구역으로');
    expect(`개체${euRo('개체')}`).toBe('개체로');
  });
});

describe('숫자', () => {
  it('끝자리를 읽은 소리로 고른다 — 영 · 일 · 삼 · 육 · 칠 · 팔 에 받침이 있다', () => {
    [0, 1, 3, 6, 7, 8, 48, 123, 806, 10].forEach((n) => expect(`${n}:${eunNeun(String(n))}`).toBe(`${n}:은`));
    [2, 4, 5, 9, 82, 174, 39].forEach((n) => expect(`${n}:${eunNeun(String(n))}`).toBe(`${n}:는`));
  });

  it('「로」는 받침이 없거나 ㄹ(일 · 칠 · 팔) 일 때다', () => {
    [2, 5, 9, 1, 7, 8].forEach((n) => expect(`${n}:${euRo(String(n))}`).toBe(`${n}:로`));
    [0, 3, 6].forEach((n) => expect(`${n}:${euRo(String(n))}`).toBe(`${n}:으로`));
  });
});

describe('영문자', () => {
  it('이름에 받침이 있는 것은 일곱뿐이다 — 에프 · 엘 · 엠 · 엔 · 알 · 에스 · 엑스', () => {
    'FLMNRSX'.split('').forEach((c) => expect(`${c}:${eunNeun(c)}`).toBe(`${c}:은`));
    'ABCDEGHIJKOPQTUVWYZ'.split('').forEach((c) => expect(`${c}:${eunNeun(c)}`).toBe(`${c}:는`));
  });

  it('엘 · 알 만 ㄹ 받침이라 「로」다', () => {
    ['L', 'R', 'A', 'T'].forEach((c) => expect(`${c}:${euRo(c)}`).toBe(`${c}:로`));
    ['F', 'M', 'N', 'S', 'X'].forEach((c) => expect(`${c}:${euRo(c)}`).toBe(`${c}:으로`));
  });
});

/**
 * 개체 이름이 이 규칙을 제일 많이 탄다 — 리더의 방송은 늘 번호로 시작한다.
 * 「A62-024 이 사람으로 의심된다」는 조사가 틀렸을 뿐 아니라 **「이 사람」으로도 읽혔다.**
 */
describe('개체 이름', () => {
  it('붙임표 뒤 번호의 끝자리를 읽는다', () => {
    expect(`A62-024${iGa('A62-024')}`).toBe('A62-024가');
    expect(`A62-011${iGa('A62-011')}`).toBe('A62-011이');
    expect(`A62-030${eunNeun('A62-030')}`).toBe('A62-030은');
    expect(`A62-002${eunNeun('A62-002')}`).toBe('A62-002는');
  });

  it('여럿을 늘어놓으면 **마지막** 이름이 정한다', () => {
    const names = ['A62-011', 'A62-024'];
    expect(iGa(names[names.length - 1])).toBe('가');
  });

  it('읽을 수 없는 글자로 끝나면 받침 없는 쪽으로 — 덜 틀린다', () => {
    expect(iGa('')).toBe('가');
    expect(eunNeun('???')).toBe('는');
    expect(euRo('—')).toBe('로');
  });
});
