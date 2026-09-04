import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlayerSnapshot, QualityTier } from '@/world';

export type WorldStatus = 'idle' | 'connecting' | 'live' | 'error';

/** 명부 한 줄. 좌표는 여기 없다 — src/world/net/remote-players 가 들고 있다 */
export interface RosterEntry {
  id: string;
  seat: number;
  nickname: string;
}

export interface WorldState {
  quality: QualityTier;
  status: WorldStatus;
  errorText: string | null;
  /** 입장 폼 값 — 방을 나가도 남는다 (다시 들어갈 때 다시 안 치게) */
  roomCode: string;
  nickname: string;
  /** 서버가 정해 준 나 */
  selfId: string | null;
  self: { seat: number; nickname: string } | null;
  /** 원격 플레이어 명부 (본인 제외). 멤버십이 바뀔 때만 바뀐다 */
  roster: RosterEntry[];
  /** 말풍선이 바뀔 때만 증가. 좌표 변화로는 절대 증가하지 않는다 */
  bubbleTick: number;
  /** 대화 기록 (본인 포함 — 서버가 본인에게도 되돌려 준다). 화면 좌하단으로 흐른다 */
  messages: ChatLine[];
}

export interface ChatLine {
  key: string;
  id: string;
  nickname: string;
  text: string;
  ts: number;
  /** 대화창 초상 — 없으면 내 말은 연구원, 남의 말은 로봇. 챕터 대본(과학자·정부요원·시스템)이 지정한다 */
  portrait?: PortraitKind;
  /**
   * 초상을 **경로로 직접** — 종류표(PortraitKind)에 없는 얼굴. 검문소 프롤로그가 그 좌석의 군인 얼굴 클로즈업
   * (public/interrogation/face-*.jpg)을 단다 (2026-09-05). 있으면 portrait 보다 먼저다. 추가만 하는 필드.
   */
  portraitSrc?: string;
  /**
   * 이건 **소리 내어 한 말이 아니라 속마음**이다 (2026-08-30 사용자: 정비 단말이 읽어 주는 대신 내가 속으로 읽는다).
   * 대화창이 다르게 그린다 — 이름표가 「속마음」, 글씨는 기울고 흐리다 (DialogueBox 의 dlg--thought)
   */
  thought?: boolean;
}

/** 대화창 초상 종류 (features/world/DialogueBox.tsx 가 파일로 바꾼다) */
export type PortraitKind = 'human' | 'robot' | 'scientist' | 'agent' | 'system' | 'me' | 'enforcer';

/** 대화 기록 보관 개수. 넘으면 오래된 것부터 버린다 (humanish 와 같은 값) */
const CHAT_LOG_MAX = 200;

const initialState: WorldState = {
  quality: 'high',
  status: 'idle',
  errorText: null,
  roomCode: '',
  nickname: '',
  selfId: null,
  self: null,
  roster: [],
  bubbleTick: 0,
  messages: [],
};

const toEntry = (p: PlayerSnapshot): RosterEntry => ({ id: p.id, seat: p.seat, nickname: p.nickname });

export const worldSlice = createSlice({
  name: 'world',
  initialState,
  reducers: {
    setQuality(s, a: PayloadAction<QualityTier>) { s.quality = a.payload; },
    setRoomCode(s, a: PayloadAction<string>) { s.roomCode = a.payload; },
    setNickname(s, a: PayloadAction<string>) { s.nickname = a.payload; },
    setStatus(s, a: PayloadAction<{ status: WorldStatus; errorText?: string | null }>) {
      s.status = a.payload.status;
      s.errorText = a.payload.errorText ?? null;
    },
    /** welcome — 본인은 명부에서 뺀다 (원격으로 그리지 않는다) */
    welcomed(s, a: PayloadAction<{ selfId: string; players: PlayerSnapshot[] }>) {
      const me = a.payload.players.find((p) => p.id === a.payload.selfId);
      s.selfId = a.payload.selfId;
      s.self = me ? { seat: me.seat, nickname: me.nickname } : null;
      s.roster = a.payload.players.filter((p) => p.id !== a.payload.selfId).map(toEntry);
      s.status = 'live';
      s.errorText = null;
    },
    playerJoined(s, a: PayloadAction<PlayerSnapshot>) {
      if (a.payload.id === s.selfId) return;
      if (s.roster.some((r) => r.id === a.payload.id)) return;
      s.roster.push(toEntry(a.payload));
    },
    playerLeft(s, a: PayloadAction<string>) {
      s.roster = s.roster.filter((r) => r.id !== a.payload);
    },
    /** 채팅 한 줄 — 말풍선 신호와 기록을 같이 갱신한다 */
    chatReceived(s, a: PayloadAction<{ id: string; nickname: string; text: string; ts: number; portrait?: PortraitKind; thought?: boolean }>) {
      s.bubbleTick += 1;
      s.messages.push({ key: `${a.payload.id}-${a.payload.ts}-${s.messages.length}`, ...a.payload });
      if (s.messages.length > CHAT_LOG_MAX) s.messages.splice(0, s.messages.length - CHAT_LOG_MAX);
    },
    /** 방을 옮기거나 나갈 때. 폼 값(roomCode·nickname)과 quality 는 남긴다 */
    left(s) {
      s.status = 'idle';
      s.errorText = null;
      s.selfId = null;
      s.self = null;
      s.roster = [];
      s.bubbleTick = 0;
      s.messages = [];
    },
  },
  selectors: {
    selectQuality: (s) => s.quality,
    selectStatus: (s) => s.status,
    selectErrorText: (s) => s.errorText,
    selectRoomCode: (s) => s.roomCode,
    selectNickname: (s) => s.nickname,
    selectSelfId: (s) => s.selfId,
    selectSelf: (s) => s.self,
    selectRoster: (s) => s.roster,
    selectBubbleTick: (s) => s.bubbleTick,
    selectMessages: (s) => s.messages,
  },
});

export const worldActions = worldSlice.actions;
export const worldSelectors = worldSlice.selectors;
