// @vitest-environment jsdom
/**
 * 입장권이 **와이어에서** 어떻게 다뤄지나 — 나갈 때와 돌아올 때 각각 한 가지씩.
 *
 *   나갈 때  로그인했으면 `?tk=` 가 붙고, 안 했으면 안 붙는다 (게스트도 그대로 들어간다)
 *   돌아올 때 명부에 **계정 id 가 실리지 않는다**
 *
 * 둘째가 특히 조용히 새는 자리다. userId 는 방 안에서만 쓰라고 소켓에 매달아 두는데
 * (worker/src/room-do.ts 의 Attached), 명부를 만들 때 떼는 것을 잊으면 그대로 방 전원에게
 * 나간다 — 타입도 통과하고 화면도 멀쩡해서 아무도 모른다. 그런데 그게 나가면 「이 방의
 * 저 사람과 저 방의 저 사람이 같은 사람」이 그냥 읽힌다. 정체를 감추는 게임에서 공짜로
 * 주는 답이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicOf } from '../../worker/src/room-do';
import { PROTOCOL_VERSION } from '@/world/mp/constants';
import type { PlayerSnapshot } from '@/world/mp/protocol';

/* ═══════════════════════════ 나갈 때 ═══════════════════════════ */

const ticket = vi.fn<() => Promise<string | null>>(() => Promise.resolve(null));
vi.mock('@/shared/supabase', () => ({ requestWorldTicket: () => ticket() }));

const { WorldConnection } = await import('@/world/net/connection');

/** 열린 주소만 본다 — 진짜 소켓을 열 상대가 없다 */
let opened: string[] = [];

class FakeSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  constructor(url: string) {
    opened.push(url);
  }
  send(): void {}
  close(): void {}
}

const events = {
  onWelcome: () => {},
  onJoined: () => {},
  onLeft: () => {},
  onMoved: () => {},
  onChat: () => {},
  onBroadcast: () => {},
  onError: () => {},
  onClose: () => {},
};

/** connect 는 입장권을 기다렸다 소켓을 연다 — 마이크로태스크 한 바퀴를 돌려 준다 */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  opened = [];
  ticket.mockReset();
  ticket.mockResolvedValue(null);
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('방으로 나가는 주소', () => {
  it('로그인했으면 입장권을 싣는다', async () => {
    ticket.mockResolvedValue('tkt.mac');
    new WorldConnection().connect('ws://x', '1234', '철수', events);
    await settle();

    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]);
    expect(url.pathname).toBe('/rooms/1234/ws');
    expect(url.searchParams.get('tk')).toBe('tkt.mac');
    expect(url.searchParams.get('nick')).toBe('철수');
    expect(url.searchParams.get('v')).toBe(String(PROTOCOL_VERSION));
  });

  it('로그인 안 했으면 안 싣는다 — 그래도 **들어간다**. 로그인은 관문이 아니다', async () => {
    ticket.mockResolvedValue(null);
    new WorldConnection().connect('ws://x', '1234', '손님', events);
    await settle();

    expect(opened).toHaveLength(1);
    expect(new URL(opened[0]).searchParams.has('tk')).toBe(false);
  });

  it('입장권을 기다리는 사이에 닫으면 소켓을 열지 않는다 — 떠난 방에 하나 남는다', async () => {
    let give: (v: string | null) => void = () => {};
    ticket.mockReturnValue(new Promise((r) => (give = r)));

    const c = new WorldConnection();
    c.connect('ws://x', '1234', '철수', events);
    c.close();
    give('늦게 온 입장권');
    await settle();

    expect(opened).toHaveLength(0);
  });

  it('기다리는 사이에 다른 방으로 갈아타면 마지막 방만 연다', async () => {
    const pending: ((v: string | null) => void)[] = [];
    ticket.mockImplementation(() => new Promise((r) => pending.push(r)));

    const c = new WorldConnection();
    c.connect('ws://x', '1111', '철수', events);
    c.connect('ws://x', '2222', '철수', events);
    for (const give of pending) give(null);
    await settle();

    expect(opened).toHaveLength(1);
    expect(new URL(opened[0]).pathname).toBe('/rooms/2222/ws');
  });
});

/* ═══════════════════════════ 돌아올 때 ═══════════════════════════ */

const SNAP: PlayerSnapshot = {
  id: 'abc',
  seat: 1,
  nickname: '철수',
  x: 0,
  z: 0,
  y: 0,
  heading: 0,
  anim: 'idle',
  authed: true,
};

describe('방에서 돌아오는 명부', () => {
  it('계정 id 를 뗀다 — 이게 새면 사람이 방을 건너 이어진다', () => {
    const out = publicOf({ ...SNAP, userId: '11111111-2222-3333-4444-555555555555' });
    expect(out).not.toHaveProperty('userId');
    expect(JSON.stringify(out)).not.toContain('11111111');
  });

  it('나머지는 그대로 간다 — 「이름이 확인됐다」까지는 나가도 된다', () => {
    expect(publicOf({ ...SNAP, userId: 'x' })).toEqual(SNAP);
  });

  it('게스트(계정 id 가 없는 사람)도 같은 모양이다', () => {
    const guest: PlayerSnapshot = { ...SNAP, authed: undefined };
    expect(publicOf({ ...guest })).toEqual(guest);
  });
});
