/**
 * 「인간인 척」 판의 WebSocket 래퍼 — world/net/connection.ts(WorldConnection)와 같은 패턴이다.
 * 방(RoomDO)의 기본 메시지(입장 · 이동 · 채팅)와 판의 메시지(game_*) · 물리 테스트의 메시지(trial_*)를
 * 한 콜백 묶음으로 넘긴다. Redux 를 모른다 — 화면(InterrogationFeature)이 콜백을 구현한다.
 *
 * 판이 도는 동안 `player_moved` · `chat` 의 id 는 **좌석 id** 다 (서버가 바꿔 보낸다 — game-protocol.ts 머리말).
 */

import { requestWorldTicket } from '@/shared/supabase';
import type { GameC2SMessage, GameS2CMessage } from '@/world/mp/game-protocol';
import { PING_INTERVAL_MS, PROTOCOL_VERSION } from '@/world/mp/constants';
import type { AnimState, C2SMessage, ErrorCode, PlayerSnapshot, S2CMessage } from '@/world/mp/protocol';

export type GameIncoming = Exclude<S2CMessage, { t: 'welcome' | 'player_joined' | 'player_left' | 'player_moved' | 'error' }> | GameS2CMessage;

export interface GameEvents {
  onWelcome(selfId: string, players: PlayerSnapshot[]): void;
  onJoined(player: PlayerSnapshot): void;
  onLeft(id: string): void;
  onMoved(id: string, x: number, z: number, y: number, heading: number, anim: AnimState): void;
  /** 그 밖의 전부 — 채팅 · 방송 · game_* · trial_*. 화면이 종류별로 가른다 */
  onMessage(msg: GameIncoming): void;
  onError(code: ErrorCode | 'connection_failed'): void;
  onClose(): void;
}

export function worldWsBase(): string {
  const env = (import.meta.env.VITE_WORLD_WS_URL as string | undefined)?.trim();
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/world-ws`;
}

export class GameConnection {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private failed = false;
  private gen = 0;

  connect(wsBase: string, roomCode: string, nickname: string, events: GameEvents): void {
    this.close();
    this.failed = false;
    const gen = this.gen;
    void requestWorldTicket(roomCode).then((ticket) => {
      if (gen !== this.gen) return;
      this.open(wsBase, roomCode, nickname, ticket, events);
    });
  }

  private open(wsBase: string, roomCode: string, nickname: string, ticket: string | null, events: GameEvents): void {
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
      this.send({ t: 'game_sync' });
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
      let msg: S2CMessage | GameS2CMessage;
      try {
        msg = JSON.parse(e.data as string) as S2CMessage | GameS2CMessage;
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
        case 'error':
          this.failed = true;
          events.onError(msg.code);
          break;
        default:
          events.onMessage(msg as GameIncoming);
          break;
      }
    };
  }

  sendMove(x: number, z: number, y: number, heading: number, anim: AnimState): void {
    this.send({ t: 'move', x, z, y, heading, anim });
  }

  sendChat(text: string): boolean {
    return this.send({ t: 'chat', text });
  }

  sendAccel(): boolean {
    return this.send({ t: 'trial_accel' });
  }

  sendBrake(): boolean {
    return this.send({ t: 'trial_brake' });
  }

  game(msg: GameC2SMessage): boolean {
    return this.send(msg);
  }

  private send(msg: C2SMessage | GameC2SMessage): boolean {
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
