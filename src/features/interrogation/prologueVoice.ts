/**
 * 프롤로그 목소리 — 대본(prologue.ts)의 줄을 소리로 낸다 (2026-09-05 사용자).
 *
 *   피실험자 01 · 02 · 03  → 지정된 세 목소리 (features/tts/openingSpeakers.ts), **원음**
 *   정부 통제실            → 관리 AI 목소리 (worker 의 LEADER_VOICE = Ethan), **시설 방송 음색**
 *   지문(stage)            → 소리 없음. 「천장 스피커가 켜진다」는 아무도 하는 말이 아니다
 *
 * ┌─ 왜 방송 큐(TtsPlayer)를 안 타나 ─────────────────────────────────────────┐
 * │ 프롤로그는 **화면에서만** 나는 줄이다 (prologue.ts 머리말) — 서버도 관리 AI 도 │
 * │ 이 말을 모른다. 큐에 넣으면 그 규칙이 깨진다: 큐는 판이 쓰는 공용 통로라       │
 * │ 경보가 끼어들면 프롤로그가 잘리고, 반대로 프롤로그가 진짜 방송을 밀어낸다.     │
 * │ 그래서 제 채널로 낸다. 음색만 같은 체인(engine 의 paOut)을 빌려 쓴다.         │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ★ **미리 받아 둔다.** 합성 왕복이 300~800ms 라, 차례가 왔을 때 받기 시작하면 자막이 먼저
 *   뜨고 소리가 뒤늦게 붙는다 — 대본은 박자가 곧 연출이라 그 어긋남이 그대로 보인다.
 *   대본이 고정 문장이라 판이 열릴 때 한꺼번에 받아 두면 되고, 워커가 같은 문장을 캐시하므로
 *   두 번째 판부터는 크레딧도 안 나간다.
 *
 * ★ **한 번에 한 줄.** 대본은 사람들이 주고받는 장면이라 겹치면 안 들린다. 앞 줄이 아직
 *   울고 있으면 끊고 새 줄을 낸다 — 대본의 gap 은 글자용으로 잡힌 값이라 소리가 그보다
 *   길 때가 있는데, 그때 겹쳐 두면 두 사람이 동시에 말하는 것처럼 들린다.
 *
 * 소리가 안 나와도 대본은 그대로 흐른다 — 자막이 본체고 소리는 얹는 것이다.
 */

import { audioContext, masterOut, paOut } from '@/features/tts/engine';
import { OPENING_CAST, OPENING_SETTINGS } from '@/features/tts/openingSpeakers';
import type { PrologueLine } from './prologue';

/** 대본 클립과 같은 조리법 — 한 번 굽고 계속 쓰는 문장이라 품질 쪽이다 (openingSpeakers 머리말) */
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';

/** 받아 둔 소리. 열쇠는 문장이다 — 대본이 고정이라 이걸로 충분하다 */
const clips = new Map<string, Promise<AudioBuffer | null>>();

let playing: AudioBufferSourceNode | null = null;
/** 이 판에서 몇 번 잇달아 실패했나 — 세 번이면 그만 부른다 (키가 없는 판) */
let fails = 0;
const GIVE_UP = 3;

/**
 * 그 줄을 누가 읽나. 지문은 아무도 안 읽는다.
 *
 * 통제실은 voiceId 를 **안 준다** — 워커가 관리 AI 목소리(LEADER_VOICE)로 읽는다.
 * 여기서 id 를 적으면 관리 AI 목소리가 두 군데에 있게 되고, 한쪽만 바뀌는 날이 온다.
 */
export function voiceOf(line: PrologueLine): { voiceId?: string; pa: boolean } | null {
  if (line.who === 'stage') return null;
  if (line.who === 'control') return { pa: true };
  return { voiceId: OPENING_CAST[(line.n ?? 1) - 1]?.voiceId, pa: false };
}

function fetchClip(line: PrologueLine, voiceId: string | undefined): Promise<AudioBuffer | null> {
  const key = line.text;
  const hit = clips.get(key);
  if (hit) return hit;

  const job = fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: line.text,
      // 통제실은 안내 방송, 피실험자는 그 자리에서 하는 말
      kind: line.who === 'control' ? 'announce' : 'readout',
      voiceId,
      ...(line.who === 'control' ? {} : { settings: OPENING_SETTINGS }),
      model: MODEL,
      format: FORMAT,
    }),
  })
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => audioContext().decodeAudioData(b))
    .catch(() => {
      // 실패한 약속을 들고 있으면 그 줄이 영영 무음이다 — 차례가 오면 한 번 더 해 본다
      clips.delete(key);
      return null;
    });

  clips.set(key, job);
  return job;
}

/**
 * 대본 전체를 미리 받아 둔다 — 판이 열릴 때 한 번. 실패는 조용히 지나간다(차례에 다시 해 본다).
 * 소리를 내지 않으므로 자동재생 자물쇠와 무관하다.
 */
export function prefetchPrologue(lines: readonly PrologueLine[]): void {
  for (const line of lines) {
    const v = voiceOf(line);
    if (v) void fetchClip(line, v.voiceId);
  }
}

/** 울고 있는 줄을 끊는다 — 화면을 떠날 때 */
export function stopPrologue(): void {
  try {
    playing?.stop();
  } catch {
    /* 이미 끝났다 */
  }
  playing = null;
}

/** 판이 새로 선다 — 앞 판의 포기 표를 비운다 (받아 둔 소리는 그대로 쓴다, 같은 대본이다) */
export function resetPrologueVoice(): void {
  fails = 0;
}

/**
 * 그 줄을 읽는다. 지문·실패·음소거는 조용히 지나간다 — 자막이 본체다.
 * 앞 줄이 아직 울고 있으면 끊는다 (머리말 ★).
 */
export async function speakPrologueLine(line: PrologueLine): Promise<void> {
  const v = voiceOf(line);
  if (!v || fails >= GIVE_UP) return;

  const buf = await fetchClip(line, v.voiceId);
  if (!buf) {
    fails += 1;
    return;
  }
  fails = 0;

  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  stopPrologue();

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(v.pa ? paOut() : masterOut());
  src.onended = () => {
    if (playing === src) playing = null;
    src.disconnect();
  };
  playing = src;
  src.start();
}
