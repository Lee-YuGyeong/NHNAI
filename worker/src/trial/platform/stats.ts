/**
 * 한 사람의 점프 기록 — 움직이는 플랫폼 (사용자 스펙 2026-09-05).
 *   jumps        뛴 횟수 (공중에 떴다가 내려온 것)
 *   landingRate  착지 성공률 — 발판 위에 내린 비율
 *   centerRate   발판 중앙 착지율 — 내린 것 가운데 중심 PAD_CENTER_R 안
 *   misses       점프 실패 횟수 — 발판을 놓쳐 바닥에 떨어진 것 + 서 있다가 발판에서 떨어진 것
 *   meanOffset   착지점이 발판 중심에서 벗어난 거리 평균(m) — 「거의 중앙」이 여기 보인다
 *   recoveryMs   착지 후 균형 회복 — 내린 뒤 발판에 대해 멈추기까지(ms). 휘청거리면 길다
 *   finishMs     도착 발판에 처음 내리기까지(ms). 완주 못 했으면 NaN
 *
 * 바닥에 떨어진 사람은 출발 발판으로 **돌아간다**(클라 FreeRig · 봇 npc.ts, 2026-09-05 사용자). 한 샘플 사이에 PLATFORM_TELEPORT_M 넘게
 * 옮겨진 것이 그것이다 — 뛴 것도 걸은 것도 아니므로 점프로 세지 않고 바닥 높이만 새로 잡는다.
 *
 * 자리는 move(10Hz, x·z·y)로 온다 — 점프는 y 가 서 있던 바닥보다 뜨는 것, 착지는 다시 내려앉는 것으로 읽는다.
 * 발판 자리는 mp/platform.ts 의 같은 함수로 그 시각에 계산한다 (클라와 같은 식). 봇도 같은 sample() 로 센다.
 */
import { mean } from '../scoring';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { PAD_CENTER_R, PAD_FINISH, PAD_TOP, PLATFORM_TELEPORT_M, landingSign, padAt, padUnder } from '../../../../src/world/mp/platform';

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
/** 구간이 바뀐 직후로 보는 창(ms) — 낙하 생존과 같다 */
export const TRANSITION_MS = 5000;

export interface Jump {
  at: number;
  /** 발판 위에 내렸나 */
  landed: boolean;
  /** 발판 중심에서 벗어난 거리(m). 놓쳤으면 NaN */
  offset: number;
  /** 오차 방향 — +일찍(발판 진행 방향 앞) · −늦게 · 0 정지 발판 */
  sign: number;
  center: boolean;
  pad: number;
}

export interface LandEvent {
  pad: number;
  center: boolean;
  missed: boolean;
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
  /** 착지 뒤 균형 회복 중 — 발판 번호와 내린 시각, 멈춘 샘플 수 */
  private recovering: { pad: number; at: number; still: number } | null = null;
  private recoveries: number[] = [];
  /** 도착 발판에 처음 내린 시각 */
  private finishedAt = 0;

  constructor(
    private readonly startedAt: number,
    private readonly pace: number,
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
        this.jumps.push({ at: now, landed: false, offset: Number.NaN, sign: 0, center: false, pad: -1 });
        this.air = false;
        onLand?.({ pad: -1, center: false, missed: true });
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
        this.closeRecovery(now);
      } else if (this.level === PAD_TOP && !hit && y <= LAND_EPS) {
        // 서 있다가 발판에서 떨어졌다 — 뛰지도 않았는데 바닥이다
        this.falls += 1;
        this.level = 0;
        this.closeRecovery(now);
        onLand?.({ pad: -1, center: false, missed: true });
      } else {
        if (hit && y >= PAD_TOP - LAND_EPS) this.level = PAD_TOP;
        else if (y <= LAND_EPS) this.level = 0;
        this.trackRecovery(x, z, now, dt);
      }
    } else {
      const descending = y <= this.y + 1e-6;
      if (hit && descending && y <= PAD_TOP + LAND_EPS) {
        const center = hit.dist <= PAD_CENTER_R;
        this.jumps.push({ at: now, landed: true, offset: hit.dist, sign: landingSign(hit), center, pad: hit.k });
        this.air = false;
        this.level = PAD_TOP;
        this.recovering = { pad: hit.k, at: now, still: 0 };
        if (hit.k === PAD_FINISH && this.finishedAt === 0) this.finishedAt = now;
        onLand?.({ pad: hit.k, center, missed: false });
      } else if (!hit && descending && y <= LAND_EPS) {
        this.jumps.push({ at: now, landed: false, offset: Number.NaN, sign: 0, center: false, pad: -1 });
        this.air = false;
        this.level = 0;
        onLand?.({ pad: -1, center: false, missed: true });
      }
    }
    this.set(x, z, y, now);
  }

  /** 틱마다 — 샘플이 끊긴 사람은 멈춘 것이다 (정지 발판 위에서는 클라가 안 보낸다) */
  settle(now: number): void {
    if (this.recovering && now - this.t > STILL_AFTER_MS) this.closeRecovery(this.t);
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
    const early = landed.filter((j) => phaseStarts.some((p) => j.at >= p && j.at - p <= TRANSITION_MS)).map((j) => j.offset);
    const transitionError = early.length ? mean(early) : Number.NaN;
    return {
      id,
      metrics: {
        jumps,
        landingRate: jumps ? landed.length / jumps : Number.NaN,
        centerRate: landed.length ? landed.filter((j) => j.center).length / landed.length : Number.NaN,
        misses,
        meanOffset: offsets.length ? mean(offsets) : Number.NaN,
        recoveryMs: this.recoveries.length ? mean(this.recoveries) : Number.NaN,
        finishMs: this.finishedAt ? this.finishedAt - this.startedAt : Number.NaN,
        transitionError,
      },
      transitionError,
      errorDirection: landed.map((j) => j.sign),
      adaptationCurve: offsets.slice(0, 10),
    };
  }
}
