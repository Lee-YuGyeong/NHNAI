/**
 * 프롤로그 목소리 — 대본(prologue.ts)의 줄을 소리로 낸다 (2026-09-05 사용자).
 *
 *   피실험자 01 · 02 · 03  → 지정된 세 목소리 (features/tts/openingSpeakers.ts), **원음**
 *                            — 단, 몸이 남자 얼굴이면 남자 목소리 (BODY_VOICE: 얼굴과 성별을 맞춘다)
 *   정부 통제실            → 관리 AI 목소리 (worker 의 LEADER_VOICE = Ethan), **시설 방송 음색**
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
 * ★ **한 줄이 끝나야 다음 줄이다** (2026-09-05 사용자). 줄을 넘기는 주인은 대화창
 *   (features/world/DialogueBox)이다 — 상자가 줄을 띄우며 onLine 으로 알리고, 이 함수가
 *   다 읽은 뒤 resolve 하면 그 사이 speaking 이 서 있어서 상자가 기다린다.
 *   박자를 여기서 따로 세지 않는 이유가 그것이다: 두 곳에서 세면 어긋난다.
 *
 * 소리가 안 나와도 대본은 그대로 흐른다 — 자막이 본체고 소리는 얹는 것이다.
 */

import { audioContext, masterOut, paOut } from '@/features/tts/engine';
import { OPENING_CAST, OPENING_SETTINGS } from '@/features/tts/openingSpeakers';
import type { BodyId } from '@/world/mp/bodies';
import type { GameSeat } from '@/world/mp/game-protocol';
import type { PrologueLine } from './prologue';

/** 대본 클립과 같은 조리법 — 한 번 굽고 계속 쓰는 문장이라 품질 쪽이다 (openingSpeakers 머리말) */
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';

/** 받아 둔 소리. 열쇠는 **목소리+문장**이다 — 같은 줄이라도 판마다 몸이 갈리면 딴 목소리로 읽는다 (BODY_VOICE) */
const clips = new Map<string, Promise<AudioBuffer | null>>();
/** 받아 둔 소리의 길이(초) — **앞머리 무음을 뺀 말의 길이**다. 자막 속도를 여기 맞춘다 (prologueClipMs) */
const seconds = new Map<string, number>();
/** 그 소리의 앞머리 무음(초) — 재생을 여기서부터 시작한다 (leadingSilenceSec) */
const leads = new Map<string, number>();

let playing: AudioBufferSourceNode | null = null;
/** 이 판에서 몇 번 잇달아 실패했나 — 세 번이면 그만 부른다 (키가 없는 판) */
let fails = 0;
const GIVE_UP = 3;

/**
 * 몸 → 목소리 — **얼굴과 목소리의 성별을 맞춘다** (2026-09-05 사용자: 「비만 남군은 셋 중
 * 남자 목소리로」). 초상이 좌석의 몸이라(prologue.ts 의 faceOf), 번호로만 목소리를 주면
 * 남자 얼굴에서 여자 목소리가 나는 판이 선다 — 배역(castSubjects)이 무작위이기 때문이다.
 *
 * 여기 없는 몸은 번호 배정(OPENING_CAST[n-1])을 그대로 쓴다 — 아직 몸마다 다 정하지 않았다.
 * 목소리를 찾는 열쇠는 성별이다(id 를 또 적으면 배역표와 두 군데가 된다).
 */
const BODY_VOICE: Partial<Record<BodyId, string | undefined>> = {
  sol_heavy_m: OPENING_CAST.find((s) => s.gender === '남')?.voiceId,
};

/** 이 판의 피실험자 01·02·03 이 무슨 몸인가 — 판이 열릴 때 적는다 (resetPrologueVoice) */
let castBodies: (BodyId | undefined)[] = [];

/**
 * 그 줄을 누가 읽나 — 모든 줄이 누군가의 말이다 (지문은 없다, prologue.ts 머리말).
 *
 * 피실험자는 몸이 먼저다(BODY_VOICE) — 얼굴이 남자인데 번호가 여자 목소리면 안 된다.
 * 몸에 짝이 없으면 번호(n)로 간다.
 *
 * 통제실은 voiceId 를 **안 준다** — 워커가 관리 AI 목소리(LEADER_VOICE)로 읽는다.
 * 여기서 id 를 적으면 관리 AI 목소리가 두 군데에 있게 되고, 한쪽만 바뀌는 날이 온다.
 */
export function voiceOf(line: PrologueLine): { voiceId?: string; pa: boolean } {
  if (line.who === 'control') return { pa: true };
  const i = (line.n ?? 1) - 1;
  const body = castBodies[i];
  const bodyVoice = body ? BODY_VOICE[body] : undefined;
  return { voiceId: bodyVoice ?? OPENING_CAST[i]?.voiceId, pa: false };
}

