/**
 * 한 사람의 회피 기록 — 사용자 스펙의 넷을 센다.
 *   survivalTime      첫 피격까지의 시간(안 맞으면 라운드 길이) — "맞아도 계속"이라 이것만이 사람을 가른다
 *   hitCount          맞은 횟수
 *   unnecessaryMoves  **나를 향해 떨어지는 게 없는데** 움직이기 시작한 횟수 — 놀라서 크게 피하거나 엉뚱한 쪽으로 간 것
 *   minDistanceAvoid  나를 향해 떨어진 물체의 착지 순간, 내 몸과 낙하 지점의 거리 평균 — "딱 20cm 만 벗어난다"가 여기 보인다
 *
 * 실제 사람의 위치는 move 메시지(10Hz, 바뀔 때만)로, AI 는 서버 적분으로 들어온다 — 같은 sample() 로 센다.
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';
import { HIT_R, THREAT_R, horizontalDist, type FallObject } from './sim';

/** 이 속도(m/s)를 넘으면 "움직인다". 걷기(2.6)의 1/4 — 제자리 흔들림은 안 센다 */
const MOVE_SPEED_MIN = 0.6;
/** 샘플이 이만큼(ms) 끊기면 멈춘 것으로 본다 (클라는 안 움직이면 안 보낸다) */
const STILL_AFTER_MS = 300;
/** 조건 전환 직후로 보는 구간(ms) — 새 중력에 아직 적응 못 한 회피들 */
export const TRANSITION_MS = 5000;
/** 이보다 멀리 벗어나면 "크게 피했다"(+), 아니면 "딱 필요한 만큼"(−) — 오차 방향의 정의 */
const OVER_DODGE_M = HIT_R + 0.7;

interface Threat {
  x: number;
  z: number;
  avoid: number | null;
  at: number;
}

export class DodgeStats {
  x: number;
  z: number;
  /** 실제 샘플이 한 번이라도 들어왔나 — 처음 자리는 자리 표시일 뿐이다 */
  seen = false;
  private t: number;
  private moving = false;
  private firstHitAt: number | null = null;
  private hits = 0;
  private unnecessary = 0;
  private hitBy = new Set<number>();
  private threats = new Map<number, Threat>();

  constructor(x: number, z: number, now: number) {
    this.x = x;
    this.z = z;
    this.t = now;
  }

  /**
   * 위치 샘플. threatened(x, z) 는 "그 자리로 지금 떨어지는 게 있는가" — 움직이기 시작한 순간 그게 없으면 불필요한 이동이다
   */
  get at(): number {
    return this.t;
  }

  sample(x: number, z: number, now: number, threatened: (px: number, pz: number) => boolean): void {
    if (!this.seen) {
      // 첫 샘플은 자리 표시(0,0)에서 오는 것 — 이동으로 세면 안 된다
      this.seen = true;
      this.x = x;
      this.z = z;
      this.t = now;
      return;
    }
    const dt = (now - this.t) / 1000;
    const speed = dt > 0 ? horizontalDist(x, z, this.x, this.z) / dt : 0;
    const movingNow = speed > MOVE_SPEED_MIN;
    if (movingNow && !this.moving && !threatened(this.x, this.z)) this.unnecessary += 1;
    this.moving = movingNow;
    this.x = x;
    this.z = z;
    this.t = now;
  }

  /** 틱마다 — 샘플이 끊긴 사람은 멈춘 것이다 */
  settle(now: number): void {
    if (this.moving && now - this.t > STILL_AFTER_MS) this.moving = false;
  }

  /** 새 물체가 떨어지기 시작했다 — 내 자리로 오는 것이면 위협으로 적어 둔다 */
  registerThreat(o: FallObject): void {
    if (!this.seen) return; // 아직 자리를 모른다
    if (horizontalDist(o.x, o.z, this.x, this.z) < THREAT_R) this.threats.set(o.id, { x: o.x, z: o.z, avoid: null, at: 0 });
  }

  /** 물체가 착지했다 — 위협이었으면 그 순간 얼마나 벗어나 있었는지 잰다 */
  onLanded(o: FallObject, now: number): void {
    const t = this.threats.get(o.id);
    if (!t || t.avoid !== null) return;
    t.avoid = horizontalDist(t.x, t.z, this.x, this.z);
    t.at = now;
  }

  onHit(o: FallObject, now: number): boolean {
    if (this.hitBy.has(o.id)) return false;
    this.hitBy.add(o.id);
    this.hits += 1;
    if (this.firstHitAt === null) this.firstHitAt = now;
    return true;
  }

  result(id: string, roundStart: number, roundEnd: number): TrialPlayerResult {
    const landed = [...this.threats.values()].filter((t): t is Threat & { avoid: number } => t.avoid !== null).sort((a, b) => a.at - b.at);
    const avoid = landed.map((t) => t.avoid);
    const early = landed.filter((t) => t.at - roundStart <= TRANSITION_MS).map((t) => t.avoid);
    const transitionError = early.length ? mean(early) : Number.NaN;
    return {
      id,
      metrics: {
        survivalTime: ((this.firstHitAt ?? roundEnd) - roundStart) / 1000,
        hitCount: this.hits,
        unnecessaryMoves: this.unnecessary,
        minDistanceAvoid: avoid.length ? mean(avoid) : Number.NaN,
        transitionError,
      },
      transitionError,
      errorDirection: avoid.map((d) => (d > OVER_DODGE_M ? 1 : -1)),
      adaptationCurve: avoid.slice(0, 5),
    };
  }
}
