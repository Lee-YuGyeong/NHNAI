/**
 * 재검실의 목소리 — 대본 문장과 구운 클립이 **한 벌**인가.
 *
 * 이 방(features/world/chapter3.ts)은 한동안 통째로 무음이었다. 재생 경로는 처음부터 있었는데
 * (DialogueBox 가 줄마다 voiceLines.play 를 부른다) 대본이 tools/voice-cast.json 의 sources 에
 * 안 올라가 있어서 클립이 없었다. voice.ts 의 규칙은 "클립이 없는 문장은 조용히 지나간다" 라
 * **아무 데서도 빨간 줄이 안 난다** — 소리가 없다는 것은 화면을 열고 귀로 들어야만 알 수 있었다.
 *
 * 게다가 열쇠가 문장 그대로다 (`scientist|…신호가…`). 대사를 한 글자만 다듬어도 클립을 못 찾고,
 * 그때도 조용히 지나간다. 그래서 여기서는 셋을 글자로 잡아 둔다:
 *   ① 대본이 명단에 올라 있는가 (cast.sources 에 chapter3 의 그 배열이 있는가)
 *   ② 그 문장의 클립이 manifest 에 있고 파일이 실제로 있는가
 *   ③ 이름표가 이어지는가 (대화창의 '과학자'·'검증 장치'·'UNIT-04' → manifest.names)
 *
 * ★ 2026-09-01: 검사 범위를 **이 방의 정해진 줄 전부**로 넓혔다. 예전에는 과학자 한 줄만 봤는데,
 *   그 사이 검증관(UNIT-04)과 검증 장치의 줄도 대본에 생겼고 **둘 다 무음이었다** — 이름표('검증 장치')가
 *   명부에 없어서 클립을 찾지 못했고, 검증관의 줄은 아예 구워지지도 않았다(대본의 who 인 examiner 가
 *   화자 목록에 없었다). 한 줄만 지키는 검사는 그 둘을 통과시킨다.
 *   감독(UNIT-04)이 **그 자리에서 지은** 질문·판정은 여전히 여기 없다 — 미리 구울 수 없는 말이라
 *   실시간 합성으로 나간다 (chapter3-voice.test.ts 가 그 갈림길을 지킨다).
 */
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import manifest from '../../../public/world/voice/manifest.json';

const CHAPTER3 = 'src/features/world/chapter3.ts';
const CAST = 'tools/voice-cast.json';
const CLIPS = 'public/world/voice/';

interface Cast {
  sources: { chapter: { file: string; arrays: string[] }[]; blocks: { file: string; const: string; speakers: string[] }[] };
}
const cast = JSON.parse(readFileSync(CAST, 'utf8')) as Cast;
const names = manifest.names as Record<string, string>;
const lines = manifest.lines as Record<string, { file: string; duration?: number }>;
const src = readFileSync(CHAPTER3, 'utf8');

/** 대본의 who → 대화창에 찍히는 이름표 (chapter3 의 SPEAKER) */
const NICKNAME: Record<string, string> = { system: 'SYSTEM', device: '검증 장치', examiner: 'UNIT-04', scientist: '과학자' };
/**
 * 이 방에서 **미리 굽는** 대사 배열 — 감독이 지은 줄만 여기서 빠진다.
 * RELEASE_WATCHED(감시를 붙여 내보내는 말)는 없어졌다 — 이 방에 감시가 없다 (2026-09-01 사용자, chapter3 머리말의 ★)
 */
const ARRAYS = ['ARRIVE', 'OPEN', 'RELEASE'];

/** 대본에서 이 배열의 대사를 긁는다 — voice-lines.mjs 의 chapterLines 와 같은 눈 */
function scriptLines(array: string): { who: string; text: string }[] {
  const block = new RegExp(`const ${array}: Line\\[\\] = (\\[[\\s\\S]*?\\]);`).exec(src);
  expect(block, `${CHAPTER3}: ${array} 배열이 없다`).not.toBeNull();
  return [...block![1].matchAll(/who:\s*'(\w+)',\s*text:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => ({
    who: m[1],
    text: m[2].replace(/\\(['"\\])/g, '$1'),
  }));
}

/** 첫 질문 여섯 — 감독이 아니라 대본이 고르는 줄이라 이것도 굽는다 */
function openers(): string[] {
  const block = /const OPENERS: readonly string\[\] = \[([\s\S]*?)\];/.exec(src);
  expect(block, `${CHAPTER3}: OPENERS 배열이 없다`).not.toBeNull();
  return [...block![1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(['"\\])/g, '$1'));
}

/** 이 이름표로 이 문장을 말하면 소리가 나는가 */
function expectClip(nickname: string, text: string): void {
  const speaker = names[nickname];
  expect(speaker, `manifest.names 에 '${nickname}' 이 없다 — 클립이 있어도 대화창이 못 찾는다 (voice-cast.json 의 names)`).toBeDefined();
  const clip = lines[`${speaker}|${text}`];
  expect(clip, `클립이 없다: ${nickname} "${text}" — node tools/voice-lines.mjs`).toBeDefined();
  expect(existsSync(`${CLIPS}${clip.file}`), `${clip.file} 이 없다`).toBe(true);
  // 대화창이 이 길이만큼 줄을 붙잡는다 (DialogueBox lineDurationFor) — 0 이면 말이 끝나기 전에 넘어간다
  expect(clip.duration ?? 0).toBeGreaterThan(0);
}

describe('재검실 — 대본에 적힌 줄은 전부 소리가 있다', () => {
  it('대본이 명단에 올라 있다 — 여기서 빠지면 다음에 굽는 사람이 이 방을 통째로 건너뛴다', () => {
    const entry = cast.sources.chapter.find((c) => c.file === CHAPTER3);
    expect(entry, `${CAST}: ${CHAPTER3} 이 sources.chapter 에 없다`).toBeDefined();
    for (const array of ARRAYS) expect(entry!.arrays).toContain(array);
    const block = cast.sources.blocks.find((b) => b.file === CHAPTER3 && b.const === 'OPENERS');
    expect(block, `${CAST}: OPENERS 가 sources.blocks 에 없다 — 첫 질문이 무음이 된다`).toBeDefined();
  });

  it('이름표가 이어진다 — 대화창에 찍히는 이름이 명부에 있어야 클립을 찾는다', () => {
    expect(names['과학자']).toBe('scientist');
    expect(names['SYSTEM']).toBe('system');
    expect(names['검증 장치']).toBe('system');
    expect(names['UNIT-04']).toBeDefined();
  });

  it('배열마다 한 줄씩 — 클립이 있고 파일도 있다 (문장 그대로가 열쇠라 한 글자만 달라도 무음이 된다)', () => {
    let n = 0;
    for (const array of ARRAYS) {
      for (const { who, text } of scriptLines(array)) {
        const nickname = NICKNAME[who];
        expect(nickname, `${array}: 모르는 화자 '${who}'`).toBeDefined();
        expectClip(nickname, text);
        n += 1;
      }
    }
    // 대본이 통째로 안 읽혔는데 초록불이 나는 일이 없게 (지금은 넷 — 도착 둘·검증관의 첫 마디·내보내는 말)
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('첫 질문 여섯도 검증관 목소리로 구워져 있다 — 이 줄만 무음이면 심문이 글자로만 시작한다', () => {
    const list = openers();
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const text of list) expectClip('UNIT-04', text);
  });
});
