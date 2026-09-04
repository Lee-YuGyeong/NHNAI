/**
 * TTS 엔진 계약 — 엔진 교체 지점은 이 파일 하나다.
 *
 * 지금은 **ElevenLabs(워커 프록시 /api/tts) → 실패하면 Web Speech** 두 겹이다.
 * 키가 없든 크레딧이 떨어졌든 네트워크가 끊겼든, 소리가 아주 안 나는 대신
 * 목소리만 나빠진다. 리더가 먼저 말을 거는 게임이라 침묵이 제일 나쁜 실패다.
 *
 * 키는 브라우저에 없다 — 합성은 워커가 하고 여기로는 mp3 바이트만 내려온다 (PLANNING §4.2).
 *
 * 로봇 음색은 받아 온 소리에 **여기서** 입힌다 (아래 ROBOT). ko-KR 로봇 목소리를 파는
 * API 가 없어서, 합성이 가져오는 것은 "사람이 감정 없이 읽은 한국어"까지다.
 */
import type { BroadcastKind } from '@/shared/broadcast';

export interface TtsEngine {
  /** 한 문장을 읽는다. resolve = 발화가 끝났다 (에러도 조용히 끝난 것으로 친다) */
  speak(text: string, kind?: BroadcastKind): Promise<void>;
  /**
   * 읽을 준비만 해 둔다 — 소리는 내지 않는다. resolve = 준비가 끝났다(실패해도 끝난 것으로 친다).
   *
   * 원격 합성은 왕복이 300~800ms 다. 차례가 온 **다음에** 받기 시작하면 그 사이가 통째로
   * 조용하고, 지각 판정(isStale)도 그 값을 치르기 전의 시각으로 하게 된다.
   * 재생 중인 방송이 있는 동안 다음 것을 미리 받아 두면 둘 다 사라진다.
   *
   * 진행 중인 발화를 건드리지 않는다 — 이걸 부른다고 소리가 끊기거나 바뀌면 안 된다.
   */
  prefetch(text: string, kind?: BroadcastKind): Promise<void>;
  /** 재생 중이던 것을 즉시 끊는다 */
  stop(): void;
  /**
   * 사용자 제스처 안에서 불러 소리를 열어 둔다.
   * 브라우저는 사용자가 페이지를 건드리기 전에는 소리를 조용히 삼킨다 —
   * 게임이 시작되자마자 리더 방송이 나가는 흐름이라 이게 없으면 첫 방송이 사라진다.
   */
  unlock(): void;
}

/** 방송 종류별 목소리 — 안내 방송은 느리고 낮게, 경보는 빠르고 높게 */
const TONE: Record<BroadcastKind, { rate: number; pitch: number }> = {
  announce: { rate: 0.95, pitch: 0.9 },
  readout: { rate: 1.0, pitch: 0.95 },
  alarm: { rate: 1.12, pitch: 1.05 },
};

/* ─────────────────────────── 폴백: Web Speech ─────────────────────────── */

/**
 * 한국어 목소리 하나를 고른다. 없으면 undefined — 그때는 lang 만 주고 브라우저에 맡긴다.
 *
 * Chrome 의 'Google 한국의' 가 이 중에서는 안내 방송 톤에 가장 가깝다. macOS 내장(Yuna)은
 * 로컬이라 지연이 없는 대신 억양이 밋밋해서 차선이다.
 */
export function pickVoice<T extends { lang: string; name: string; localService?: boolean }>(
  voices: T[],
): T | undefined {
  const ko = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ko'));
  if (ko.length === 0) return undefined;
  return ko.find((v) => v.name.includes('Google')) ?? ko.find((v) => !v.localService) ?? ko[0];
}

/**
 * 목소리 목록을 기다린다. Chrome 은 첫 getVoices() 가 빈 배열이고 나중에 voiceschanged 로 온다.
 * 안 오는 브라우저도 있어서 1초만 기다리고 있는 것으로 진행한다 — 방송이 멎는 것보다 낫다.
 */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, 1000);
    speechSynthesis.addEventListener('voiceschanged', done);
  });
}

