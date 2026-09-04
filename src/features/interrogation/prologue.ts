/**
 * 검문소 프롤로그 — 판이 열리고 **첫 토론이 시작되는 순간** 구역 통신에 흘러가는 대본 (2026-09-05 사용자).
 *
 *   피실험자 01  "뭐야… 여기가 어디야?"
 *   피실험자 02  "문이 안 열려."
 *   (천장 스피커가 켜진다)
 *   정부 통제실  "현재 식별 표지가 없는 휴머노이드가 여러분 사이에 숨어 있습니다."
 *   …
 *   정부 통제실  "판별을 시작합니다."
 *
 * ┌─ 게임 프로세스를 건드리지 않는다 ────────────────────────────────────────┐
 * │ 이 줄들은 **화면에서만** 난다. 서버에 가지 않고, 관리 AI 도 AI 좌석도 이 말을 │
 * │ 못 본다 — 의심도 · 판정 · 대화 기록 어느 것에도 안 실린다. 그저 채팅창에 찍힐  │
 * │ 뿐이다. 정부 통제실은 무대 위 처형자(Executioner)의 목소리다.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 피실험자 01 · 02 · 03 은 좌석 가운데 **무작위로** 셋을 뽑는다. 다만 네 사람의 화면이 서로 다른 사람을
 * 가리키면 안 되므로 난수는 판이 열린 서버 시각(GameStateWire.startedAt)으로 심는다 — 전원이 같은 배역을 본다.
 */
import { speechMs } from '@/features/tts/cap';
import type { GameSeat } from '@/world/mp/game-protocol';
import type { ChatEntry } from './interrogationSlice';

export type PrologueWho = 'control' | 'subject' | 'stage';

export interface PrologueLine {
  who: PrologueWho;
  /** 피실험자 번호 (subject 만) */
  n?: 1 | 2 | 3;
  text: string;
  /** 앞 줄에서 이 줄까지 뜸(ms) */
  gap: number;
}

/** 정부 통제실의 이름표 · 좌석 id 자리에 쓰는 표식 */
export const CONTROL_NAME = '정부 통제실';
export const CONTROL_ID = 'CONTROL';

export const PROLOGUE: readonly PrologueLine[] = [
  { who: 'subject', n: 1, text: '뭐야… 여기가 어디야?', gap: 1500 },
  { who: 'subject', n: 2, text: '문이 안 열려.', gap: 2200 },
  { who: 'stage', text: '천장 스피커가 켜진다.', gap: 2400 },
  { who: 'control', text: '현재 식별 표지가 없는 휴머노이드가 여러분 사이에 숨어 있습니다.', gap: 1600 },
  { who: 'stage', text: '잠시 정적.', gap: 3200 },
  { who: 'subject', n: 3, text: '…우리 중에 AI가 있다고?', gap: 2600 },
  { who: 'subject', n: 1, text: '난 인간이야.', gap: 2200 },
  { who: 'subject', n: 2, text: 'AI도 그렇게 말하겠지.', gap: 2200 },
  { who: 'control', text: '지금부터 판별 테스트를 시작합니다.', gap: 3000 },
  { who: 'control', text: '각 테스트가 끝날 때마다 인간이 아니라고 생각되는 사람을 의심하십시오.', gap: 3200 },
  { who: 'subject', n: 3, text: '틀리면?', gap: 2600 },
  { who: 'control', text: '…인간이 처형됩니다.', gap: 3000 },
  { who: 'control', text: '판별을 시작합니다.', gap: 3200 },
];

/**
 * 줄 사이의 숨 — 앞 줄을 **다 읽은 뒤** 다음 줄까지 (2026-09-05 사용자: 「한 대사 끝나면 그 다음 대사」).
 *
 * 재생부는 이제 gap 으로 예약을 걸지 않는다. gap 은 **글자용**으로 잡힌 값이라 소리가 그보다
 * 길어서 대사가 겹쳤다 — 그래서 앞 줄이 끝나는 것을 기다리고, 그다음 이만큼만 쉰다
 * (features/interrogation/prologueVoice.ts).
 *
 * 짧게 잡는 이유는 예산이다: 첫 토론이 40초인데 소리로 읽으면 대본이 33초쯤 된다.
 * 아래 PROLOGUE_MS 가 그 합을 지키고, 시험이 40초를 넘지 않는지 본다.
 */
