/**
 * 방 등록소 — **열린 방을 적어 두는 종이 한 장.** 전 세계에 인스턴스 하나다 (LOBBY_DO_NAME).
 *
 * ┌─ 무엇을 대신하나 ────────────────────────────────────────────────────────┐
 * │ 원작 humanish 는 supabase 의 `rooms` 표가 이 일을 했다 (lib/server/room). │
 * │ 이 저장소에는 그 표가 없고, 만들 이유도 없다: 방의 진짜 상태(누가 붙어    │
 * │ 있나)는 이미 방 DO 안에 있다. 없던 것은 **그 방들이 모여 이름을 적는      │
 * │ 자리** 하나뿐이라, DB 를 파는 대신 DO 를 하나 더 세운다.                  │
 * │                                                                          │
 * │   POST /api/rooms   → open    방을 등록한다 (번호 · 제목)                 │
 * │   GET  /api/rooms   → list    열린 방 목록                                │
 * │   (방 DO 가 스스로) → report  "이 방에 지금 n 명, 상태는 이것"            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 인원은 **적어 두지 않고 받아 적는다** ──────────────────────────────────┐
 * │ 화면이 "나 들어갔다"고 알려 주는 모양이면 아무나 아무 숫자나 적을 수 있고, │
 * │ 창을 강제로 닫은 사람은 영원히 앉아 있는 것으로 남는다. 그래서 인원을     │
 * │ 말하는 것은 **방 DO 뿐이다** (worker/src/room-do.ts 의 report) — 소켓이   │
 * │ 진짜로 붙어 있는 수를 30초마다 적고, 아무도 없으면 자기 줄을 지운다.      │
 * │ 그 소식이 끊긴 줄은 여기서 시효(ROOM_STALE_MS)로 걷힌다.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 상태는 스토리지 **한 칸**에 통째로 든다 (KEY). 줄이 수십 개인 종이라 쪼갤 이유가 없고,
 * 한 칸이면 읽기-고치기-쓰기가 한 번에 끝나서 두 요청이 서로를 밟지 않는다
 * (DO 의 입력 게이트가 그 사이를 막아 준다).
 */

import { ROOM_CODE_RE, ROOM_MAX_PLAYERS } from '../../src/world/mp/constants';
import {
  ROOM_STALE_MS,
  normalizeRoomName,
  sameRoomName,
  type LobbyRoom,
  type OpenRoomError,
  type RoomPhase,
} from '../../src/world/mp/lobby';

/** 등록소는 하나다. 방 DO 와 워커가 같은 이름으로 찾는다 (idFromName) */
export const LOBBY_DO_NAME = 'lobby';

/** 스토리지의 그 한 칸 */
const KEY = 'rooms';

/**
 * 적어 둘 수 있는 줄 수. 등록소는 **로그인 없이 누구나 두드릴 수 있는 자리라**
 * 천장이 필요하다. 사람이 이만큼 모이는 판이 아니므로, 여기 닿았다면 그건 장난이다.
 * 오래된 줄이 걷히면(ROOM_STALE_MS) 자리는 다시 난다.
 */
export const MAX_ROOMS = 200;

/**
 * 아무도 안 들어온 방을 걷기까지. 만들자마자 대기방으로 넘어가므로 몇 초면 첫 소식이 온다 —
 * 1분이 지나도록 인원이 0 이면 그 방은 「만들어 놓고 안 간 방」이다.
 * (사람이 앉은 방의 시효는 ROOM_STALE_MS 로 훨씬 길다 — 그쪽은 깜빡이면 안 되는 줄이다)
 */
export const EMPTY_STALE_MS = 60_000;

/** 번호를 뽑아 보는 횟수. 9000 개 중 몇 개 안 찬 상태라 한 번에 걸리는 게 보통이다 */
const CODE_TRIES = 20;

/** 종이에 적힌 한 줄. 화면으로 나가는 모양(LobbyRoom)에 시각 둘이 더 붙어 있다 */
export interface RoomRecord {
  code: string;
  name: string | null;
  players: number;
  phase: RoomPhase;
  /** 마지막 소식 (ms) — 시효를 재는 값 */
  at: number;
  /** 처음 등록된 시각 (ms) — 목록 기본 차례(새 방이 위)를 정하는 값 */
  born: number;
}

/** 코드 → 줄. 종이 한 장 전체 */
export type Registry = Record<string, RoomRecord>;

/* ═══════════════════════════ 종이에 하는 일 (순수 함수) ═══════════════════════════ */

