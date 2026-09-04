/**
 * 개체 목소리 — 노드 다섯이 저희끼리 떠들 때 나는 소리.
 *
 * 여태 이 방에서 소리가 나는 것은 **리더 방송뿐**이었다. 개체들은 말풍선과 피드에 글자로만
 * 떠서, 다섯이 모여 떠드는 그림인데 귀로는 "대화"가 아니라 "자막이 뜬다"로 읽혔다.
 *
 * ── 왜 features/tts 의 엔진을 안 쓰나 ──
 * 저쪽(features/tts/engine.ts)은 **한 화자짜리 싱글턴**이다. 세대(generation)·재생 노드·음색이
 * 모듈 하나에 하나씩이라, 리더가 읽는 자리에 개체를 얹으면 서로의 발화를 끊는다. 게다가
 * features 규칙상 남의 폴더는 import 하지 않는다 (src/features/README.md — tts 담당은 hbkim507).
 * 그래서 여기서 따로 낸다. 공유는 store 경유(@/shared/broadcast)로만 한다.
 *
 * ── 리더가 항상 이긴다 ──
 * 폴백(Web Speech)은 **브라우저 전역 큐가 하나**라, 조정이 없으면 개체가 리더 방송을 끊는다.
 * 그래서 리더가 읽는 동안 개체는 아예 말하지 않는다 (setBlocked). 못 낸 말은 버린다 —
 * 개체의 한마디는 말풍선과 같이 지나가는 것이라, 나중에 나오면 화면과 어긋난 소리가 된다.
 *
 * ── 무엇으로 읽나 ──
 * 기본은 **Web Speech(무료)** 다. 노드마다 pitch·rate 를 갈라 다섯을 구분한다. 품질은 떨어지지만
 * 판이 도는 내내 크레딧이 나가지 않는다 — 개체 대사는 몇 초에 한 번씩 계속 나오는 것이라
 * 그걸 원격 합성에 물리면 요금이 방송과는 다른 자릿수가 된다.
 * 원격(ElevenLabs)은 만들어 두되 **꺼져 있다.** 켜는 것은 돈을 쓰는 결정이라 사람이 한다 (아래 REMOTE_KEY).
 */

/** 노드 하나의 음색 — Web Speech 축(pitch 0~2 · rate 0.1~10)에 얹는다 */
export interface NodeVoice {
  /** 높이. 이게 다섯을 가르는 제일 센 단서다 */
  pitch: number;
  /** 빠르기. 높이만 다르면 한 사람이 흉내 내는 것처럼 들려서 조금씩 어긋나게 둔다 */
  rate: number;
  /** 원격 음색용 링모드 반송파(Hz) — 원격이 켜졌을 때만 쓴다 */
  carrier: number;
}

/**
 * 자리별 음색표.
 *
 * 값이 아니라 **순서**가 핵심이다. 앞 다섯 자리의 높이가 0.60 · 1.50 · 1.05 · 0.83 · 1.28 로
 * 번갈아 뛰는데, 이건 한 방에 서는 개체가 다섯이라 **먼저 채워지는 다섯 자리가 서로 제일 멀어야**
 * 하기 때문이다. 낮은 것부터 차례로 늘어놓으면 이웃한 두 개체가 붙어 들려서 구분이 안 된다.
 *
 * 여덟까지 두는 이유는 노드가 8석이기 때문이다 (PLANNING §1.1) — 자리가 다 차도 겹치지 않는다.
 * 높이 범위 0.60~1.50 은 알아들을 수 있는 선이다. 0.5 아래는 웅얼거리고 1.6 위는 삑삑거린다.
 */
export const NODE_VOICES: readonly NodeVoice[] = [
  { pitch: 0.6, rate: 1.02, carrier: 42 },
  { pitch: 1.5, rate: 0.94, carrier: 64 },
  { pitch: 1.05, rate: 1.1, carrier: 50 },
  { pitch: 0.83, rate: 0.98, carrier: 38 },
  { pitch: 1.28, rate: 1.06, carrier: 58 },
  { pitch: 0.72, rate: 0.92, carrier: 46 },
  { pitch: 1.38, rate: 1.12, carrier: 68 },
  { pitch: 0.94, rate: 1.0, carrier: 54 },
];

