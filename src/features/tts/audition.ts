/**
 * 배역 시청 — /tts 에서 대본 화자(과학자·정부요원·경비 둘)의 목소리를 갈아 듣는다.
 *
 * 대본 클립은 tools/voice-lines.mjs 가 voice-cast.json 대로 미리 굽는다. 목소리를 **고르는** 단계에서
 * 그걸 돌릴 수는 없다 — 후보마다 전 대사를 합성하면 크레딧이 후보 수만큼 나간다. 그래서 여기서
 * **같은 조리법으로 한 줄만** 실시간 합성한다: 같은 모델(cast.model) · 같은 발성(화자 settings) ·
 * 같은 재생 필터(화자 fx). 값을 전부 voice-cast.json 에서 그대로 읽으므로,
 * 여기서 들리는 소리가 곧 구워질 클립의 소리다.
 *
 * 재생 필터(robot)는 features/world/voice.ts 가 클립에 입히는 것과 같은 체인이다.
 * 사람 배역(과학자·정부요원)에게는 필터가 없다 — 무전기를 걷은 뒤 원음 그대로 튼다 (2026-09-01 사용자).
 * 남은 필터는 기계 것뿐이라 시청에서 갈리는 것은 이제 **목소리 자체**다.
 * 가져다 쓰지 못하는 것은 폴더 규칙 때문이다 (남의 폴더는 import 하지 않는다 — engine.ts 의 ROBOT,
 * arena/node-voice.ts 와 같은 사정). 값은 cast 의 fx 를 읽으니 어긋날 자리는 체인 구조뿐이다.
 */
import cast from '../../../tools/voice-cast.json';

/** 시청 대상 — 지금 목소리를 고르는 네 배역 (2026-08-30). system·me 는 이미 정해져서 뺐다 */
export type AuditionRoleId = 'scientist' | 'agent' | 'unit07' | 'unit12';

/** voice-cast.json 의 화자 fx — 프리셋별로 쓰는 축이 달라 전부 선택이다 */
interface CastFx {
  preset: string;
  low?: number;
  high?: number;
  carrier?: number;
  depth?: number;
  steps?: number;
  room?: number;
  wet?: number;
}
interface CastSpeaker {
  settings: Record<string, number>;
  fx: CastFx;
  gain?: number;
  /** 화자별 재생 속도 — 없으면 PLAY_RATE. 1 아래면 음높이가 내려간다 (과학자는 0.94 로 뒀다가 1.0 으로 되돌렸다, 2026-09-02) */
  playRate?: number;
  voice: { name: string };
}

/** 형(型)을 여기서 못 박는다 — cast 에서 화자가 빠지거나 모양이 바뀌면 컴파일이 멎는다 */
const SPEAKERS: Record<AuditionRoleId, CastSpeaker> = cast.speakers;

export interface AuditionRole {
  id: AuditionRoleId;
  label: string;
  /** 대본에서 그대로 가져온 줄들 — 누를 때마다 다음 줄. 이 문장들이 나중에 클립으로 구워진다 */
  lines: readonly string[];
}

/**
 * 줄은 배역의 **말투 폭**이 드러나게 골랐다 — 브리핑조·짧은 동요(과학자), 명령 한 줄·긴 지시(요원),
 * 검문·순찰 소리(경비). 한 줄만 듣고 고르면 다른 말투에서 무너지는 목소리를 못 거른다.
 */
export const AUDITION_ROLES: readonly AuditionRole[] = [
  {
    id: 'scientist',
    label: '과학자',
    lines: [
      '통신 연결됐습니다. 들리죠? 여긴 AI 자치 구역입니다.',
      'AI 를 오래 쳐다보거나, 물러서거나, 감정을 드러내면 오릅니다. 기계처럼 담담하게 움직이세요.',
      '뭐지?',
    ],
  },
  {
    id: 'agent',
    label: '정부요원',
    lines: [
      '여기는 지휘부. 계속 조사하십시오.',
      '개체는 전부 안쪽에 있습니다. 앞의 격납문을 개방합니다. 중앙 시설로 이동하십시오.',
    ],
  },
  {
    id: 'unit07',
    label: 'UNIT-07 · 복도 경비',
    lines: ['정지. 식별 코드.', '코어 동기화 07:00.', '됐다. 가라.'],
  },
  {
    id: 'unit12',
    label: 'UNIT-12 · 경비',
    lines: ['다시 말해라.', '따라간다.', '이 구간 이상 없음.'],
  },
];

/** n번째 누름에 읽을 줄 — 끝까지 가면 처음으로 돈다 */
export function lineOf(role: AuditionRole, press: number): string {
  return role.lines[press % role.lines.length];
}

/** 지금 cast 에 배정돼 있는 목소리 이름 — 화면에 "지금: …"으로 띄운다 */
export function castNameOf(id: AuditionRoleId): string {
  return SPEAKERS[id].voice.name;
}

