/**
 * 방 하나 = Durable Object 하나. humanish 의 worker/src/room-do.ts 에서
 * "입장 · 이동 중계 · 채팅 중계 · 퇴장" 만 남기고 줄였다 (봇·라운드·투표·게이트 없음).
 *
 * Hibernatable WebSocket API 를 쓴다 — 아무도 안 움직이는 동안 DO 가 잠들어 과금이 안 된다.
 * 소켓마다 attachment 에 PlayerSnapshot 을 실어 두므로 DO 가 깨어나도 명부가 남아 있다.
 *
 * ┌─ 로그인한 사람 (2026-08-30) ─────────────────────────────────────────────┐
 * │ 입장할 때 `?tk=` 로 **입장권**이 올 수 있다 (worker/src/auth.ts). 있으면   │
 * │ 그 안의 이름이 `?nick=` 을 이긴다 — 쿼리의 닉네임은 아무나 적을 수 있지만  │
 * │ 입장권은 이 워커가 서명한 것이라 못 지어낸다. 그래서 로그인한 사람의       │
 * │ 이름은 **방에서 사칭되지 않는다.**                                        │
 * │                                                                          │
 * │ 없거나 어긋나면 **막지 않고 게스트로 떨어뜨린다.** 로그인은 이 게임에서    │
 * │ 자격이 아니라 이름의 근거일 뿐이다 (shared/guest.ts 가 정한 규칙).         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 등록소에 자기 소식을 적는다 (2026-08-31) ───────────────────────────────┐
 * │ 로비의 방 목록은 이 방이 적어 주는 인원으로 산다 (worker/src/lobby-do.ts). │
 * │ **인원을 말하는 것은 이 파일뿐이다** — 화면이 말하는 모양이면 아무나 아무  │
 * │ 숫자나 적고, 창을 강제로 닫은 사람은 영원히 앉아 있는 것으로 남는다.       │
 * │ 여기서는 소켓이 진짜로 붙어 있는 수를 센다 (roster).                       │
 * │                                                                          │
 * │   들어옴 · 나감   그때마다 적는다                                          │
 * │   청소 알람       30초마다 다시 적는다 (등록소의 시효를 갱신하는 맥박)      │
 * │   시작 방송       그 줄을 「게임 중」으로 바꾼다 (ROOM_START_LINE)          │
 * │   아무도 없음     인원 0 을 적으면 등록소가 그 줄을 지운다                 │
 * │                                                                          │
 * │ 등록소가 없어도(바인딩 없음·장애) 방은 그대로 돈다 — report 는 실패해도    │
 * │ 조용하다. 목록에 안 뜰 뿐이고, 번호를 아는 사람은 여전히 들어온다.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import {
  BROADCAST_MIN_INTERVAL_MS,
  CHAT_MAX_LEN,
  CHAT_MIN_INTERVAL_MS,
  MAX_WS_MESSAGE_LEN,
  MOVE_MIN_INTERVAL_MS,
  PROTOCOL_VERSION,
  ROOM_MAX_PLAYERS,
  ROOM_START_LINE,
  SOCKET_TIMEOUT_MS,
  SWEEP_ALARM_MS,
} from '../../src/world/mp/constants';
import type { RoomPhase } from '../../src/world/mp/lobby';
import type { ErrorCode, PlayerSnapshot, S2CMessage } from '../../src/world/mp/protocol';
import { spawnFor } from '../../src/world/mp/spawn';
import { isGameMessage } from '../../src/world/mp/game-protocol';
import { cleanNickname, isC2SMessage, isTrialMessage, parseBroadcast, parseMove } from '../../src/world/mp/validate';
import { verifyTicket, type AuthEnv } from './auth';
import { makeBrain, type BrainEnv } from './game/brain';
import { GameRuntime } from './game/runtime';
import { lobbyStub, type LobbyEnv } from './lobby-do';
import { TrialRuntime } from './trial/runtime';

/**
 * 소켓에 매달아 두는 것 = 남에게 보내는 것 + **보내지 않는 것 하나**.
 *
 * ★ userId 는 와이어에 싣지 않는다. 계정 id 를 방 전원에게 뿌리면 「이 방의 저 사람과
 *   저 방의 저 사람이 같은 사람」이 그냥 읽힌다 — 정체를 감추는 게임에서 그건 공짜로
 *   주는 답이다. 그래서 roster() 가 내보낼 때 떼고, 방 안에서만 쓴다.
 */
