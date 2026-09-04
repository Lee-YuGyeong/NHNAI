/**
 * 물리 미니게임 방의 WebSocket 래퍼 — `src/world/net/connection.ts`(WorldConnection)와 같은
 * 마운트 시 연결 · 언마운트 시 종료 패턴이다. 같은 방 번호로 새로 연결한다(같은 room-do.ts
 * 인스턴스로 간다, `idFromName(roomCode)`) — 복도의 살아있는 연결을 이어받지 않는다. 그 연결은
 * `/world`를 떠날 때 이미 닫혀 있다(WorldFeature.tsx, "화면을 떠나면 소켓도 닫는다").
 *
 * WorldConnection 을 그대로 확장하지 않는다 — trial_* 이벤트를 WorldEvents 에 얹으면 복도
 * 화면과 무관한 개념이 그 인터페이스에 새로 생긴다. 약간의 중복(ping·open·close 배선)을
 * 감수하고 여기서 따로 갖는다.
 */

import { requestWorldTicket } from '@/shared/supabase';
import { PING_INTERVAL_MS, PROTOCOL_VERSION } from '@/world/mp/constants';
import type { AnimState, ErrorCode, PlayerSnapshot, S2CMessage, TrialGame, TrialResultWire } from '@/world/mp/protocol';

export interface TrialEvents {
  onWelcome(selfId: string, players: PlayerSnapshot[]): void;
  onJoined(player: PlayerSnapshot): void;
  onLeft(id: string): void;
  /** 남의 좌표 — 방 안에서 그 사람의 로봇을 그리는 데 쓴다 (WorldScene 의 Remotes) */
  onMoved(id: string, x: number, z: number, y: number, heading: number, anim: AnimState): void;
  onHistory(results: TrialResultWire[]): void;
  onRoundStart(game: TrialGame, round: number, startAt: number, durationMs: number | undefined): void;
  onRunning(id: string, startAt: number): void;
  onWaypoints(id: string, brakeAt: number, brakePos: number, stopAt: number, stopPos: number): void;
  /** 낙하 생존 — 서버 물리 스냅샷(~10Hz). 클라는 보간해 그릴 뿐이다 */
  onSnapshot(msg: Extract<S2CMessage, { t: 'trial_snapshot' }>): void;
  onHit(id: string, objectId: number): void;
  onResult(result: TrialResultWire): void;
  onError(code: ErrorCode | 'connection_failed'): void;
  onClose(): void;
}

export function worldWsBase(): string {
  const env = (import.meta.env.VITE_WORLD_WS_URL as string | undefined)?.trim();
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/world-ws`;
}

export class TrialConnection {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private failed = false;
  private gen = 0;

  /** @param game 판이 없을 때 이 게임으로 새 판을 연다 (protocol.ts 의 trial_join) */
  connect(wsBase: string, roomCode: string, nickname: string, game: TrialGame, events: TrialEvents): void {
    this.close();
    this.failed = false;
    const gen = this.gen;

    void requestWorldTicket(roomCode).then((ticket) => {
      if (gen !== this.gen) return;
      this.open(wsBase, roomCode, nickname, ticket, game, events);
    });
  }

  private open(wsBase: string, roomCode: string, nickname: string, ticket: string | null, game: TrialGame, events: TrialEvents): void {
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
      this.send({ t: 'trial_join', game });
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
        case 'trial_history':
          events.onHistory(msg.results);
          break;
        case 'trial_round_start':
          events.onRoundStart(msg.game, msg.round, msg.startAt, msg.durationMs);
          break;
        case 'trial_running':
          events.onRunning(msg.id, msg.startAt);
          break;
        case 'trial_stopline_waypoints':
          events.onWaypoints(msg.id, msg.brakeAt, msg.brakePos, msg.stopAt, msg.stopPos);
          break;
        case 'trial_snapshot':
          events.onSnapshot(msg);
          break;
        case 'trial_hit':
          events.onHit(msg.id, msg.objectId);
          break;
        case 'trial_result':
          events.onResult(msg.result);
          break;
        case 'error':
          this.failed = true;
          events.onError(msg.code);
          break;
        default:
          break; // 전방 호환. 이 화면이 모르는 타입(chat/broadcast 등)은 무시한다
      }
    };
  }

  /** 판이 끝난 뒤 새 판을 청한다 — 판이 도는 중이면 서버가 그 판을 다시 알려 줄 뿐이다 */
  rejoin(game: TrialGame): boolean {
    return this.send({ t: 'trial_join', game });
  }

  /** 내 좌표. LocalRig 과 같은 규칙으로 TrialRig 이 보낸다 — 남의 화면에 내 로봇이 서게 하는 것뿐, 판정과 무관하다 */
  sendMove(x: number, z: number, y: number, heading: number, anim: AnimState): void {
    this.send({ t: 'move', x, z, y, heading, anim });
  }

  sendAccel(): boolean {
    return this.send({ t: 'trial_accel' });
  }

  sendBrake(): boolean {
    return this.send({ t: 'trial_brake' });
  }

  private send(msg: { t: string } & Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.gen += 1;
    this.stopPing();
    if (this.ws) {
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
