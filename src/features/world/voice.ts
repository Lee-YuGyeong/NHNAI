/**
 * 대사 음성 — 대화창(DialogueBox)에 줄이 뜰 때 미리 합성해 둔 클립을 튼다.
 *
 *   클립: public/world/voice/*.mp3 + manifest.json (tools/voice-lines.mjs 가 만든다 — 대본 문장 그대로가 열쇠)
 *   화자: manifest.names 로 닉네임(과학자·정부요원·UNIT-07…) → 화자 id. **내 말(self)은 소리가 안 난다** (speakerOf 머리말).
 *   음색: 화자마다 fx 프리셋 — pa(시설 방송: SYSTEM/A-01), robot(기계 음색: 경비 개체),
 *         none(원음: 과학자·정부요원). **무전기(comm)는 없다** — 두 사람 목소리에서 차례로 걷었다
 *         (2026-09-01 사용자). 사람은 원음이나 시설 방송이고, 필터가 걸리는 것은 기계뿐이다.
 *         ElevenLabs 는 사람 목소리만 주므로 기계 소리는 여기서 만든다
 *         (features/tts/engine.ts 의 체인과 같은 생각: 확성기 대역 → 링모드 → 비트크러시 → 짧은 잔향, "알아들을 수 있는가"가 기준).
 *
 * 클립이 없는 문장(플레이어 채팅, LLM 이 지은 경비 대답)은 조용히 지나간다. 한 번에 한 클립 — 다음 줄이 뜨면 앞 클립은 끊는다.
 * 볼륨은 localStorage 'world.voice.volume'(0~1, 기본 1). 0 이면 아예 받지도 않는다.
 *
 * ★ **실시간 합성 — 모델이 지은 줄만** (2026-09-03 사용자: 「모델이 말하면 TTS 가 실시간으로 말했으면 해」).
 *   시나리오 2 의 개체 대답 중 대본표에 없던 자리는 모델이 문장을 짓는다(features/world2/say.ts). 구운 클립이
 *   있을 리 없으니 그대로 두면 그 줄만 무음이다 — 열쇠가 문장 그대로라서, 지어진 문장은 영영 클립이 없다.
 *   그래서 그런 줄은 `markLive(text)` 로 표를 달아 두고, play() 가 그 자리에서 **워커 프록시(/api/tts)로 합성해**
 *   구운 클립과 **같은 음색 체인**에 태운다 — 같은 개체의 목소리로 들려야 한 개체다.
 *   두 겹인 것도 방송 쪽과 같다: /api/tts 가 안 되면(키 없음 · 크레딧 소진) Web Speech 로 읽는다
 *   (features/tts/engine.ts 의 speakFallback). 침묵보다는 나쁜 목소리가 낫다.
 *   **표를 단 줄만** 이 길로 간다 — 대본을 고치고 안 구운 줄까지 실시간으로 읽으면 「클립이 없다」는 경고가 조용히 묻힌다.
 */

import { speechMs } from '@/features/tts/cap';
import { speakFallback } from '@/features/tts/engine';

type FxPreset = 'pa' | 'robot' | 'none';
interface Fx {
  preset: FxPreset;
  low?: number;
  high?: number;
  carrier?: number;
  depth?: number;
  steps?: number;
  room?: number;
  wet?: number;
}
export interface Manifest {
  names: Record<string, string>;
  speakers: Record<string, { fx: Fx; gain: number; playRate?: number }>;
  /** duration = 클립 길이(초). 대화창이 이만큼은 기다린다 */
  lines: Record<string, { file: string; duration?: number }>;
}
/**
 * 재생 속도 — 대사·음성이 "너무 늦어 답답하다"(2026-08-30 사용자) → 1.1배. 클립을 다시 뽑지 않고 재생 때 올린다.
 * AudioBufferSourceNode 의 playbackRate 라 음높이도 그만큼(≈1.6반음) 올라간다 — 로봇 필터가 있는 화자는 티가 덜 나고,
 * 사람 목소리도 이 정도는 자연스럽다. 길이(duration·durationOf)는 재생 속도로 나눠 대화창 타이밍과 맞춘다.
 *
 * 화자별 playRate(manifest·voice-cast)가 이 값을 이긴다 — 깊은 목소리는 +1.6반음이 "가벼워졌다"로
 * 들려서(2026-08-30 과학자 Ethan) 1.0 으로 돌렸고, 한동안 **1 아래로 내려** 음높이를 낮추는 손잡이로도
 * 썼다(2026-08-31 과학자 0.94 = -1.1반음). 그 한 단계는 되돌렸다 — 지금 과학자는 1.0, 원음의 음높이다
 * (2026-09-02 사용자: deep 한 단계만 올려). 말 속도는 **클립을 빠르게 구워** 낸다(voice-cast 의
 * settings.speed — ElevenLabs 쪽 속도라 음높이가 안 변한다): 과학자는 1.1배로 구워 1.0배로 트니 말 속도 1.1배.
 * 두 축을 곱한 값이 1 아래로 내려가면 "너무 늦어 답답하다"(2026-08-30 사용자)로 돌아간다.
 */
