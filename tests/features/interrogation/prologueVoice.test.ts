/**
 * 프롤로그 목소리 배정 (src/features/interrogation/prologueVoice.ts).
 *
 * 여기서 재는 것 셋:
 *  ① 피실험자 01·02·03 이 **지정된 세 목소리**로 읽히나 (2026-09-05 사용자)
 *  ② 통제실은 목소리를 여기서 정하지 않나 — 관리 AI 목소리는 워커 한 곳에서만 정해야 한다
 *  ③ 자막과 소리의 **짝이 어긋나지 않나** — 이게 조용히 깨지는 자리다
 */
import { describe, expect, it } from 'vitest';
import { PROLOGUE, prologueLines } from '@/features/interrogation/prologue';
import { voiceOf } from '@/features/interrogation/prologueVoice';
import { OPENING_CAST } from '@/features/tts/openingSpeakers';
import type { GameSeat } from '@/world/mp/game-protocol';

/** 2026-09-05 사용자가 지정한 셋 */
const ASSIGNED = ['4JJwo477JUAx3HV0T7n7', 'hfY9LTyBpmCf5bUstZlU', 'airYK6ydeWdrJg6gyZA3'];

describe('프롤로그 목소리 — 피실험자 셋', () => {
  it('n 1·2·3 이 지정된 목소리로 간다', () => {
    for (const n of [1, 2, 3] as const) {
      expect(voiceOf({ who: 'subject', n, text: '아무 말' })?.voiceId).toBe(ASSIGNED[n - 1]);
    }
  });

  it('배역표와 같은 값을 본다 — 두 곳에 따로 적지 않는다', () => {
    expect(OPENING_CAST.map((s) => s.voiceId)).toEqual(ASSIGNED);
  });

  it('피실험자는 원음이다 — 방에 선 사람이지 스피커가 아니다', () => {
    expect(voiceOf({ who: 'subject', n: 1, text: 'x' })?.pa).toBe(false);
  });
});

describe('프롤로그 목소리 — 통제실과 지문', () => {
  /** 관리 AI 목소리를 여기 또 적으면 한쪽만 바뀌는 날이 온다 */
  it('통제실은 목소리를 여기서 정하지 않는다 — 워커가 정한다', () => {
    const v = voiceOf({ who: 'control', text: '판별을 시작합니다.' });
    expect(v).not.toBeNull();
    expect(v?.voiceId).toBeUndefined();
  });

  it('통제실은 시설 방송 음색이다 — 천장 스피커에서 나온다', () => {
    expect(voiceOf({ who: 'control', text: 'x' })?.pa).toBe(true);
  });

  it('지문은 아무도 읽지 않는다 — 「천장 스피커가 켜진다」는 말이 아니라 설명이다', () => {
    expect(voiceOf({ who: 'stage', text: '천장 스피커가 켜진다.' })).toBeNull();
  });
});

/**
 * ★ 대화창은 `prologueLines(...)` 를 띄우고, 재생부는 그 줄의 **key 끝 숫자**로 `PROLOGUE` 를
 *   되찾아 읽는다. 짝이 어긋나면 **다른 사람 목소리로 남의 대사가 나가는데** 화면은 멀쩡해 보인다.
 *   prologueLines 가 줄을 걸러 내거나 key 모양을 바꾸는 날 여기서 걸린다.
 */
describe('프롤로그 — 자막과 소리의 짝', () => {
  const seats = [1, 2, 3, 4].map((n) => ({
    id: `s${n}`,
    seat: n,
    name: `이름${n}`,
    isolated: false,
  })) as unknown as GameSeat[];

  it('줄 수가 같다', () => {
    expect(prologueLines(seats, 1234)).toHaveLength(PROLOGUE.length);
  });

  it('같은 자리의 글이 같다 — 자막과 소리가 같은 줄이어야 한다', () => {
    prologueLines(seats, 1234).forEach((l, i) => expect(l.text).toBe(PROLOGUE[i].text));
  });

  /**
   * ★ 재생부는 줄의 **key 끝 숫자**로 대본을 되찾아 읽는다 (InterrogationFeature 의 onPrologueLine).
   *   key 모양이 바뀌면 엉뚱한 줄을 읽거나 아무것도 안 읽는데, 화면은 멀쩡해 보인다.
   */
  it('key 끝 숫자가 대본의 자리다 — 재생부가 그걸로 줄을 되찾는다', () => {
    prologueLines(seats, 1234).forEach((l, i) => {
      expect(Number(l.key.slice(l.key.lastIndexOf('-') + 1))).toBe(i);
    });
  });

  it('피실험자 줄에는 그 번호의 이름표가 붙는다', () => {
    prologueLines(seats, 1234).forEach((line, i) => {
      const l = PROLOGUE[i];
      if (l.who !== 'subject') return;
      expect(line.nickname).toContain(`피실험자 ${String(l.n).padStart(2, '0')}`);
    });
  });
});