export const PROLOGUE_BEAT_MS = 600;

/**
 * 합성음은 `speechMs` 의 어림보다 **빠르다** — 2026-09-05 실측: 대본의 말하는 줄 열한 개가
 * 26.4초인데 어림은 30.8초였다(0.86배).
 *
 * `speechMs` 는 **안내 방송**(rate 0.95, 초당 5.5자) 기준으로 잡은 자다. 프롤로그는 speed 1.0 에
 * multilingual 모델이라 그보다 빠르다 — 같은 자로 재면 대본이 실제보다 길다고 나오고, 그 값으로
 * 예산을 잡으면 넣을 수 있는 줄을 못 넣는다.
 *
 * 대본을 고치면 다시 재는 게 맞다. 재는 법은 워커를 띄우고 각 줄을 /api/tts 로 받아 ffprobe 로
 * 길이를 합치는 것이다 (지문은 소리가 없으니 뺀다).
 */
const SPOKEN_FACTOR = 0.86;

/**
 * 대본 전체 길이(ms) — 첫 토론(GAME_FIRST_DISCUSSION_MS) 안에 다 흐른다.
 *
 * ★ **소리 기준**이다. 예전에는 gap 의 합이었는데, 재생이 순차로 바뀌면서 그 값은 실제 길이와
 *   상관이 없어졌다 (gap 은 이제 안 쓴다). 지금은 「각 줄을 읽는 데 걸리는 시간 + 줄 사이 숨」이고,
 *   읽는 시간은 자막이 머무는 시간과 같은 자(cap.ts 의 speechMs)로 잰다 — 소리가 나오든 안 나오든
 *   같은 박자라 한 값으로 둘 다 덮는다.
 *
 *   실제 합성음이 이 어림보다 길 수 있다. 그래서 시험이 40초에 **여유를 두고** 걸린다.
 */
export const PROLOGUE_MS = PROLOGUE.reduce(
  // 지문은 소리가 없다 — 글자를 읽는 시간 그대로다. 보정은 합성음에만 건다
  (t, l) => t + speechMs(l.text) * (l.who === 'stage' ? 1 : SPOKEN_FACTOR) + PROLOGUE_BEAT_MS,
  0,
);

/** 결정적 난수 (mulberry32) — 같은 씨앗이면 네 화면이 같은 순서를 뽑는다 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 피실험자 01 · 02 · 03 을 좌석에서 뽑는다 — 격리된 좌석은 빼고, 셋이 안 되면 있는 대로 돌려 쓴다.
 * 좌석 순서(seat 번호)로 먼저 줄 세운 뒤 섞으므로, 서버가 좌석 배열을 어떤 순서로 보내든 결과가 같다.
 */
export function castSubjects(seats: readonly GameSeat[], seed: number): GameSeat[] {
  const pool = [...seats].filter((s) => !s.isolated).sort((a, b) => a.seat - b.seat);
  if (pool.length === 0) return [];
  const rand = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 2].map((i) => pool[i % pool.length]);
}

export interface TimedEntry {
  /** 대본 시작에서 이 줄까지(ms) */
  at: number;
  entry: ChatEntry;
}

/** 대본을 채팅 줄로 — at 은 누적 시각. ts 는 startedAt 기준이라 나중에 들어온 사람의 로그에서도 순서가 선다 */
export function prologueEntries(seats: readonly GameSeat[], seed: number): TimedEntry[] {
  const cast = castSubjects(seats, seed);
  let at = 0;
  return PROLOGUE.map((l) => {
    at += l.gap;
    const ts = seed + at;
    if (l.who === 'control') return { at, entry: { id: CONTROL_ID, name: CONTROL_NAME, text: l.text, ts, kind: 'control' } };
    if (l.who === 'stage') return { at, entry: { id: 'system', name: '', text: l.text, ts, kind: 'system' } };
    const seat = cast[(l.n ?? 1) - 1];
    const tag = `피실험자 ${String(l.n ?? 1).padStart(2, '0')}`;
    return { at, entry: { id: seat?.id ?? 'system', name: seat ? `${tag} · ${seat.name}` : tag, text: l.text, ts, kind: 'chat' } };
  });
}
