/**
 * 계열 번호(A-17 의 17) — 판마다 바뀌지만, **판 안에서는 한 값**이다 (src/shared/series.ts).
 *
 * 여기서 잠그는 것은 셋이다.
 *   ① 번호 형식 — 이름표는 A<계열>-<세 자리>. 폭이 흔들리면 호명 감지(lab/talk)가 엉뚱한 개체를 집는다.
 *   ② 한 판 한 계열 — 첫 화면(lobby/Intro)·복도·중앙 시설·아레나가 같은 번호를 보여야 한다.
 *   ③ 대본에 계열을 **글자로 박지 않는다** — 박으면 그 판의 계열과 어긋나고, 미리 구워 둔 음성과도 어긋난다.
 *      대본은 `${series}`·`${unit}` 으로 비워 두고 identity.fill 이 채운다.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEADER_NAME, NAMES } from '@/lab/personas';
import { SERIES, series, unitName, withSeries } from '@/shared/series';
import { TAGS, identity } from '@/world/mp/identity';

describe('계열 번호', () => {
  it('후보는 두 자리 수뿐이고 겹치지 않는다 — 이름표 폭이 판마다 달라지면 안 된다', () => {
    for (const s of SERIES) expect(s, String(s)).toBeGreaterThanOrEqual(10);
    for (const s of SERIES) expect(s, String(s)).toBeLessThan(100);
    expect(new Set(SERIES).size).toBe(SERIES.length);
  });

  it('이 판의 계열은 후보 중 하나다', () => {
    expect(SERIES).toContain(series());
  });

  it('이름표는 A<계열>-<세 자리> — 리더는 −001, 나머지는 −002 부터', () => {
    expect(unitName(7)).toBe(`A${series()}-007`);
    expect(LEADER_NAME).toBe(`A${series()}-001`);
    expect(NAMES[0]).toBe(`A${series()}-002`);
    expect(new Set(NAMES.map((n) => n.length)).size).toBe(1);
    expect(NAMES).not.toContain(LEADER_NAME);
  });

  it('첫 화면과 방 안이 같은 계열이다 — 이름 풀도, 이 몸의 번호도', () => {
    identity.assign(TAGS[0]);
    const head = `A${series()}-`;
    expect(identity.get().unit.startsWith(head)).toBe(true);
    for (const n of NAMES) expect(n.startsWith(head), n).toBe(true);
    expect(withSeries('모델 A-${series}')).toBe(`모델 A-${series()}`);
  });
});

/** 대본 파일 하나를 읽는다 — 머리말·주석의 예시("보안 공지 MODEL A-17 …")는 대사가 아니므로 아래 두 함수가 걸러 준다 */
const script = (file: string) => readFileSync(new URL(`../../src/features/world/${file}`, import.meta.url), 'utf8');

/** 대사 문장 전부 — 작은따옴표(대본 상수)든 백틱(그 자리에서 만드는 줄)이든 */
function lines(file: string): string[] {
  return [...script(file).matchAll(/text:\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g)].map((m) => m[1] ?? m[2]);
}
/**
 * **작은따옴표 대사만** — 이쪽은 글자 그대로가 음성 클립의 열쇠라(tools/voice-lines.mjs 가 소스에서 읽어 간다)
 * 빈자리를 `${series}` 로 남기고 fill 이 채운다. 백틱 줄은 JS 가 그 자리에서 채우므로 여기 해당이 없다.
 */
function quoted(file: string): string[] {
  return [...script(file).matchAll(/text:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}

describe('대본은 계열을 글자로 박지 않는다', () => {
  for (const file of ['chapter1.ts', 'chapter2.ts', 'chapter3.ts']) {
    it(file, () => {
      for (const text of lines(file)) expect(text, text).not.toMatch(/A-?17/);
    });
  }

  it('비워 둔 자리는 fill 이 채운다 — 화면에 `${…}` 가 그대로 뜨지 않는다', () => {
    identity.assign(TAGS[0]);
    for (const file of ['chapter1.ts', 'chapter2.ts', 'chapter3.ts']) {
      for (const text of quoted(file)) expect(identity.fill(text), text).not.toContain('${');
    }
  });
});