export type Attached = PlayerSnapshot & { userId?: string };

/** 와이어로 나가는 모습 — 계정 id 를 뗀다 (위 주석). 시험이 이 약속을 붙잡는다 */
export function publicOf({ userId: _drop, ...snap }: Attached): PlayerSnapshot {
  return snap;
}

/** 방 번호를 경로에서 다시 뽑는다. 입장권이 **그 방의 것인지** 보려면 필요하다 (auth.ts verifyTicket) */
const ROOM_IN_PATH = /^(?:\/world-ws)?\/rooms\/([0-9]{1,6})\/ws$/;

/** 이 방이 쥔 것 — 입장권 검증 비밀(auth) · 등록소 바인딩(lobby) · 판의 LLM 키(game/brain) */
export type RoomEnv = AuthEnv & LobbyEnv & BrainEnv;

/** 스토리지에 남기는 값들. DO 가 잠들었다 깨어나도 자기 번호와 상태를 안다 */
const CODE_KEY = 'code';
const PHASE_KEY = 'phase';
/** 내보낸 계정(auth.users.id)들. 방장이 내보낸 사람이 같은 계정으로 다시 문을 두드리면 여기서 걸린다 */
const BANS_KEY = 'bans';

export class RoomDO implements DurableObject {
  /** 소켓별 마지막 이동·채팅 시각. 메모리에만 — DO 가 깨어나면 0 부터라 첫 메시지는 통과한다 */
  private lastMoveAt = new WeakMap<WebSocket, number>();
  private lastChatAt = new WeakMap<WebSocket, number>();
  private lastBroadcastAt = new WeakMap<WebSocket, number>();

  /** 자기 번호·상태의 기억. 잠들면 날아가므로 스토리지가 원본이고 이건 사본이다 */
  private code: string | null = null;
  private phase: RoomPhase | null = null;
  /** 내보낸 계정들의 사본. 원본은 스토리지다 (BANS_KEY) — 잠들었다 깨어나도 밴은 남는다 */
  private bans: string[] | null = null;

  /**
   * 물리 미니게임(낙하 생존·정지선·색 사냥) 전부를 맡는 쪽 — 이 방의 나머지(입장·이동·채팅)는
   * 그대로 두고, 라운드에 필요한 것만 여기로 위임한다 (worker/src/trial/runtime.ts 머리말).
   */
  private readonly trial: TrialRuntime;
  /**
   * 「인간인 척」 한 판 (worker/src/game/runtime.ts) — /interrogation 이 여는 판. 판이 도는 동안은 trial_* 도
   * 이쪽이 받고(엔진을 직접 조립한다), 채팅·이동의 id 는 좌석 id 로 바꿔 나간다 (game-protocol.ts 머리말).
   * 판이 없을 때는 아무 일도 안 한다 — /world · /trial 은 예전 그대로다.
   */
  private readonly game: GameRuntime;

  /** env 는 두 번째 인자로 온다 (Cloudflare 규약). 입장권 검증 비밀이 여기 있다 */
  constructor(private readonly ctx: DurableObjectState, private readonly env: RoomEnv) {
    // 플랫폼이 대신 pong 을 돌려준다 → 하트비트가 DO 를 깨우지 않는다.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.trial = new TrialRuntime(
      this.ctx.storage,
      () => this.roster(),
      (msg) => this.broadcast(msg),
      (ws, msg) => this.send(ws, msg),
    );
    this.game = new GameRuntime({
      storage: this.ctx.storage,
      roster: () => this.roster(),
      broadcast: (msg) => this.broadcast(msg as S2CMessage),
      sendTo: (id, msg) => this.sendTo(id, msg as S2CMessage),
      brain: makeBrain(this.env ?? {}),
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('websocket 업그레이드가 아니다', { status: 400 });
    }
    return this.upgrade(new URL(request.url));
  }

  /* ─────────────────────────────── 입장 ─────────────────────────────── */

