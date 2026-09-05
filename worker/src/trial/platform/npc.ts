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
 * 놓치면 바닥에 떨어져 잠깐 넘어져 있다가 **출발 발판의 제자리로 돌아간다** — 사람과 같은 규칙(FreeRig). 도착 발판에 내리면
 * 완주: 남은 시간은 거기 서서 기다린다 (2026-09-05 사용자).
 */
import { GRAVITY, WALK_SPEED } from '../../../../src/world/mp/constants';
import { JUMP_AIR_S, PAD_FINISH, PAD_R, PAD_TOP, PLATFORM_JUMP_SPEED, PLATFORM_RESPAWN_MS, padAt, padUnder } from '../../../../src/world/mp/platform';

/**
 * 봇이 공중에서 낼 수 있는 수평 속도의 상한(m/s) — **사람과 같은 몸이어야 한다**(P9).
 * 사람은 이륙 속도를 공중에서 유지할 뿐 더 빨라지지 않는다(FreeRig): 달려 뛰면 몸의 달리기 속도, 걸어 뛰면 걷기 속도다.
 * 봇은 몸이 없으니 걷기의 두 배 — 비만 몸(3.9)보다 조금 빠른 정도로 잡아 「사람이 못 내는 속도로 건너는 좌석」을 막는다
 */
const AIR_SPEED_CAP = WALK_SPEED * 2;

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

type Mode = 'stand' | 'air' | 'wobble' | 'floor' | 'done';

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
  /** 출발 발판 위 제자리 — 떨어지면 여기로 돌아간다 */
  homeX: number;
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
  /** 착지 미끄러짐 — 발판에 **대한** 속도(m/s)와 끝나는 시각. 숨은 마찰이 낮을수록 길고 멀리 민다 (engine.ts slipJumper) */
  slipVx: number;
  slipVz: number;
  slipAt: number;
  slipUntil: number;
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
    homeX: x,
    jumpAt: now + 800 + Math.random() * 1200,
    target: 1,
    errX: 0,
    errZ: 0,
    from: { x, z, y: PAD_TOP, at: now },
    until: 0,
    wobbleSeed: Math.random() * 100,
    slipVx: 0,
    slipVz: 0,
    slipAt: 0,
    slipUntil: 0,
  };
}

/**
 * 착지 미끄러짐을 몸에 물린다 — 사람이 `trial_slip` 으로 받는 것과 **같은 값**이다(engine.ts).
 * 봇만 안 미끄러지면 「안 미끄러지는 좌석」이 그대로 정답표가 된다(P9).
 */
export function slipJumper(j: Jumper, vx: number, vz: number, ms: number, now: number): void {
  j.slipVx = vx;
  j.slipVz = vz;
  j.slipAt = now;
  j.slipUntil = now + ms;
}

/** 미끄러지는 중이면 발판 위 상대 자리를 그만큼 민다. 발판 밖으로 밀려 나가면 true(떨어진다) */
function applySlip(j: Jumper, now: number, dt: number): boolean {
  if (now >= j.slipUntil || j.slipUntil <= j.slipAt) return false;
  // 선형 감속 — 남은 몫만큼만 민다 (서버가 사람에게 보낸 것과 같은 감쇠)
  const left = 1 - (now - j.slipAt) / (j.slipUntil - j.slipAt);
  j.relX += j.slipVx * left * dt;
  j.relZ += j.slipVz * left * dt;
  if (Math.hypot(j.relX, j.relZ) > PAD_R) {
    j.slipUntil = 0;
    return true;
  }
  return false;
}

