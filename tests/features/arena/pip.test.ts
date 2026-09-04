/**
 * 대화창 색점 — **머리 위 이름표와 같은 색인가.**
 *
 * 이게 어긋나도 화면은 멀쩡해 보인다. 색점은 찍히고 이름표도 뜨는데 둘이 다른 색일 뿐이라,
 * 사람은 "저 색이 저 몸"이라고 잘못 외운 채로 판을 본다. 그래서 눈으로는 못 잡는다 — 여기서 잡는다.
 */

import { describe, expect, it } from 'vitest';

import { seatColor } from '@/arena3d/mp/validate';
import { ME_PIP, UNKNOWN_PIP, pipColor } from '@/features/arena/pip';

const AI = ['A62-002', 'A62-003', 'A62-004', 'A62-005'] as const;
const ME = 'A62-023';

describe('pipColor', () => {
  it('개체의 색점은 그 몸의 이름표 색이다 — 순번이 곧 자리 번호다', () => {
    AI.forEach((id, seat) => {
      expect(pipColor(id, ME, AI)).toBe(seatColor(seat));
    });
  });

  it('내 색점은 이 화면이 "나"에 쓰는 청록이다 — 내 몸엔 이름표가 없다', () => {
    expect(pipColor(ME, ME, AI)).toBe(ME_PIP);
  });

  it('명부에 없는 이름(폐기돼 빠진 개체·리더)은 회색이다 — 자리 번호가 없다', () => {
    expect(pipColor('A62-001', ME, AI)).toBe(UNKNOWN_PIP);
  });

  it('색은 개체마다 갈린다 — 같은 색 둘이면 색점이 가리키는 몸이 둘이 된다', () => {
    const seen = AI.map((id) => pipColor(id, ME, AI));
    expect(new Set(seen).size).toBe(AI.length);
  });
});
