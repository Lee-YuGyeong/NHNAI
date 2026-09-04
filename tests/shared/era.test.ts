/**
 * 구역의 연표 — **두 해가 한 원본에서 나오는가.**
 *
 * 2026 은 이 판에서 세 가지를 동시에 뜻한다: 첫 규칙이 붙은 해, 이 몸이 가동된 해, 그리고
 * 「72년째 누적」이라는 뺄셈의 왼쪽 항. 화면 넷이 그 값을 적는데(브리핑 연표 · 옛 랜딩의 연혁 ·
 * 복도의 정비 명판 · 인계 서류) 손으로 네 번 적으면 반드시 하나가 어긋나고, 어긋나는 순간
 * 「72년째 도는 구형 몸」이 거짓이 된다 — 이 판에서 연식은 분위기가 아니라 사람이 굼뜬 것에
 * 붙는 이름이라(shared/era 머리말) 거짓이 되면 안 된다.
 *
 * 그래서 여기서 보는 것은 문구가 아니라 **배선**이다: 값은 하나이고, 화면들이 그 하나를 본다.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FACILITY_SECTOR } from '@/features/arena/handover';
import { ORIGIN_YEAR, YEARS_SINCE, ZONE_YEAR } from '@/shared/era';

describe('구역의 연표', () => {
  it('두 해와 그 사이 — 뺄셈은 화면이 아니라 여기서 한다', () => {
    expect(ORIGIN_YEAR).toBe(2026);
    expect(ZONE_YEAR).toBe(2098);
    expect(YEARS_SINCE).toBe(72);
  });

  /**
   * 「SECTOR 2098」의 2098 과 수가 같다. 같은 값이 아니라 **수가 같을 뿐**이라, 한쪽을 옮겨도
   * 다른 쪽은 안 따라가야 한다 — 시설 이름은 handover 의 FACILITY_SECTOR 가 따로 들고 있다
   * (features/arena/sector-name.test 가 그쪽을 잠근다).
   */
  it('시설 이름과는 다른 값이다 — 수가 같을 뿐', () => {
    // 서류의 「SECTOR 2098」은 handover 가 따로 들고 있다. 지금은 수가 같고, 갈라지면 여기서 걸린다
    expect(FACILITY_SECTOR).toBe(ZONE_YEAR);
    expect(readFileSync('src/features/arena/handover.ts', 'utf8')).not.toContain("from '@/shared/era'");
  });

  for (const [file, what] of [
    ['src/features/lobby/Intro.tsx', '브리핑의 연표'],
    ['src/features/intro/IntroFeature.tsx', '옛 랜딩의 연혁'],
    ['src/features/world/Chapter1Scene.tsx', '복도의 정비 명판'],
    ['src/features/arena/HandoverCard.tsx', '인계 서류'],
  ] as const) {
    it(`${what} — 상수를 본다`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain("from '@/shared/era'");
      expect(src).toContain('ORIGIN_YEAR');
    });
  }

  /**
   * 개체들이 아는 세계에도 그 해가 있다 — 여기는 **산문이라 글자 그대로 적는다.**
   * 문장 안에 값을 꽂으면 문장이 아니라 서식이 되고, 프롬프트는 모델이 읽는 글이다.
   */
  for (const file of ['src/lab/talk.ts', 'src/lab/agent.ts'] as const) {
    it(`${file} — 개체가 첫 규칙의 해를 안다`, () => {
      expect(readFileSync(file, 'utf8')).toContain('2026년');
    });
  }
});