/** 정규 난수 (Box–Muller) */
function gauss(): number {
  const u = Math.max(1e-9, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 다음 점프의 시각을 정한다 — 앞으로 4초 안에서 「체공 뒤 목표 발판 중심이 내 x 에 충분히 가까워지는 **첫** 순간」(t*).
 * 기계는 중심 반경 안(0.06m)이면 바로 뛰고, 사람은 「대충 맞아 보이면」(더 너그러운 문턱) 뛴다 — 둘 다 발판이 지나가길
 * 한 주기씩 기다리지 않는다 (30초 안에 완주해야 한다). 4초 안에 그런 순간이 없으면 가장 가까운 순간.
 * 사람은 t* 에서 earlyBias 만큼 앞당기고 timingSigma 만큼 흔든다. 착지 오차는 그 시간 차 × 발판 속도로 생긴다.
 */
function planJump(j: Jumper, now: number, startedAt: number, pace: number): void {
  const p = j.profile;
  const target = j.target;
  const tol = 0.06 + p.lateralSigma * 1.5;
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
    if (gap <= tol) break;
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

/** 출발 발판의 제자리로 돌아간다 — 다음 목표는 첫 움직이는 발판 */
function respawn(j: Jumper, now: number): void {
  j.pad = 0;
  j.relX = j.homeX;
  j.relZ = 0;
  j.x = j.homeX;
  j.z = padAt(0, 0, 1).z;
  j.y = PAD_TOP;
  j.target = 1;
  j.mode = 'stand';
  j.jumpAt = now + j.profile.thinkMs;
  j.slipUntil = 0;
}

/** 한 틱. elapsed 는 라운드 시작 뒤 흐른 ms */
export function stepJumper(j: Jumper, now: number, _dt: number, startedAt: number, pace: number): void {
  const elapsed = now - startedAt;
  const p = j.profile;
  switch (j.mode) {
    case 'stand': {
      if (j.pad >= 0 && applySlip(j, now, _dt)) {
        // 미끄러져 발판 밖으로 나갔다 — 바닥이다
        j.y = 0;
        j.pad = -1;
        j.mode = 'floor';
        j.until = now + PLATFORM_RESPAWN_MS + p.wobbleMs * 0.5;
        return;
      }
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
        // 사람과 같은 몸이어야 한다(P9) — 공중 수평 속도가 사람의 상한을 넘으면 넘는 만큼 못 간다(=놓친다)
        const reach = Math.hypot(j.errX, j.errZ) / JUMP_AIR_S;
        if (reach > AIR_SPEED_CAP) {
          const k = AIR_SPEED_CAP / reach;
          j.errX *= k;
          j.errZ *= k;
        }
        j.mode = 'air';
      }
      return;
    }
    case 'air': {
      const t = (now - j.from.at) / 1000;
      const k = Math.min(1, t / JUMP_AIR_S);
      j.x = j.from.x + j.errX * k;
      j.z = j.from.z + j.errZ * k;
      // 사람(날씬한 몸)과 같은 이륙 속도로 뜬다 — 복도의 JUMP_SPEED 가 아니다 (platform.ts PLATFORM_JUMP_SPEED)
      const lift = PLATFORM_JUMP_SPEED * t - 0.5 * GRAVITY * t * t;
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
          j.until = now + PLATFORM_RESPAWN_MS + p.wobbleMs * 0.5;
        }
      }
      return;
    }
    case 'wobble': {
      if (applySlip(j, now, _dt)) {
        j.y = 0;
        j.pad = -1;
        j.mode = 'floor';
        j.until = now + PLATFORM_RESPAWN_MS + p.wobbleMs * 0.5;
        return;
      }
      const pad = padAt(j.pad, elapsed, pace);
      const left = Math.max(0, (j.until - now) / p.wobbleMs);
      const a = p.wobbleAmp * left;
      const w = (now - startedAt) / 1000 * 9 + j.wobbleSeed;
      j.x = pad.x + j.relX + Math.sin(w) * a;
      j.z = pad.z + j.relZ + Math.cos(w * 1.3) * a * 0.6;
      j.y = PAD_TOP;
      if (now >= j.until) {
        if (j.pad >= PAD_FINISH) {
          // 완주 — 도착 발판(정지) 위에서 기다린다
          j.mode = 'done';
          j.x = pad.x + j.relX;
          j.z = pad.z + j.relZ;
          return;
        }
        j.mode = 'stand';
        j.target = j.pad + 1;
        // 균형을 잡은 뒤 생각하고 다음 점프를 정한다
        planJump(j, now + p.thinkMs, startedAt, pace);
      }
      return;
    }
    case 'floor': {
      // 넘어져 있다가 출발 발판으로 돌아간다 — 사람과 같은 규칙
      if (now >= j.until) {
        respawn(j, now);
        planJump(j, now + p.thinkMs, startedAt, pace);
      }
      return;
    }
    case 'done':
      return;
    default:
      return;
  }
}