/** 소리 상자들(clips · seconds · leads)의 열쇠 — 문장만으로는 모자란다: 같은 줄이 판마다 딴 목소리로 읽힐 수 있다 */
function clipKey(line: PrologueLine): string {
  return `${voiceOf(line).voiceId ?? 'PA'}|${line.text}`;
}

/* ───────────────────────────── 앞머리 무음 ───────────────────────────── */

/**
 * 합성기가 붙여 보내는 앞머리 무음을 재는 데 쓰는 값들.
 *
 * 문턱은 **클립의 봉우리에 맞춰** 잡는다 — 절대값 하나로 자르면 조용히 녹은 클립이 통째로
 * 무음이 된다. 바닥(FLOOR)은 그 밑에 두는 안전선이다: 봉우리가 이보다도 작으면 말이 아니다.
 * 찾은 자리에서 GUARD 만큼 물러선다 — 첫 자음은 서서히 오르므로 문턱에 닿는 자리에서 바로
 * 자르면 그 자음이 깎인다. 상한(MAX)을 넘는 무음은 안 자른다: 그건 앞머리가 아니라 깨진 클립이다.
 */
const SILENCE_REL = 0.02;
const SILENCE_FLOOR = 0.003;
const GUARD_SEC = 0.03;
const MAX_LEAD_SEC = 1;

/** AudioBuffer 에서 이 함수가 보는 것만 — 시험이 WebAudio 없이 부를 수 있게 */
export interface ClipSamples {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * 클립 앞머리의 무음이 몇 초인가 — 합성기가 붙여 보내는 「숨 고르는 자리」다.
 *
 * 자막은 줄이 뜨는 순간부터 소리 길이에 맞춰 찍힌다 (DialogueBox 의 paceFor). 그 길이에
 * 앞머리 무음까지 들어 있으면 **글자만 먼저 굴러가고 목소리는 늦게 붙는다** — 2026-09-05
 * 사용자: 「정부 통제실에서 말하는 게 tts 가 시작이 더 늦어. 사람1은 타이밍 맞게 나오고 있거든」.
 *
 * 통제실만 늦은 것은 그 줄만 다른 발성으로 합성되기 때문이다: 피실험자는 readout ·
 * OPENING_SETTINGS(stability 0.45 · speed 1.0), 통제실은 announce(stability 0.85 · speed 0.95,
 * worker/src/tts.ts) — 단조롭고 느리게 읽는 목소리일수록 첫 소리 앞의 여백이 길다.
 * 화면 쪽(PA 체인)은 아니다: 마른 소리가 0.72 로 그대로 지나가고, 늦는 마디는 천장(압축기)의
 * 6ms 뿐이라 귀에 안 잡힌다.
 *
 * **재기만 한다.** 자르는 것은 재생부의 몫이다 (speakPrologueLine 의 start 오프셋).
 */
export function leadingSilenceSec(buf: ClipSamples): number {
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c += 1) chans.push(buf.getChannelData(c));
  if (!chans.length) return 0;

  let peak = 0;
  for (const d of chans) for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
  // 통째로 조용한 클립 — 잘라 낼 앞머리가 아니라 그냥 소리가 없는 것이다
  if (peak <= SILENCE_FLOOR) return 0;

  const gate = Math.max(SILENCE_FLOOR, peak * SILENCE_REL);
  const limit = Math.min(buf.length, Math.ceil(MAX_LEAD_SEC * buf.sampleRate));
  for (let i = 0; i < limit; i += 1) {
    for (const d of chans) {
      if (Math.abs(d[i]) < gate) continue;
      return Math.max(0, i / buf.sampleRate - GUARD_SEC);
    }
  }
  // 상한까지 조용하다 — 앞머리로 보기엔 너무 길다. 건드리지 않는다
  return 0;
}