/**
 * 이름을 자리 번호로 — 명단에 있으면 그 순서, 없으면 이름을 접어서 고른다.
 *
 * 명단 순서를 쓰는 이유는 **겹치지 않게** 하기 위해서다. 이름만 해시하면 다섯 중 둘이
 * 같은 자리에 떨어지는 일이 심심찮게 나고, 그러면 두 개체가 같은 목소리로 말한다.
 * 명단 밖 이름(리더·명단이 아직 안 온 순간)은 드물어서 해시로 족하다.
 *
 * 순수 함수다 — 같은 이름·같은 명단이면 판이 도는 내내 같은 자리다. 목소리가 도중에
 * 바뀌면 그건 다른 개체가 말하는 것으로 들린다.
 */
export function slotOf(id: string, roster: readonly string[]): number {
  const at = roster.indexOf(id);
  if (at !== -1) return at % NODE_VOICES.length;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % NODE_VOICES.length;
}

/** 이 개체의 음색 */
export function profileOf(id: string, roster: readonly string[]): NodeVoice {
  return NODE_VOICES[slotOf(id, roster)];
}

/**
 * 한국어를 읽는 속도(초당 글자). features/tts/cap.ts 가 방송 길이를 재는 값과 같다 —
 * 같은 언어를 같은 기계가 읽는데 화면마다 다른 속도를 가정할 이유가 없다.
 */
const CHARS_PER_SEC = 5.5;
/** 말끝이 잘려 들리지 않게 두는 여유 */
const TAIL_MS = 300;

/**
 * 이 음색으로 이 줄을 **말하는 데** 걸릴 시간(ms). 대화 리듬이 이걸 기다린다.
 *
 * 말풍선이 머무는 시간(holdFor)은 **읽는** 시간이라 최대 9초에서 멎는데, 40자짜리 한마디를
 * 소리 내어 읽으면 7초가 넘는다. 리듬을 읽는 시간만으로 잡으면 개체들이 서로의 말을 끊고
 * 들어와, 다섯이 동시에 웅얼거리는 소리가 된다 — 무성이던 것보다 나쁘다.
 *
 * /world 의 대화창이 같은 문제를 이미 이렇게 풀었다 (DialogueBox.lineDurationFor —
 * "음성이 다 말하기 전에 넘어가지 않는다"). 저쪽은 클립 길이를 실제로 알고 여기는 어림하는
 * 것만 다르다: 자리마다 빠르기(rate)가 다르니 그것으로 나눈다.
 */
export function speechMsOf(v: NodeVoice, text: string): number {
  return Math.round((text.length / (CHARS_PER_SEC * v.rate)) * 1000) + TAIL_MS;
}

/* ─────────────────────────── 상태 ─────────────────────────── */

let roster: readonly string[] = [];
/** 리더가 읽는 중인가. 읽는 동안 개체는 입을 다문다 */
let blocked = false;
/** 0~1. 방송 손잡이를 그대로 따른다 — 한 방에서 나는 소리에 손잡이가 둘일 이유가 없다 */
let volume = 1;
/**
 * 발화 세대. stop() 과 다음 speak() 이 올린다 —
 * 목소리 목록이나 원격 응답을 기다리는 사이에 끊긴 말이 뒤늦게 나오지 않게 한다.
 */
let generation = 0;

/**
 * 지금 판에 선 개체 명단을 알려 준다 (자리 배정용).
 * 폐기로 명단이 줄어도 **다시 부르지 않는다** — 순서가 밀리면 산 개체의 목소리가 바뀐다.
 */
function cast(ids: readonly string[]): void {
  roster = [...ids];
}

function setBlocked(on: boolean): void {
  if (on === blocked) return;
  blocked = on;
  if (on) stop(); // 리더가 입을 열었다 — 개체는 말하던 것도 멈춘다
}

function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
}

/**
 * 이 개체가 이 줄을 말하는 데 걸릴 시간(ms) — 대화 리듬이 다음 말을 이만큼 미룬다.
 *
 * **소리를 껐는지는 보지 않는다.** 음소거가 대화를 빠르게 만들면 같은 방의 두 사람이
 * 다른 속도로 게임을 하게 된다 (features/tts/cap.ts 가 자막 속도를 두고 세운 것과 같은 약속).
 */
function speechMs(id: string, text: string): number {
  return speechMsOf(NODE_VOICES[slotOf(id, roster)], text);
}

/* ─────────────────────────── 기본: Web Speech ─────────────────────────── */

/**
 * 한국어 목소리들. 브라우저가 여럿 주면 자리마다 다른 것을 물린다 —
 * 높이·빠르기보다 **다른 목소리**가 훨씬 센 단서다. 하나뿐이면 그 하나에 높이만 갈라 얹는다.
 *
 * Chrome 은 첫 getVoices() 가 빈 배열이고 나중에 voiceschanged 로 온다. 안 오는 브라우저도
 * 있어서 1초만 기다린다 — 개체가 입을 못 떼는 것보다 밋밋한 목소리가 낫다.
 */
