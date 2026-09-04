/**
 * 내가 폐기되는 장면 — 무너지고, 방이 꺼지고, 그러고 나서 결말 카드가 온다.
 *
 * 여기서 붙잡아 두는 것은 **층의 순서** 하나다. 꺼지는 화면(.dying)은 리더의 선고가 다 읽힐
 * 때까지 떠 있으므로, 그것이 자막(.dlg)을 덮으면 내가 무엇으로 확정됐는지 못 읽고 죽는다.
 * 결말 카드(.endgame)는 반대로 그 위여야 한다 — 여운이 끝나면 화면을 넘겨받는 쪽이다.
 *
 * 시간 규칙(언제 카드가 뜨는가)은 briefing.test 가 endHoldMs 로 따로 본다.
 * z-index 는 눈으로는 "어? 자막이 좀 어둡네" 정도로만 보여서, 규칙으로 적어 두지 않으면 다시 샌다.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** 화면이 실제로 심는 그 스타일 — 아레나는 상수를 안 내보내므로 소스에서 그대로 떠 온다 (arrive.test 와 같은 방식) */
const ARENA_CSS = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8').split('const CSS = `')[1].split('`')[0];
const DIALOGUE_CSS = readFileSync('src/features/world/dialogue.css', 'utf8');

/** 그 선택자가 세운 층. 규칙 하나가 z-index 를 한 번만 적는 이 파일들에서만 쓴다 */
function layerOf(css: string, selector: string): number {
  const at = css.indexOf(selector);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  const found = css.slice(at, css.indexOf('}', at)).match(/z-index:\s*(-?\d+)/);
  expect(found, `${selector} 에 z-index 가 없다`).not.toBeNull();
  return Number(found![1]);
}

describe('꺼지는 화면이 선고를 덮지 않는다', () => {
  it('.dying 은 리더 자막(.dlg)보다 아래다 — 내 죄목은 끝까지 읽혀야 한다', () => {
    expect(layerOf(ARENA_CSS, '.arena .dying')).toBeLessThan(layerOf(DIALOGUE_CSS, '.dlg {'));
  });

  it('.dying 은 클릭을 안 먹는다 — 화면 전체를 덮는 층이다', () => {
    expect(ARENA_CSS.slice(ARENA_CSS.indexOf('.arena .dying'))).toMatch(/^[^}]*pointer-events:\s*none/);
  });

  it('결말 카드는 그 위다 — 여운이 끝나면 화면을 넘겨받는다', () => {
    expect(layerOf(ARENA_CSS, '.arena .endgame {')).toBeGreaterThan(layerOf(ARENA_CSS, '.arena .dying'));
  });
});