/**
 * 소식이 끊긴 줄을 걷는다. **읽을 때마다 한다** — 청소 알람을 따로 돌리면 아무도 안 보는
 * 등록소를 깨우느라 과금되고, 어차피 걷힌 결과를 보는 사람은 읽는 사람뿐이다.
 */
export function pruneRegistry(reg: Registry, now: number): Registry {
  for (const [code, r] of Object.entries(reg)) {
    const ttl = r.players > 0 ? ROOM_STALE_MS : EMPTY_STALE_MS;
    if (now - r.at > ttl) delete reg[code];
  }
  return reg;
}

/**
 * 방을 등록한다.
 *
 * ★ 이미 열려 있는 번호는 **거절한다** (code_taken). 그 번호로 들어가는 길은 이미 있고
 *   (「코드로 입장」), 만들기로도 들어가지면 같은 조작이 두 이름을 갖는다 —
 *   무엇보다 남이 쓰던 방에 내가 붙인 제목이 덮여서, 그 방 사람들의 목록 줄이 바뀐다.
 * ★ 같은 제목도 거절한다 (name_taken, 원작과 같은 결정). 눈으로 구분 안 되는 두 줄이
 *   나란히 서느니 다른 이름을 붙이는 쪽이 낫다.
 *
 * @param code 비었으면 여기서 뽑는다 (pickFreeCode)
 */
export function openInRegistry(
  reg: Registry,
  { code, name, now, rand = Math.random }: { code?: string | null; name?: unknown; now: number; rand?: () => number },
): { ok: true; room: LobbyRoom } | { ok: false; error: OpenRoomError } {
  pruneRegistry(reg, now);

  const title = normalizeRoomName(name);
  if (title && Object.values(reg).some((r) => r.name && sameRoomName(r.name, title))) {
    return { ok: false, error: 'name_taken' };
  }
  if (Object.keys(reg).length >= MAX_ROOMS) return { ok: false, error: 'too_many' };

  let picked: string;
  if (code != null && code !== '') {
    if (!ROOM_CODE_RE.test(code)) return { ok: false, error: 'bad_code' };
    if (reg[code]) return { ok: false, error: 'code_taken' };
    picked = code;
  } else {
    const free = pickFreeCode(reg, rand);
    if (!free) return { ok: false, error: 'no_code' };
    picked = free;
  }

  // 인원은 0 으로 시작한다 — 만든 사람이 소켓을 붙이는 순간 방 DO 가 1 로 고쳐 적는다.
  // 여기서 1 이라고 적으면 만들어 놓고 안 간 방이 한 명 있는 방으로 보인다.
  reg[picked] = { code: picked, name: title, players: 0, phase: 'lobby', at: now, born: now };
  return { ok: true, room: toLobbyRoom(reg[picked]) };
}

/** 비어 있는 네 자리 번호. 전부 겹치면 null (등록소가 그만큼 찼다는 뜻이다) */
export function pickFreeCode(reg: Registry, rand: () => number = Math.random): string | null {
  for (let i = 0; i < CODE_TRIES; i += 1) {
    const code = String(Math.floor(1000 + rand() * 9000));
    if (!reg[code]) return code;
  }
  return null;
}

/**
 * 방이 자기 소식을 적는다 (worker/src/room-do.ts 만 부른다).
 *
 * ★ 아무도 없으면 **줄을 지운다.** 마지막 사람이 나간 방은 목록에 있으면 안 된다 —
 *   그 줄을 누른 사람은 빈 방에 혼자 앉게 되고, 그게 로비에서 제일 흔한 실망이다.
 * ★ 제목은 방이 모른다. 그래서 여기서 **덮지 않고 물려받는다** — 코드로 그냥 들어와서
 *   생긴 줄만 제목이 없다 (그때는 화면이 #번호 로 부른다).
 */
export function reportInRegistry(
  reg: Registry,
  { code, players, phase, now }: { code: string; players: number; phase: RoomPhase; now: number },
): void {
  if (!ROOM_CODE_RE.test(code)) return;
  if (players <= 0) {
    delete reg[code];
    return;
  }
  const prev = reg[code];
  if (!prev && Object.keys(reg).length >= MAX_ROOMS) return;
  reg[code] = {
    code,
    name: prev?.name ?? null,
    players: Math.min(players, ROOM_MAX_PLAYERS),
    phase,
    at: now,
    born: prev?.born ?? now,
  };
}

