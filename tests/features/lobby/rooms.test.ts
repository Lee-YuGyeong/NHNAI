// @vitest-environment jsdom
/**
 * 로비의 데이터 규칙 — 등록소 왕복 · 제목 다듬기 · 찾기 · 정렬 · 발자국(localStorage).
 *
 * jsdom 인 이유는 둘이다: 최근 방이 localStorage 에 살고, 등록소 왕복이 fetch 를 탄다.
 * **워커를 흉내 내지 않는다** — 목으로 막는 것은 fetch 하나뿐이고, 검사하는 것은
 * "무엇을 보내고 무엇을 받아 접는가" 다 (tests/worker/auth.test.ts 와 같은 규칙).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_ERROR_TEXT,
  fetchRooms,
  foldForSearch,
  nextSort,
  normalizeRoomName,
  openRoom,
  recentRooms,
  rememberRoom,
  roomLabel,
  sinceLabel,
  sortRooms,
  type LobbyRoom,
  type Sort,
} from '@/features/lobby/rooms';

const room = (code: string, name: string | null, players: number): LobbyRoom => ({
  code,
  name,
  players,
  capacity: 3,
  phase: 'lobby',
});

/* ═══════════════════════════════ 등록소 왕복 ═══════════════════════════════ */

/** 마지막으로 나간 요청. 무엇을 보냈는지 보려고 모아 둔다 */
let sent: { url: string; init?: RequestInit }[] = [];

function stubFetch(reply: () => Response | Promise<Response>) {
  sent = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return Promise.resolve(reply());
  });
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('열린 방 목록 — 등록소에서 받아 온다', () => {
  it('줄을 그대로 읽는다', async () => {
    stubFetch(() => jsonRes({ rooms: [room('1024', '초보 환영', 2)] }));
    const snap = await fetchRooms();
    expect(snap).toEqual({ status: 'ok', rooms: [room('1024', '초보 환영', 2)] });
    expect(sent[0].url).toBe('/api/rooms');
  });

  it('**못 닿은 것과 빈 목록을 구분한다** — 사람이 다음에 할 일이 다르다', async () => {
    stubFetch(() => jsonRes({ rooms: [] }));
    expect(await fetchRooms()).toEqual({ status: 'ok', rooms: [] });

    // 워커가 안 떠 있으면 프록시가 실패한다 (npm run dev 만 돌릴 때)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    expect(await fetchRooms()).toEqual({ status: 'offline' });
  });

  it('등록소가 없는 배포(503)도 offline 이다 — 목록이 없는 것은 고장이 아니다', async () => {
    stubFetch(() => jsonRes({ error: 'registry_disabled' }, 503));
    expect(await fetchRooms()).toEqual({ status: 'offline' });
  });

  it('본문이 JSON 이 아니어도 화면은 안 죽는다', async () => {
    stubFetch(() => new Response('<html>', { status: 200 }));
    expect(await fetchRooms()).toEqual({ status: 'offline' });
  });
});

