/**
 * 방을 울리는 규칙 (src/features/voice/roomVoice.ts, docs/VOICE.md §6·§7).
 *
 * 소리 장치는 관문으로 빠져 있어서 여기서 재는 것은 **누구의 줄이 소리가 되고 누구의 줄이
 * 조용한가**뿐이다. 그게 이 파일에서 틀리면 안 되는 전부다.
 */
import { describe, expect, it, vi } from 'vitest';
import { type VoicePorts, createRoomVoice } from '@/features/voice/roomVoice';
import type { SeatLine } from '@/features/voice/roomVoice';

/** 서버가 토큰을 실어 보낸 줄 */
function line(id: string, seat: number, ts = 0): SeatLine {
  return { id, seat, text: '짧은 말', ts, clip: `tok-${id}` };
}

/**
 * 토큰이 없는 줄 — 예산이 바닥났거나 명부가 없어서 서버가 소리를 안 내기로 한 것이다.
 * (기본값 인자로 만들지 않는다: clip 에 undefined 를 **넘겨도** 기본값이 끼어들어
 *  토큰이 붙어 버린다 — 이 파일이 실제로 한 번 밟은 함정이다.)
 */
function mute(id: string, seat: number, ts = 0): SeatLine {
  return { id, seat, text: '짧은 말', ts };
}

/** 소리 관문을 가짜로 — 무엇을 받아 왔고 무엇을 틀었는지만 적어 둔다 */
function ports(over: Partial<VoicePorts> = {}) {
  const fetched: string[] = [];
  const played: number[] = [];
  const base: VoicePorts = {
    fetchClip: async (t) => {
      fetched.push(t);
      return { t };
    },
    play: async (seat) => {
      played.push(seat);
    },
    wait: async () => {},
    now: () => 0,
    ...over,
  };
  return { ports: base, fetched, played };
}

/** 떠 있는 약속들이 정리되게 한 바퀴 돌린다 */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('방 목소리 — 남의 말은 그 좌석 목소리로 난다', () => {
  it('토큰으로 받아 와 그 좌석으로 튼다', async () => {
    const p = ports();
    const voice = createRoomVoice(p.ports);
    expect(voice.hear(line('a', 3))).toBe('play');
    await settle();
    expect(p.fetched).toEqual(['tok-a']);
    expect(p.played).toEqual([3]);
  });
});

/**
 * ★ 내 말은 나에게만 무음이다 (§7). 다른 여덟에게는 정상으로 들린다 —
 * 여기서 재는 것은 **내 화면**이라 안 나는 것이 맞다.
 */
describe('방 목소리 — 내 말은 나만 못 듣는다', () => {
  it('내 좌석의 줄은 받아 오지도 틀지도 않는다', async () => {
    const p = ports();
    const voice = createRoomVoice(p.ports);
    voice.setSelfSeat(2);
    expect(voice.hear(line('a', 2))).toBe('self');
    await settle();
    expect(p.fetched).toEqual([]);
    expect(p.played).toEqual([]);
  });

  it('★ 그래도 발언권 자리는 차지한다 — 안 그러면 나만 한 줄을 더 듣게 된다', async () => {
    // 내 줄(wait)과 남의 줄(play) 둘 다 붙잡아 둬서 자리가 찬 상태를 만든다
    let releaseMine = () => {};
    let releaseTheirs = () => {};
    const mine = new Promise<void>((r) => (releaseMine = r));
    const theirs = new Promise<void>((r) => (releaseTheirs = r));
    const p = ports({ wait: () => mine, play: async () => theirs });

    const voice = createRoomVoice(p.ports);
    voice.setSelfSeat(2);
    voice.hear(line('a', 2)); // 내 줄 — 소리는 없지만 자리 하나
    voice.hear(line('b', 5)); // 남의 줄 — 자리 둘
    await settle();
    expect(voice.stats().playing).toBe(2);

    // 자리가 다 찼으므로 세 번째는 기다린다. 내 줄이 자리를 안 잡았다면 여기서 바로 울렸을 것이다
    voice.hear(line('c', 6));
    await settle();
    expect(voice.stats().waiting).toBe(1);
    expect(p.fetched).toEqual(['tok-b']);

    // 내 줄이 끝나면 그 자리에 c 가 들어간다
    releaseMine();
    await settle();
    expect(p.fetched).toEqual(['tok-b', 'tok-c']);
    releaseTheirs();
  });
});

