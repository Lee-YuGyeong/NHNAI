/**
 * 목소리 선택 — 순수 함수라 node 환경 그대로 돈다 (speechSynthesis 없이 검증된다).
 *
 * 계약: 한국어가 아니면 절대 고르지 않는다. 한국어가 여럿이면 품질 순으로 고른다.
 * 여기서 막는 건 "브라우저 기본 목소리가 영어라 리더가 영어로 방송하는" 사고다.
 */
import { describe, expect, it } from 'vitest';
import { pickVoice } from '@/features/tts/engine';

const v = (name: string, lang: string, localService = false) => ({ name, lang, localService });

describe('pickVoice', () => {
  it('한국어 목소리가 없으면 아무것도 고르지 않는다 (lang 만 주고 브라우저에 맡긴다)', () => {
    expect(pickVoice([v('Samantha', 'en-US'), v('Kyoko', 'ja-JP')])).toBeUndefined();
  });

  it('영어가 먼저 와 있어도 한국어를 골라낸다', () => {
    const ko = v('Yuna', 'ko-KR', true);
    expect(pickVoice([v('Samantha', 'en-US'), ko])).toBe(ko);
  });

  it('ko_KR 처럼 밑줄로 오는 표기도 한국어로 본다', () => {
    const ko = v('한국어', 'ko_KR');
    expect(pickVoice([ko])).toBe(ko);
  });

  it('한국어가 여럿이면 Google 목소리를 먼저 쓴다', () => {
    const google = v('Google 한국의', 'ko-KR');
    expect(pickVoice([v('Yuna', 'ko-KR', true), google])).toBe(google);
  });

  it('Google 이 없으면 원격 목소리, 그것도 없으면 첫 한국어', () => {
    const remote = v('원격', 'ko-KR', false);
    expect(pickVoice([v('Yuna', 'ko-KR', true), remote])).toBe(remote);
    const only = v('Yuna', 'ko-KR', true);
    expect(pickVoice([only])).toBe(only);
  });
});