describe('방 만들기 — 등록소에 적는다', () => {
  it('제목과 번호를 싣는다. 제목은 **보내기 전에 다듬는다**', async () => {
    stubFetch(() => jsonRes({ room: room('1024', '야간 근무조', 0) }, 201));
    const result = await openRoom({ name: '  야간   근무조 ', code: '1024' });
    expect(result).toEqual({ ok: true, room: room('1024', '야간 근무조', 0) });
    expect(sent[0].init?.method).toBe('POST');
    expect(JSON.parse(String(sent[0].init?.body))).toEqual({ name: '야간 근무조', code: '1024' });
  });

  it('빈 제목은 **키째 안 싣는다** — "비웠다"와 "안 보냈다"가 요청에서 구분돼야 한다', async () => {
    stubFetch(() => jsonRes({ room: room('1024', null, 0) }, 201));
    await openRoom({ name: '   ', code: '1024' });
    expect(JSON.parse(String(sent[0].init?.body))).toEqual({ code: '1024' });
  });

  it('거절은 **이유가 있는 실패**다 — 화면이 그 자리에 적을 수 있게 뜻을 돌려준다', async () => {
    stubFetch(() => jsonRes({ error: 'name_taken' }, 409));
    expect(await openRoom({ name: '초보 환영' })).toEqual({ ok: false, error: 'name_taken' });

    stubFetch(() => jsonRes({ error: 'code_taken' }, 409));
    expect(await openRoom({ code: '1024' })).toEqual({ ok: false, error: 'code_taken' });
  });

  it('모르는 이유·못 닿음은 offline 으로 접는다 (문구가 없는 뜻을 화면에 올리지 않는다)', async () => {
    stubFetch(() => jsonRes({ error: '무슨소리' }, 500));
    expect(await openRoom({})).toEqual({ ok: false, error: 'offline' });

    vi.stubGlobal('fetch', () => Promise.reject(new Error('down')));
    expect(await openRoom({})).toEqual({ ok: false, error: 'offline' });
  });

  it('거절 이유마다 **사람 말이 하나씩** 있다 — 뜻만 오고 문구는 화면 것이다', () => {
    for (const key of Object.keys(OPEN_ERROR_TEXT) as (keyof typeof OPEN_ERROR_TEXT)[]) {
      expect(OPEN_ERROR_TEXT[key].length).toBeGreaterThan(0);
    }
  });
});

describe('방 제목 다듬기 — 남이 지은 글자가 내 목록에 들어온다', () => {
  it('앞뒤 공백을 털고 사이 공백을 한 칸으로 접는다', () => {
    expect(normalizeRoomName('  말  많은   방 ')).toBe('말 많은 방');
  });

  it('빈 제목·공백뿐인 제목·문자열이 아닌 값은 **null 이다** (빈 문자열을 돌려주지 않는다)', () => {
    expect(normalizeRoomName('')).toBeNull();
    expect(normalizeRoomName('   \u3000 ')).toBeNull();
    expect(normalizeRoomName(42)).toBeNull();
    expect(normalizeRoomName(undefined)).toBeNull();
  });

  it('서식문자는 지운다 — U+202E 하나로 제목을 거꾸로 세울 수 있다', () => {
    expect(normalizeRoomName('초보\u202E환영')).toBe('초보환영');
    expect(normalizeRoomName('초\u200B보')).toBe('초보');
  });

  it('제어문자는 **공백으로** 바꾼다 — 지우면 없던 낱말이 만들어진다', () => {
    expect(normalizeRoomName('초보\n방')).toBe('초보 방');
  });

  it('자모가 풀린 한글을 먼저 합친다 — 안 합치면 열 글자짜리 제목이 잘린다', () => {
    const decomposed = '초보 환영합니다'.normalize('NFD');
    expect(decomposed.length).toBeGreaterThan(8);
    expect(normalizeRoomName(decomposed)).toBe('초보 환영합니다');
  });

  it('스무 글자에서 **코드포인트로** 자른다 (이모지가 반 토막 나지 않게)', () => {
    expect(normalizeRoomName('가'.repeat(30))).toHaveLength(20);
    expect(normalizeRoomName('🙂'.repeat(30))).toBe('🙂'.repeat(20));
  });
});

describe('찾기 — 접어서 맞춘다', () => {
  it('대소문자와 공백을 지운다 (띄어쓰기를 기억해서 치는 사람은 없다)', () => {
    expect(foldForSearch('  Night  Shift ')).toBe('nightshift');
    expect(foldForSearch('말 많은 방')).toBe('말많은방');
  });

  it('띄어쓰기를 빼고 쳐도 제목이 걸린다', () => {
    const rooms = [room('1024', '말 많은 방', 2), room('2098', '조용히 합시다', 1)];
    const hit = rooms.filter((r) => foldForSearch(roomLabel(r)).includes(foldForSearch('말많은')));
    expect(hit.map((r) => r.name)).toEqual(['말 많은 방']);
  });

  it('자모가 풀린 채로 쳐도 걸린다 — 제목은 합쳐서 적혀 있다 (normalizeRoomName)', () => {
    expect(foldForSearch('말 많은'.normalize('NFD'))).toBe(foldForSearch('말많은'));
  });

  it('제목이 없는 방은 코드가 그 자리에 선다 — 자리표시자를 넣지 않는다', () => {
    expect(roomLabel(room('4700', null, 2))).toBe('#4700');
    expect(roomLabel(room('4700', '연습장', 2))).toBe('연습장');
  });
});

