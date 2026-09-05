/**
 * 「인간인 척」 판의 WebSocket 래퍼 — world/net/connection.ts(WorldConnection)와 같은 패턴이다.
 * 방(RoomDO)의 기본 메시지(입장 · 이동 · 채팅)와 판의 메시지(game_*) · 물리 테스트의 메시지(trial_*)를
 * 한 콜백 묶음으로 넘긴다. Redux 를 모른다 — 화면(InterrogationFeature)이 콜백을 구현한다.
 *
 * 판이 도는 동안 `player_moved` · `chat` 의 id 는 **좌석 id** 다 (서버가 바꿔 보낸다 — game-protocol.ts 머리말).
 */

import { requestWorldTicket } from '@/shared/supabase';
import type { CardItem, GameC2SMessage, GameS2CMessage } from '@/world/mp/game-protocol';
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

  /** 색 사냥 — E. 어느 구슬인지만 보낸다. 거리·쿨다운·정오는 서버가 본다 */
  sendPick(objectId: number): boolean {
    return this.send({ t: 'trial_pick', objectId });
  }

  /**
   * 회전 원판 — 걷기 **명령**(월드 기준 속도 m/s)만 올린다. 자리는 안 올린다:
   * 원판이 몸을 실어 나르고 미끄러뜨리는데 그 미끄러짐이 숨은 마찰계수에서 나오므로(P8) 서버가 적분한다.
   * 돌려받는 것은 trial_disc 스냅샷이다 (worker/src/trial/disc/engine.ts 머리말).
   */
  sendWalk(x: number, z: number): boolean {
    return this.send({ t: 'trial_walk', x, z });
  }

  /**
   * 낙하 생존 — Space. 「눌렀다」만 올린다: 높이가 피격 판정 대상이라 서버가 포물선을 적분해 스냅샷의 air 로
   * 돌려준다 (worker/src/trial/fall/engine.ts 머리말).
   */
  sendJump(): boolean {
    return this.send({ t: 'trial_jump' });
  }

  /** 무너지는 타워 — 밀치기(E). 카메라가 보는 방향만 올린다. 누구를 얼마나 미는지는 서버 (worker/src/trial/tower/engine.ts onPush) */
  sendPush(hx: number, hz: number): boolean {
    return this.send({ t: 'trial_push', hx, hz });
  }

  game(msg: GameC2SMessage): boolean {
    return this.send(msg);
  }

  /** 시험 1등의 카드 — 엎어진 세 장 중 몇 번째를 뒤집나 (runtime 의 cardPick) */
  sendCardPick(index: number): boolean {
    return this.send({ t: 'game_card_pick', index });
  }

  /** 쥔 카드를 쓴다 — 지목권·답변 강제권은 대상이 있고, 진정권은 나 자신이다 (runtime 의 cardUse) */
  sendCardUse(item: CardItem, target?: string): boolean {
    return this.send(target ? { t: 'game_card_use', item, target } : { t: 'game_card_use', item });
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