let koVoices: SpeechSynthesisVoice[] | null = null;

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (koVoices) return Promise.resolve(koVoices);
  const keep = (all: SpeechSynthesisVoice[]) =>
    (koVoices = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ko')));

  const now = speechSynthesis.getVoices();
  if (now.length > 0) return Promise.resolve(keep(now));
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(keep(speechSynthesis.getVoices()));
    };
    const timer = setTimeout(done, 1000);
    speechSynthesis.addEventListener('voiceschanged', done);
  });
}

async function speakLocal(text: string, v: NodeVoice, slot: number, mine: number): Promise<void> {
  const voices = await voicesReady();
  if (mine !== generation) return; // 기다리는 사이 끊겼다

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (voices.length) u.voice = voices[slot % voices.length];
  u.pitch = v.pitch;
  u.rate = v.rate;
  u.volume = volume; // WebAudio 를 안 지나가는 갈래라 여기서 직접 얹는다
  speechSynthesis.speak(u);
}

/* ─────────────────────────── 선택: 원격 합성 ─────────────────────────── */

/**
 * 원격을 켜는 열쇠. **기본은 꺼짐이고, 켜는 것은 사람이 한다** — 개체 대사는 몇 초에 한 번씩
 * 판이 끝날 때까지 나오는 것이라, 켜는 순간부터 한 판이 통째로 요금이 된다.
 *
 *   localStorage['arena.nodeVoice.remote'] = '1'
 *   localStorage['arena.nodeVoice.voices'] = '["voiceId1","voiceId2",…]'   ← 자리 순서대로
 *
 * 목소리 목록이 비어 있으면 켜져 있어도 원격을 쓰지 않는다. 전부 워커 기본 목소리로 나가면
 * 다섯이 **같은 목소리**로 말하는데, 그건 돈을 내고 구분을 잃는 것이다.
 * (계정이 쓸 수 있는 목소리 id 는 /tts 화면이 보여 준다 — GET /api/tts/voices)
 */
const REMOTE_KEY = 'arena.nodeVoice.remote';
const VOICES_KEY = 'arena.nodeVoice.voices';

/**
 * 한 번 띄운 화면에서 원격으로 읽을 수 있는 최대 줄 수.
 *
 * 천장이지 예산이 아니다 — 대화 루프가 폭주하거나 화면을 켜 둔 채 자리를 비웠을 때
 * 요금이 조용히 새는 것만 막는다. 한 판(8분 30초)에 개체 대사가 100줄을 넘기 어렵다.
 */
const MAX_REMOTE_LINES = 120;
let remoteLines = 0;