/**
 * 발화 세대. stop() 과 다음 speak() 이 이걸 올린다 —
 * 목소리를 기다리는 사이에 끊긴 발화가 뒤늦게 말을 시작하지 않게 한다.
 */
let generation = 0;

const webSpeechEngine: TtsEngine = {
  async speak(text, kind = 'announce') {
    const mine = ++generation;
    const voices = await voicesReady();
    if (mine !== generation) return; // 기다리는 동안 끊겼다

    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      const voice = pickVoice(voices);
      if (voice) u.voice = voice;
      Object.assign(u, TONE[kind]);
      u.volume = volume; // WebAudio 를 안 지나가는 갈래라 여기서 직접 얹는다

      // Chrome 은 15초쯤 지나면 합성기가 저 혼자 멈춘다. 주기적으로 깨워 둔다.
      // 간격이 깨우는 주기이자 **놓치는 최대 시간**이다 — 15초에 멈췄는데 20초에 깨우면
      // 5초가 통째로 빈다. 방송 예산이 최대 30초라 그 구간을 여러 번 지난다 (cap.ts).
      const wake = setInterval(() => speechSynthesis.resume(), 5_000);
      const finish = () => {
        clearInterval(wake);
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
    });
  },
  // 브라우저 안에서 합성한다 — 받아 둘 것이 없다. 목소리 목록은 speak 이 알아서 기다린다
  async prefetch() {},
  stop() {
    generation += 1;
    speechSynthesis.cancel();
  },
  unlock() {
    // 빈 발화 하나로 자물쇠만 연다. 소리는 나지 않는다
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  },
};

/* ─────────────────────────── ElevenLabs ─────────────────────────── */

/**
 * 합성한 소리를 재생하는 문맥. 만들 때는 잠긴(suspended) 상태로 태어나고
 * unlock() 의 resume() 이 사용자 제스처 안에서 그걸 연다.
 */
let ctx: AudioContext | null = null;
function audio(): AudioContext {
  return (ctx ??= new AudioContext());
}

/**
 * 이미 받아 둔 소리. 같은 문장·같은 종류·같은 목소리면 같은 소리라 다시 받을 이유가 없다.
 *
 * 캐시가 여기 있는 이유는 속도가 아니라 **돈**이다. /tts 에서 같은 샘플을 반복해 누르며
 * 목소리를 고르는 게 바로 다음 작업인데, 그 한 번 한 번이 크레딧이다.
 * (새로고침하면 사라진다 — 무료로 만든 소리를 유료 전환 뒤까지 들고 있으면 안 된다)
 *
 * ★ 소리가 아니라 **약속**을 담는다. 미리 받기(prefetch)와 실제 발화(speak)가 같은 문장을
 *   두고 겹치는데, 받아 온 것만 담으면 아직 오는 중인 요청은 캐시에 없어서 **한 문장에
 *   크레딧이 두 번 나간다.** 오는 중인 것도 같은 자리에 있어야 뒤에 온 쪽이 그것을 기다린다.
 */
const MAX_CACHE = 30;
const cache = new Map<string, Promise<AudioBuffer>>();

function remember(key: string, job: Promise<AudioBuffer>): void {
  cache.set(key, job);
  // Map 은 넣은 순서를 지키므로 첫 키가 가장 오래된 것이다
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}

/** 지금 재생 중인 소리. stop() 이 이걸 끊는다 */
let source: AudioBufferSourceNode | null = null;

/** /tts 에서 목소리를 갈아 들을 때만 쓴다. 비우면 워커의 기본 목소리로 돌아간다 */
let voiceOverride: string | undefined;

/**
 * 마지막 발화를 누가 읽었나 — 진단용(/tts).
 * 'none' 이 따로 있는 이유: 아직 아무것도 안 읽은 상태를 성공으로 보여주면
 * **확인된 적 없는 것을 확인됐다고 말하는 셈**이라 지표가 거짓말을 한다.
 */
export type SpokenBy = 'none' | 'elevenlabs' | 'fallback';
let spokenBy: SpokenBy = 'none';
let fallbackReason: string | null = null;