describe('정렬 — 열 이름을 누를 때마다', () => {
  it('같은 열은 방향만 뒤집는다', () => {
    expect(nextSort({ key: 'players', dir: 'desc' }, 'players')).toEqual({ key: 'players', dir: 'asc' });
    expect(nextSort({ key: 'players', dir: 'asc' }, 'players')).toEqual({ key: 'players', dir: 'desc' });
  });

  it('다른 열로 옮기면 그 열의 기본 방향이다 — 제목은 ㄱ부터, 인원은 많은 쪽부터', () => {
    expect(nextSort({ key: 'players', dir: 'asc' }, 'title')).toEqual({ key: 'title', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'players')).toEqual({ key: 'players', dir: 'desc' });
  });

  it('인원이 같으면 번호순 — 같은 값끼리 자리가 매번 바뀌면 목록이 살아 움직인다', () => {
    const rooms = [room('300', 'ㄷ', 3), room('100', 'ㄱ', 3), room('200', 'ㄴ', 5)];
    const sorted = sortRooms(rooms, { key: 'players', dir: 'desc' });
    expect(sorted.map((r) => r.code)).toEqual(['200', '100', '300']);
  });

  it('원본을 뒤집지 않는다 (렌더 도중에 목록이 흔들리지 않게)', () => {
    const rooms = [room('300', 'ㄷ', 3), room('100', 'ㄱ', 9)];
    const before = rooms.map((r) => r.code);
    sortRooms(rooms, { key: 'players', dir: 'asc' } satisfies Sort);
    expect(rooms.map((r) => r.code)).toEqual(before);
  });
});

describe('최근 방 — 이 브라우저의 발자국', () => {
  beforeEach(() => localStorage.clear());

  it('들어간 방이 맨 앞에 서고, 다시 들어가면 자리만 올라간다', () => {
    rememberRoom('111', 1000);
    rememberRoom('222', 2000);
    rememberRoom('111', 3000);
    expect(recentRooms()).toEqual([
      { code: '111', at: 3000 },
      { code: '222', at: 2000 },
    ]);
  });

  it('방 번호 모양이 아니면 적지 않는다', () => {
    rememberRoom('abcd');
    rememberRoom('1234567');
    expect(recentRooms()).toEqual([]);
  });

  it('스무 줄에서 멎는다', () => {
    for (let i = 0; i < 25; i += 1) rememberRoom(String(100000 + i), i);
    expect(recentRooms()).toHaveLength(20);
  });

  it('옛 모양(코드 문자열만 든 배열)도 읽는다 — 남의 브라우저에 남은 값을 버리지 않는다', () => {
    localStorage.setItem('wih:recent-rooms', JSON.stringify(['1234', 'zzzz', { code: '5678', at: 42 }]));
    expect(recentRooms()).toEqual([
      { code: '1234', at: 0 },
      { code: '5678', at: 42 },
    ]);
  });

  it('망가진 값에는 빈 목록으로 답한다', () => {
    localStorage.setItem('wih:recent-rooms', '{{{');
    expect(recentRooms()).toEqual([]);
  });
});

describe('얼마나 지났나', () => {
  const now = 10_000_000_000;
  it('초 단위는 적지 않는다 — 「43초 전」은 「방금」과 같은 말이다', () => {
    expect(sinceLabel(now - 40_000, now)).toBe('방금');
    expect(sinceLabel(now - 5 * 60_000, now)).toBe('5분 전');
    expect(sinceLabel(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(sinceLabel(now - 2 * 86_400_000, now)).toBe('2일 전');
  });

  it('시각을 모르는 옛 기록은 「기록 없음」이다', () => {
    expect(sinceLabel(0, now)).toBe('기록 없음');
  });
});
