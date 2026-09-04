/**
 * WebSocket 래퍼.
 *
 * 콜백 인터페이스(WorldEvents)로 한 겹 감싸는 이유: 소켓 코드가 상태관리 라이브러리(Redux)를
 * 모르게 하려고. 다른 화면으로 옮길 때 이 파일은 그대로 가고 콜백 구현만 새로 쓴다.
 *
 * 하트비트는 raw 텍스트 "ping"이다. JSON 프로토콜이 아니다 — 플랫폼(Cloudflare)이 DO를
 * 깨우지 않고 대신 "pong"을 돌려주기 때문이다. 그래서 onmessage에서 JSON.parse 전에 걸러낸다.
 *
 * ┌─ 입장권 (2026-08-30) ────────────────────────────────────────────────────┐
 * │ 로그인한 사람은 소켓을 열기 **직전에** 워커에서 60초짜리 입장권을 받아     │
 * │ `?tk=` 로 실어 보낸다 (shared/supabase.ts · worker/src/auth.ts). 그러면    │
 * │ 방이 이름을 쿼리가 아니라 서명에서 읽는다 — 사칭되지 않는다.              │
 * │                                                                          │
 * │ ★ 이 일을 **부르는 쪽에 시키지 않는다.** connect() 를 부르는 화면이 셋인데 │
 * │   (대기방 · 3D 월드 · 방송 통로) 한 군데라도 빠뜨리면 그 화면에서만 이름이 │
 * │   게스트로 떨어지고, 그건 화면 탓으로 보여서 원인을 찾기 어렵다.          │
 * │   로그인을 안 했거나 워커가 없으면 null 이 오고 그냥 게스트로 연결된다 —   │
 * │   **막지 않는다.** 이 게임은 로그인 없이 도는 것이 정상이다.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { requestWorldTicket } from '@/shared/supabase';
import { PING_INTERVAL_MS, PROTOCOL_VERSION } from '../mp/constants';
import type { AnimState, BroadcastKind, C2SMessage, ErrorCode, PlayerSnapshot, S2CMessage } from '../mp/protocol';

export interface WorldEvents {
  onWelcome(selfId: string, players: PlayerSnapshot[]): void;
  onJoined(player: PlayerSnapshot): void;
  onLeft(id: string): void;
  onMoved(id: string, x: number, z: number, y: number, heading: number, anim: AnimState): void;
  onChat(id: string, nickname: string, text: string, ts: number): void;
  /** 리더 방송이 도착했다. ts 는 서버 시각 — 늦게 온 방송을 가려내는 데 쓴다 */
  onBroadcast(text: string, kind: BroadcastKind, ts: number): void;
  onError(code: ErrorCode | 'connection_failed'): void;
  onClose(): void;
}

/**
 * 워커 주소. 기본은 같은 오리진의 /world-ws — 프론트와 워커를 한 프로젝트로 배포하므로
 * 배포 환경에서는 이것으로 충분하다. 개발 서버는 vite.config.ts 가 127.0.0.1:8787 로 프록시한다.
 * VITE_WORLD_WS_URL 은 별도 워커를 가리킬 때만 쓰는 탈출구다.
 */