function fetchClip(line: PrologueLine, voiceId: string | undefined): Promise<AudioBuffer | null> {
  const key = clipKey(line);
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
    .then((buf) => {
      /*
       * 자막이 이 길이에 맞춰 찍힌다 (prologueClipMs) — 소리를 받아 봐야 아는 값이다.
       * 재는 것은 **말의 길이**지 클립의 길이가 아니다: 앞머리 무음까지 세면 글자가 먼저
       * 굴러가고 목소리가 늦게 붙는다 (leadingSilenceSec).
       */
      const lead = leadingSilenceSec(buf);
      leads.set(key, lead);
      seconds.set(key, Math.max(0, buf.duration - lead));
      /*
       * 개발 중에는 잰 값을 적어 둔다 — 「누가 늦나」는 귀로는 갈리지만 눈으로는 안 보이는 자리다.
       * 열한 줄이 한 표로 찍히므로 통제실만 앞머리가 긴지, 전부 그런지가 한눈에 갈린다.
       *
       * info 다 — debug 는 DevTools 가 기본으로 숨긴다(Verbose 를 켜야 보인다). 보라고 적는
       * 줄이 안 보이면 없는 것만 못하다.
       */
      if (import.meta.env.DEV) {
        console.info(`[prologue] ${line.who} 앞머리 ${Math.round(lead * 1000)}ms · 말 ${Math.round((buf.duration - lead) * 1000)}ms — ${line.text}`);
      }
      return buf;
    })
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
    void fetchClip(line, voiceOf(line).voiceId);
  }
}

/**
 * 그 줄의 **말이** 몇 ms 인가 — 받아 둔 것만 안다 (아직 안 왔거나 실패했으면 null).
 * 앞머리 무음은 빠져 있다: 재생도 그 자리부터 시작하므로 자막과 소리가 같은 0 초를 본다.
 *
 * 자막 속도를 여기 맞춘다 (DialogueBox 의 voiceMsOf). 안 맞추면 자막은 글자 속도(글자당 31ms)로
 * 찍혀 먼저 끝나고, 안내 방송 속도(글자당 182ms)인 통제실의 긴 줄에서는 다 찍힌 글을 보며 소리만
 * 기다리는 침묵이 몇 초씩 붙는다 — 클립을 트는 화면에서 이미 겪고 고친 것이다 (DialogueBox 의 paceFor).
 *
 * 미리 받아 두므로(prefetchPrologue) 첫 줄을 뺀 나머지는 차례가 올 때 이미 알고 있다. 첫 줄은 글자
 * 기준으로 찍히는데, 그래도 붙잡기(speaking)가 소리 끝까지 잡아 주므로 잘리지는 않는다.
 */
export function prologueClipMs(line: PrologueLine): number | null {
  const sec = seconds.get(clipKey(line));
  return sec === undefined ? null : sec * 1000;
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

/**
 * 판이 새로 선다 — 앞 판의 포기 표를 비우고, **이 판의 배역이 무슨 몸인지** 적는다 (voiceOf 가 본다).
 * 받아 둔 소리는 그대로 쓴다 — 열쇠에 목소리가 들어 있어(clipKey) 몸이 갈려도 딴 클립과 안 섞인다.
 *
 * ★ prefetchPrologue **보다 먼저** 불러야 한다 — 미리 받는 목소리가 이 배역을 따르기 때문이다.
 */
export function resetPrologueVoice(cast: readonly GameSeat[] = []): void {
  fails = 0;
  castBodies = cast.map((s) => s.body);
}

/* ───────────────────────────── 늦는 자리를 가르는 눈금 (개발용) ───────────────────────────── */

/**
 * 통제실을 시설 방송 체인(paOut)에 태울까 — 개발 중에만 끌 수 있다.
 *
 *   window.__prologuePA = false   // 콘솔에서 끄고 판을 다시 연다
 *
 * 2026-09-05 사용자: 「정부 통제실에서 말하는 게 tts 가 시작이 더 늦어」. 앞머리 무음을 재
 * 봤더니 통제실이 오히려 **더 짧았고**(통제실 53~129ms · 피실험자 0~150ms), 자막 길이도 잰
 * 말 길이로 다시 계산하니 둘 다 0.92 로 같았다 — **JS 가 아는 한 둘은 똑같이 맞는다.**
 *
 * 그렇다면 남는 차이는 통제실만 지나는 그 길뿐이다: 400Hz 하이패스(말의 저역을 걷어 첫소리를
 * 여리게 만든다) · 0.9초 잔향(어택을 뭉갠다) · 20:1 압축기(2ms 만에 봉우리를 눌러 앉힌다).
 * 셋 다 **소리를 늦추지는 않지만 늦게 들리게 할 수는 있다** — 그건 계산으로 못 가르고 귀로만
 * 갈린다. 그래서 스위치를 둔다: 꺼서 맞으면 길의 문제고, 꺼도 늦으면 다른 데 있다.
 */
function paWanted(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return true;
  return (window as unknown as { __prologuePA?: boolean }).__prologuePA !== false;
}

/**
 * **소리가 스피커에 닿기까지 몇 ms 인가** — 자막을 그만큼 늦게 연다 (DialogueBox 의 voiceLagMs).
 *
 * `src.start()` 는 곧바로 돌아오지만 그 소리가 실제로 들리는 것은 오디오 장치를 다 지난 뒤다:
 * baseLatency(브라우저가 채워 두는 버퍼) + outputLatency(OS·장치까지의 길). 내장 스피커면
 * 합쳐 10~30ms 라 눈에 안 띄는데 **블루투스 이어폰이면 150~300ms** 고, 그 동안 자막만 먼저 굴러간다.
 *
 * 2026-09-05 사용자: 「관리자뿐 아니라 다들 조금씩 늦게 시작해」. **전부**라는 것이 이 값의
 * 지문이다 — 목소리마다 · 체인마다 다른 것이라면 전부일 리가 없다. (앞서 통제실만 늦다고 보고
 * 앞머리 무음을 짚었다가 틀렸다: 재어 보니 통제실이 오히려 짧았다.)
 *
 * 상한을 둔다 — 브라우저가 터무니없는 값을 주면 자막이 통째로 밀린다. 그럴 바엔 안 맞추는 게 낫다.
 * 귀로 맞춰 보려면 `window.__prologueLag = 200` (개발 중, ms). 0 을 넣으면 안 늦춘다.
 */
const MAX_LAG_MS = 400;

export function prologueLagMs(): number {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const dial = (window as unknown as { __prologueLag?: unknown }).__prologueLag;
    if (typeof dial === 'number' && Number.isFinite(dial)) return Math.max(0, Math.min(MAX_LAG_MS, dial));
  }
  const ctx = audioContext();
  const lag = ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000;
  return Number.isFinite(lag) ? Math.max(0, Math.min(MAX_LAG_MS, lag)) : 0;
}