export const VOICE_RATE = 1.1;

/** 이 화자의 재생 속도 — manifest 에 화자가 없으면(플레이어 채팅 등) 기본값 */
function rateOf(m: Manifest | null, speaker: string | undefined): number {
  return (speaker && m?.speakers[speaker]?.playRate) || VOICE_RATE;
}

/** play() 가 돌려주는 것 — 대화창이 "음성이 끝날 때까지" 머무를 수 있게 */
export interface Playing {
  duration: number;
  /** performance.now() 기준 시작 시각 */
  startedAt: number;
}

/** 실시간으로 읽어야 하는 문장들 — 모델이 지은 줄. 판이 새로 서면 비운다 (markLive) */
const liveTexts = new Set<string>();
/** 이 판에서 실시간 합성이 몇 번 연달아 실패했나 — 세 번이면 그만 부른다 (키가 없는 판) */
let liveFails = 0;
/** 지금 폴백(Web Speech)으로 읽고 있나 — stop() 이 **내가 시킨 것만** 끊게 하는 표. 방송이 폴백으로 읽는 중일 수도 있다 */
let fallbackOn = false;
const LIVE_GIVE_UP = 3;

const BASE = '/world/voice/';
const VOLUME_KEY = 'world.voice.volume';

let manifest: Promise<Manifest | null> | null = null;
/** 받아 둔 manifest — durationOf 가 동기로 읽는다 */
let loaded: Manifest | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: AudioBufferSourceNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
/** 클립 없음을 이미 알린 문장 — 같은 줄이 반복될 때마다 콘솔을 채우지 않는다 (DEV 전용) */
const warned = new Set<string>();
const chains = new Map<string, AudioNode>();

function volume(): number {
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    return v === null ? 1 : Math.max(0, Math.min(1, Number(v) || 0));
  } catch {
    return 1;
  }
}