/**
 * 목록. **대기 중인 방이 앞, 그 안에서는 새 방이 위다** (원작 listOpenRooms 와 같은 차례).
 *
 * 화면은 이 차례를 다시 정렬할 수 있지만(제목·인원 열), 처음 열었을 때 눈에 먼저 닿는 것은
 * 들어갈 수 있는 방이어야 한다 — 게임 중인 방이 위에 쌓이면 목록이 「구경거리」가 된다.
 */
export function listRegistry(reg: Registry, now: number): LobbyRoom[] {
  pruneRegistry(reg, now);
  return Object.values(reg)
    .sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'lobby' ? -1 : 1;
      return b.born - a.born;
    })
    .map(toLobbyRoom);
}

/** 종이의 줄 → 화면으로 나가는 줄. 시각(at·born)은 내보내지 않는다 — 화면이 쓸 일이 없다 */
function toLobbyRoom(r: RoomRecord): LobbyRoom {
  return { code: r.code, name: r.name, players: r.players, capacity: ROOM_MAX_PLAYERS, phase: r.phase };
}

/* ═══════════════════════════════ DO ═══════════════════════════════ */

export class LobbyDO implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const reg = ((await this.ctx.storage.get<Registry>(KEY)) ?? {}) as Registry;

    if (url.pathname === '/list') {
      const before = Object.keys(reg).length;
      const rooms = listRegistry(reg, now);
      // 걷힌 게 있을 때만 쓴다. 목록은 자주 읽히는 자리라 매번 쓰면 읽기가 쓰기가 된다
      if (Object.keys(reg).length !== before) await this.ctx.storage.put(KEY, reg);
      return json({ rooms });
    }

    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    let body: { code?: unknown; name?: unknown; players?: unknown; phase?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    if (url.pathname === '/open') {
      const result = openInRegistry(reg, {
        code: typeof body.code === 'string' ? body.code : null,
        name: body.name,
        now,
      });
      if (!result.ok) return json({ error: result.error }, result.error === 'bad_code' ? 400 : 409);
      await this.ctx.storage.put(KEY, reg);
      return json({ room: result.room }, 201);
    }

    if (url.pathname === '/report') {
      if (typeof body.code !== 'string' || typeof body.players !== 'number') return json({ error: 'bad_request' }, 400);
      reportInRegistry(reg, {
        code: body.code,
        players: body.players,
        phase: body.phase === 'playing' ? 'playing' : 'lobby',
        now,
      });
      pruneRegistry(reg, now);
      await this.ctx.storage.put(KEY, reg);
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  }
}

/* ═══════════════════════════ 워커가 여는 창구 ═══════════════════════════ */

/** 등록소를 쥔 워커의 env. 바인딩이 없으면 로비는 목록 없이 돈다 (아래 handleRooms) */
export interface LobbyEnv {
  LOBBY_DO?: DurableObjectNamespace;
}

/** 등록소 stub. 바인딩이 없으면 null — 부르는 쪽이 그걸 보고 조용히 포기한다 */
export function lobbyStub(env: LobbyEnv | undefined): DurableObjectStub | null {
  const ns = env?.LOBBY_DO;
  if (!ns) return null;
  return ns.get(ns.idFromName(LOBBY_DO_NAME));
}

/**
 * GET /api/rooms   → { rooms }
 * POST /api/rooms  { name?, code? } → { room } (201)
 *
 * ★ 로그인을 요구하지 않는다. 이 게임에서 로그인은 관문이 아니라 이름의 근거다
 *   (src/shared/supabase.ts). 방을 만드는 데 계정을 요구하면 그 규칙이 여기서만 깨진다.
 * ★ 등록소가 없으면 **503 이지 500 이 아니다.** 「목록이 없는 배포」는 고장이 아니라
 *   설정 상태이고, 화면은 그걸 보고 목록 자리에 이유를 적는다 (features/lobby/rooms.ts).
 */
export async function handleRooms(request: Request, env: LobbyEnv): Promise<Response> {
  const stub = lobbyStub(env);
  if (!stub) return json({ error: 'registry_disabled' satisfies OpenRoomError }, 503);

  if (request.method === 'GET') return stub.fetch('https://lobby/list');
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  let body: { name?: unknown; code?: unknown } = {};
  // 본문 없이 POST 하는 호출자가 있다 (제목 없는 방) — 그것까지 400 으로 막지 않는다
  if (request.headers.get('content-length') !== '0') {
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
  }

  return stub.fetch('https://lobby/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: typeof body.code === 'string' ? body.code.trim() : null,
      name: typeof body.name === 'string' ? body.name : null,
    }),
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      // CORS 는 여기서 정하지 않는다 — 진입점의 문지기(guard.ts)가 허용 목록으로 얹는다
    },
  });
}