/**
 * 이 배역에 걸린 음색을 한 줄로 — 화면에 띄워 **무엇을 듣고 있는지** 보이게 한다.
 *
 * 목소리(누구)는 골라서 정하지만 음색(어떻게 들리는가)은 voice-cast 의 숫자다. 그 숫자는 소리로만
 * 확인되는데, 화면에 안 보이면 "지금 몇으로 들은 거지"를 파일을 열어야 안다 — 음색을 손보는 동안
 * 특히 그렇다 (2026-08-31 과학자 저역·음높이·무전기).
 *
 * 안 건 축은 **안 적는다** — 0 으로 적으면 건 것처럼 보인다. 그래서 줄 길이가 곧 "이 배역에 뭐가
 * 걸려 있나"다: 사람 둘은 배속 하나뿐이고(무전기를 걷었다, 2026-09-01), 경비는 대역과 배속이다.
 * 기본값은 chainFor 의 robot 가지와 같은 값이다 (한쪽을 고치면 여기도 고친다).
 */
export function toneOf(id: AuditionRoleId): string {
  const { fx, playRate } = SPEAKERS[id];
  const rate = `${playRate ?? PLAY_RATE}배`;
  // 필터가 없는 배역에 대역을 적으면 **안 거는 필터를 건 것처럼** 보인다 — 사람 둘이 그렇다
  return fx.preset === 'none' ? `원음 · ${rate}` : `${fx.low ?? 380}~${fx.high ?? 3200}Hz · ${rate}`;
}

/**
 * /api/tts 로 보낼 본문 — 발성·모델·포맷을 cast 에서 그대로 싣는다.
 * kind 는 안 보낸다: settings 가 네 축을 전부 덮으니 종류 기본값은 어차피 안 남는다.
 * format 을 안 실으면 방송용(22/32)으로 와서, 게임 클립(44.1/64)보다 탁한 소리로 비교하게 된다.
 */
export function auditionBody(id: AuditionRoleId, text: string, voiceId: string): Record<string, unknown> {
  return {
    text,
    voiceId: voiceId || undefined, // '' = 워커 기본 목소리
    model: cast.model,
    format: cast.format,
    settings: SPEAKERS[id].settings,
  };
}

/* ─────────────────────────── 게임 소리 ─────────────────────────── */

/**
 * 게임이 실제로 트는 것의 명세 — features/world/voice.ts 가 읽는 것과 같은 public 파일이다.
 * 시청과 게임이 다르게 들린 것(2026-08-30)의 주범이 여기 있었다: 클립이 캐스팅표의
 * 한국어 보이스가 아니라 **fallback(영어 기본 보이스)** 으로 구워져 있었다.
 * 그래서 "게임과 같은 소리"의 기준은 cast 가 아니라 이 manifest 다.
 */
export interface GameManifest {
  speakers: Record<string, { voice: { name: string; source: string } | null }>;
  lines: Record<string, { file: string }>;
}

const CLIP_BASE = '/world/voice/';
let gameManifest: Promise<GameManifest | null> | null = null;

