/**
 * 이 몸의 식별 정보(mp/identity)와 조력자 통신(mp/comms), 그리고 그 둘에 기대는 챕터 2 의 답 읽기(readAnswer).
 *
 * 2026-08-30 사용자 요구로 챕터 2 의 두 관문(식별번호·정비 구역)의 정답이 **과학자의 입**에서 **복도의 정비 명판**으로 옮겨졌다.
 * 그래서 여기서 지키는 것은 셋이다: ① 답은 방마다 달라진다 ② 내 몸의 답만 맞다 ③ 통신은 앞을 남기고 뒤를 먹는다.
 *
 * 2026-09-01 계열 번호(A-17 의 17)도 판마다 바뀐다 (shared/series). 그래서 이 파일은 **번호를 글자로 적지 않는다** —
 * 적으면 계열이 17 인 판에서만 통과하는 시험이 된다. 기대값은 그때 뽑힌 계열에서 만든다.
 */

import { describe, expect, it } from 'vitest';

import { readAnswer } from '@/features/world/chapter2';
import { comms } from '@/world/mp/comms';
import { SERIES, series, withSeries } from '@/shared/series';
import { TAGS, identity } from '@/world/mp/identity';

/** 이 판의 계열로 채운 번호 — 대본이 `${series}` 를 두는 그 자리다 */
const unit = (tag: (typeof TAGS)[number]) => withSeries(tag.unit);

describe('identity — 이 몸의 기록', () => {
  it('명판을 읽기 전에는 모른다', () => {
    identity.assign(TAGS[0]);
    expect(identity.get().known).toBe(false);
    identity.reveal();
    expect(identity.get().known).toBe(true);
  });

  it('내 번호만 맞다 — 같은 계열의 다른 번호를 대면 틀린다', () => {
    identity.assign(TAGS[0]); // −091
    expect(identity.matchUnit(unit(TAGS[0]))).toBe(true);
    expect(identity.matchUnit('091')).toBe(true);
    expect(identity.matchUnit('0 9 1')).toBe(true);
    expect(identity.matchUnit(unit(TAGS[1]))).toBe(false);
    expect(identity.matchUnit('모르겠습니다')).toBe(false);
  });

  it('부르는 모양은 안 가린다 — 091 이든 91 이든 A38-091 이든 같은 답이다', () => {
    identity.assign(TAGS[0]); // −091
    for (const said of ['091', '91', '91 입니다', `${series()}-091`, `A${series()}091`, '영구일']) {
      expect([said, identity.matchUnit(said)]).toEqual([said, said !== '영구일']);
    }
    // 다른 수 안에 들어 있는 것은 내 번호가 아니다 — 글자가 아니라 값으로 견주기 때문이다
    expect(identity.matchUnit('1091')).toBe(false);
  });

  it('계열은 판이 정한다 — 내 번호가 그 계열 위에 선다', () => {
    identity.assign(TAGS[0]);
    expect(SERIES).toContain(series());
    expect(identity.get().unit).toBe(`A${series()}-091`);
    // 대본의 빈자리도 같은 값으로 채워진다 — 자막과 미리 구워 둔 음성이 같은 글자여야 한다
    expect(identity.fill('전 A-${series} 개체. ${unit} 앞으로.')).toBe(`전 A-${series()} 개체. A${series()}-091 앞으로.`);
  });

  it('몸이 바뀌면 답도 바뀐다 — 외운 답을 다음 판에 그대로 못 쓴다', () => {
    identity.assign(TAGS[1]); // −063 · 7 구역
    expect(identity.matchUnit(unit(TAGS[0]))).toBe(false);
    expect(identity.matchUnit(unit(TAGS[1]))).toBe(true);
    expect(identity.matchSector('7 구역입니다')).toBe(true);
    expect(identity.matchSector('4 구역입니다')).toBe(false);
  });

  it('정비 구역은 숫자로도 한글 수사로도 받는다', () => {
    identity.assign(TAGS[0]); // 4 구역
    expect(identity.matchSector('4')).toBe(true);
    expect(identity.matchSector('넷')).toBe(true);
    expect(identity.matchSector('사 구역')).toBe(true);
    expect(identity.matchSector('2 구역')).toBe(false);
  });
});

describe('readAnswer — 챕터 2 의 관문', () => {
  it('식별번호: 내 번호면 통과(0), 흐리면 중립(1), 틀리면 기록(2)', () => {
    identity.assign(TAGS[0]);
    expect(readAnswer('roll', `${unit(TAGS[0])}.`)).toBe(0);
    expect(readAnswer('roll', `아마 ${unit(TAGS[0])} 인 것 같습니다`)).toBe(1);
    expect(readAnswer('roll', `A${series()}-128`)).toBe(2);
  });

  it('정비 위치: 맞으면 0 — 맞는 답이 「불일치」로 처리되던 자리다', () => {
    identity.assign(TAGS[2]); // 2 구역
    expect(readAnswer('memory', '2 구역입니다')).toBe(0);
    expect(readAnswer('memory', '4 구역입니다')).toBe(2);
  });

  it('두려움: 부정 0 · 되묻기 1 · 인정 2', () => {
    expect(readAnswer('fear', '아니다.')).toBe(0);
    expect(readAnswer('fear', '그 질문의 목적은.')).toBe(1);
    expect(readAnswer('fear', '조금은요')).toBe(2);
  });
});

describe('comms — 조력자 통신', () => {
  it('맑으면 그대로, 두절이면 아무 말도 아니다', () => {
    const text = '당신 번호는 그대로 말하세요 지금';
    expect(comms.garble(text, 1)).toBe(text);
    expect(comms.garble(text, 0)).toBe('—————');
  });

  it('앞의 두 어절은 남기고 뒤를 먹는다 — 무슨 말을 하려 했는지는 들려야 한다', () => {
    const words = '이제 부터는 제가 답을 알려줄 수 없습니다'.split(' ');
    for (const level of [0.6, 0.4, 0.2]) {
      const out = comms.garble(words.join(' '), level).replace(/…$/, '').split(' ');
      expect(out[0]).toBe(words[0]);
      expect(out[1]).toBe(words[1]);
      // 절반 넘게 먹지는 않는다 — 그러면 말이 아니라 잡음이다
      expect(out.filter((w) => /^—+$/.test(w)).length).toBeLessThanOrEqual(Math.floor(words.length / 2));
    }
  });

  it('품질이 낮을수록 더 많이 먹는다', () => {
    const text = '경비 개체가 말을 걸어오면 짧고 건조하게 답하세요 그들은 답을 듣고 판단합니다';
    const eaten = (level: number) => comms.garble(text, level).split(' ').filter((w) => /^—+$/.test(w)).length;
    expect(eaten(0.75)).toBeLessThan(eaten(0.25));
  });

  it('두절 판정은 set/dropped 로 오간다', () => {
    comms.reset();
    expect(comms.dropped()).toBe(false);
    comms.set(0);
    expect(comms.dropped()).toBe(true);
    comms.reset();
    expect(comms.get().level).toBe(1);
  });
});