// 콘솔에서 `__prologuePA` 를 쳐 보면 스위치가 있다는 걸 알 수 있다 (world/probe.ts 와 같은 방식)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __prologuePA?: boolean };
  w.__prologuePA ??= true;
}

/**
 * 그 줄을 읽고, **다 읽을 때까지 기다린다** (2026-09-05 사용자: 「한 대사 끝나면 그 다음 대사」).
 *
 * ★ resolve 시점이 이 함수의 전부다. 시작할 때 끝내면 상자가 다음 줄로 넘어가 버려서 대사가
 *   겹친다 — 처음에 그렇게 짰고, 그게 「왜 동시에 나와?」였다.
 *
 * 소리가 없는 줄(지문 · 합성 실패 · 키 없음)은 **곧바로** resolve 한다. 그 줄이 화면에 머무는
 * 시간은 상자가 글자로 잰다(DialogueBox 의 charHold) — 여기서 또 세면 두 번 기다리게 된다.
 * 소리가 아예 안 나오는 판에서 대본이 제 박자로 흐르는 것도 그래서 그대로다.
 */
export async function speakPrologueLine(line: PrologueLine): Promise<void> {
  const v = voiceOf(line);
  if (fails >= GIVE_UP) return;

  /*
   * 줄이 뜬 순간이다 — 상자가 자막을 찍기 시작하는 바로 그때 이 함수가 불린다 (DialogueBox 의 onLine).
   * 여기서 소리가 실제로 나가기까지 몇 ms 가 뜨는지가 「소리가 늦다」의 첫 갈림이다: 0 에 가까우면
   * 늦는 자리는 JS 가 아니라 그 뒤(음향 체인 · 귀)다.
   */
  const shownAt = performance.now();

  const buf = await fetchClip(line, v.voiceId);
  if (!buf) {
    fails += 1;
    return;
  }
  fails = 0;

  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  stopPrologue();

  await new Promise<void>((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(v.pa && paWanted() ? paOut() : masterOut());
    src.onended = () => {
      if (playing === src) playing = null;
      src.disconnect();
      resolve();
    };
    playing = src;
    // 앞머리 무음을 건너뛰고 **말이 시작되는 자리**부터 — 자막이 재는 길이도 그 자리부터다 (leadingSilenceSec)
    src.start(0, leads.get(clipKey(line)) ?? 0);
    if (import.meta.env.DEV) {
      // 체인이 붙는 지연(baseLatency)까지 같이 적는다 — 통제실만 다른 길을 타므로 여기서 갈릴 수 있다
      const chain = v.pa && paWanted() ? 'PA' : '원음';
      const path = `버퍼 ${Math.round((ctx.baseLatency ?? 0) * 1000)}ms + 장치 ${Math.round((ctx.outputLatency ?? 0) * 1000)}ms`;
      console.info(
        `[prologue] ${line.who}/${chain} 줄→start ${Math.round(performance.now() - shownAt)}ms · 귀까지 ${path} = 늦춤 ${Math.round(prologueLagMs())}ms — ${line.text.slice(0, 12)}`,
      );
    }
  });
}
