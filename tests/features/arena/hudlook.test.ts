/**
 * 검증실(/interrogation)의 화면은 **다른 챕터와 같은 장치로 보여야 한다.**
 *
 * 복도·중앙 시설·재검실은 전부 features/world/hud.css 한 벌을 쓴다 — 남색 반투명 모따기 판 ·
 * 왼쪽 청록 선 · 스캔라인. 검증실만 웹 폼의 둥근 모서리에 회색 라벨이라, 이야기가 마지막 방에
 * 들어서는 순간 화면 문법이 바뀌었다 (2026-09-02 사용자: "전체적으로 다른 챕터랑 UI 느낌 비슷하게").
 *
 * 그래서 여기서 지키는 것은 둘이다.
 *   ① **판은 모서리를 안 굴린다.** 둥근 모서리 하나가 그 판을 웹 폼으로 되돌린다.
 *      (글 치는 칸과 동그란 점·바퀴는 예외다 — 복도의 입력줄도 4px 이고, 점은 점이다.)
 *   ② **같은 값을 쓴다.** 남색 바닥·청록 선·스캔라인을 눈대중으로 베끼면 두 화면이 조금씩
 *      어긋나고, 그 조금이 「같은 시설」을 깬다. hud.css 가 바뀌면 이 시험이 먼저 깨진다.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** 화면이 실제로 심는 그 스타일 — 아레나는 상수를 안 내보내므로 소스에서 그대로 떠 온다 (arrive.test 와 같은 방식) */
const ARENA_CSS = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8').split('const CSS = `')[1].split('`;')[0];
const HUD_CSS = readFileSync('src/features/world/hud.css', 'utf8');

/** 띄어쓰기만 다른 것은 같은 값으로 친다 — `rgba(0,0,0,.12)` 와 `rgba(0, 0, 0, .12)` 는 같은 회색이다 */
const tight = (v: string) => v.replace(/\s+/g, '');

/** 그 선택자가 세운 규칙 한 덩이 */
function ruleOf(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

/** `.arena { … }` 안에 적힌 변수 값 */
function varOf(name: string): string {
  const found = ruleOf(ARENA_CSS, '.arena { min-height').match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(found, `${name} 이 없다`).not.toBeNull();
  return found![1].trim();
}

describe('판은 모서리를 안 굴린다', () => {
  for (const sel of ['.arena .comms {', '.arena .commhd {', '.arena .feed {', '.arena .ask {', '.arena .soundpanel {',
    '.arena .panel.overlay {', '.arena .endcard {', '.arena .panelchip {', '.arena .soundchip {', '.arena button {',
    '.arena .timebar {', '.arena .casting {', '.arena .err {']) {
    it(`${sel.replace('.arena ', '').replace(' {', '')} — 각지게 선다`, () => {
      expect(ruleOf(ARENA_CSS, sel)).not.toMatch(/border-radius/);
    });
  }

  it('글 치는 칸만 예외다 — 복도의 입력줄(WorldFeature)도 4px 이다', () => {
    expect(ruleOf(ARENA_CSS, '.arena .line input {')).toMatch(/border-radius:\s*4px/);
  });
});

describe('무대 HUD 와 같은 값을 쓴다', () => {
  it('판 바닥색이 같다 — 다른 챕터의 계량기 판(.hud-panel)과 같은 남색이다', () => {
    expect(tight(varOf('--panel'))).toBe(tight(ruleOf(HUD_CSS, '.hud-panel {').match(/background:\s*([^;]+);/)![1]));
  });

  it('왼쪽 선 색이 같다 — 판을 세우는 그 청록 한 줄', () => {
    expect(tight(ruleOf(HUD_CSS, '.hud-panel {'))).toContain(tight(`border-left: 1px solid ${varOf('--edge')}`));
  });

  it('스캔라인이 같다 — 켜져 있는 장치라는 표시', () => {
    expect(tight(ruleOf(HUD_CSS, '.hud-panel::after'))).toContain(tight(varOf('--scan')));
  });
});
