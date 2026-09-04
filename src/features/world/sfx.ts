/**
 * 효과음 — 파일 없이 WebAudio 로 합성한다. 심장박동(SYNC 글리치) · 굉음(행동 분석 테스트) · 총성(사격·즉결 사격).
 * AudioContext 는 첫 사용자 제스처 뒤에만 소리가 난다 — 월드는 「입장」 클릭·포인터 잠금이 있으니 늘 그 뒤다.
 * 볼륨은 목소리(voice.ts)와 같은 localStorage 'world.voice.volume' 을 따른다.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function volume(): number {
  try {
    const v = localStorage.getItem('world.voice.volume');
    return v === null ? 1 : Math.max(0, Math.min(1, Number(v) || 0));
  } catch {
    return 1;
  }
}

/** 심장박동 두 번 — 낮은 두 번의 쿵. 글리치마다 한 번 */
export function heartbeat(): void {
  const c = context();
  if (!c) return;
  const vol = volume();
  if (vol <= 0) return;
  const t0 = c.currentTime + 0.01;
  for (const [at, gain] of [
    [0, 0.9],
    [0.34, 0.6],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(62, t0 + at);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + at + 0.16);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(gain * vol, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
    osc.connect(g).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.25);
  }
}

/** 굉음 — 금속이 떨어지는 쾅. 잡음 한 방 + 울리는 쇳소리 */
export function metalBang(): void {
  const c = context();
  if (!c) return;
  const vol = volume();
  if (vol <= 0) return;
  const t0 = c.currentTime + 0.01;
  // 잡음
  const len = Math.floor(c.sampleRate * 0.28);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.9 * vol, t0);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  src.connect(lp).connect(ng).connect(c.destination);
  src.start(t0);
  // 쇳소리 — 두 배음이 길게 운다
  for (const [f, g0, dur] of [
    [317, 0.35, 1.4],
    [842, 0.18, 0.9],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(g0 * vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

/* ─────────────────────────────── 총성 재료 ─────────────────────────────── */

/**
 * 큰 소리의 마지막 마디 — 부드러운 포화(WaveShaper)와 리미터. 층을 여럿 겹쳐도 찌그러지지 않으면서 **크게** 들린다.
 * 한 컨텍스트에 하나만 만들어 쓴다.
 */
let bus: AudioNode | null = null;
function master(c: AudioContext): AudioNode {
  if (bus) return bus;
  const shaper = c.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.8);
  }
  shaper.curve = curve;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;
  shaper.connect(limiter).connect(c.destination);
  bus = shaper;
  return bus;
}

/** 잡음 한 방 — dur 초 길이의 버퍼를 (1−t)^shape 로 깎아 필터를 물리고, decay 초에 걸쳐 사라진다 */
function burst(c: AudioContext, out: AudioNode, o: { at: number; dur: number; shape: number; gain: number; decay: number; filter: { type: BiquadFilterType; freq: number; q?: number } }): void {
  const len = Math.max(1, Math.floor(c.sampleRate * o.dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** o.shape;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.filter.type;
  f.frequency.value = o.filter.freq;
  if (o.filter.q !== undefined) f.Q.value = o.filter.q;
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, o.gain), o.at);
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(o.at);
  src.stop(o.at + o.dur + 0.02);
}

/**
 * 총성 — 권총 한 발. **두려울 만큼 세게** (2026-08-31 사용자: "권총 쏘는 것처럼 강렬하게").
 * 네 겹이다: ① 크랙(고역 파열 — 귀를 때린다) ② 펀치(저역 잡음 — 공기가 밀린다) ③ 총구 저역(배를 친다)
 * ④ 슬랩 둘(강판 벽이 되던지는 반사 — 여기가 좁고 단단한 시설이라는 감각). 발마다 음정·세기를 조금씩 흔들어 같은 소리가 반복되지 않게.
 * 합이 1 을 훌쩍 넘으므로 리미터(master)를 통해 나간다 — 찌그러지지 않으면서 크게 들린다.
 */
export function gunshot(): void {
  const c = context();
  if (!c) return;
  const vol = volume();
  if (vol <= 0) return;
  const out = master(c);
  const t0 = c.currentTime + 0.005;
  const j = 0.92 + Math.random() * 0.16;
  // ① 크랙 — 짧고 날카롭게, 고역만
  burst(c, out, { at: t0, dur: 0.1, shape: 7, gain: 1.7 * vol, decay: 0.06, filter: { type: 'bandpass', freq: 2400 * j, q: 0.6 } });
  // ② 펀치 — 저역 잡음이 뒤를 받친다
  burst(c, out, { at: t0, dur: 0.18, shape: 3, gain: 1.2 * vol, decay: 0.13, filter: { type: 'lowpass', freq: 760 * j } });
  // ③ 총구 저역 — 배를 치는 쪽
  const osc = c.createOscillator();
  const og = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(250 * j, t0);
  osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.13);
  og.gain.setValueAtTime(1.15 * vol, t0);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  osc.connect(og).connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.26);
  // ④ 슬랩 — 벽에 맞고 두 번 돌아온다
  burst(c, out, { at: t0 + 0.045, dur: 0.26, shape: 2.2, gain: 0.5 * vol, decay: 0.2, filter: { type: 'lowpass', freq: 1600 } });
  burst(c, out, { at: t0 + 0.115, dur: 0.45, shape: 1.6, gain: 0.3 * vol, decay: 0.36, filter: { type: 'lowpass', freq: 900 } });
}
