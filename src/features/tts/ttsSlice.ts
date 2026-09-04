import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { broadcastAnnounce, broadcastMute, broadcastVolume, type BroadcastKind } from '@/shared/broadcast';
import { capForSpeech } from './cap';

/**
 * 방송 큐 — `shared/broadcast` 의 `broadcastAnnounce` 가 유일한 입구다.
 * 재생(엔진 호출)은 TtsPlayer 가 하고, 여기는 순서와 상태만 관리한다.
 *
 * 순서 규칙:
 * - announce·readout 은 선입선출.
 * - alarm 은 큐 맨 앞에 서고, 재생 중이던 일반 방송을 끊는다 (경보는 기다리지 않는다).
 * - 대기는 MAX_QUEUE 까지 — 넘치면 가장 오래된 일반 방송부터 버린다.
 *   라운드가 빠르게 넘어가는 게임이라 낡은 방송은 정보가 아니라 소음이다. 경보는 버리지 않는다.
 * - 들어올 때 종류별 길이 예산으로 자른다 (cap.ts). 큐에 담긴 문장 = 실제로 읽힐 문장이다.
 * - **서버에서 중계돼 온 방송(ts 가 붙은 것)은 기다리지 않는다.** 방 전원이 같은 순간에
 *   들어야 하는데, 앞 방송을 읽고 있던 사람만 몇 초 늦게 시작하면 그게 깨진다.
 *   그래서 도착하는 즉시 재생 중이던 것을 끊고 나가고, 그러고도 늦었으면 아예 읽지 않는다.
 *
 * **음소거는 소리만 끈다.** 큐도 재생 자리도 그대로 돌아서 자막(BroadcastBanner)은 계속
 * 흐른다. 예전에는 음소거가 큐를 통째로 비웠는데, 그러면 소리를 끄는 순간 자막까지 죽었다 —
 * 자막이 필요한 상황이 정확히 그때다(스피커가 없거나, 조용해야 하거나, 못 알아듣겠거나).
 * 소리를 내지 않는 일은 TtsPlayer 몫이고, 여기는 음소거를 순서 규칙으로 취급하지 않는다.
 */
export interface QueuedBroadcast {
  text: string;
  kind: BroadcastKind;
  /** 서버가 찍은 시각. 방에서 중계돼 온 방송에만 있다 */
  ts?: number;
}

const MAX_QUEUE = 5;

/**
 * 서버 방송이 이만큼 늦으면 읽지 않는다.
 * 남들이 다 듣고 넘어간 뒤에 혼자 나오는 방송은 정보가 아니라 혼선이다 —
 * 화면에는 이미 다음 단계가 떠 있다.
 */
export const STALE_MS = 1000;

/** 지금 읽기 시작하기엔 너무 늦었나. 혼자 도는 화면의 방송(ts 없음)은 늦는 개념이 없다 */
export function isStale(item: QueuedBroadcast, now: number): boolean {
  return item.ts !== undefined && now - item.ts > STALE_MS;
}

export interface TtsState {
  text: string;                    // 테스트 화면의 입력창
  queue: QueuedBroadcast[];        // 재생 대기 방송
  current: QueuedBroadcast | null; // 지금 읽는 방송 — null 이면 조용한 상태
  muted: boolean;                  // 음소거 — 켜면 재생을 끊고, 들어오는 방송도 버린다
  volume: number;                  // 방송 볼륨 0~1. 0 은 음소거와 같게 다룬다 (자막은 계속 흐른다)
}

/** 볼륨은 화면을 나가도 남는다 — 매번 다시 맞추게 하지 않는다 (world/Bgm 과 같은 약속) */
const VOLUME_STORE = 'tts.broadcast.volume';
const DEFAULT_VOLUME = 1;

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORE);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME; // 저장소를 못 읽는 환경(사생활 보호 모드·테스트)이라도 소리는 난다
  }
}

const initialState: TtsState = { text: '', queue: [], current: null, muted: false, volume: loadVolume() };

export const ttsSlice = createSlice({
  name: 'tts',
  initialState,
  reducers: {
    setText(s, a: PayloadAction<string>) { s.text = a.payload; },
    /** 재생 자리가 비었으면 큐 머리를 올린다 (TtsPlayer 가 부른다). 음소거여도 흐른다 — 자막이 있다 */
    playNext(s) { if (!s.current) s.current = s.queue.shift() ?? null; },
    /** 발화가 끝났다 (TtsPlayer 가 부른다) */
    ended(s) { s.current = null; },
  },
  extraReducers: (b) => {
    b.addCase(broadcastAnnounce, (s, a) => {
      // 음소거여도 받는다 — 소리만 꺼진 것이고 방송은 자막으로 계속 지나간다
      const kind = a.payload.kind ?? 'announce';
      const text = capForSpeech(a.payload.text, kind);
      if (!text) return; // 읽을 게 없는 방송은 자리만 차지한다
      const item: QueuedBroadcast = { text, kind, ts: a.payload.ts };
      // 서버 방송은 경보와 같은 대접을 받는다 — 기다리면 '같은 순간'이 깨지기 때문이다
      if (item.kind === 'alarm' || item.ts !== undefined) {
        s.queue.unshift(item);
        // 재생 중이던 일반 방송을 끊는다 — 비우면 TtsPlayer 가 정지시키고 큐 머리(경보)를 꺼낸다
        if (s.current && s.current.kind !== 'alarm') s.current = null;
      } else {
        s.queue.push(item);
        if (s.queue.length > MAX_QUEUE) {
          const oldest = s.queue.findIndex((q) => q.kind !== 'alarm');
          if (oldest !== -1) s.queue.splice(oldest, 1);
        }
      }
    });
    // 음소거는 `shared/broadcast` 로 들어온다 — 방송을 보내는 화면이 tts 를 import 하지 않게
    b.addCase(broadcastVolume, (s, a) => {
      s.volume = Math.min(1, Math.max(0, a.payload));
      try {
        localStorage.setItem(VOLUME_STORE, String(s.volume));
      } catch {
        /* 저장 못 해도 이번 판에서는 먹는다 */
      }
    });
    b.addCase(broadcastMute, (s, a) => {
      // 큐를 건드리지 않는다. 끄는 것은 소리뿐이고 재생 중이던 소리를 멈추는 일은 TtsPlayer 가 한다
      s.muted = a.payload ?? !s.muted;
    });
  },
  selectors: {
    selectText: (s) => s.text,
    selectQueue: (s) => s.queue,
    selectCurrent: (s) => s.current,
    selectMuted: (s) => s.muted,
    selectVolume: (s) => s.volume,
  },
});

export const ttsActions = ttsSlice.actions;
export const ttsSelectors = ttsSlice.selectors;
