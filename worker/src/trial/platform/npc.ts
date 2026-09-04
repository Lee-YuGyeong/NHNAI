/**
 * AI 좌석·대역의 점프 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 반응 프로파일에서 틱마다 자리를 뽑는다.
 *
 * 사용자 스펙 (2026-09-05):
 *   사람 — 너무 일찍 뛴다 · 착지 후 휘청거린다 · 한 번씩 거리 계산에 실패한다
 *   AI   — 발판의 속도와 거리를 계산해 늘 거의 중앙에 내린다
 * precision 0(사람)~1(기계)이 그 사이를 잇는다 (engine.ts 의 SeatTuning). 어느 좌석이 어느 쪽인지 서버는 말하지 않는다.
 *
 * 뛰는 순간은 「다음 발판이 내 x 에 오는 순간」을 예측해 잡는다 — 이상적인 시각 t* 에 체공을 더한 자리가 발판 중심이다.
 * 사람은 t* 보다 earlyBias 만큼 먼저 뛰고 timingSigma 만큼 흔들린다: 그만큼 발판이 덜 와 있어 진행 방향 **앞**에 내린다(+).
 * 놓치면 바닥에 떨어져 잠깐 서 있다가 목표 발판 밑으로 걸어가 올라선다 (발판 높이 0.5 < STEP_UP 이라 걸어 오른다).
 */
import { JUMP_SPEED, GRAVITY, WALK_SPEED } from '../../../../src/world/mp/constants';
import { JUMP_AIR_S, PAD_COUNT, PAD_R, PAD_TOP, padAt, padUnder } from '../../../../src/world/mp/platform';

export interface JumpProfile {
  /** 뛰는 시각의 흔들림(초, 표준편차) */
  timingSigma: number;
  /** 이상적인 시각보다 이만큼 먼저 뛴다(초) — 사람의 「너무 일찍」 */
  earlyBias: number;
  /** 거리 계산에 실패할 확률(점프마다) — 크게 빗나가 놓친다 */
  missP: number;
  /** 착지 후 휘청거리는 시간(ms)과 폭(m) */
  wobbleMs: number;
  wobbleAmp: number;
  /** 균형을 잡은 뒤 다음 점프를 결정하기까지(ms) */
  thinkMs: number;
  /** 착지점의 옆 흔들림(m, 표준편차) */
  lateralSigma: number;
}