/** 자리 순서대로 쓸 ElevenLabs 목소리 id. 빈 배열이면 원격을 쓰지 않는다 */
function remoteVoiceIds(): string[] {
  try {
    if (localStorage.getItem(REMOTE_KEY) !== '1') return [];
    const raw = localStorage.getItem(VOICES_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string' && !!v) : [];
  } catch {
    return []; // 저장소를 못 읽거나 JSON 이 깨졌으면 무료 갈래로 간다 — 소리는 계속 난다
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  return (ctx ??= new AudioContext());
}

/** 체인 하나 — 소리를 넣는 자리(input)와 볼륨을 얹는 자리(out) */
interface Chain {
  input: AudioNode;
  out: GainNode;
}
/** 자리별 체인 — 한 번 짓고 계속 쓴다 (반송파 오실레이터 수명 관리 때문에) */
const chains = new Map<number, Chain>();
/** 지금 원격으로 울리는 소리. stop() 이 끊는다 */
let source: AudioBufferSourceNode | null = null;

/** 샘플값을 계단으로 뭉갠다 — 디지털 거칢 */
function crushCurve(steps: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/**
 * 기계 음색. features/tts/engine.ts 의 ROBOT 체인과 **같은 생각**이다 —
 * 확성기 대역 → 링모드 → 비트크러시 → 천장, 기준은 "기계 같은가"가 아니라 "알아들을 수 있는가".
 * 저쪽을 가져다 쓰지 못하는 것은 폴더 규칙 때문이고(남의 폴더는 import 하지 않는다),
 * 다른 것은 반송파뿐이다 — 자리마다 어긋나게 둬서 목소리와 함께 음색으로도 갈린다.
 */
function chainFor(slot: number, carrier: number): Chain {
  const hit = chains.get(slot);
  if (hit) return hit;
  const c = audio();

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 400;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;

  // 오실레이터를 gain 파라미터에 꽂으면 그게 곧 곱셈이다. 깊이 0.4 — 1 이면 로봇답지만 말이 안 들린다
  const ring = c.createGain();
  ring.gain.value = 0.6;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = carrier;
  const depth = c.createGain();
  depth.gain.value = 0.4;
  osc.connect(depth).connect(ring.gain);
  osc.start();

  const crush = c.createWaveShaper();
  crush.curve = crushCurve(24);
  // 계단이 만든 고주파가 접혀 들어오면 쇳소리가 된다(에일리어싱) — 4배로 계산하고 내린다
  crush.oversample = '4x';

  const makeup = c.createGain();
  makeup.gain.value = 1.4;
  // 값을 손으로 만지는 체인이라 어디서 봉우리가 1.0 을 넘는지 미리 알 수 없다. 넘으면 잘려서 치지직거린다
  const ceiling = c.createDynamicsCompressor();
  ceiling.threshold.value = -3;
  ceiling.ratio.value = 20;
  ceiling.attack.value = 0.002;
  ceiling.release.value = 0.1;
  ceiling.knee.value = 0;

  // 볼륨은 천장 **뒤**에 둔다 — 앞에 두면 줄여도 천장이 다시 밀어 올려 손잡이가 먹지 않는다
  const out = c.createGain();
  out.gain.value = volume;

  hp.connect(lp).connect(ring).connect(crush).connect(makeup).connect(ceiling).connect(out);
  out.connect(c.destination);

  const chain: Chain = { input: hp, out };
  chains.set(slot, chain);
  return chain;
}

/** 원격으로 읽었으면 true. false 는 "못 읽었다" — 부른 쪽이 무료 갈래로 넘긴다 */
async function speakRemote(text: string, v: NodeVoice, slot: number, voiceId: string, mine: number): Promise<boolean> {
  if (remoteLines >= MAX_REMOTE_LINES) return false;
  remoteLines += 1;

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, kind: 'readout', voiceId }),
  });
  if (!res.ok) return false;
  const buf = await audio().decodeAudioData(await res.arrayBuffer());
  if (mine !== generation) return true; // 받아 오는 사이 끊겼다 — 실패가 아니라 취소다

  const c = audio();
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  const chain = chainFor(slot, v.carrier);
  chain.out.gain.value = volume;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(chain.input);
  src.onended = () => {
    if (source === src) source = null;
    src.disconnect();
  };
  source = src;
  src.start();
  return true;
}

/* ─────────────────────────── 입구 ─────────────────────────── */

/**
 * 이 개체가 이 한마디를 말한다. 못 내면 조용히 지나간다 —
 * 말풍선은 이미 떠 있고, 소리가 빠졌다고 판이 멎을 이유는 없다.
 *
 * 앞말을 끊고 나간다. 개체들은 한 번에 하나씩 말하는 판이라(대화 리듬은 ArenaFeature 가 잡는다)
 * 겹치는 것은 늦게 온 앞말뿐이고, 그건 이미 말풍선이 지나간 소리다.
 */
function speak(id: string, text: string): void {
  const line = text.trim();
  if (!line || blocked || volume <= 0) return;
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') return;

  stop();
  const mine = ++generation;
  const slot = slotOf(id, roster);
  const v = NODE_VOICES[slot];
  const ids = remoteVoiceIds();

  if (ids.length) {
    void speakRemote(line, v, slot, ids[slot % ids.length], mine)
      .catch(() => false)
      .then((ok) => {
        // 원격이 막혔으면(키·크레딧·네트워크) 무료 갈래로 읽는다. 침묵보다 나쁜 목소리가 낫다
        if (!ok && mine === generation) void speakLocal(line, v, slot, mine);
      });
    return;
  }
  void speakLocal(line, v, slot, mine);
}

/** 지금 나는 소리를 끊는다 */
function stop(): void {
  generation += 1;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  try {
    source?.stop();
  } catch {
    /* 이미 끝났다 */
  }
  source = null;
}

/**
 * 사용자 제스처 안에서 불러 소리를 열어 둔다.
 * 브라우저는 사람이 화면을 건드리기 전의 소리를 조용히 삼킨다 — 개체들은 방에 들어가면
 * 바로 떠들기 시작하므로, 이게 없으면 첫 몇 마디가 통째로 사라진다.
 */
function unlock(): void {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
  if (ctx) void ctx.resume();
}

export const nodeVoice = { cast, speak, stop, setBlocked, setVolume, speechMs, unlock };
