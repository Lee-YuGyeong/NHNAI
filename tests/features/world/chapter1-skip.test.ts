// @vitest-environment jsdom
/**
 * 복도의 대사를 **T 로 넘길 때** 대본이 하는 일 (chapter1.skip).
 *
 * 대화창은 제가 들고 있는 줄만 넘길 수 있다. 다음 줄은 대본의 예약에 매달려 있어서,
 * 여기서 같이 당기지 않으면 넘긴 만큼 그대로 정적이 된다 — 「스킵이 안 먹힌다」로 보이는 자리다.
 *
 * 음성(voice.ts)은 가짜다. 여기서 보는 것은 **줄이 언제 나오는가** 뿐이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/world/voice', () => ({
  voiceLines: { play: vi.fn(() => Promise.resolve(null)), prefetch: vi.fn(() => Promise.resolve()), stop: vi.fn(), durationOf: vi.fn(() => undefined) },
}));

import { chapter1 } from '@/features/world/chapter1';

const said: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  said.length = 0;
  chapter1.reset();
  chapter1.bind((line) => said.push(line.text), '나', null, null);
  chapter1.enter('corridor');
  chapter1.start();
});
afterEach(() => {
  chapter1.reset();
  vi.useRealTimers();
});

/** 인트로가 시작되기까지(1.2초) — 그 전엔 앞당길 대사가 아직 예약되지도 않았다 */
const INTRO_AT_MS = 1_300;

describe('chapter1.skip — 다음 줄을 지금 부른다', () => {
  it('다음 줄이 제 시각을 기다리지 않는다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    expect(said).toHaveLength(1); // 첫 줄이 떴고, 둘째 줄은 첫 줄의 길이만큼 뒤에 있다

    expect(chapter1.skip()).toBe(true);
    expect(said).toHaveLength(2);
  });

  it('한 번에 한 줄씩이다 — 한 번 눌렀다고 대본이 다 흘러가면 안 된다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    chapter1.skip();
    chapter1.skip();
    expect(said).toHaveLength(3);
  });

  it('앞당긴 뒤에도 줄 사이의 간격은 남는다 — 대본이 한꺼번에 쏟아지지 않는다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    chapter1.skip();
    const before = said.length;

    vi.advanceTimersByTime(300);
    expect(said).toHaveLength(before); // 방금 뜬 줄을 읽을 시간은 그대로다
  });

  it('대사가 다 끝나면 아무것도 안 한다 — 무대 이동은 저 혼자 안 당겨진다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    while (chapter1.skip());
    expect(chapter1.skip()).toBe(false);
  });

  it('넘겨도 대본의 단계는 제 순서대로 온다 — 인트로가 끝나면 조사 단계가 열린다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    while (chapter1.skip());
    // 마지막 줄을 읽을 시간은 남아 있다 — 그 뒤에 단계가 넘어간다
    vi.advanceTimersByTime(30_000);
    expect(chapter1.get().phase).toBe('explore');
    expect(chapter1.get().objective).toBeTruthy();
  });

  it('넘긴 판이 뒤엉키지 않는다 — 다 넘긴 뒤에도 대사는 인트로 다섯 줄뿐이다', () => {
    vi.advanceTimersByTime(INTRO_AT_MS);
    while (chapter1.skip());
    expect(said).toHaveLength(5);
  });
});
