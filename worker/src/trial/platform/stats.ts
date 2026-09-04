/**
 * 한 사람의 점프 기록 — 움직이는 플랫폼 (사용자 스펙 2026-09-05).
 *   jumps        뛴 횟수 (공중에 떴다가 내려온 것)
 *   landingRate  착지 성공률 — 발판 위에 내린 비율
 *   centerRate   발판 중앙 착지율 — 내린 것 가운데 중심 PAD_CENTER_R 안
 *   misses       점프 실패 횟수 — 발판을 놓쳐 바닥에 떨어진 것 + 서 있다가 발판에서 떨어진 것
 *   meanOffset   착지점이 발판 중심에서 벗어난 거리 평균(m) — 「거의 중앙」이 여기 보인다
 *   recoveryMs   착지 후 균형 회복 — 내린 뒤 발판에 대해 멈추기까지(ms). 휘청거리면 길다
 *   slipM        착지하고 발이 밀린 거리(m) 평균 — **숨은 조건(발판 윗면 마찰)이 여기로 나온다** (condition.ts PLATFORM_GRIP)
 *   finishMs     도착 발판에 처음 내리기까지(ms). 완주 못 했으면 NaN
 *
 * 바닥에 떨어진 사람은 출발 발판으로 **돌아간다**(클라 FreeRig · 봇 npc.ts, 2026-09-05 사용자). 한 샘플 사이에 PLATFORM_TELEPORT_M 넘게
 * 옮겨진 것이 그것이다 — 뛴 것도 걸은 것도 아니므로 점프로 세지 않고 바닥 높이만 새로 잡는다.
 *
 * 자리는 move(10Hz, x·z·y)로 온다 — 점프는 y 가 서 있던 바닥보다 뜨는 것, 착지는 다시 내려앉는 것으로 읽는다.
 * 발판 자리는 mp/platform.ts 의 같은 함수로 그 시각에 계산한다 (클라와 같은 식). 봇도 같은 sample() 로 센다.
 *
 * **착지 시각은 샘플 시각이 아니라 보간한 시각이다.** 샘플이 100ms 간격인데 발판은 초당 2m(배속 1.7 이면 3.4m)까지
 * 움직여서, 착지를 놓친 만큼 발판이 0.2~0.34m 지나간다 — 「중앙」의 반경(PAD_CENTER_R)이 0.25m 다. 즉 판별의 주축이
 * 통째로 샘플링 오차에 묻혀 있었다. 공중 마지막 샘플과 지상 첫 샘플 사이에서 발이 윗면을 가르는 순간을 보간해,
 * **그 시각의 발판 자리**로 오차를 다시 잰다.
 */
import { GRAVITY } from '../../../../src/world/mp/constants';
import { mean } from '../scoring';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { PAD_CENTER_R, PAD_FINISH, PAD_TOP, PLATFORM_TELEPORT_M, landingSign, padAt, padUnder, type PadHit } from '../../../../src/world/mp/platform';

/** 바닥에서 이만큼 뜨면 점프다 */
const LIFT = 0.12;
/** 착지로 볼 높이 여유 */
const LAND_EPS = 0.06;
/** 발판에 대해 이 속도(m/s) 아래면 멈춘 것 — 두 샘플 연속이면 균형을 잡았다 */
const SETTLED_SPEED = 0.45;
/** 샘플이 이만큼(ms) 끊기면 멈춘 것이다 (클라는 안 움직이면 안 보낸다) */
const STILL_AFTER_MS = 300;
/** 균형 회복 상한(ms) — 그 이상은 그냥 오래 휘청인 것 */
const RECOVERY_CAP_MS = 2500;
/** 마찰 감속에 쓰는 중력가속도 — 물리 상수지 숨겨야 할 조건값이 아니다 */
const G = 9.8;
/**
 * 착지하며 발을 디뎌 **그 자리에서 죽이는** 속도의 몫 = μg × 이 시간(초).
 * 사람은 내리면서 다리로 충격을 받는다 — 미끄러짐은 그러고도 남은 속도만큼이다. 이 값이 없으면 기준 바닥에서도
 * 모든 착지가 미끄러진다
 */
const PLANT_S = 0.35;
/** 미끄러짐이 이보다 길어지지는 않는다(ms) — 한 판이 30초다 */
const SLIP_CAP_MS = 900;
/**
 * 발이 밀리는 거리의 상한(m) — 발판 반지름(0.8)의 여섯 할.
 * 발판은 옆으로 최대 4.8m/s 로 달린다(mp/platform.ts PERIODS·AMPS): 그 위에 내리면 발이 맞춰야 하는 속도가
 * 그만큼 커서, 물리를 그대로 두면 젖은 강판 구간의 **모든** 착지가 발판 밖으로 쓸려 나간다 — 그러면 판별이
 * 아니라 운이다. 신호는 남기고(기준 7cm 대 젖은 50cm) 사형 선고는 안 되게 여기서 자른다
 */
