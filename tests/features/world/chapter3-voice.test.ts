// @vitest-environment jsdom
/**
 * 재검실의 두 목소리 길 — **누가 어느 길로 소리를 내는가**.
 *
 * 이 방에는 소리로 가는 길이 둘이다:
 *   구운 클립  대본에 적힌 줄 — SYSTEM·과학자·검증 장치, 그리고 **검증관의 정해진 말과 첫 질문(OPENERS)**.
 *              대화창이 manifest 를 보고 틀고, 글자도 그 클립 길이에 맞춰 찍는다 (DialogueBox) — 소리와 글이 딱 맞는다
 *   방송       감독이 **그 자리에서 지은** 질문·판정(live) — 미리 못 굽는 말이라 실시간 합성뿐이다
 *
 * 둘이 겹치면 **한 개체가 두 목소리로 말한다.** 클립이 있는 줄을 방송으로도 보내면 대화창이
 * 클립을 틀면서 엔진도 같은 문장을 읽는다 — 귀로만 알 수 있고, 크레딧은 그동안 계속 나간다.
 * 반대로 감독이 지은 줄이 방송에서 빠지면 묻는 쪽이 도로 무음이 되는데 그것도 아무 데서도 안 걸린다
 * (voice.ts 는 클립 없는 문장을 조용히 지나간다).
 *
 * ★ 2026-09-01 사용자("대사와 음성이 제대로 맞지 않는다") 뒤로 갈림길이 바뀌었다: 예전에는 **검증관의 말이면 전부**
 *   방송으로 보냈다 — 대본에 적힌 줄까지. 그 줄들은 클립이 없어 리더(사람) 목소리로, 그것도 1~2초 늦게 도착했다.
 *   이제 정해진 줄은 경비 목소리로 구워 두고(recheck-voice.test.ts), **live 로 표시된 줄만** 방송을 탄다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chapter3 } from '@/features/world/chapter3';

/** 검증관의 이름 — 대화창에 찍히는 이름표 (chapter3 SPEAKER.examiner) */
const EXAMINER = 'UNIT-04';

interface Heard {
  /** 대화창에 찍힌 줄 — `이름|문장` */
  said: string[];
  /** 방송으로 나간 문장 */
  spoken: string[];
}

function listen(withVoice = true): Heard {
  const heard: Heard = { said: [], spoken: [] };
  chapter3.bind(
    (l) => heard.said.push(`${l.nickname}|${l.text}`),
    '나',
    null,
    withVoice ? (text) => heard.spoken.push(text) : undefined,
  );
  return heard;
}

/** 재검실을 열고 **첫 질문이 걸릴 때까지** 민다 (도착 대본 → 표식 → 검증관의 첫 마디 → 첫 질문) */
function runToQuestions(withVoice = true): Heard {
  const heard = listen(withVoice);
  chapter3.start();
  vi.advanceTimersByTime(20_000);
  // 걸어가지 않고 표식에 선 것으로 친다 — 문답은 여기서 열린다
  chapter3.beginQuestioning();
  vi.advanceTimersByTime(20_000);
  return heard;
}

describe('재검실 — 지은 말만 방송으로 나간다', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 감독은 폴백으로 답하게 둔다 (판정 한 줄은 어느 쪽이든 **지은 말**이다)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('감독 없음'))));
    chapter3.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    chapter3.reset();
  });

  it('첫 질문까지는 방송이 한 줄도 안 나간다 — 여기까지는 전부 구운 클립이다', () => {
    const { said, spoken } = runToQuestions();

    // 도착 대본과 검증관의 첫 마디, 첫 질문을 지나왔다 (지나오지 않았으면 아래 검사가 공짜다)
    expect(said.length).toBeGreaterThanOrEqual(4);
    expect(said.filter((s) => s.startsWith(`${EXAMINER}|`)).length).toBeGreaterThanOrEqual(2);
    expect(spoken).toEqual([]);
  });

  it('첫 질문은 대화창에도 한 줄로 선다 — 목표 줄에만 있으면 소리도 생김새도 다른 질문이 된다', () => {
    const { said } = runToQuestions();
    const last = said[said.length - 1];
    expect(last.startsWith(`${EXAMINER}|`), `마지막 줄이 검증관의 질문이 아니다: ${last}`).toBe(true);
    expect(chapter3.get().pending?.question).toBe(last.slice(EXAMINER.length + 1));
  });

  it('감독이 지은 판정 한 줄은 방송으로 나간다 — 이 길이 끊기면 묻는 쪽이 무음이 된다', async () => {
    const heard = runToQuestions();
    const before = heard.spoken.length;

    chapter3.answerText('이상 없음.');
    await vi.advanceTimersByTimeAsync(20_000);

    expect(heard.spoken.length).toBeGreaterThan(before);
    // 지은 줄은 대화창에도 같은 문장으로 찍힌다 — 방송은 소리만 내고 자막은 대화창이 그린다
    for (const text of heard.spoken) expect(heard.said).toContain(`${EXAMINER}|${text}`);
  });

  it('목소리를 안 이어 줘도 판은 그대로 돈다 — 방송에 못 닿는 자리가 있다 (헤드리스·테스트)', () => {
    const withVoice = runToQuestions();
    chapter3.reset();
    const without = runToQuestions(false);

    // 첫 질문은 여섯 중 하나를 뽑으므로 마지막 줄만 다를 수 있다 — 그 앞은 같은 대본이다
    expect(without.said.slice(0, -1)).toEqual(withVoice.said.slice(0, -1));
    expect(without.spoken).toHaveLength(0);
  });
});
