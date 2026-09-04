/**
 * 프롤로그 목소리 배정 (src/features/interrogation/prologueVoice.ts).
 *
 * 여기서 재는 것 셋:
 *  ① 피실험자 01·02·03 이 **지정된 세 목소리**로 읽히나 (2026-09-05 사용자)
 *  ② 통제실은 목소리를 여기서 정하지 않나 — 관리 AI 목소리는 워커 한 곳에서만 정해야 한다
 *  ③ 자막과 소리의 **짝이 어긋나지 않나** — 이게 조용히 깨지는 자리다
 */
import { describe, expect, it } from 'vitest';
import { PROLOGUE, prologueEntries } from '@/features/interrogation/prologue';
import { voiceOf } from '@/features/interrogation/prologueVoice';
import { OPENING_CAST } from '@/features/tts/openingSpeakers';
import type { GameSeat } from '@/world/mp/game-protocol';

/** 2026-09-05 사용자가 지정한 셋 */
const ASSIGNED = ['4JJwo477JUAx3HV0T7n7', 'hfY9LTyBpmCf5bUstZlU', 'airYK6ydeWdrJg6gyZA3'];

describe('프롤로그 목소리 — 피실험자 셋', () => {
  it('n 1·2·3 이 지정된 목소리로 간다', () => {
    for (const n of [1, 2, 3] as const) {
      expect(voiceOf({ who: 'subject', n, text: '아무 말', gap: 0 })?.voiceId).toBe(ASSIGNED[n - 1]);
    }
  });

  it('배역표와 같은 값을 본다 — 두 곳에 따로 적지 않는다', () => {
    expect(OPENING_CAST.map((s) => s.voiceId)).toEqual(ASSIGNED);
  });

  it('피실험자는 원음이다 — 방에 선 사람이지 스피커가 아니다', () => {
    expect(voiceOf({ who: 'subject', n: 1, text: 'x', gap: 0 })?.pa).toBe(false);
  });
});

describe('프롤로그 목소리 — 통제실과 지문', () => {
  /** 관리 AI 목소리를 여기 또 적으면 한쪽만 바뀌는 날이 온다 */
  it('통제실은 목소리를 여기서 정하지 않는다 — 워커가 정한다', () => {
    const v = voiceOf({ who: 'control', text: '판별을 시작합니다.', gap: 0 });
    expect(v).not.toBeNull();
    expect(v?.voiceId).toBeUndefined();
  });

  it('통제실은 시설 방송 음색이다 — 천장 스피커에서 나온다', () => {
    expect(voiceOf({ who: 'control', text: 'x', gap: 0 })?.pa).toBe(true);
  });

  it('지문은 아무도 읽지 않는다 — 「천장 스피커가 켜진다」는 말이 아니라 설명이다', () => {
    expect(voiceOf({ who: 'stage', text: '천장 스피커가 켜진다.', gap: 0 })).toBeNull();
  });
});

/**
 * ★ 재생부는 `prologueEntries(...)[i]` 의 자막과 `PROLOGUE[i]` 의 소리를 짝지어 낸다.
 *   그 짝이 어긋나면 **다른 사람 목소리로 남의 대사가 나가는데**, 화면은 멀쩡해 보인다.
 *   prologueEntries 가 PROLOGUE 를 걸러 내거나 순서를 바꾸는 날 여기서 걸린다.
 */
describe('프롤로그 — 자막과 소리의 짝', () => {
  const seats = [1, 2, 3, 4].map((n) => ({
    id: `s${n}`,
    seat: n,
    name: `이름${n}`,
    isolated: false,
  })) as unknown as GameSeat[];

  it('줄 수가 같다', () => {
    expect(prologueEntries(seats, 1234)).toHaveLength(PROLOGUE.length);
  });

  it('같은 자리의 글이 같다 — 자막과 소리가 같은 줄이어야 한다', () => {
    const entries = prologueEntries(seats, 1234);
    entries.forEach((e, i) => expect(e.entry.text).toBe(PROLOGUE[i].text));
  });

  it('피실험자 줄에는 그 번호의 이름표가 붙는다', () => {
    const entries = prologueEntries(seats, 1234);
    entries.forEach((e, i) => {
      const l = PROLOGUE[i];
      if (l.who !== 'subject') return;
      expect(e.entry.name).toContain(`피실험자 ${String(l.n).padStart(2, '0')}`);
    });
  });
});