const SLIP_CAP_M = 0.5;
/** 이보다 작은 미끄러짐은 없는 것으로 본다(m/s) */
const SLIP_MIN_V = 0.05;
/** 구간이 바뀐 직후로 보는 창(ms) — 낙하 생존과 같다 */
export const TRANSITION_MS = 5000;

export interface Jump {
  at: number;
  /** 발판 위에 내렸나 */
  landed: boolean;
  /** 발판 중심에서 벗어난 거리(m). 놓쳤으면 NaN */
  offset: number;
  /** 착지하고 발이 밀린 거리(m) — 숨은 마찰이 낮을수록 길다. 놓쳤으면 0 */
  slip: number;
  /** 오차 방향 — +일찍(발판 진행 방향 앞) · −늦게 · 0 정지 발판 */
  sign: number;
  center: boolean;
  pad: number;
}

export interface LandEvent {
  pad: number;
  center: boolean;
  missed: boolean;
  /**
   * 착지 미끄러짐 — 발판에 **대한** 속도로 밀려 나가는 몫. 엔진이 이걸 그 사람에게 보내고(trial_slip),
   * 클라가 제 몸을 그만큼 밀어 준다. 마찰계수 자체는 안 나간다(P8) — 곱셈이 끝난 결과만 나간다
   */
  slip: { vx: number; vz: number; ms: number } | null;
}

export class JumpStats {
  x = 0;
  z = 0;
  y = 0;
  seen = false;
  jumps: Jump[] = [];
  falls = 0;
  private t = 0;
  /** 발이 붙어 있던 바닥 높이 — 0 바닥 · PAD_TOP 발판 */
  private level = 0;
  private air = false;
  /** 직전의 **공중** 샘플 하나 더 — 착지 순간을 풀려면 그때의 수직 속도가 필요하다 (touchdown) */
  private airPrev: { y: number; t: number } | null = null;
  /** 착지 뒤 균형 회복 중 — 발판 번호와 내린 시각, 멈춘 샘플 수 */
  private recovering: { pad: number; at: number; still: number } | null = null;
  private recoveries: number[] = [];
  /** 도착 발판에 처음 내린 시각 */
  private finishedAt = 0;

  constructor(
    private readonly startedAt: number,
    private readonly pace: number,
    /** 그 시각 발판 윗면의 마찰계수 — 숨은 조건(condition.ts PLATFORM_GRIP). 안 주면 미끄러지지 않는 바닥 */
    private readonly muAt: (now: number) => number = () => Number.POSITIVE_INFINITY,
  ) {}

  get at(): number {
    return this.t;
  }

