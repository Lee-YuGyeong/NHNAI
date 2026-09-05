/**
 * 검문소 프롤로그 — 판이 열리고 **첫 토론이 시작되는 순간** 비주얼 노벨식 대화창(features/world/DialogueBox)으로 흐르는 대본
 * (2026-09-05 사용자: "박사 나오는 이런 식의 대화창을 열어 달라. 말하는 대화창은 따로 두고. 얼굴은 군인 얼굴로 클로즈업").
 *
 *   피실험자 01  "뭐야… 여기가 어디야?"
 *   피실험자 02  "문이 안 열려."
 *   (천장 스피커가 켜진다)
 *   정부 통제실  "현재 식별 표지가 없는 휴머노이드가 여러분 사이에 숨어 있습니다."
 *   …
 *   정부 통제실  "판별을 시작합니다."
 *
 * ┌─ 게임 프로세스를 건드리지 않는다 ────────────────────────────────────────┐
 * │ 이 줄들은 **화면에서만** 난다. 서버에 가지 않고, 구역 통신(채팅)에도 안 찍히며, 관리 AI 도 AI 좌석도 │
 * │ 이 말을 못 본다 — 의심도 · 판정 · 대화 기록 어느 것에도 안 실린다.                                  │
 * │ 서버로 가는 것은 **「끝났다」 한 마디**뿐이다 (game_prologue_done): 그때까지 대역과 AI 참가자가       │
 * │ 입을 다물고, 첫 토론의 40초도 그때부터 센다 (worker/src/game/runtime.ts 의 prologueHold).           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 초상: 피실험자는 **그 좌석의 몸**(mp/bodies.ts 군인 넷)의 얼굴 클로즈업, 정부 통제실은 무대 위 처형자의 얼굴 —
 * 둘 다 게임의 GLB 를 tools/soldier-portrait.html (?crop=face) 로 찍은 public/interrogation/face-*.jpg 다.
 * 지문(「천장 스피커가 켜진다」)은 이름표 없이 흐린 글씨(thought)로, 시설 초상을 단다.
 *
 * 피실험자 01 · 02 · 03 은 좌석 가운데 **무작위로** 셋을 뽑는다. 다만 네 사람의 화면이 서로 다른 사람을
 * 가리키면 안 되므로 난수는 판이 열린 서버 시각(GameStateWire.startedAt)으로 심는다 — 전원이 같은 배역을 본다.
 */
import type { ChatLine } from '@/features/world/worldSlice';
import type { GameSeat } from '@/world/mp/game-protocol';

export type PrologueWho = 'control' | 'subject' | 'stage';

export interface PrologueLine {
  who: PrologueWho;
  /** 피실험자 번호 (subject 만) */
  n?: 1 | 2 | 3;
  text: string;
}

/** 정부 통제실의 이름표 · id */
export const CONTROL_NAME = '정부 통제실';
export const CONTROL_ID = 'CONTROL';
/** 처형자 얼굴 — 정부 통제실의 초상 */
export const CONTROL_FACE = '/interrogation/face-executioner.jpg';
/** 몸을 모르는 좌석(옛 워커)의 얼굴 */
export const FALLBACK_FACE = '/interrogation/face-sol_fit_m.jpg';
/** 지문의 초상 — 시설 방송 */
export const STAGE_FACE = '/ui/portrait-system.webp';

export const PROLOGUE: readonly PrologueLine[] = [
  { who: 'subject', n: 1, text: '뭐야… 여기가 어디야?' },
  { who: 'subject', n: 2, text: '문이 안 열려.' },
  { who: 'stage', text: '천장 스피커가 켜진다.' },
  { who: 'control', text: '현재 식별 표지가 없는 휴머노이드가 여러분 사이에 숨어 있습니다.' },
  { who: 'stage', text: '잠시 정적.' },
  { who: 'subject', n: 3, text: '…우리 중에 AI가 있다고?' },
  { who: 'subject', n: 1, text: '난 인간이야.' },
  { who: 'subject', n: 2, text: 'AI도 그렇게 말하겠지.' },
  { who: 'control', text: '지금부터 판별 테스트를 시작합니다.' },
  { who: 'control', text: '각 테스트가 끝날 때마다 인간이 아니라고 생각되는 사람을 의심하십시오.' },
  { who: 'subject', n: 3, text: '틀리면?' },
  { who: 'control', text: '…인간이 처형됩니다.' },
  { who: 'control', text: '판별을 시작합니다.' },
];

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

/** 좌석의 얼굴 — 몸(mp/bodies.ts)을 찍은 클로즈업 */
export function faceOf(seat: GameSeat | undefined): string {
  return seat?.body ? `/interrogation/face-${seat.body}.jpg` : FALLBACK_FACE;
}

/**
 * 열쇠로 대본을 되찾는다 — 상자는 줄의 **열쇠만** 돌려주기 때문이다 (DialogueBox 의 onLine).
 * 열쇠를 만드는 곳(바로 아래 prologueLines)과 읽는 곳이 갈려 있으면 형식이 어긋나는 날이 온다.
 */
export function prologueLineOf(key: string): PrologueLine | undefined {
  const i = Number(key.slice(key.lastIndexOf('-') + 1));
  return Number.isInteger(i) ? PROLOGUE[i] : undefined;
}

/**
 * 대본을 대화창 줄(ChatLine)로 — DialogueBox 가 순서대로 한 줄씩 찍고 머문다 (타자 · 머무름은 상자의 것).
 * key 는 씨앗과 번호로 — 같은 판에서 다시 만들어도 같은 줄이라 상자가 두 번 찍지 않는다.
 */
export function prologueLines(seats: readonly GameSeat[], seed: number): ChatLine[] {
  const cast = castSubjects(seats, seed);
  return PROLOGUE.map((l, i) => {
    const key = `prologue-${seed}-${i}`;
    const ts = seed + i;
    if (l.who === 'control') return { key, id: CONTROL_ID, nickname: CONTROL_NAME, text: l.text, ts, portraitSrc: CONTROL_FACE };
    if (l.who === 'stage') return { key, id: 'system', nickname: ' ', text: l.text, ts, portrait: 'system', portraitSrc: STAGE_FACE, thought: true };
    const seat = cast[(l.n ?? 1) - 1];
    const tag = `피실험자 ${String(l.n ?? 1).padStart(2, '0')}`;
    return { key, id: seat?.id ?? 'system', nickname: seat ? `${tag} · ${seat.name}` : tag, text: l.text, ts, portraitSrc: faceOf(seat) };
  });
}
