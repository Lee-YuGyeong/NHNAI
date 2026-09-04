// @vitest-environment jsdom
/**
 * 재검실(챕터 3)의 무대 상태.
 *
 * 이 파일은 원래 **응시 면제**를 잠그고 있었다 (2026-08-30 사용자 신고: "재검실에서 AI 쳐다만 봐도 의심도가 계속 오른다").
 * 봉쇄된 방에 개체가 하나뿐이고, 그 개체가 검증대 뒤에서 나를 보고 있고, 나는 조명 아래 표식에 서 있으라는 명령을
 * 받은 방이라 — 시선을 피하는 쪽이 이상했기 때문이다.
 *
 * 이제 그 면제가 필요 없다: **쳐다보는 것 자체가 의심도를 안 올린다** (2026-09-01 사용자, src/world/mp/sensor.ts 의 ★).
 * 방마다 예외를 덧대는 대신 규칙을 걷어냈으므로, 여기서 잠글 것도 면제가 아니라 무대가 겹치지 않는지 하나다.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { chapter3 } from '@/features/world/chapter3';

describe('재검실 무대', () => {
  beforeEach(() => {
    chapter3.reset();
  });

  it('두 번 시작해도 상태가 겹치지 않는다', () => {
    chapter3.start();
    chapter3.start();
    expect(chapter3.get().phase).toBe('arrive');
    expect(chapter3.get().round).toBe(0);
  });

  it('다른 맵을 열면 처음으로 돌아간다 — 앞 무대가 따라가지 않는다', () => {
    chapter3.start();
    chapter3.enter('central');
    expect(chapter3.get().phase).toBe('idle');
  });
});