  /** 자리 샘플. onLand 는 착지(또는 실패)한 순간 한 번 */
  sample(x: number, z: number, y: number, now: number, onLand?: (e: LandEvent) => void): void {
    const elapsed = now - this.startedAt;
    const hit = padUnder(x, z, elapsed, this.pace);
    if (!this.seen) {
      this.seen = true;
      this.level = y >= PAD_TOP - 0.1 && hit ? PAD_TOP : 0;
      this.set(x, z, y, now);
      return;
    }
    const dt = Math.max(1, now - this.t) / 1000;

    // 돌아갔다 — 출발 발판으로 옮겨진 것. 공중이었어도 떨어진 뒤의 일이라 그 점프는 이미 닫혔거나(바닥 착지) 닫을 수 없다
    if (Math.hypot(x - this.x, z - this.z) > PLATFORM_TELEPORT_M) {
      if (this.air) {
        // 바닥 샘플 없이 바로 옮겨졌다(빠른 클라) — 놓친 점프로 닫는다
        this.jumps.push({ at: now, landed: false, offset: Number.NaN, slip: 0, sign: 0, center: false, pad: -1 });
        this.air = false;
        onLand?.({ pad: -1, center: false, missed: true, slip: null });
      }
      this.closeRecovery(now);
      this.level = hit && y >= PAD_TOP - LAND_EPS ? PAD_TOP : 0;
      this.set(x, z, y, now);
      return;
    }

    if (!this.air) {
      if (y > this.level + LIFT) {
        // 떴다 — 회복 중이었으면 여기서 끊긴다 (멈추기 전에 다시 뛴 것)
        this.air = true;
        this.airPrev = null;
        this.closeRecovery(now);
      } else if (this.level === PAD_TOP && !hit && y <= LAND_EPS) {
        // 서 있다가 발판에서 떨어졌다 — 뛰지도 않았는데 바닥이다
        this.falls += 1;
        this.level = 0;
        this.closeRecovery(now);
        onLand?.({ pad: -1, center: false, missed: true, slip: null });
      } else {
        if (hit && y >= PAD_TOP - LAND_EPS) this.level = PAD_TOP;
        else if (y <= LAND_EPS) this.level = 0;
        this.trackRecovery(x, z, now, dt);
      }
    } else {
      const descending = y <= this.y + 1e-6;
      // 발이 발판 윗면을 가른 **순간**을 보간한다 — 샘플 시각을 그대로 쓰면 발판이 그 사이 0.2m 넘게 지나간다
      const touch = descending ? this.touchdown(x, z, y, now, PAD_TOP) : null;
      const hitAt = touch ? padUnder(touch.x, touch.z, touch.at - this.startedAt, this.pace) : null;
      if (hitAt && descending && y <= PAD_TOP + LAND_EPS) {
        const center = hitAt.dist <= PAD_CENTER_R;
        const slip = this.slipOf(x, z, now, hitAt, touch!.at);
        this.jumps.push({ at: touch!.at, landed: true, offset: hitAt.dist, slip: slip.dist, sign: landingSign(hitAt), center, pad: hitAt.k });
        this.air = false;
        this.level = PAD_TOP;
        this.recovering = { pad: hitAt.k, at: now, still: 0 };
        if (hitAt.k === PAD_FINISH && this.finishedAt === 0) this.finishedAt = now;
        onLand?.({ pad: hitAt.k, center, missed: false, slip: slip.wire });
      } else if (!hitAt && descending && y <= LAND_EPS) {
        this.jumps.push({ at: now, landed: false, offset: Number.NaN, slip: 0, sign: 0, center: false, pad: -1 });
        this.air = false;
        this.level = 0;
        onLand?.({ pad: -1, center: false, missed: true, slip: null });
      }
    }
    if (this.air) this.airPrev = { y: this.y, t: this.t };
    this.set(x, z, y, now);
  }

  /** 틱마다 — 샘플이 끊긴 사람은 멈춘 것이다 (정지 발판 위에서는 클라가 안 보낸다) */
  settle(now: number): void {
    if (this.recovering && now - this.t > STILL_AFTER_MS) this.closeRecovery(this.t);
  }

