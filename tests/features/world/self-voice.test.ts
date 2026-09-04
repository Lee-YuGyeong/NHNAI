/**
 * **내 말은 소리를 안 낸다** (2026-09-03 사용자: "사용자는 tts 제거해줘").
 *
 * 이 게임에서 내 말은 **내가 친 말**이다 — 대본에 적힌 줄이든 검문 앞에서 고른 답이든, 그 자리에
 * 있는 사람은 나다. 거기에 합성 목소리를 얹으면 내가 한 말을 남이 대신 읽어 주는 꼴이 되고,
 * 남과 대화하는 자리에서 그게 제일 두드러진다.
 *
 * 화자를 못 찾은 줄은 재생부가 조용히 지나가므로(voice.ts 의 play), **화자가 안 붙는다**는 것이
 * 곧 소리가 안 난다는 뜻이다. 여기서 지키는 것은 그 한 줄이다 — 굽는 쪽(tools/voice-cast.json)에서
 * 'me' 를 걷어도 이 잣대가 살아 있어야, 나중에 누가 클립을 되살려도 소리가 새어 나오지 않는다.
 *
 * 말풍선·대화창은 그대로다. 사라지는 것은 소리뿐이라, 남의 줄은 여전히 화자를 찾아야 한다.
 */
import { describe, expect, it } from 'vitest';

import { speakerOf, type Manifest } from '@/features/world/voice';

const M: Manifest = {
  names: { 과학자: 'scientist', 'UNIT-07': 'unit07', 나: 'me' },
  speakers: { scientist: { fx: 'none', gain: 1 }, unit07: { fx: 'robot', gain: 1 }, me: { fx: 'robot', gain: 1 } },
  lines: {},
};

describe('내 말의 화자', () => {
  it('내 말에는 화자가 안 붙는다 — 클립이 있어도 안 튼다', () => {
    expect(speakerOf(M, '나', true)).toBeUndefined();
  });

  it('이름표가 화자표에 있어도 마찬가지다 — 판단은 「내 말인가」 하나로 한다', () => {
    // manifest 에 '나' → 'me' 가 남아 있어도(옛 파일·배포본) 소리는 안 난다
    expect(M.names['나']).toBe('me');
    expect(speakerOf(M, '나', true)).toBeUndefined();
  });

  it('남의 줄은 그대로 제 목소리로 말한다 — 없애는 것은 내 소리뿐이다', () => {
    expect(speakerOf(M, '과학자', false)).toBe('scientist');
    expect(speakerOf(M, 'UNIT-07', false)).toBe('unit07');
  });

  it('명단에 없는 이름은 여전히 조용하다 (플레이어 채팅·LLM 이 지은 답)', () => {
    expect(speakerOf(M, 'A62-024', false)).toBeUndefined();
  });
});
