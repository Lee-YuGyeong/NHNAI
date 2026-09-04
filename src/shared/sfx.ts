/**
 * UI 효과음 — **누르면 소리가 난다** (2026-08-30 사용자: "방 누르면 철컹! 이런 소리").
 *
 * 파일을 받지 않는다. 전부 WebAudio 로 그 자리에서 합성한다 (features/world/sfx.ts 와 같은 수법:
 * 잡음 한 줌 + 오실레이터 몇 개). 클릭음 하나 때문에 mp3 를 받게 하면 첫 클릭이 늦고,
 * 늦게 나는 클릭음은 안 나는 것만 못하다.
 *
 * ┌─ 소리를 붙이는 규칙 ─────────────────────────────────────────────────────┐
 * │ 화면마다 버튼에 onClick 을 하나씩 달지 않는다 — 다는 걸 잊은 버튼만       │
 * │ 조용해지고, 그게 제일 이상하다. 대신 **한 군데서 위임으로 듣는다**         │
 * │ (shared/UiSfx.tsx). 여기 sfxFor() 가 "눌린 것이 무엇인가"를 보고 소리를    │
 * │ 고르고, 특별한 소리가 필요한 버튼만 `data-sfx="clank"` 처럼 적어 둔다.     │
 * │                                                                          │
 * │ 손끝의 소리와 사건의 소리를 나눈다: 누르는 순간은 click, 그 결과가         │
 * │ **서버에서 돌아올 때** 진짜 소리가 난다 (대기방의 준비·시작·채팅).         │
 * │ 눌렀는데 서버가 안 받아 줬으면 소리도 안 나야 맞다.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 켜고 끄기는 localStorage 'wih:sfx' 한 곳이다 (기본 켜짐). 손잡이는 SfxToggle.
 *
 * ★ **배경음은 없다.** 로비에 깔았다가 지웠다 (2026-08-30 사용자: "걍 없애줘").
 *   공기든 곡이든 오래 켜 두는 소리는 누군가에게는 계속 성가시고, 이 화면에서 소리가
 *   해야 할 일은 **누른 것에 대답하는 것**뿐이다. 되살릴 일이 있으면 8c35dcb 를 되돌린다.
 * AudioContext 는 첫 제스처 뒤에만 소리를 낸다 — 이 소리들은 전부 클릭이 만드는 소리라 늘 그 뒤다.
 * (이 저장소는 소리 내는 모듈마다 제 AudioContext 를 든다 — voice.ts · tts/engine.ts 와 같은 규칙.)
 */

export type SfxName =
  | 'hover'
  | 'click'
  | 'clank'
  | 'open'
  | 'close'
  | 'ready'
  | 'deny'
  | 'talk'
  | 'join'
  | 'leave'
  | 'start'
  | 'beat'
  | 'halt';

/** data-sfx 에 적힌 글자가 진짜 소리 이름인지 보는 데 쓴다 */
const NAMES: readonly string[] = [
  'hover',
  'click',
  'clank',
  'open',
  'close',
  'ready',
  'deny',
  'talk',
  'join',
  'leave',
  'start',
  'beat',
  'halt',
];

/* ═══════════════════════════ 켜고 끄기 ═══════════════════════════ */

const KEY = 'wih:sfx';

/** 기본은 켜짐. 이 소리는 전부 사용자가 누른 뒤에만 나므로 먼저 묻지 않는다 */
export function sfxOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true; // 저장소를 막아 둔 브라우저 — 소리는 나되 설정만 안 남는다
  }
}

export function setSfxOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* 저장이 안 돼도 이번 판에서는 아래 playSfx 가 sfxOn() 을 다시 읽는다 */
  }
}

/* ═══════════════════════════ 소리를 만드는 부품 ═══════════════════════════ */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;