export function worldWsBase(): string {
  const env = (import.meta.env.VITE_WORLD_WS_URL as string | undefined)?.trim();
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/world-ws`;
}

export class WorldConnection {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** 서버가 error를 보낸 뒤 닫히면 onClose로 이유를 덮어쓰지 않는다 */
  private failed = false;
  /**
   * 몇 번째 연결인가. 입장권을 기다리는 사이에 close() 되거나 다른 방으로 갈아탈 수 있어서,
   * 돌아온 입장권이 **아직 유효한 시도의 것인지** 이 번호로 본다. 없으면 떠난 방에 소켓이 하나 남는다.
   */
  private gen = 0;

  /**
   * @param wsBase  워커 주소 (예: ws://127.0.0.1:8787). 끝의 / 는 있어도 된다
   * @param roomCode 방 번호
   * @param nickname 닉네임 — 서버가 정리해서 되돌려 준다 (로그인했으면 입장권의 이름이 이긴다)
   */
  connect(wsBase: string, roomCode: string, nickname: string, events: WorldEvents): void {
    this.close();
    this.failed = false;
    const gen = this.gen;

    // 입장권은 있으면 좋고 없으면 마는 것이라 실패를 따로 알리지 않는다 (파일 머리말)
    void requestWorldTicket(roomCode).then((ticket) => {
      if (gen !== this.gen) return; // 기다리는 사이에 닫혔거나 다른 방으로 갔다
      this.open(wsBase, roomCode, nickname, ticket, events);
    });
  }

  private open(wsBase: string, roomCode: string, nickname: string, ticket: string | null, events: WorldEvents): void {
    const base = wsBase.replace(/\/$/, '');
    const url =
      `${base}/rooms/${encodeURIComponent(roomCode)}/ws` +
      `?v=${PROTOCOL_VERSION}&nick=${encodeURIComponent(nickname)}` +
      (ticket ? `&tk=${encodeURIComponent(ticket)}` : '');

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.stopPing();
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, PING_INTERVAL_MS);
    };

    ws.onerror = () => {
      this.failed = true;
      events.onError('connection_failed');
    };

    ws.onclose = () => {
      this.stopPing();
      if (!this.failed) events.onClose();
    };

    ws.onmessage = (e: MessageEvent) => {
      if (e.data === 'pong') return;

      let msg: S2CMessage;
      try {
        msg = JSON.parse(e.data as string) as S2CMessage;
      } catch {
        return;
      }

      switch (msg.t) {
        case 'welcome':
          events.onWelcome(msg.selfId, msg.players);
          break;
        case 'player_joined':
          events.onJoined(msg.player);
          break;
        case 'player_left':
          events.onLeft(msg.id);
          break;
        case 'player_moved':
          events.onMoved(msg.id, msg.x, msg.z, msg.y ?? 0, msg.heading, msg.anim);
          break;
        case 'chat':
          events.onChat(msg.id, msg.nickname, msg.text, msg.ts);
          break;
        case 'broadcast':
          events.onBroadcast(msg.text, msg.kind, msg.ts);
          break;
        case 'error':
          this.failed = true;
          events.onError(msg.code);
          break;
        default:
          break; // 전방 호환. 모르는 타입은 무시한다
      }
    };
  }

  sendMove(x: number, z: number, y: number, heading: number, anim: AnimState): void {
    this.send({ t: 'move', x, z, y, heading, anim });
  }

  sendChat(text: string): boolean {
    return this.send({ t: 'chat', text });
  }

  /**
   * 리더 방송을 서버로 보낸다. **보낸 쪽도 로컬로 읽지 않는다** —
   * 서버가 되돌려주는 것을 듣는다. 채팅이 로컬 에코를 안 하는 것과 같은 이유다.
   * 호스트가 아니면 서버가 조용히 버린다.
   */
  sendBroadcast(text: string, kind: BroadcastKind): boolean {
    return this.send({ t: 'broadcast', text, kind });
  }

  /**
   * 방장이 한 사람을 내보낸다. **누가 보내는지는 싣지 않는다** — 서버가 소켓의 좌석으로 안다
   * (protocol.ts 의 kick). 방장이 아니면 서버가 조용히 버린다.
   */
  sendKick(id: string): boolean {
    return this.send({ t: 'kick', id });
  }

  /** 연결 전 호출은 정상 상황이다(씬이 먼저 뜬다). 조용히 버린다. 실제로 나갔으면 true. */
  private send(msg: C2SMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    // 세대를 올린다 — 아직 오는 중인 입장권이 있으면 그 응답은 이제 남의 것이다 (gen 주석)
    this.gen += 1;
    this.stopPing();
    if (this.ws) {
      // 닫는 중에 콜백이 튀어 상태를 되돌리는 걸 막는다
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private stopPing(): void {
    if (this.pingTimer === null) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
