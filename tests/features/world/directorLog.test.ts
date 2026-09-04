/**
 * DIRECTOR 판이 「관련 기록」으로 집어 드는 줄 (features/world/directorLog.ts).
 *
 * 이 한 줄이 시연의 전부다 — 감독이 "아까는 4 구역이라고 했다"고 할 때, **그 말이 어디서 나왔는지**를 옆에 띄우는 것.
 * 모델이 인용했다고 주장하지 않는다: 대답과 겹치는 낱말이 든 **통행자의 말**을 최근 것부터 찾을 뿐이다.
 */

import { describe, expect, it } from 'vitest';

import { relatedLine } from '../../../src/features/world/directorLog';

const DOSSIER = [
  '[복도] 통행자: "4 구역입니다"',
  '[복도] 관측: 정비 명판을 들여다봤다',
  '[중앙 시설] 통행자: "임무 수행 중이다"',
];

describe('관련 기록 찾기', () => {
  it('대질하는 말에 든 숫자·낱말로 앞말을 찾는다', () => {
    expect(relatedLine('아까는 4 구역이라고 했다.', DOSSIER)).toBe('[복도] 통행자: "4 구역입니다"');
  });

  it('관측이 아니라 **통행자가 한 말**만 집는다 — 대질의 재료는 그것뿐이다', () => {
    expect(relatedLine('정비 명판을 봤나.', DOSSIER)).toBeNull();
  });

  it('겹치는 게 없으면 아무것도 띄우지 않는다 — 없는 근거를 지어내지 않는다', () => {
    expect(relatedLine('통과.', DOSSIER)).toBeNull();
    expect(relatedLine('다시 말해라.', [])).toBeNull();
  });

  it('가장 최근 것을 집는다 — 말이 바뀌었으면 마지막 주장이 근거다', () => {
    const d = [...DOSSIER, '[중앙 시설] 통행자: "7 구역입니다"'];
    expect(relatedLine('구역을 다시 말해라.', d)).toBe('[중앙 시설] 통행자: "7 구역입니다"');
  });
});