  /**
   * 발이 높이 `top` 을 가른 **순간** — 자리와 시각.
   *
   * 착지 샘플의 y 로는 못 푼다: 클라는 땅에 닿는 순간 y 를 바닥 높이로 맞춰 보내므로(FreeRig) 그 값은 늘 `top` 이고,
   * 두 샘플을 선형으로 이으면 교차점이 언제나 「지금」이 되어 보간이 아무 일도 안 한다. 그래서 **직전 공중 구간의
   * 포물선**을 푼다 — 마지막 공중 샘플의 높이 h 와 그 순간의 수직 속도 v₀(그 앞 샘플과의 차)로
   * ½gτ² − v₀τ − h = 0 을 풀면 τ = (v₀ + √(v₀² + 2gh)) / g 다. 중력은 공개값이다(발판 게임의 숨은 값은 마찰이다).
   * 수평은 등속이라 그 비율로 나눈다.
   */
  private touchdown(x: number, z: number, y: number, now: number, top: number): { x: number; z: number; at: number } {
    const span = Math.max(1, now - this.t);
    const h = this.y - top;
    let k: number;
    if (h > 0 && this.airPrev && this.t > this.airPrev.t) {
      const dtPrev = (this.t - this.airPrev.t) / 1000;
      // 두 샘플의 평균 속도는 그 **가운데** 순간의 속도다 — 마지막 샘플의 속도로 쓰려면 반 구간만큼 더 떨어뜨린다
      const v0 = (this.y - this.airPrev.y) / dtPrev - GRAVITY * (dtPrev / 2);
      const tau = (v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * GRAVITY * h))) / GRAVITY;
      k = Math.min(1, Math.max(0, (tau * 1000) / span));
    } else {
      // 공중 샘플이 하나뿐이면 속도를 모른다 — 높이만으로 선형 교차
      k = this.y > y ? Math.min(1, Math.max(0, h / (this.y - y))) : 1;
    }
    return { x: this.x + (x - this.x) * k, z: this.z + (z - this.z) * k, at: this.t + span * k };
  }

  /**
   * 착지 미끄러짐 — **발판에 대한** 착지 속도에서 다리가 받아 낸 몫(μg·PLANT_S)을 빼고 남은 것이 μg 로 감속하며 밀린다.
   * 숨은 마찰(condition.ts PLATFORM_GRIP)이 여기로 나온다. 와이어에는 속도와 지속 시간만 실린다 — μ 는 안 실린다(P8)
   */
  private slipOf(x: number, z: number, now: number, hit: PadHit, at: number): { dist: number; wire: { vx: number; vz: number; ms: number } | null } {
    const dt = Math.max(0.001, (now - this.t) / 1000);
    const vx = (x - this.x) / dt - hit.vx; // 발판도 옆으로 달리고 있다 — 발이 맞춰야 하는 건 그 차이다
    const vz = (z - this.z) / dt;
    const v = Math.hypot(vx, vz);
    const a = this.muAt(at) * G;
    if (!Number.isFinite(a) || a <= 0 || v < 1e-6) return { dist: 0, wire: null };
    const slipV = Math.max(0, v - a * PLANT_S);
    if (slipV < SLIP_MIN_V) return { dist: 0, wire: null };
    // 선형 감속이라 밀린 거리 = slipV × 시간 / 2. 시간을 자르면 거리도 같이 잘린다 — 클라·봇이 보는 값과 어긋나지 않게
    const ms = Math.min(SLIP_CAP_MS, (slipV / a) * 1000, ((2 * SLIP_CAP_M) / slipV) * 1000);
    const dist = (slipV * (ms / 1000)) / 2;
    return { dist, wire: { vx: (vx / v) * slipV, vz: (vz / v) * slipV, ms } };
  }

  private set(x: number, z: number, y: number, now: number): void {
    this.x = x;
    this.z = z;
    this.y = y;
    this.t = now;
  }

  /** 착지 뒤 발판에 대한 상대 속도 — 발판이 움직이니 발판의 이동분을 뺀다 */
  private trackRecovery(x: number, z: number, now: number, dt: number): void {
    const r = this.recovering;
    if (!r) return;
    // 내내 휘청거리면 상한에서 끊는다 — 다음 점프까지 영영 안 멈추는 사람도 기록은 남아야 한다
    if (now - r.at >= RECOVERY_CAP_MS) {
      this.closeRecovery(now);
      return;
    }
    const prevPad = padAt(r.pad, this.t - this.startedAt, this.pace);
    const curPad = padAt(r.pad, now - this.startedAt, this.pace);
    const relX = x - this.x - (curPad.x - prevPad.x);
    const relZ = z - this.z;
    const v = Math.hypot(relX, relZ) / dt;
    if (v < SETTLED_SPEED) {
      r.still += 1;
      if (r.still >= 2) this.closeRecovery(now);
    } else r.still = 0;
  }

  private closeRecovery(now: number): void {
    const r = this.recovering;
    if (!r) return;
    this.recoveries.push(Math.min(RECOVERY_CAP_MS, Math.max(0, now - r.at)));
    this.recovering = null;
  }

  result(id: string, phaseStarts: readonly number[]): TrialPlayerResult {
    const landed = this.jumps.filter((j) => j.landed);
    const offsets = landed.map((j) => j.offset);
    const jumps = this.jumps.length;
    const misses = jumps - landed.length + this.falls;
    // 전환 직후의 어긋남 = **어디에 내렸는가 + 거기서 얼마나 밀렸는가.** 바닥이 바뀐 걸 몸이 몰랐으면 둘 다 커진다(P3)
    const early = landed.filter((j) => phaseStarts.some((p) => j.at >= p && j.at - p <= TRANSITION_MS)).map((j) => j.offset + j.slip);
    const transitionError = early.length ? mean(early) : Number.NaN;
    const slips = landed.map((j) => j.slip);
    return {
      id,
      metrics: {
        jumps,
        landingRate: jumps ? landed.length / jumps : Number.NaN,
        centerRate: landed.length ? landed.filter((j) => j.center).length / landed.length : Number.NaN,
        misses,
        meanOffset: offsets.length ? mean(offsets) : Number.NaN,
        recoveryMs: this.recoveries.length ? mean(this.recoveries) : Number.NaN,
        slipM: slips.length ? mean(slips) : Number.NaN,
        finishMs: this.finishedAt ? this.finishedAt - this.startedAt : Number.NaN,
        transitionError,
      },
      transitionError,
      errorDirection: landed.map((j) => j.sign),
      adaptationCurve: offsets.slice(0, 10),
    };
  }
}