  /** 업그레이드 시점에 전부 판정한다: 버전 → 닉네임 → 정원 → 좌석 배정 → accept → 명부 교환 */
  private async upgrade(url: URL): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const reject = (code: ErrorCode): Response => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', code } satisfies S2CMessage));
      server.close(4000, code);
      return new Response(null, { status: 101, webSocket: client });
    };

    if (Number(url.searchParams.get('v')) !== PROTOCOL_VERSION) return reject('version_mismatch');

    /*
     * 이름을 고른다 — **입장권이 있으면 그것이 이긴다** (파일 머리말).
     * 로그인은 했는데 humanish 에서 이름을 아직 안 지었으면 ticket.name 이 없다.
     * 그때는 쿼리의 게스트 닉네임을 그대로 쓴다: 로그인했다고 이름을 지어 주지 않는다.
     */
    // 방 번호는 두 곳이 쓴다: 입장권이 **그 방의 것인지** 보는 데(verifyTicket)와, 등록소에 적는 데(remember)
    const roomCode = ROOM_IN_PATH.exec(url.pathname)?.[1] ?? '';
    const ticket = await verifyTicket(url.searchParams.get('tk'), roomCode, this.env?.WORLD_TICKET_SECRET);
    const nickname = (ticket?.name ? cleanNickname(ticket.name) : null) ?? cleanNickname(url.searchParams.get('nick'));
    if (!nickname) return reject('bad_request');

    /*
     * 내보내진 계정은 문에서 돌아선다 (kick 이 적는 밴 명부).
     *
     * ★ 게스트는 여기 안 걸린다 — 계정이 없으면 알아볼 방법도 없다. 내보내진 사람이
     *   입장권을 버리고 게스트로 다시 들어오는 길은 **알고 열어 둔 것이다** (2026-09-01 결정):
     *   로그인을 관문으로 만들지 않는 규칙(파일 머리말)이 밴보다 오래됐고, 이 구멍을
     *   막는 값은 방 단위 로그인 강제뿐이라 그 규칙을 뒤집기 전에는 못 막는다.
     */
    if (ticket && (await this.loadBans()).includes(ticket.sub)) return reject('banned');

    const others = this.roster();
    if (others.length >= ROOM_MAX_PLAYERS) return reject('room_full');

    // 비어 있는 가장 낮은 좌석
    const taken = new Set(others.map((p) => p.seat));
    let seat = 1;
    while (taken.has(seat)) seat += 1;

    const start = spawnFor(seat, ROOM_MAX_PLAYERS);
    const snapshot: PlayerSnapshot = {
      id: crypto.randomUUID(),
      seat,
      nickname,
      x: start.x,
      z: start.z,
      y: 0,
      heading: 0,
      anim: 'idle',
      // 「이 이름은 확인된 것」 — 계정 id 와 달리 이건 나가도 된다. 누가 인간인지는 말하지 않는다
      ...(ticket ? { authed: true } : {}),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...snapshot, ...(ticket ? { userId: ticket.sub } : {}) } satisfies Attached);

    this.send(server, { t: 'welcome', selfId: snapshot.id, players: [...others, snapshot] });
    this.broadcast({ t: 'player_joined', player: snapshot }, server);
    // 판이 도는 중이면 지금 상태와(앉아 있던 자리가 있으면) 배역을 이 사람에게만 준다
    void this.game.onJoin(snapshot.id);

    await this.ensureAlarm();
    // 자리가 하나 찼다 — 로비의 그 줄이 바로 따라 움직인다 (파일 머리말의 등록소)
    await this.remember(roomCode);
    void this.report();
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ─────────────────────────── WebSocket 수신 ─────────────────────────── */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_WS_MESSAGE_LEN) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!isC2SMessage(parsed)) return;

    const snap = ws.deserializeAttachment() as Attached | null;
    if (!snap) return;

    // 「인간인 척」 판의 메시지 — 전부 GameRuntime 이 받는다
    if (isGameMessage(parsed)) {
      await this.game.handle(snap.id, parsed);
      return;
    }

    // 물리 미니게임 메시지는 여기서 전부 갈라진다 — 이 파일에는 라운드 로직을 안 둔다 (파일 머리말).
    // 판이 도는 중이면 판이 엔진을 쥐고 있으므로 그쪽으로 간다
    if (isTrialMessage(parsed)) {
      if (this.game.active()) await this.game.handleTrial(snap.id, parsed);
      else await this.trial.handle(ws, snap, parsed);
      return;
    }

    switch (parsed.t) {
      case 'move': {
        // 한 소켓이 이동을 쏟아부으면 DO 가 방 전원에게 N배로 증폭해 뿌린다. 서버가 바닥을 깐다.
        const now = Date.now();
        if (now - (this.lastMoveAt.get(ws) ?? 0) < MOVE_MIN_INTERVAL_MS) return;
        this.lastMoveAt.set(ws, now);

        const move = parseMove(parsed);
        if (!move) return; // NaN 하나가 통과하면 모든 클라의 보간이 영구히 깨진다

        snap.x = move.x;
        snap.z = move.z;
        snap.y = move.y;
        snap.heading = move.heading;
        snap.anim = move.anim;
        // 새로 들어오는 사람의 welcome 에 반영되도록 attachment 를 갱신한다
        ws.serializeAttachment(snap);

        // 판이 도는 동안은 좌석 id 로 나간다 — 플레이어 id 가 실리면 어느 좌석이 사람인지 읽힌다 (game/runtime.ts onChat)
        const outId = this.game.active() ? (this.game.seatIdOf(snap.id) ?? snap.id) : snap.id;
        this.broadcast({ t: 'player_moved', id: outId, x: snap.x, z: snap.z, y: snap.y, heading: snap.heading, anim: snap.anim }, ws);
        // 물리 미니게임(낙하 생존)이 사람의 자리를 아는 길 — 범위 검증을 통과한 좌표만 넘긴다
        if (this.game.active()) this.game.onMove(snap.id, snap.x, snap.z, now);
        else this.trial.onMove(snap.id, snap.x, snap.z, now);
        return;
      }

      case 'chat': {
        const raw = (parsed as { text?: unknown }).text;
        if (typeof raw !== 'string') return;
        const text = raw.trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;

        const now = Date.now();
        if (now - (this.lastChatAt.get(ws) ?? 0) < CHAT_MIN_INTERVAL_MS) return;
        this.lastChatAt.set(ws, now);

        // 판이 도는 동안은 판이 좌석 이름으로 내보낸다 (위 move 와 같은 이유)
        if (this.game.onChat(snap.id, text)) return;
        // 닉네임·시각은 서버 값만 쓴다. 본인도 포함해 보낸다 — 낙관적 로컬 에코를 하면 순서가 갈린다
        this.broadcast({ t: 'chat', id: snap.id, nickname: snap.nickname, text, ts: now });
        return;
      }

      case 'broadcast': {
        // 리더 방송은 **호스트만** 낸다. DO 에는 아직 리더 개념이 없어서,
        // 리더 에이전트를 돌리는 클라(= 방에서 가장 낮은 좌석)를 호스트로 본다.
        // 이 판정이 없으면 아무 클라나 방 전원의 스피커를 울릴 수 있다.
        if (snap.seat !== this.hostSeat()) return;

        const now = Date.now();
        if (now - (this.lastBroadcastAt.get(ws) ?? 0) < BROADCAST_MIN_INTERVAL_MS) return;
        this.lastBroadcastAt.set(ws, now);

        const b = parseBroadcast(parsed);
        if (!b) return;

        // 시각은 서버 값만 쓴다. 본인도 포함해 보낸다 — 낸 쪽이 로컬로 먼저 읽으면
        // 방송이 사람마다 다른 순간에 나가고, "같은 순간 같은 내용"이 깨진다.
        this.broadcast({ t: 'broadcast', text: b.text, kind: b.kind, ts: now });

        /*
         * 판이 열렸다 (src/world/mp/constants 의 ROOM_START_LINE). **이 방이 스스로 안다** —
         * 화면이 등록소에 "우리 시작했다"고 알리는 모양이면 지나가는 사람이 남의 방을
         * 게임 중으로 만들 수 있다. 여기서는 이미 호스트 좌석만 통과한 뒤다.
         */
        if (b.text.startsWith(ROOM_START_LINE)) void this.markPlaying();
        return;
      }

      case 'kick': {
        /*
         * 방장이 한 사람을 내보낸다 (원작 humanish 의 /api/room/kick + room_bans).
         *
         * ★ 보내는 쪽의 자격은 **소켓의 좌석**으로 본다 (방송과 같은 규칙). 본문에 "나는 방장"
         *   이라고 적어 보내는 길을 아예 만들지 않는다.
         * ★ 자기 자신은 못 내보낸다 — 그건 나가기이고, 나가기는 소켓을 닫으면 된다.
         * ★ 로그인한 사람은 **계정을 밴 명부에 적어** 같은 계정으로는 못 돌아온다 (upgrade 의
         *   banned). 로그인은 입장할 때 소켓에 매달아 둔 userId 로 안다 (Attached).
         *   게스트는 소켓을 끊는 것까지다 — 알아볼 값이 없다. 그 우회는 감수한다 (upgrade 주석).
         *   명부는 방이 다 비면 태운다 (handleLeave) — 같은 번호로 서는 다음 방은 남이다.
         */
        if (snap.seat !== this.hostSeat()) return;
        const targetId = (parsed as { id?: unknown }).id;
        if (typeof targetId !== 'string' || targetId === snap.id) return;

        for (const other of this.ctx.getWebSockets()) {
          const target = other.deserializeAttachment() as Attached | null;
          if (!target || target.id !== targetId) continue;

          // 끊기 **전에** 적는다 — 내보내진 쪽이 끊기자마자 다시 문을 두드리는 것과 겨루는 자리다
          if (target.userId) {
            const bans = await this.loadBans();
            if (!bans.includes(target.userId)) {
              bans.push(target.userId);
              await this.ctx.storage.put(BANS_KEY, bans);
            }
          }

          // 내보내진 사람에게 먼저 이유를 준다 — 끊고 나서 보내면 안 닿는다
          this.send(other, { t: 'error', code: 'kicked' });
          this.broadcast({ t: 'player_left', id: target.id }, other);
          other.close(4002, 'kicked');
          /*
           * 여기서 직접 적는다. 서버가 스스로 닫은 소켓에는 webSocketClose 가 오지 않으므로
           * (플랫폼 규약) handleLeave 를 기다리면 등록소의 인원이 한 명 많은 채로 남는다.
           */
          void this.report(this.roster().filter((p) => p.id !== target.id).length);
          return;
        }
        return;
      }

      default:
        return; // 전방 호환. 모르는 타입은 무시한다
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  private handleLeave(ws: WebSocket): void {
    const snap = ws.deserializeAttachment() as Attached | null;
    if (snap) this.broadcast({ t: 'player_left', id: snap.id }, ws);
    /*
     * 나간 사람을 **직접 빼고** 센다. 닫히는 중인 소켓이 아직 목록에 남아 있을 수 있어서
     * roster() 를 그대로 믿으면 마지막 사람이 나간 방이 「1명」으로 남는다 — 그 줄을 누른
     * 사람은 빈 방에 혼자 앉는다. 0 을 적으면 등록소가 그 줄을 지운다.
     */
    const remaining = snap ? this.roster().filter((p) => p.id !== snap.id).length : undefined;
    void this.report(remaining);
    // 물리 미니게임 — 나간 사람을 기다리느라 라운드가 안 닫히지 않게 (worker/src/trial/runtime.ts 머리말 ★)
    if (snap) void this.trial.onLeave(snap.id);
    if (snap) this.game.onLeave(snap.id);
    /*
     * 마지막 사람이 나갔다 — 밴 명부를 태운다. 이 번호로 다음에 서는 방은 **다른 모임**이다:
     * 명부가 남으면 지난 판에 내보내진 사람이 남의 방 문 앞에서 영문도 모르고 돌아서게 된다.
     * (방장이 남아 있는 한 kick 으로는 방이 안 빈다 — 태우는 길은 여기 하나다.)
     */
    if (remaining === 0) {
      this.bans = [];
      void this.ctx.storage.delete(BANS_KEY);
    }
  }

  /* ─────────────────────────────── 알람 ─────────────────────────────── */

  /**
   * 유령 소켓 청소 (half-open 은 close 이벤트가 오지 않는다).
   * 아무도 없으면 알람 체인을 끝낸다 — 재예약하면 빈 DO 가 영원히 깨어나 과금된다.
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      // ping 을 한 번도 안 보낸 소켓(테스트 스크립트 등)은 건드리지 않는다.
      if (last !== null && now - last.getTime() > SOCKET_TIMEOUT_MS) {
        this.handleLeave(ws);
        ws.close(4001, 'heartbeat_timeout');
      }
    }
    if (this.ctx.getWebSockets().length > 0) await this.ctx.storage.setAlarm(now + SWEEP_ALARM_MS);
    // 등록소의 시효를 갱신하는 맥박. 유령 소켓을 걷어낸 **뒤에** 세므로 목록의 인원이 실제와 같다
    await this.report();
    /*
     * 물리 미니게임의 안전망 — 새 알람 슬롯을 따로 두지 않는다(DO 알람은 하나뿐이다).
     * 이 30초 청소 알람에 얹혀서 "누가 멈춰 서 라운드가 안 끝나는가"만 확인한다
     * (worker/src/trial/runtime.ts 머리말).
     */
    await this.trial.onSweep(now);
    // 판의 안전망 — 잠들어 타이머를 잃었어도 마감이 지난 국면을 민다 (worker/src/game/runtime.ts 머리말)
    await this.game.onSweep(now);
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_ALARM_MS);
    }
  }

  /* ─────────────────────────────── 등록소 ─────────────────────────────── */

  /**
   * 자기 번호를 적어 둔다. 잠들면 메모리가 날아가므로 스토리지가 원본이다 —
   * 알람으로 깨어난 DO 도 이 값으로 자기가 몇 번 방인지 안다.
   */
  private async remember(code: string): Promise<void> {
    if (!code || this.code === code) return;
    this.code = code;
    await this.ctx.storage.put(CODE_KEY, code);
  }

  /** 판이 열렸다고 적고 곧바로 알린다. 두 번째부터는 아무 일도 하지 않는다 */
  private async markPlaying(): Promise<void> {
    if (this.phase === 'playing') return;
    this.phase = 'playing';
    await this.ctx.storage.put(PHASE_KEY, 'playing');
    await this.report();
  }

  /**
   * 등록소에 지금 인원을 적는다 (worker/src/lobby-do.ts).
   *
   * ★ **실패해도 조용하다.** 등록소는 목록을 위한 것이지 방이 도는 조건이 아니다 —
   *   여기서 던지면 사람이 들어오고 나가는 길이 남의 사정으로 막힌다.
   *
   * @param count 셀 수를 이미 알고 있을 때 (나가는 사람을 뺀 수 — handleLeave)
   */
  private async report(count?: number): Promise<void> {
    const stub = lobbyStub(this.env);
    if (!stub) return;

    const code = this.code ?? (await this.ctx.storage.get<string>(CODE_KEY)) ?? null;
    if (!code) return; // 아직 아무도 안 들어온 방. 적을 이름이 없다
    this.code = code;
    this.phase ??= (await this.ctx.storage.get<RoomPhase>(PHASE_KEY)) ?? 'lobby';

    try {
      await stub.fetch('https://lobby/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, players: count ?? this.roster().length, phase: this.phase }),
      });
    } catch {
      /* 등록소가 없거나 잠깐 못 닿았다. 방은 그대로 돈다 (파일 머리말) */
    }
  }

  /* ─────────────────────────────── 유틸 ─────────────────────────────── */

  /** 밴 명부를 읽는다. 스토리지가 원본이라 첫 호출에만 읽고, 그 뒤로는 사본을 쓴다 */
  private async loadBans(): Promise<string[]> {
    this.bans ??= (await this.ctx.storage.get<string[]>(BANS_KEY)) ?? [];
    return this.bans;
  }

  /** 지금 붙어 있는 전원의 스냅샷 (좌석 오름차순). 닫히는 중인 소켓은 attachment 가 없을 수 있어 거른다 */
  private roster(): PlayerSnapshot[] {
    const list: PlayerSnapshot[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const s = ws.deserializeAttachment() as Attached | null;
      if (s) list.push(publicOf(s)); // 계정 id 는 여기서 떨어진다 (Attached 주석)
    }
    return list.sort((a, b) => a.seat - b.seat);
  }

  private send(ws: WebSocket, msg: S2CMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // 닫히는 중인 소켓. close 핸들러가 정리한다
    }
  }

  /** 플레이어 id 로 한 사람에게만 — 판이 배역처럼 그 소켓에만 가야 하는 것을 보낼 때 */
  private sendTo(id: string, msg: S2CMessage): boolean {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const s = ws.deserializeAttachment() as Attached | null;
      if (s?.id !== id) continue;
      this.send(ws, msg);
      return true;
    }
    return false;
  }

  /**
   * 호스트 좌석 = 지금 방에 있는 가장 낮은 좌석.
   * 좌석은 "비어 있는 가장 낮은 자리"로 배정되므로 보통 처음 들어온 사람이고,
   * 그 사람이 나가면 다음으로 낮은 좌석이 자동으로 호스트가 된다 — 빈자리가 생기지 않는다.
   */
  private hostSeat(): number {
    let lowest = Number.POSITIVE_INFINITY;
    for (const p of this.roster()) if (p.seat < lowest) lowest = p.seat;
    return lowest;
  }

  private broadcast(msg: S2CMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(payload);
      } catch {
        // 위와 같다
      }
    }
  }
}
