/**
 * 귓속말 — **친밀도가 앞을 알려 주는** 열두 항목 (features/world2/hints.ts).
 *
 * 이 시험이 쥐는 것은 값이 아니라 **사슬의 계약**이다:
 *   방마다 둘이고 순서대로다 · 그 방에 없는 개체는 말하지 못한다 · 영영 안 열리는 힌트는 없다 ·
 *   상한에 닿은 개체도 준다 · 앞의 것이 나온 뒤에만 뒤의 것이 열린다 · 문장은 대본에서 온다.
 *
 * ★ 마지막 것(⑩)이 이 파일의 이유다. script-verbatim.test.ts 는 이름 목록을 손으로 적은 탓에
 *   script.ts 밖의 파일을 못 본다 — 「대사를 지어내지 않는다」가 새 파일에서 조용히 새는 것을 여기서 막는다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { GAP_MS, HINTS, hints } from '../../../src/features/world2/hints';
import { ORDER, ROOM_UNITS, type Room } from '../../../src/features/world2/scenario2';
import { units } from '../../../src/features/world2/units';

const DOC = readFileSync(fileURLToPath(new URL('../../../docs/design/plan-dialogue-v7.md', import.meta.url)), 'utf8');

/** talk.say 가 돌려주는 것 중 pick 이 보는 세 값만 */
const result = (delta: number, more: { crossed?: boolean; reported?: boolean } = {}) => ({
  delta,
  crossed: false,
  reported: false,
  ...more,
});

beforeEach(() => {
  units.reset();
  hints.reset();
});

describe('표 — 사슬의 계약', () => {
  it('열둘, 방마다 둘, 방 순서대로', () => {
    expect(HINTS).toHaveLength(12);
    expect(HINTS.map((h) => h.room)).toEqual(ORDER.flatMap((r) => [r, r]));
    expect(HINTS.map((h) => h.id)).toEqual(ORDER.flatMap((r) => [`${r}:next`, `${r}:last`]));
  });

  it('말할 수 있는 것만 말한다 — 화자는 그 방 명부에 있다', () => {
    for (const h of HINTS) expect(ROOM_UNITS[h.room], h.id).toContain(h.speaker);
  });

  it('영영 안 열리는 힌트는 없다 — need 가 그 개체의 상한 안이다', () => {
    for (const h of HINTS) {
      const cap = units.def(h.speaker)?.persona.cap?.max ?? 3;
      expect(cap, `${h.id} · ${h.speaker}`).toBeGreaterThanOrEqual(h.need);
    }
  });
});

describe('방아쇠', () => {
  it('태도가 오른 말에 준다', () => {
    units.shift('u104', 2);
    expect(hints.pick('u104', 'corridor', result(2), 0)?.id).toBe('corridor:next');
  });

  it('상한에 닿은 개체도 준다 — 더 오를 데가 없으면 delta 는 영영 0 이다', () => {
    // 밖 얘기 한 번이면 3 이 되는 개체(cast 의 outside 3). delta 만 보면 창이 있는 방의 두 줄이 안 나온다
    units.shift('seer', 3);
    expect(units.stage('seer')).toBe(3);
    expect(hints.pick('seer', 'window', result(0), 0)?.id).toBe('window:next');
  });

  it('올리지 못한 말에는 안 준다 — 상한 아래의 0 · 내림 · 선 넘음 · 보고', () => {
    units.shift('u104', 2);
    expect(hints.pick('u104', 'corridor', result(0), 0)).toBeNull();
    expect(hints.pick('u104', 'corridor', result(-1), 0)).toBeNull();
    expect(hints.pick('u104', 'corridor', result(1, { crossed: true }), 0)).toBeNull();
    expect(hints.pick('u104', 'corridor', result(1, { reported: true }), 0)).toBeNull();
  });

  it('문턱에 못 미치면 안 준다', () => {
    units.shift('u104', 1);
    expect(hints.pick('u104', 'corridor', result(1), 0)).toBeNull();
  });

  it('다른 개체는 남의 힌트를 대신 말하지 않는다', () => {
    units.shift('u089', 1);
    expect(hints.pick('u089', 'corridor', result(1), 0)).toBeNull();
  });
});

describe('사슬', () => {
  it('앞의 것이 나온 뒤에만 뒤의 것이 열린다', () => {
    units.shift('u137', 3);
    // 복도의 첫 항목(u104)이 아직이면 금 그은 것의 마지막-방 힌트도 안 열린다
    expect(hints.pick('u137', 'corridor', result(3), 0)).toBeNull();

    units.shift('u104', 2);
    const first = hints.pick('u104', 'corridor', result(2), 0)!;
    expect(first.id).toBe('corridor:next');
    hints.consume(first, 0);

    expect(hints.pick('u137', 'corridor', result(3), GAP_MS)?.id).toBe('corridor:last');
  });

  it('한 판에 한 번 — 찍은 뒤에는 안 나오고, 판이 새로 서면 처음으로', () => {
    units.shift('u104', 2);
    const h = hints.pick('u104', 'corridor', result(2), 0)!;
    hints.consume(h, 0);
    expect(hints.heard()).toEqual(['corridor:next']);
    expect(hints.pick('u104', 'corridor', result(2), GAP_MS)).toBeNull();

    hints.reset();
    expect(hints.heard()).toEqual([]);
    expect(hints.pick('u104', 'corridor', result(2), 0)?.id).toBe('corridor:next');
  });

  it('간격 — 한 마디 뒤에 몰아서 나오지 않는다', () => {
    units.shift('u104', 2);
    hints.consume(hints.pick('u104', 'corridor', result(2), 0)!, 1000);
    units.shift('u137', 3);
    expect(hints.pick('u137', 'corridor', result(3), 1000 + GAP_MS - 1)).toBeNull();
    expect(hints.pick('u137', 'corridor', result(3), 1000 + GAP_MS)?.id).toBe('corridor:last');
  });

  it('지나간 방의 것은 다시 안 연다 — 방이 다르면 아무것도 없다', () => {
    units.shift('u104', 3);
    expect(hints.pick('u104', 'rest' as Room, result(3), 0)).toBeNull();
  });
});

describe('문장', () => {
  const all = HINTS.flatMap((h) => h.lines.map((l) => ({ h, l })));

  it('항목마다 두 줄, 화자가 갈리지 않는다', () => {
    for (const h of HINTS) {
      expect(h.lines, h.id).toHaveLength(2);
      for (const l of h.lines) expect(l.who, h.id).toBe(h.speaker);
    }
  });

  it('문체 — 20 자 이하 · 반말 · 말줄임은 한 글자로', () => {
    for (const { h, l } of all) {
      expect(l.text.length, `${h.id}: ${l.text}`).toBeLessThanOrEqual(20);
      expect(l.text, `${h.id}: ${l.text}`).not.toMatch(/요\.|니다\./);
      expect(l.text, `${h.id}: ${l.text}`).not.toContain('...');
    }
  });

  it('지어내지 않는다 — 스물넷 줄 전부가 대본 v8 에 글자 그대로 있다', () => {
    const missing = all.filter(({ l }) => !DOC.includes(l.text)).map(({ h, l }) => `${h.id}: ${l.text}`);
    expect(missing).toEqual([]);
  });
});
