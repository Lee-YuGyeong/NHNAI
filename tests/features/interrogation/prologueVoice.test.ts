/**
 * 프롤로그 목소리 배정 (src/features/interrogation/prologueVoice.ts).
 *
 * 여기서 재는 것 셋:
 *  ① 피실험자 01·02·03 이 **지정된 세 목소리**로 읽히나 (2026-09-05 사용자)
 *  ② 통제실은 목소리를 여기서 정하지 않나 — 관리 AI 목소리는 워커 한 곳에서만 정해야 한다
 *  ③ 자막과 소리의 **짝이 어긋나지 않나** — 이게 조용히 깨지는 자리다
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PROLOGUE, prologueLines } from '@/features/interrogation/prologue';
import { leadingSilenceSec, resetPrologueVoice, voiceOf, type ClipSamples } from '@/features/interrogation/prologueVoice';
import { OPENING_CAST } from '@/features/tts/openingSpeakers';
import type { GameSeat } from '@/world/mp/game-protocol';

/** 2026-09-05 사용자가 지정한 셋 */
const ASSIGNED = ['4JJwo477JUAx3HV0T7n7', 'hfY9LTyBpmCf5bUstZlU', 'airYK6ydeWdrJg6gyZA3'];

describe('프롤로그 목소리 — 피실험자 셋', () => {
  it('n 1·2·3 이 지정된 목소리로 간다', () => {
    for (const n of [1, 2, 3] as const) {
      expect(voiceOf({ who: 'subject', n, text: '아무 말' }).voiceId).toBe(ASSIGNED[n - 1]);
    }
  });

  it('배역표와 같은 값을 본다 — 두 곳에 따로 적지 않는다', () => {
    expect(OPENING_CAST.map((s) => s.voiceId)).toEqual(ASSIGNED);
  });

  it('피실험자는 원음이다 — 방에 선 사람이지 스피커가 아니다', () => {
    expect(voiceOf({ who: 'subject', n: 1, text: 'x' }).pa).toBe(false);
  });
});

/**
 * 몸 → 목소리 (2026-09-05 사용자: 「비만 남군은 셋 중 남자 목소리로」).
 * 초상이 좌석의 몸이라(prologue.ts 의 faceOf), 번호로만 주면 남자 얼굴에서 여자 목소리가 난다.
 */
describe('프롤로그 목소리 — 몸을 따라간다 (얼굴과 성별을 맞춘다)', () => {
  const seat = (body?: string) => ({ id: 'x', seat: 1, name: '이름', isolated: false, body }) as unknown as GameSeat;
  const MALE = OPENING_CAST.find((s) => s.gender === '남')!.voiceId;

  // 배역은 모듈의 상태다 — 여기서 적은 것이 다른 벌레잡이(위 「피실험자 셋」)로 새면 안 된다
  afterEach(() => resetPrologueVoice());

  it('비만 남군 몸이면 남자 목소리다 — 번호(여자 목소리)가 아니라 얼굴을 따른다', () => {
    resetPrologueVoice([seat('sol_fit_f'), seat('sol_heavy_m'), seat('sol_fit_f')]);
    expect(voiceOf({ who: 'subject', n: 2, text: 'x' }).voiceId).toBe(MALE);
  });

  it('짝이 없는 몸은 번호 배정 그대로다', () => {
    resetPrologueVoice([seat('sol_fit_f'), seat('sol_fit_f'), seat('sol_fit_f')]);
    expect(voiceOf({ who: 'subject', n: 2, text: 'x' }).voiceId).toBe(ASSIGNED[1]);
  });

  it('배역을 모르는 화면(판 도중 합류)도 번호 배정으로 소리는 난다', () => {
    resetPrologueVoice();
    expect(voiceOf({ who: 'subject', n: 3, text: 'x' }).voiceId).toBe(ASSIGNED[2]);
  });
});

describe('프롤로그 목소리 — 통제실과 지문', () => {
  /** 관리 AI 목소리를 여기 또 적으면 한쪽만 바뀌는 날이 온다 */
  it('통제실은 목소리를 여기서 정하지 않는다 — 워커가 정한다', () => {
    expect(voiceOf({ who: 'control', text: '판별을 시작합니다.' }).voiceId).toBeUndefined();
  });

  it('통제실은 시설 방송 음색이다 — 천장 스피커에서 나온다', () => {
    expect(voiceOf({ who: 'control', text: 'x' }).pa).toBe(true);
  });
});

/**
 * 앞머리 무음 (2026-09-05 사용자: 「정부 통제실에서 말하는 게 tts 가 시작이 더 늦어. 사람1은
 * 타이밍 맞게 나오고 있거든」).
 *
 * 자막은 소리 길이에 맞춰 찍히므로(DialogueBox 의 paceFor) 클립 앞의 무음까지 「말」로 세면
 * 글자만 먼저 굴러간다. 재는 쪽이 틀리면 화면은 멀쩡한데 입만 안 맞는다 — 눈으로 못 보는 자리다.
 */
describe('프롤로그 목소리 — 앞머리 무음', () => {
  const RATE = 1000;
  /** 앞에 무음 leadSec, 뒤에 level 크기의 소리가 이어지는 한 채널짜리 클립 */
  function clip(leadSec: number, bodySec: number, level = 0.5): ClipSamples {
    const lead = Math.round(leadSec * RATE);
    const data = new Float32Array(lead + Math.round(bodySec * RATE));
    for (let i = lead; i < data.length; i += 1) data[i] = i % 2 ? level : -level;
    return { sampleRate: RATE, length: data.length, numberOfChannels: 1, getChannelData: () => data };
  }

  it('앞머리 무음을 재어 낸다 — 여유(30ms)만큼 물러서서', () => {
    expect(leadingSilenceSec(clip(0.5, 2))).toBeCloseTo(0.47, 3);
  });

  /** 첫 자음은 서서히 오른다 — 문턱에 닿는 자리에서 바로 자르면 그 자음이 깎인다 */
  it('찾은 자리보다 **앞에서** 자른다 — 말머리를 깎지 않는다', () => {
    expect(leadingSilenceSec(clip(0.2, 1))).toBeLessThan(0.2);
  });

  it('말이 곧바로 시작하면 안 자른다', () => {
    expect(leadingSilenceSec(clip(0, 2))).toBe(0);
  });

  /** 문턱을 절대값 하나로 두면 여기서 클립이 통째로 사라진다 — 봉우리에 맞춰 잡는 이유 */
  it('조용히 녹은 클립도 잰다 — 문턱은 그 클립의 봉우리에 맞춘다', () => {
    expect(leadingSilenceSec(clip(0.5, 2, 0.01))).toBeCloseTo(0.47, 3);
  });

  it('통째로 조용한 클립은 안 자른다 — 앞머리가 아니라 소리가 없는 것이다', () => {
    expect(leadingSilenceSec(clip(1, 0))).toBe(0);
  });

  it('상한(1초)을 넘는 무음은 안 건드린다 — 앞머리가 아니라 깨진 클립이다', () => {
    expect(leadingSilenceSec(clip(2, 1))).toBe(0);
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