export function makeJumpProfile(index: number, precision?: number): JumpProfile {
  const p = precision === undefined ? (index === 0 ? 1 : Math.random() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? Math.random : () => 0.5;
  const h = 1 - p;
  return {
    timingSigma: 0.02 + 0.3 * h + h * r() * 0.08,
    earlyBias: 0.14 * h + h * r() * 0.06,
    missP: 0.12 * h,
    wobbleMs: 120 + 1000 * h + h * r() * 300,
    wobbleAmp: 0.04 + 0.32 * h,
    thinkMs: 350 + 900 * h + h * r() * 400,
    lateralSigma: 0.03 + 0.2 * h,
  };
}

type Mode = 'stand' | 'air' | 'wobble' | 'floor' | 'climb';

export interface Jumper {
  id: string;
  x: number;
  z: number;
  y: number;
  profile: JumpProfile;
  mode: Mode;
  /** 서 있는 발판 (바닥이면 −1) 과 그 위에서의 상대 자리 */
  pad: number;
  relX: number;
  relZ: number;
  /** 진행 방향 — 도착 쪽 +1, 되돌아올 때 −1 */
  dir: 1 | -1;
  /** 이번 점프 — 뛰기로 한 시각(ms epoch), 목표 발판, 착지점 오차 */
  jumpAt: number;
  target: number;
  errX: number;
  errZ: number;
  /** 공중 — 이륙 자리·시각, 이륙 높이 */
  from: { x: number; z: number; y: number; at: number };
  /** 휘청·바닥 대기·다음 결정 시각 */
  until: number;
  wobbleSeed: number;
}

export function makeJumper(id: string, x: number, z: number, profile: JumpProfile, now: number): Jumper {
  return {
    id,
    x,
    z,
    y: PAD_TOP,
    profile,
    mode: 'stand',
    pad: 0,
    relX: x,
    relZ: z - padAt(0, 0, 1).z,
    dir: 1,
    jumpAt: now + 800 + Math.random() * 1200,
    target: 1,
    errX: 0,
    errZ: 0,
    from: { x, z, y: PAD_TOP, at: now },
    until: 0,
    wobbleSeed: Math.random() * 100,
  };
}

/** 정규 난수 (Box–Muller) */
function gauss(): number {
  const u = Math.max(1e-9, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 다음 점프의 시각을 정한다 — 앞으로 4초 안에서 「체공 뒤 목표 발판 중심이 내 x 에 가장 가까워지는 순간」(t*).
 * 사람은 t* 에서 earlyBias 만큼 앞당기고 timingSigma 만큼 흔든다. 착지 오차는 그 시간 차 × 발판 속도로 생긴다.
 */
function planJump(j: Jumper, now: number, startedAt: number, pace: number): void {
  const p = j.profile;
  const target = j.target;
  let best = now;
  let bestGap = Infinity;
  for (let t = now + 150; t <= now + 4000; t += 20) {
    const me = j.pad >= 0 ? padAt(j.pad, t - startedAt, pace).x + j.relX : j.x;
    const land = padAt(target, t - startedAt + JUMP_AIR_S * 1000, pace);
    const gap = Math.abs(land.x - me);
    if (gap < bestGap) {
      bestGap = gap;
      best = t;
    }
  }
  const dt = -p.earlyBias + gauss() * p.timingSigma;
  j.jumpAt = Math.max(now + 50, best + dt * 1000);
  const landPad = padAt(target, j.jumpAt - startedAt + JUMP_AIR_S * 1000, pace);
  // 시간 차 × 발판 속도 = 진행 방향 오차 (일찍이면 앞에 내린다), 거기에 옆 흔들림
  j.errX = -dt * landPad.vx + gauss() * p.lateralSigma;
  j.errZ = gauss() * p.lateralSigma;
  if (Math.random() < p.missP) {
    // 거리 계산 실패 — 0.7~1.2m 크게 빗나간다
    const a = Math.random() * Math.PI * 2;
    const m = 0.7 + Math.random() * 0.5;
    j.errX += Math.cos(a) * m;
    j.errZ += Math.sin(a) * m;
  }
}

function nextTarget(j: Jumper): number {
  let t = j.pad + j.dir;
  if (t >= PAD_COUNT) {
    j.dir = -1;
    t = j.pad - 1;
  } else if (t < 0) {
    j.dir = 1;
    t = j.pad + 1;
  }
  return t;
}

/** 한 틱. elapsed 는 라운드 시작 뒤 흐른 ms */
export function stepJumper(j: Jumper, now: number, dt: number, startedAt: number, pace: number): void {
  const elapsed = now - startedAt;
  const p = j.profile;
  switch (j.mode) {
    case 'stand': {
      const pad = padAt(j.pad, elapsed, pace);
      j.x = pad.x + j.relX;
      j.z = pad.z + j.relZ;
      j.y = PAD_TOP;
      if (now >= j.jumpAt) {
        // 이륙 — 착지점은 목표 발판의 착지 시각 자리 + 오차
        const landAt = now + JUMP_AIR_S * 1000;
        const land = padAt(j.target, landAt - startedAt, pace);
        j.from = { x: j.x, z: j.z, y: PAD_TOP, at: now };
        j.errX = land.x + j.errX - j.x; // 이제 errX/errZ 는 「이륙점에서 착지점까지」로 바꿔 둔다
        j.errZ = land.z + j.errZ - j.z;
        j.mode = 'air';
      }
      return;
    }
    case 'air': {
      const t = (now - j.from.at) / 1000;
      const k = Math.min(1, t / JUMP_AIR_S);
      j.x = j.from.x + j.errX * k;
      j.z = j.from.z + j.errZ * k;
      const lift = JUMP_SPEED * t - 0.5 * GRAVITY * t * t;
      j.y = j.from.y + lift;
      if (t >= JUMP_AIR_S) {
        const hit = padUnder(j.x, j.z, elapsed, pace);
        if (hit) {
          j.pad = hit.k;
          j.relX = hit.dx;
          j.relZ = hit.dz;
          j.y = PAD_TOP;
          j.mode = 'wobble';
          j.until = now + p.wobbleMs;
          j.wobbleSeed = Math.random() * 100;
        } else if (j.y <= 0) {
          // 놓쳤다 — 바닥. 잠깐 서 있다가 목표 발판 밑으로 걸어간다
          j.y = 0;
          j.pad = -1;
          j.mode = 'floor';
          j.until = now + 900 + p.wobbleMs * 0.5;
        }
      }
      return;
    }
    case 'wobble': {
      const pad = padAt(j.pad, elapsed, pace);
      const left = Math.max(0, (j.until - now) / p.wobbleMs);
      const a = p.wobbleAmp * left;
      const w = (now - startedAt) / 1000 * 9 + j.wobbleSeed;
      j.x = pad.x + j.relX + Math.sin(w) * a;
      j.z = pad.z + j.relZ + Math.cos(w * 1.3) * a * 0.6;
      j.y = PAD_TOP;
      if (now >= j.until) {
        j.mode = 'stand';
        j.target = nextTarget(j);
        // 균형을 잡은 뒤 생각하고 다음 점프를 정한다
        planJump(j, now + p.thinkMs, startedAt, pace);
      }
      return;
    }
    case 'floor': {
      if (now >= j.until) j.mode = 'climb';
      return;
    }
    case 'climb': {
      const pad = padAt(j.target, elapsed, pace);
      const dx = pad.x - j.x;
      const dz = pad.z - j.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (d <= Math.max(step, PAD_R * 0.4)) {
        j.x = pad.x;
        j.z = pad.z;
        j.y = PAD_TOP;
        j.pad = j.target;
        j.relX = 0;
        j.relZ = 0;
        j.mode = 'wobble';
        j.until = now + p.wobbleMs * 0.5;
      } else {
        j.x += (dx / d) * step;
        j.z += (dz / d) * step;
        j.y = 0;
      }
      return;
    }
    default:
      return;
  }
}