/** 이미 받았거나 받는 중이면 그것을 준다. 아니면 새로 받아 온다 — 한 문장에 요청은 한 번이다 */
function synth(text: string, kind: BroadcastKind): Promise<AudioBuffer> {
  const key = `${voiceOverride ?? ''}|${kind}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const job = fetchVoice(text, kind).catch((e: unknown) => {
    // 실패한 약속을 들고 있으면 같은 문장이 영영 그 실패로 고정된다.
    // 미리 받기가 한 번 실패했다고 진짜 차례에 시도조차 못 하면 안 된다.
    cache.delete(key);
    throw e;
  });
  remember(key, job);
  return job;
}

async function fetchVoice(text: string, kind: BroadcastKind): Promise<AudioBuffer> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, kind, voiceId: voiceOverride }),
  });
  if (!res.ok) {
    // 워커가 붙여 보낸 사유를 그대로 들고 올라간다 — 키·보이스·크레딧 중 무엇인지 거기 적혀 있다
    const said = (await res.json().catch(() => null)) as { error?: string } | null;
    if (said?.error) throw new Error(said.error);
    // 사유가 없는 502 는 워커가 낸 게 아니다. 개발 서버가 워커에 못 붙으면 이 모양이 되는데,
    // 그냥 "HTTP 502" 로 두면 ElevenLabs 가 거절한 것처럼 보여서 엉뚱한 데를 파게 된다.
    if (res.status === 502) throw new Error('502 — 워커에 연결 못 함. npm run worker:dev 가 떠 있는지 확인');
    throw new Error(`HTTP ${res.status}`);
  }

  return audio().decodeAudioData(await res.arrayBuffer());
}

/* ── 로봇 음색 ──
 *
 * ko-KR 로봇 목소리를 파는 API 가 없다. 그래서 기계 소리는 여기서 만든다 —
 * 합성이 가져오는 것은 "사람이 감정 없이 읽은 한국어"까지고, 기계가 되는 건 이 체인이다.
 *
 *   확성기 대역 → 링 모듈레이션 → 비트크러시 → 창고 잔향
 *
 * 값을 잡는 기준은 "얼마나 기계 같은가"가 아니라 **"지시문을 알아들을 수 있는가"** 다.
 * /arena 는 리더의 지시문 자체가 게임이라, 발음이 뭉개지면 분위기가 아니라 기능이 깨진다.
 * 그래서 depth 를 1 근처로 올리지 않는다 — 순수 링모드는 로봇답지만 말이 안 들린다.
 */
const ROBOT = {
  low: 400,      // 이 아래를 버린다 — 확성기에는 저음이 없다
  high: 3000,    // 이 위를 버린다. 전화·무전기 대역이 이 둘 사이다.
                 // 300~3400 에서 좁혔다. 좁힐수록 확성기다워지지만 자음이 먼저 죽는다

  carrier: 50,   // 링모드 반송파(Hz). 낮으면 덜덜거리고, 높으면 삐걱거린다
  depth: 0.4,    // 링모드 깊이. 1 이면 완전한 링모드 = 말이 안 들린다
  steps: 24,     // 비트크러시 계단 수. 적을수록 거칠다 — 10 은 치지직거렸다
  room: 0.28,    // 잔향 길이(초) — 창고의 짧은 반사지 성당이 아니다
  wet: 0.12,     // 잔향 섞는 양. 0.25 는 울림이 과했다 — 방송이 공간에 먹혔다
  /**
   * 대역을 잘라내 줄어든 음량 보정.
   * 2.2 는 과했다 — 크러시가 봉우리를 1.0 그대로 남기는데 거기에 2.2 를 곱하니
   * 출력에서 잘려 나갔고, 그 잘린 소리가 치지직거림의 정체였다.
   */
  makeup: 1.4,
};

// WaveShaperNode.curve 는 SharedArrayBuffer 를 받지 않아 버퍼 종류까지 좁혀야 한다
/** 샘플값을 계단으로 뭉갠다 — 디지털 거칢 */
function crushCurve(steps: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** 지수적으로 잦아드는 잡음 = 잔향용 충격응답. 음원 파일을 들고 다닐 이유가 없다 */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}

/**
 * 체인은 한 번만 짓고 계속 쓴다. 발화마다 다시 지으면 반송파 오실레이터를
 * 매번 시작·정지해야 하고, 그 수명 관리가 곧 새는 자리가 된다.
 */
let chainInput: AudioNode | null = null;

function robotChain(): AudioNode {
  if (chainInput) return chainInput;
  const ctx = audio();

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = ROBOT.low;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = ROBOT.high;

  // 링 모듈레이션 — 오실레이터를 gain 파라미터에 꽂으면 그게 곧 곱셈이다.
  // gain 을 (1 - depth) 로 두고 반송파 진폭을 depth 로 주면 깊이가 한 손잡이가 된다:
  // 0 이면 원음 그대로, 1 이면 완전한 링모드.
  const ring = ctx.createGain();
  ring.gain.value = 1 - ROBOT.depth;
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = ROBOT.carrier;
  const depth = ctx.createGain();
  depth.gain.value = ROBOT.depth;
  carrier.connect(depth).connect(ring.gain);
  carrier.start();

  const crush = ctx.createWaveShaper();
  crush.curve = crushCurve(ROBOT.steps);
  // 계단이 만든 고주파가 표본화 한계를 넘으면 접혀 들어와 쇳소리가 된다(에일리어싱).
  // 4배로 올려 계산하고 내리면 그게 대부분 사라진다 — 치지직거림의 나머지 절반이 여기였다.
  crush.oversample = '4x';

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, ROBOT.room);
  const wet = ctx.createGain();
  wet.gain.value = ROBOT.wet;
  const dry = ctx.createGain();
  dry.gain.value = 1 - ROBOT.wet;

  const makeup = ctx.createGain();
  makeup.gain.value = ROBOT.makeup;

  /**
   * 마지막에 천장을 둔다. 값을 손으로 만지는 체인이라 어느 조합에서 봉우리가
   * 1.0 을 넘는지 미리 알 수 없고, 넘으면 출력에서 잘려 치지직거린다.
   * 여기서 눌러 두면 앞의 값을 아무렇게나 바꿔도 그 소리는 다시 나지 않는다.
   */
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -3;
  ceiling.ratio.value = 20;   // 20:1 이면 압축이 아니라 사실상 천장이다
  ceiling.attack.value = 0.002;
  ceiling.release.value = 0.1;
  ceiling.knee.value = 0;

  hp.connect(lp).connect(ring).connect(crush);
  crush.connect(dry).connect(makeup);
  crush.connect(verb).connect(wet).connect(makeup);
  makeup.connect(ceiling).connect(master());

  return (chainInput = hp);
}

/**
 * 시설 방송(PA) — /world 의 SYSTEM(A-01) 과 **같은 소리다.**
 * 값은 features/world/voice.ts 의 'pa' 프리셋과 voice-cast.json 의 system 화자에서 그대로 가져왔다
 * (대역 400~3200 · 잔향 0.9초 · 섞는 양 0.28 · 보정 1.4 · 화자 게인 0.9).
 *
 * 리더는 관제 방송이지 경비 개체가 아니다. 링모드·비트크러시를 거치는 ROBOT 체인은
 * "기계가 말한다"는 소리인데, 저쪽 세계에서 같은 자리(시설 방송)를 맡은 SYSTEM 은
 * 필터를 얹지 않은 사람 목소리에 확성기 대역과 큰 방의 잔향만 걸려 있다. 같은 자리면 같은 소리여야 한다.
 *
 * 두 화면의 차이는 남는다 — /world 는 대본 문장이라 mp3 를 미리 만들어 두지만(공짜),
 * 심문소의 지시문은 그때그때 지어지므로 실시간 합성이다. 소리의 성격만 맞추는 것이다.
 */
const PA = {
  low: 400,
  high: 3200,
  room: 0.9,   // 잔향 길이(초) — 큰 홀. ROBOT(0.28, 창고의 짧은 반사)보다 길다
  wet: 0.28,
  makeup: 1.4,
  gain: 0.9,   // voice-cast.json 의 system 화자 게인
};

/** 어느 음색으로 낼지. 기본은 시설 방송 — /tts 만 A/B 로 갈아 끼운다 */
type FxPreset = 'pa' | 'robot' | 'none';
let fx: FxPreset = 'pa';

let paInput: AudioNode | null = null;

function paChain(): AudioNode {
  if (paInput) return paInput;
  const ctx = audio();

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = PA.low;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = PA.high;

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, PA.room);
  const wet = ctx.createGain();
  wet.gain.value = PA.wet;
  const dry = ctx.createGain();
  dry.gain.value = 1 - PA.wet;

  const makeup = ctx.createGain();
  makeup.gain.value = PA.makeup;
  const out = ctx.createGain();
  out.gain.value = PA.gain;

  // 로봇 체인과 같은 이유로 천장을 둔다 — 잔향이 겹치는 자리에서 봉우리가 1.0 을 넘는다
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -3;
  ceiling.ratio.value = 20;
  ceiling.attack.value = 0.002;
  ceiling.release.value = 0.1;
  ceiling.knee.value = 0;

  hp.connect(lp);
  lp.connect(dry).connect(makeup);
  lp.connect(verb).connect(wet).connect(makeup);
  makeup.connect(out).connect(ceiling).connect(master());

  return (paInput = hp);
}

/**
 * 마스터 볼륨 — 로봇 체인을 거치든 안 거치든 소리는 전부 이 손잡이를 지나 나간다.
 * 체인 끝의 ceiling(천장) **뒤**에 둔다: 앞에 두면 볼륨을 줄여도 천장이 다시 밀어 올려
 * 손잡이가 먹지 않는다. 폴백(speechSynthesis)은 WebAudio 를 안 지나가므로 제 utterance 에 그대로 얹는다.
 */
let volume = 1;
let masterGain: GainNode | null = null;

function master(): AudioNode {
  if (masterGain) return masterGain;
  const g = audio().createGain();
  g.gain.value = volume;
  g.connect(audio().destination);
  return (masterGain = g);
}

/** 0~1. 0 이면 소리는 없지만 방송은 자막으로 계속 지나간다 (TtsPlayer 가 시간을 세어 넘긴다) */
export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (masterGain) masterGain.gain.value = volume;
}

export function getVolume(): number {
  return volume;
}

function play(buf: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const src = audio().createBufferSource();
    src.buffer = buf;
    src.connect(fx === 'robot' ? robotChain() : fx === 'pa' ? paChain() : master());
    src.onended = () => {
      src.disconnect();
      resolve();
    };
    source = src;
    src.start();
  });
}

/**
 * 원격 합성을 쓸 화면인가 (scope.ts). 꺼 두면 폴백으로만 읽는다 —
 * 내 작업 범위 밖 화면이 예전과 똑같이 들리고, 크레딧도 나가지 않는다.
 */
let remote = true;

const elevenEngine: TtsEngine = {
  async speak(text, kind = 'announce') {
    // 범위 밖이면 실패한 게 아니라 애초에 부르지 않는다 — 폴백 사유로 기록하지도 않는다
    if (!remote) return webSpeechEngine.speak(text, kind);

    const mine = ++generation;
    try {
      const buf = await synth(text, kind);
      if (mine !== generation) return; // 받아 오는 사이 끊겼다
      spokenBy = 'elevenlabs';
      fallbackReason = null;
      await play(buf);
    } catch (e) {
      if (mine !== generation) return; // 끊겨서 난 오류다 — 폴백까지 갈 일이 아니다
      spokenBy = 'fallback';
      fallbackReason = e instanceof Error ? e.message : String(e);
      // 침묵보다는 나쁜 목소리가 낫다. 사유는 남긴다 — 안 그러면 폴백이 도는 걸 눈치 못 챈다
      console.warn(`[tts] ElevenLabs 실패 → Web Speech 로 읽는다: ${fallbackReason}`);
      await webSpeechEngine.speak(text, kind);
    }
  },
  async prefetch(text, kind = 'announce') {
    // 폴백으로 읽을 화면이면 받아 둘 것이 없다 — 크레딧도 나가지 않는다
    if (!remote) return;
    try {
      // 캐시에 넣는 것이 전부다. **generation·spokenBy·source 를 건드리지 않는다** —
      // 여기서 세대를 올리면 지금 읽고 있는 방송이 제 차례에 끊긴다.
      await synth(text, kind);
    } catch {
      // 미리 받는 데 실패한 것은 실패가 아니다. 진짜 차례가 오면 speak 이 다시 부르고,
      // 그때도 안 되면 거기서 폴백으로 넘어가며 사유가 남는다. 여기서 남기면 이중으로 찍힌다.
    }
  },
  stop() {
    generation += 1;
    // stop() 은 onended 를 부르고, 그게 speak 의 약속을 resolve 한다.
    // 이미 끝난 노드를 또 멈추면 던지므로 삼킨다.
    try { source?.stop(); } catch { /* 이미 끝났다 */ }
    source = null;
    webSpeechEngine.stop(); // 폴백으로 읽던 중일 수도 있다
  },
  unlock() {
    void audio().resume();
    webSpeechEngine.unlock(); // 폴백도 같이 열어 둔다 — 필요해진 뒤엔 제스처가 없다
  },
};

/**
 * 폴백 목소리로 한 문장 — 원격 합성(/api/tts)이 안 될 때의 **마지막 겹**.
 *
 * 방송 큐(TtsPlayer)를 안 타는 화면도 이 겹은 같이 쓴다: 시나리오 2 는 모델이 지은 개체 대사를
 * 그 자리에서 합성해 트는데(features/world/voice.ts 의 live), 키가 없거나 크레딧이 떨어지면
 * 여기로 내려온다. 「침묵보다는 나쁜 목소리가 낫다」는 이 파일 머리말의 규칙이 거기서도 같다.
 *
 * 엔진 계약(TtsEngine) 밖이다 — 목소리 고르기와 Chrome 의 15 초 멈춤 깨우기를 두 벌로 두지 않으려는 것뿐이다.
 */
export function speakFallback(text: string, kind: BroadcastKind = 'announce'): Promise<void> {
  return webSpeechEngine.speak(text, kind);
}

/* ─────────────────────────── 진단 (계약 밖) ─────────────────────────── */

/**
 * 지금 이 브라우저에서 실제로 잡힌 **폴백** 목소리 이름 — 테스트 화면(/tts)에만 쓴다.
 * 엔진 계약(TtsEngine)에는 넣지 않는다. 다른 엔진으로 갈아끼우면 그냥 사라지면 된다.
 */
export async function voiceName(): Promise<string | null> {
  if (typeof speechSynthesis === 'undefined') return null;
  return pickVoice(await voicesReady())?.name ?? null;
}

/** 목소리 A/B — /tts 전용. 워커의 기본 목소리를 덮어쓴다 */
export function setVoiceId(id: string | undefined): void {
  voiceOverride = id || undefined;
}

/** 음색을 갈아 끼운다 — 기본은 'pa'(시설 방송). /tts 가 A/B 로 부른다 */
export function setFx(preset: FxPreset): void {
  fx = preset;
}

export function getFx(): FxPreset {
  return fx;
}

/**
 * 원격 합성을 켜고 끈다 (TtsPlayer 가 경로를 보고 부른다, scope.ts).
 * 끄면 폴백만 쓴다 — 소리가 사라지는 게 아니라 예전 목소리로 돌아간다.
 */
export function setRemote(on: boolean): void {
  remote = on;
}

/**
 * 로봇 음색 on/off — /tts 에서 원본과 갈아 듣는 손잡이.
 * 캐시는 필터를 타기 **전** 소리를 들고 있어서, 껐다 켰다 해도 다시 합성하지 않는다
 * (= 크레딧이 들지 않는다). 그래서 같은 문장으로 몇 번이든 비교할 수 있다.
 */
export function setRobot(on: boolean): void {
  setFx(on ? 'robot' : 'none');
}

/**
 * 마지막 발화를 누가 읽었는지와, 폴백이었다면 그 사유.
 * **소리를 듣고 목소리를 고르는 화면에서 이게 없으면 안 된다** — 폴백인 줄 모르고
 * "ElevenLabs 목소리가 별로네" 하고 판단하게 된다.
 */
export function lastSpeech(): { by: SpokenBy; reason: string | null } {
  return { by: spokenBy, reason: fallbackReason };
}

/** 현재 엔진 — 교체는 이 한 줄 */
export const engine: TtsEngine = elevenEngine;
