/**
 * 개체 목소리의 자리 배정 — 순수 함수라 node 환경 그대로 돈다.
 *
 * 계약: 한 방에 서는 다섯은 **서로 다른 목소리**여야 하고, 한 개체의 목소리는
 * 판이 도는 내내 **바뀌지 않아야** 한다. 목소리가 도중에 바뀌면 그건 다른 개체가
 * 말하는 것으로 들리고, 둘이 같으면 누가 말했는지 귀로 못 가른다.
 * 재생(Web Speech·원격 합성)은 여기서 보지 않는다 — 브라우저 몫이다.
 */
import { describe, expect, it } from 'vitest';
import { NODE_VOICES, profileOf, slotOf, speechMsOf } from '@/features/arena/node-voice';

/** 한 방에 서는 개체 다섯 (이름은 매판 NAMES 에서 새로 뽑힌다 — 형식에 기대지 않는다) */
const FIVE = ['A-17', 'A-3', 'A-28', 'A-9', 'A-34'];

describe('음색표', () => {
  it('노드 8석을 다 채워도 자리가 겹치지 않는다', () => {
    // PLANNING §1.1 — 노드는 8개다. 표가 그보다 짧으면 자리가 돌아 두 개체가 같은 목소리를 쓴다
    expect(NODE_VOICES.length).toBeGreaterThanOrEqual(8);
  });

  it('알아들을 수 있는 높이 범위 안이다', () => {
    // 0.5 아래는 웅얼거리고 1.6 위는 삑삑거린다 — 지시문을 알아듣는 게 이 게임의 기능이다
    for (const v of NODE_VOICES) {
      expect(v.pitch).toBeGreaterThanOrEqual(0.5);
      expect(v.pitch).toBeLessThanOrEqual(1.6);
    }
  });

  it('먼저 채워지는 다섯 자리는 서로 뚜렷하게 떨어져 있다', () => {
    // 한 방에 다섯이 선다. 이 다섯이 붙어 들리면 표가 아무리 길어도 소용이 없다
    const five = NODE_VOICES.slice(0, 5).map((v) => v.pitch).sort((a, b) => a - b);
    for (let i = 1; i < five.length; i++) {
      expect(five[i] - five[i - 1]).toBeGreaterThanOrEqual(0.15);
    }
  });
});

describe('자리 배정 — slotOf', () => {
  it('명단에 있으면 명단 순서를 그대로 쓴다', () => {
    FIVE.forEach((id, i) => expect(slotOf(id, FIVE)).toBe(i));
  });

  it('한 방의 다섯은 서로 다른 목소리를 받는다', () => {
    const slots = FIVE.map((id) => slotOf(id, FIVE));
    expect(new Set(slots).size).toBe(FIVE.length);
    const pitches = FIVE.map((id) => profileOf(id, FIVE).pitch);
    expect(new Set(pitches).size).toBe(FIVE.length);
  });

  it('같은 이름·같은 명단이면 몇 번을 물어도 같은 자리다', () => {
    // 목소리가 판 도중에 바뀌면 다른 개체가 말하는 것으로 들린다
    for (const id of FIVE) expect(slotOf(id, FIVE)).toBe(slotOf(id, FIVE));
  });

  it('명단 밖 이름도 자리를 받는다 — 표 범위 안에서, 언제 물어도 같은 자리로', () => {
    // 리더(A-1)처럼 명단에 없는 이름이 올 수 있다. 소리가 안 나는 것보다 아무 자리나 받는 게 낫다
    for (const id of ['A-1', '', '알 수 없는 개체']) {
      const slot = slotOf(id, FIVE);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(NODE_VOICES.length);
      expect(slotOf(id, FIVE)).toBe(slot);
    }
  });

  it('명단이 비어 있어도 터지지 않는다 — 성격이 아직 오는 중인 순간이 있다', () => {
    const slot = slotOf('A-17', []);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(NODE_VOICES.length);
  });
});

describe('음색 — profileOf', () => {
  it('자리 번호가 가리키는 표의 항목 그대로다', () => {
    for (const id of FIVE) expect(profileOf(id, FIVE)).toBe(NODE_VOICES[slotOf(id, FIVE)]);
  });
});

describe('말하는 길이 — speechMsOf', () => {
  const anyVoice = NODE_VOICES[0];

  it('긴 말이 더 오래 걸린다', () => {
    expect(speechMsOf(anyVoice, '가'.repeat(40))).toBeGreaterThan(speechMsOf(anyVoice, '가'.repeat(10)));
  });

  it('빠르기가 낮은 자리는 같은 말을 더 오래 끈다', () => {
    const slow = NODE_VOICES.reduce((a, b) => (a.rate <= b.rate ? a : b));
    const fast = NODE_VOICES.reduce((a, b) => (a.rate >= b.rate ? a : b));
    const line = '지시대로 했다. 기록을 확인해라.';
    expect(speechMsOf(slow, line)).toBeGreaterThan(speechMsOf(fast, line));
  });

  it('빈 줄에도 바닥이 있다 — 0 을 돌려주면 리듬이 그 자리를 안 기다린다', () => {
    expect(speechMsOf(anyVoice, '')).toBeGreaterThan(0);
  });

  /*
   * 이 검사가 이 파일에서 제일 중요하다 — **대화 리듬이 소리를 기다려야 하는 이유**가 여기 있다.
   * ArenaFeature 의 beat() 는 읽는 시간만 재고 5.2초에서 멎는데, 개체가 흔히 내는 40자 한마디는
   * 소리로 그보다 길다. 리듬이 이걸 안 보면 다음 개체가 앞말 위에 겹쳐 말한다.
   */
  const BEAT_CEILING_MS = 5200;
  it('흔한 길이의 한마디가 대화 리듬 천장을 넘는다', () => {
    for (const v of NODE_VOICES) {
      expect(speechMsOf(v, '가'.repeat(40))).toBeGreaterThan(BEAT_CEILING_MS);
    }
  });
});