export function loadGameManifest(): Promise<GameManifest | null> {
  return (gameManifest ??= fetch(`${CLIP_BASE}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<GameManifest>) : null))
    .catch(() => null));
}

/** manifest 의 줄 열쇠 — 화자|문장 그대로 (voice-lines.mjs 가 굽는 모양과 같아야 한다) */
export function clipKeyOf(id: AuditionRoleId, text: string): string {
  return `${id}|${text}`;
}

/** 이 배역이 게임에서 실제로 쓰는 목소리 — 클립을 아직 안 구운 배역이면 null */
export function gameVoiceOf(m: GameManifest | null, id: AuditionRoleId): { name: string; source: string } | null {
  return m?.speakers[id]?.voice ?? null;
}

/** 이 줄의 구운 클립 파일 — 없으면 null (대사를 고치고 음성을 안 다시 뽑았거나, 범위 밖) */
export function gameClipOf(m: GameManifest | null, id: AuditionRoleId, text: string): string | null {
  return m?.lines[clipKeyOf(id, text)]?.file ?? null;
}

/* ─────────────────────────── 재생 ─────────────────────────── */

/**
 * features/world/voice.ts 의 VOICE_RATE 와 같은 값 — 클립은 게임에서 1.1배로 재생된다
 * (대사가 "너무 늦어 답답하다", 2026-08-30). 시청도 같은 속도로 들어야 같은 소리다.
 * import 하지 못하는 것은 폴더 규칙 때문이다. 저쪽 값이 바뀌면 여기도 바꾼다.
 * 화자별 playRate(cast)가 이긴다 — 저쪽은 manifest 의 playRate 를 읽고, 두 값은 시험이 맞춘다.
 */
const PLAY_RATE = 1.1;

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  return (ctx ??= new AudioContext());
}

/** 같은 (목소리·배역·문장) 은 같은 소리 — 다시 눌러도 크레딧이 안 나가게 받아 둔다 */
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const chains = new Map<AuditionRoleId, AudioNode>();
let source: AudioBufferSourceNode | null = null;
/** 발화 세대 — 받아 오는 사이 다른 버튼이 눌리면 늦게 온 소리는 버린다 */
let generation = 0;

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

/** 배역의 필터 체인 — 한 번 짓고 계속 쓴다 (robot 의 반송파 오실레이터 수명 때문에) */
function chainFor(id: AuditionRoleId): AudioNode {
  const hit = chains.get(id);
  if (hit) return hit;
  const { fx, gain } = SPEAKERS[id];
  const c = audio();
  const out = c.createGain();
  out.gain.value = gain ?? 1;
  out.connect(ceiling(c)).connect(c.destination);

  let input: AudioNode;
  if (fx.preset === 'robot') {
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
    input = out; // 필터 없음 — 사람 배역(과학자·정부요원)이 여기로 온다 (게인과 천장만 지난다)
  }
  chains.set(id, input);
  return input;
}

function fetchBuffer(id: AuditionRoleId, text: string, voiceId: string): Promise<AudioBuffer | null> {
  const key = `${voiceId}|${id}|${text}`;
  let p = buffers.get(key);
  if (!p) {
    p = fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(auditionBody(id, text, voiceId)),
    })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => audio().decodeAudioData(b))
      .catch(() => {
        buffers.delete(key); // 실패는 캐시하지 않는다 — 키를 넣고 다시 누르면 되게
        return null;
      });
    buffers.set(key, p);
  }
  return p;
}

/** 지금 나는 시청 소리를 끊는다 */
export function stopAudition(): void {
  generation += 1;
  try {
    source?.stop();
  } catch {
    /* 이미 끝났다 */
  }
  source = null;
}

/**
 * 후보든 게임 클립이든 소리를 내는 자리는 하나다 — 같은 필터, 같은 1.1배속이어야 A/B 가 성립한다.
 *
 * raw = 필터를 뺀 진단용 ("가벼워진 게 필터 때문인가"를 귀로 가르는 손잡이, 2026-08-30).
 * 사람 배역은 이제 필터가 없어 raw 와 같은 소리다 — 남은 쓸모는 경비 둘이다 (무전기를 걷었다, 2026-09-01).
 * 배속은 raw 에서도 유지한다 — 한 번에 한 변수만 바꿔야 어느 쪽이 소리를 바꿨는지 안다.
 */
async function playBuffer(id: AuditionRoleId, buf: AudioBuffer, raw = false): Promise<void> {
  const c = audio();
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  const src = c.createBufferSource();
  src.buffer = buf;
  const rate = SPEAKERS[id].playRate ?? PLAY_RATE;
  src.playbackRate.value = rate;
  // raw = 필터 끔
  src.connect(raw ? c.destination : chainFor(id));
  src.onended = () => {
    if (source === src) source = null;
    src.disconnect();
  };
  source = src;
  src.start();
}

/**
 * 후보 소리 — 이 배역의 이 줄을, 이 목소리로 실시간 합성해 읽는다. 폴백은 없다 —
 * Web Speech 로 읽어 주면 **다른 목소리를 듣고 고르는 셈**이라, 시청에서는 침묵이 낫다.
 */
export async function speakAudition(
  id: AuditionRoleId,
  text: string,
  voiceId: string,
  raw = false,
): Promise<'played' | 'failed'> {
  stopAudition();
  const mine = generation;
  const buf = await fetchBuffer(id, text, voiceId);
  if (!buf) return 'failed';
  if (mine !== generation) return 'played'; // 받는 사이 다른 버튼이 눌렸다 — 실패가 아니라 취소다
  await playBuffer(id, buf, raw);
  return 'played';
}

/** 구운 클립 파일 — 같은 파일은 한 번만 받는다 (public 정적 파일이라 크레딧은 애초에 없다) */
const clipBuffers = new Map<string, Promise<AudioBuffer | null>>();

function clipBuffer(file: string): Promise<AudioBuffer | null> {
  let p = clipBuffers.get(file);
  if (!p) {
    p = fetch(CLIP_BASE + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => audio().decodeAudioData(b))
      .catch(() => {
        clipBuffers.delete(file);
        return null;
      });
    clipBuffers.set(file, p);
  }
  return p;
}

/**
 * 게임 소리 — 이 줄의 **구운 클립 그대로**를 배역 필터·1.1배속으로 튼다.
 * 게임에서 나는 소리와 정확히 같다(같은 파일·같은 체인). 후보와 같은 줄을 번갈아 누르면 그게 A/B 다.
 */
export async function playGameClip(
  id: AuditionRoleId,
  text: string,
  raw = false,
): Promise<'played' | 'missing' | 'failed'> {
  stopAudition();
  const mine = generation;
  const file = gameClipOf(await loadGameManifest(), id, text);
  if (!file) return 'missing';
  const buf = await clipBuffer(file);
  if (!buf) return 'failed';
  if (mine !== generation) return 'played';
  await playBuffer(id, buf, raw);
  return 'played';
}