/**
 * 이 모듈의 출력 버스. 마지막에 리미터를 한 겹 둔다 — 클릭이 겹쳐도 찢어지지 않게.
 * 만들 수 없는 환경(jsdom·구형 브라우저)이면 null 이고, 그때는 모든 소리가 조용히 지나간다.
 */
function audio(): GainNode | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      const ceiling = ctx.createDynamicsCompressor();
      ceiling.threshold.value = -10;
      ceiling.knee.value = 8;
      ceiling.ratio.value = 12;
      ceiling.attack.value = 0.002;
      ceiling.release.value = 0.12;
      bus = ctx.createGain();
      bus.gain.value = 0.9;
      bus.connect(ceiling).connect(ctx.destination);
    } catch {
      ctx = null;
      bus = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return bus;
}

/** 잡음 한 줌. shape(0~1) 이 꼬리 모양이다 — 쇳소리의 '치'는 전부 여기서 나온다 */
function noise(c: AudioContext, dur: number, shape: (t: number) => number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * shape(i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

/** 잡음 한 방 — 걸러서 낸다. sweep 이 있으면 그 사이를 훑는다(문이 열리고 닫히는 바람) */
function hit(
  c: AudioContext,
  out: AudioNode,
  o: {
    at?: number;
    dur: number;
    gain: number;
    freq: number;
    sweep?: number;
    q?: number;
    type?: BiquadFilterType;
    shape?: (t: number) => number;
  },
): void {
  const t0 = c.currentTime + 0.005 + (o.at ?? 0);
  const src = noise(c, o.dur, o.shape ?? ((t) => (1 - t) ** 3));
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.sweep !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweep), t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

/** 음 하나. to 가 있으면 glide 동안 그리로 떨어진다(문이 앉는 '컹'의 저역) */
function tone(
  c: AudioContext,
  out: AudioNode,
  o: { at?: number; dur: number; gain: number; from: number; to?: number; glide?: number; type?: OscillatorType },
): void {
  const t0 = c.currentTime + 0.005 + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + (o.glide ?? o.dur));
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

/* ═══════════════════════════ 소리들 ═══════════════════════════ */

/**
 * 이 게임의 소리는 **금속과 격납고**다 (2098년 AI 전용 구역). 밝은 「띵」이 아니라
 * 걸쇠·유압·철판이다 — 로비가 파란 콘솔로 보이는 것과 같은 이유로, 소리도 그 방의 소리여야 한다.
 */
const VOICES: Record<SfxName, (c: AudioContext, out: AudioNode) => void> = {
  /** 지나가는 소리. 목록 위를 훑을 때 줄마다 한 번 — 들릴락 말락 해야 한다 */
  hover: (c, o) => {
    tone(c, o, { from: 2050, to: 2380, dur: 0.03, gain: 0.028, type: 'triangle' });
  },

  /** 누르는 소리. 마르고 짧게 — 여운이 남으면 연달아 누를 때 뭉갠다 */
  click: (c, o) => {
    hit(c, o, { freq: 2600, q: 0.8, dur: 0.035, gain: 0.22, type: 'highpass', shape: (t) => (1 - t) ** 6 });
    tone(c, o, { from: 1250, to: 780, dur: 0.045, gain: 0.055, type: 'square' });
  },

  /**
   * 철컹 — 이 판의 대표음. **방으로 들어가는 소리**다.
   * 두 박자다: 걸쇠가 풀리는 마른 「철」, 0.07초 뒤 문짝이 자리에 앉는 「컹」.
   * 한 방으로 만들면 그냥 쿵이고, 사이가 더 벌어지면 두 소리로 들린다.
   */
  clank: (c, o) => {
    hit(c, o, { freq: 3400, q: 1.2, dur: 0.06, gain: 0.34, shape: (t) => (1 - t) ** 5 });
    tone(c, o, { from: 1870, dur: 0.06, gain: 0.05, type: 'square' });
    tone(c, o, { at: 0.07, from: 118, to: 44, dur: 0.2, gain: 0.55, glide: 0.09 });
    hit(c, o, { at: 0.07, freq: 620, q: 0.7, dur: 0.16, gain: 0.3, type: 'lowpass', shape: (t) => (1 - t) ** 2.2 });
    // 배음 셋이 짧게 운다 — 종이 되지 않게 0.3초 안에 끊는다
    for (const [f, g] of [
      [437, 0.1],
      [611, 0.055],
      [913, 0.032],
    ] as const)
      tone(c, o, { at: 0.07, from: f, dur: 0.28, gain: g, type: 'triangle' });
  },

  /** 판이 열린다 — 바람이 올라간다 (팝업·만들기) */
  open: (c, o) => {
    hit(c, o, { freq: 420, sweep: 2600, q: 1.3, dur: 0.22, gain: 0.16, shape: (t) => Math.sin(Math.PI * t) });
    tone(c, o, { from: 330, to: 880, dur: 0.16, gain: 0.05, type: 'triangle' });
  },

  /** 판이 닫힌다 — 내려간 끝에 딸깍 하고 앉는다 */
  close: (c, o) => {
    hit(c, o, { freq: 2400, sweep: 380, q: 1.3, dur: 0.18, gain: 0.15, shape: (t) => Math.sin(Math.PI * t) });
    hit(c, o, { at: 0.16, freq: 1500, dur: 0.03, gain: 0.16, type: 'highpass', shape: (t) => (1 - t) ** 5 });
  },

  /** 확인 — 준비가 서버에 걸렸을 때. 두 음이 올라간다 */
  ready: (c, o) => {
    tone(c, o, { from: 660, dur: 0.09, gain: 0.12, type: 'triangle' });
    tone(c, o, { at: 0.08, from: 990, dur: 0.13, gain: 0.12, type: 'triangle' });
  },

  /** 막힘 — 방 번호가 틀렸다. 낮게 두 번 튕긴다 */
  deny: (c, o) => {
    tone(c, o, { from: 196, to: 150, dur: 0.09, gain: 0.13, type: 'sawtooth' });
    tone(c, o, { at: 0.1, from: 165, to: 120, dur: 0.13, gain: 0.13, type: 'sawtooth' });
  },

  /** 말 한 줄이 방에 떴다 — 무전기의 짧은 삑 */
  talk: (c, o) => {
    tone(c, o, { from: 880, to: 1180, dur: 0.06, gain: 0.065, type: 'sine' });
    hit(c, o, { freq: 1800, q: 2, dur: 0.05, gain: 0.055 });
  },

  /** 누가 들어왔다 (올라가는 두 음) */
  join: (c, o) => {
    tone(c, o, { from: 620, dur: 0.07, gain: 0.075, type: 'sine' });
    tone(c, o, { at: 0.07, from: 930, dur: 0.09, gain: 0.07, type: 'sine' });
  },

  /** 누가 나갔다 (내려가는 두 음) */
  leave: (c, o) => {
    tone(c, o, { from: 700, dur: 0.07, gain: 0.07, type: 'sine' });
    tone(c, o, { at: 0.07, from: 466, dur: 0.11, gain: 0.07, type: 'sine' });
  },

  /**
   * 박자 신호 · 카운트다운 한 칸 — **때를 알리는 소리**다 (features/arena 의 시행).
   *
   * 1인칭으로 걷는 중에는 화면 맨 위 ● 를 못 본다. 박자 판은 박자를 놓치면 그것으로 끝이라
   * 신호가 눈에만 있으면 판이 성립하지 않는다. 마르고 짧게 — 다섯 번 연달아 나도 뭉치지 않게.
   */
  beat: (c, o) => {
    tone(c, o, { from: 1760, dur: 0.045, gain: 0.09, type: 'triangle' });
    hit(c, o, { freq: 3200, q: 1.4, dur: 0.03, gain: 0.1, type: 'highpass', shape: (t) => (1 - t) ** 6 });
  },

  /** 멈추라는 신호 — 낮게 한 번 내리찍는다. 박자(beat)와 헷갈리면 안 되므로 결이 반대다 */
  halt: (c, o) => {
    tone(c, o, { from: 220, to: 90, dur: 0.22, gain: 0.3, glide: 0.1 });
    hit(c, o, { freq: 520, q: 0.8, dur: 0.18, gain: 0.16, type: 'lowpass', shape: (t) => (1 - t) ** 2.4 });
  },

  /**
   * 격납문이 열린다 — 판이 시작될 때 딱 한 번. 이 소리만 1초 가까이 끈다:
   * 화면이 복도(/world)로 넘어가는 동안 소리가 먼저 가 있어야 "내려간다"가 된다.
   */
  start: (c, o) => {
    tone(c, o, { from: 150, to: 34, dur: 0.75, gain: 0.6, glide: 0.5 });
    hit(c, o, {
      freq: 300,
      sweep: 1200,
      q: 0.6,
      dur: 0.7,
      gain: 0.22,
      type: 'lowpass',
      shape: (t) => Math.sin(Math.PI * t) ** 2,
    });
    for (const [f, g] of [
      [218, 0.095],
      [327, 0.055],
    ] as const)
      tone(c, o, { from: f, dur: 0.8, gain: g, type: 'triangle' });
    hit(c, o, { at: 0.52, freq: 3000, q: 1.2, dur: 0.07, gain: 0.28, shape: (t) => (1 - t) ** 5 });
  },
};

/** 같은 소리가 겹쳐 두 배로 커지는 것을 막는 최소 간격(초) */
const MIN_GAP = 0.04;
const lastAt = new Map<SfxName, number>();

/** 한 번 낸다. 꺼져 있거나 소리를 못 내는 환경이면 조용히 지나간다 — 던지지 않는다 */
export function playSfx(name: SfxName): void {
  if (!sfxOn()) return;
  const out = audio();
  if (!out || !ctx) return;
  const now = ctx.currentTime;
  if (now - (lastAt.get(name) ?? -1) < MIN_GAP) return;
  lastAt.set(name, now);
  try {
    VOICES[name](ctx, out);
  } catch {
    /* 소리가 안 난다고 화면이 멈추면 안 된다 */
  }
}

/* ═══════════════════════════ 무엇이 눌렸나 ═══════════════════════════ */

/** 소리가 나는 것 — **누를 수 있는 것만**이다. 글·입력칸·스크롤은 조용하다 */
const PRESSABLE = 'button, a[href], [role="button"], summary';

/**
 * 이벤트가 닿은 곳에서 위로 올라가 「눌린 것」을 찾는다. 버튼 안의 아이콘(svg)·글자가
 * target 으로 오는 게 보통이라 closest 로 올라가야 한다. 못 누르는 버튼은 null 이다 —
 * 회색 버튼에서 소리가 나면 눌린 줄 안다.
 */
export function pressable(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest(PRESSABLE) : null;
  if (!(el instanceof HTMLElement)) return null;
  if ('disabled' in el && (el as HTMLButtonElement).disabled) return null;
  if (el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

/**
 * 이 조작에 어떤 소리를 낼 것인가. null 이면 소리를 내지 않는다.
 *
 *   data-sfx="clank"  그 버튼만의 소리 (아는 이름이 아니면 그냥 click)
 *   data-sfx="none"   조용히 (효과음 스위치 자신처럼, 소리가 답이 아닌 버튼)
 */
export function sfxFor(target: EventTarget | null, kind: 'press' | 'hover'): SfxName | null {
  const el = pressable(target);
  if (!el) return null;
  const named = el.dataset.sfx;
  if (named === 'none') return null;
  if (kind === 'hover') return 'hover';
  return named !== undefined && NAMES.includes(named) ? (named as SfxName) : 'click';
}