/**
 * 서버가 토큰을 안 실어 보냈다 = 예산이 바닥났거나 명부가 없다 (§6). 그 결정은 방 단위라
 * 전원이 같은 줄부터 같이 조용해진다. 클라이언트는 따지지 않고 따른다.
 */
describe('방 목소리 — 토큰이 없으면 글자만', () => {
  it('토큰 없는 줄은 받아 오지 않는다', async () => {
    const p = ports();
    const voice = createRoomVoice(p.ports);
    expect(voice.hear(mute('a', 3))).toBe('no-clip');
    await settle();
    expect(p.fetched).toEqual([]);
  });

  it('토큰 없는 줄도 자리는 차지한다 — 남들에게도 안 들리니 발언권이 같이 간다', async () => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const p = ports({ wait: () => held });
    const voice = createRoomVoice(p.ports);

    voice.hear(mute('a', 3));
    await settle();
    expect(voice.stats().playing).toBe(1);
    release();
  });
});

/**
 * ★ 폴백이 없다 (§6, 2026-09-04 사용자). 실패하면 브라우저 음성으로 내려가는 것이 아니라
 * **방 전체가 조용해진다.** 한 좌석만 다른 목소리로 들리는 것은 그 좌석이 조용한 것보다 나쁘다.
 */
describe('방 목소리 — 안 되면 방 전체가 조용해진다', () => {
  it('세 번 잇달아 실패하면 그 판의 참가자 음성을 끈다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = ports({ fetchClip: async () => Promise.reject(new Error('402 크레딧 소진')) });
    const voice = createRoomVoice(p.ports);

    for (const id of ['a', 'b', 'c']) {
      voice.hear(line(id, 1));
      await settle();
    }
    expect(voice.silenced()).toBe(true);
    expect(voice.hear(line('d', 4))).toBe('silenced');
    vi.restoreAllMocks();
  });

  it('한 번 딸꾹질로는 안 끈다 — 두 번 실패하고 성공하면 계속 간다', async () => {
    let calls = 0;
    const p = ports({
      fetchClip: async (t) => {
        calls += 1;
        if (calls <= 2) throw new Error('일시적');
        return { t };
      },
    });
    const voice = createRoomVoice(p.ports);
    for (const id of ['a', 'b', 'c']) {
      voice.hear(line(id, 1));
      await settle();
    }
    expect(voice.silenced()).toBe(false);
    expect(p.played).toEqual([1]);
  });

  it('꺼진 뒤에는 어느 좌석도 소리가 안 난다 — 좌석별로 꺼지는 길은 없다 (P11)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = ports({ fetchClip: async () => Promise.reject(new Error('x')) });
    const voice = createRoomVoice(p.ports);
    for (const id of ['a', 'b', 'c']) {
      voice.hear(line(id, 1));
      await settle();
    }
    for (const seat of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(voice.hear(line(`s${seat}`, seat))).toBe('silenced');
    }
    vi.restoreAllMocks();
  });
});

describe('방 목소리 — 판이 새로 선다', () => {
  it('reset 하면 꺼진 것도 풀린다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = ports({ fetchClip: async () => Promise.reject(new Error('x')) });
    const voice = createRoomVoice(p.ports);
    for (const id of ['a', 'b', 'c']) {
      voice.hear(line(id, 1));
      await settle();
    }
    expect(voice.silenced()).toBe(true);
    voice.reset();
    expect(voice.silenced()).toBe(false);
    expect(voice.stats()).toEqual({ playing: 0, waiting: 0 });
    vi.restoreAllMocks();
  });
});