function loadManifest(): Promise<Manifest | null> {
  return (manifest ??= fetch(`${BASE}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => (loaded = m))
    .catch(() => null));
}
// 미리 받아 둔다 — 챕터 대본이 첫 줄을 내기 전에 길이를 알아야 연출 타이밍이 맞는다
if (typeof window !== 'undefined' && typeof fetch === 'function') void loadManifest();

/**
 * 이 줄의 화자 id — 이름표(manifest.names)로 찾는다.
 * (속마음은 아예 여기까지 오지 않는다 — DialogueBox 가 안 튼다)
 *
 * ★ **내 말은 화자가 없다 = 소리가 안 난다** (2026-09-03 사용자: "사용자는 tts 제거해줘").
 *
 *   여태 내 말은 'me' 화자로 구운 클립을 틀었다. 그런데 이 게임에서 **내 말은 내가 친 말**이다 —
 *   대본에 적힌 줄이든 검문 앞에서 고른 답이든, 그 자리에 있는 사람은 나다. 거기에 합성 목소리를
 *   얹으면 내가 한 말을 남이 대신 읽어 주는 꼴이 되고, 남과 대화하는 자리에서 그게 제일 두드러졌다.
 *   말풍선과 대화창은 그대로다. 사라지는 것은 소리뿐이다.
 *
 *   클립이 없는 줄과 같은 길로 간다 — 대화창은 글자 수로 길이를 잡고(paceFor·lineDurationFor의
 *   폴백), 챕터 대본은 그 길이로 다음 줄을 잡는다. 따로 손볼 자리가 없다.
 */
export function speakerOf(m: Manifest, nickname: string, isSelf: boolean): string | undefined {
  if (isSelf) return undefined;
  return m.names[nickname];
}

/** 이 줄의 클립 길이(초) — manifest 를 아직 못 받았거나 클립이 없으면 undefined (동기) */
function durationOf(nickname: string, text: string, isSelf: boolean): number | undefined {
  if (!loaded) return undefined;
  const speaker = speakerOf(loaded, nickname, isSelf);
  const d = speaker ? loaded.lines[`${speaker}|${text}`]?.duration : undefined;
  return d === undefined ? undefined : d / rateOf(loaded, speaker);
}

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume();
    master.connect(ctx.destination);
  }
  return ctx;
}

/* ───────────── 음색 체인 ───────────── */

function crushCurve(steps: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}
function band(c: AudioContext, low: number, high: number): [AudioNode, AudioNode] {
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = low;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = high;
  hp.connect(lp);
  return [hp, lp];
}
function ceiling(c: AudioContext): DynamicsCompressorNode {
  const n = c.createDynamicsCompressor();
  n.threshold.value = -3;
  n.ratio.value = 20;
  n.attack.value = 0.002;
  n.release.value = 0.1;
  n.knee.value = 0;
  return n;
}

/** 화자별 체인 — 한 번 짓고 계속 쓴다 (오실레이터 수명 관리 때문에) */
function chainFor(speaker: string, fx: Fx, gain: number): AudioNode {
  const key = `${speaker}`;
  const hit = chains.get(key);
  if (hit) return hit;
  const c = audio();
  const out = c.createGain();
  out.gain.value = gain;
  out.connect(ceiling(c)).connect(master!);

  let input: AudioNode;
  if (fx.preset === 'pa') {
    // 시설 방송 — 확성기 대역 + 큰 방의 잔향
    const [hp, lp] = band(c, fx.low ?? 400, fx.high ?? 3200);
    const verb = c.createConvolver();
    verb.buffer = impulse(c, fx.room ?? 0.9);
    const wet = c.createGain();
    wet.gain.value = fx.wet ?? 0.28;
    const dry = c.createGain();
    dry.gain.value = 1 - (fx.wet ?? 0.28);
    const makeup = c.createGain();
    makeup.gain.value = 1.4;
    lp.connect(dry).connect(makeup);
    lp.connect(verb).connect(wet).connect(makeup);
    makeup.connect(out);
    input = hp;
  } else if (fx.preset === 'robot') {
    // 기계 — 대역 → 링모드(반송파를 gain 에 꽂으면 곱셈) → 비트크러시 → 짧은 잔향
    const [hp, lp] = band(c, fx.low ?? 380, fx.high ?? 3200);
    const depth = fx.depth ?? 0.38;
    const ring = c.createGain();
    ring.gain.value = 1 - depth;
    const carrier = c.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = fx.carrier ?? 50;
    const amp = c.createGain();
    amp.gain.value = depth;
    carrier.connect(amp).connect(ring.gain);
    carrier.start();
    const crush = c.createWaveShaper();
    crush.curve = crushCurve(fx.steps ?? 24);
    crush.oversample = '4x';
    const verb = c.createConvolver();
    verb.buffer = impulse(c, fx.room ?? 0.25);
    const wet = c.createGain();
    wet.gain.value = fx.wet ?? 0.1;
    const dry = c.createGain();
    dry.gain.value = 1 - (fx.wet ?? 0.1);
    const makeup = c.createGain();
    makeup.gain.value = 1.4;
    lp.connect(ring).connect(crush);
    crush.connect(dry).connect(makeup);
    crush.connect(verb).connect(wet).connect(makeup);
    makeup.connect(out);
    input = hp;
  } else {
    input = out;
  }
  chains.set(key, input);
  return input;
}

/* ───────────── 클립 ───────────── */

function bufferFor(file: string): Promise<AudioBuffer | null> {
  let p = buffers.get(file);
  if (!p) {
    p = fetch(BASE + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => audio().decodeAudioData(b))
      .catch(() => null);
    buffers.set(file, p);
  }
  return p;
}

/**
 * 이 문장은 **모델이 지었다** — 클립이 없으니 그 자리에서 합성해 튼다. 이야기(scenario2)가 줄을 내보내기 직전에 단다.
 * 표를 그대로 들고 있는 이유: 대사가 바뀌어 클립이 어긋난 줄과 **구별해야** 한다. 그건 무음으로 두고 경고를 띄우는 편이 맞다.
 */
export function markLive(text: string): void {
  const t = text.trim();
  if (t) liveTexts.add(t);
}
/** 판이 새로 선다 — 앞 판의 지어진 문장도, 포기 표도 비운다 */
export function resetLive(): void {
  liveTexts.clear();
  liveFails = 0;
}

/**
 * 지어진 한 줄을 **그 자리에서** 읽는다 — 워커 프록시(/api/tts) → 실패하면 Web Speech.
 * 받아 온 소리는 구운 클립과 **같은 음색 체인**을 탄다: 같은 개체가 두 목소리로 말하면 안 된다.
 * 폴백은 체인을 못 탄다(브라우저가 제 장치로 바로 읽는다) — 그 판에서는 기계 음색 없이 사람 목소리로 들린다.
 */
async function playLive(speaker: string, sp: Manifest['speakers'][string], text: string): Promise<Playing | null> {
  const rate = sp.playRate ?? VOICE_RATE;
  if (liveFails < LIVE_GIVE_UP) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // readout — 개체가 제 자리에서 하는 말이라 안내 방송보다 평평하게 읽힌다
        body: JSON.stringify({ text, kind: 'readout' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const buf = await audio().decodeAudioData(await res.arrayBuffer());
      const c = audio();
      if (c.state === 'suspended') await c.resume().catch(() => undefined);
      if (master) master.gain.value = volume();
      stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(chainFor(speaker, sp.fx, sp.gain ?? 1));
      src.onended = () => {
        if (current === src) current = null;
        src.disconnect();
      };
      current = src;
      src.start();
      liveFails = 0;
      return { duration: buf.duration / rate, startedAt: performance.now() };
    } catch (e) {
      liveFails += 1;
      if (import.meta.env.DEV) console.warn(`[voice] 실시간 합성 실패 → Web Speech 로 읽는다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // 마지막 겹 — 브라우저가 읽는다. 길이를 못 재니 글자 수로 어림해 대화창이 그만큼 머문다
  fallbackOn = true;
  void speakFallback(text, 'readout').finally(() => {
    fallbackOn = false;
  });
  return { duration: speechMs(text) / 1000, startedAt: performance.now() };
}

function stop(): void {
  /*
   * 폴백으로 읽던 줄은 브라우저의 합성기가 들고 있어서 버퍼를 끊는 것으로는 안 멎는다.
   * **내가 시킨 것일 때만** 끊는다 — speechSynthesis.cancel 은 전역이라, 방송(TtsPlayer)이 폴백으로 읽는 중이면 그것까지 자른다
   */
  if (fallbackOn && typeof speechSynthesis !== 'undefined') {
    fallbackOn = false;
    speechSynthesis.cancel();
  }
  if (!current) return;
  try {
    current.stop();
  } catch {
    /* 이미 끝남 */
  }
  current.disconnect();
  current = null;
}

/** 이 줄의 클립을 튼다. 없으면 아무것도 안 하고 null. 틀었으면 길이·시작 시각 — 대화창이 끝날 때까지 기다린다 */
async function play(nickname: string, text: string, isSelf: boolean): Promise<Playing | null> {
  stop();
  if (volume() <= 0) return null;
  const m = await loadManifest();
  if (!m) return null;
  const speaker = speakerOf(m, nickname, isSelf);
  if (!speaker) return null;
  const entry = m.lines[`${speaker}|${text}`];
  const sp = m.speakers[speaker];
  if (!entry || !sp) {
    /*
     * 클립이 없다 = 이 줄은 조용히 지나간다. 플레이어 채팅·LLM 이 지은 답처럼 **원래 없는** 줄도 있지만,
     * 대본 화자(m.names 에 있는 이름)의 줄이 비면 그건 대개 **대사를 고치고 음성을 안 다시 뽑은 것**이다.
     * 열쇠가 문장 그대로라 한 글자만 바뀌어도 어긋나는데, 지금까지는 아무 말 없이 소리만 사라져서
     * 한참 뒤에야 "왜 안 들리지"로 발견됐다 (2026-08-29 — 대사를 단문으로 고치며 61줄 중 49줄이 조용해졌다).
     * 개발 중에는 그 자리에서 말해 준다. 고치는 법은 `node tools/voice-lines.mjs` 다.
     */
    // 모델이 지은 줄이면 여기서 합성한다 — 구울 수 없는 문장이라 클립이 없는 게 정상이다
    if (sp && liveTexts.has(text.trim())) return playLive(speaker, sp, text);
    if (import.meta.env.DEV && !warned.has(text)) {
      warned.add(text);
      console.warn(`[voice] 클립 없음 — [${speaker}] "${text}"\n  대사를 고쳤으면 음성을 다시 뽑는다: node tools/voice-lines.mjs`);
    }
    return null;
  }
  const buf = await bufferFor(entry.file);
  if (!buf) return null;
  const c = audio();
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  if (master) master.gain.value = volume();
  stop();
  const rate = rateOf(m, speaker);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const chain = chainFor(speaker, sp.fx, sp.gain ?? 1);
  src.connect(chain);
  src.onended = () => {
    if (current === src) current = null;
    src.disconnect();
  };
  current = src;
  src.start();
  return { duration: buf.duration / rate, startedAt: performance.now() };
}

/** 다음에 뜰 줄을 미리 받아 둔다 (대본이 이어질 때 첫 소리가 늦지 않게) */
async function prefetch(nickname: string, text: string, isSelf: boolean): Promise<void> {
  const m = await loadManifest();
  if (!m) return;
  const speaker = speakerOf(m, nickname, isSelf); // 내 말은 여기서 undefined — 받을 것이 없다
  const entry = speaker ? m.lines[`${speaker}|${text}`] : undefined;
  if (entry) void bufferFor(entry.file);
}

export const voiceLines = { play, prefetch, stop, durationOf };
