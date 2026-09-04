/**
 * 의심도 상태머신 — 순수 클래스다. 시각도 소켓도 모른다 (PLANNING §1.2 · P1).
 *
 * 의심도를 움직이는 것은 **오직 말뿐**이다 — 발언(지목 · 동조 · 철회), 관리 AI 의 주장 판정,
 * 그리고 관리 AI 가 방의 대화를 읽고 내리는 판정(read).
 * 물리 테스트의 어떤 수치도 여기로 자동으로 흘러들지 않는다 — 그 값은 화면에 뜨고, 사람이 그걸 보고
 * 지목해야만 눈금이 움직인다. 이 파일에 테스트 결과 타입을 import 하지 않는 것이 그 약속이다.
 *
 * 두 층이 있다:
 *   · **지목 상태** — 지금 누가 누구를 겨누고 있나 (실시간 공개). 몰이(2인 이상)와 철회의 근거다.
 *   · **발언** — 눈금을 실제로 움직이는 한 걸음. 같은 사람이 같은 대상을 거듭 말해도 매번 걸음이다 (§1.2 "상승도 발언").
 *
 * 걸음(SUSPICION, game-protocol.ts):
 *   지목            아무도 안 겨누던 대상을 처음 지목하는 발언 +8
 *   동조            이미 남이 겨누는 대상에 얹는 발언 +5
 *   되풀이          같은 사람이 같은 대상을 다시 말하는 발언 +3 — 혼자서 같은 말로 눈금을 밀 수는 있지만 느리다
 *   몰이            2인 이상이 같은 대상을 겨누는 동안, 발언마다 +2 가산 — 몰이 한 번(episode)에 +6 까지
 *   철회            겨누기를 거두면 **그동안 그 대상에 얹은 만큼** 되돌린다 ("건 만큼 되돌림")
 *   주장 판정       일치 −10 · 불일치 +10 (§4.2 가 곧 이 트리거다)
 *   말 읽기         관리 AI 가 몇 마디를 한 장면으로 읽고 −8 ~ +12 (read) — 겨눔이 아니라 그 사람의 말에 붙는 값이라 철회로 안 걷힌다
 *   100             격리 — 눈금이 얼어붙고, 그 사람이 건 지목은 전부 철회된다 (죽은 사람은 몰지 못한다)
 */

import { SUSPICION } from '../../../src/world/mp/game-protocol';

export interface SuspicionDelta {
  target: string;
  amount: number;
  by: string;
  why: string;
}

/** 같은 사람이 같은 대상을 되풀이하는 발언의 걸음 — 제안값(§10) */
export const REPEAT_STEP = 3;

export class SuspicionBook {
  private readonly value = new Map<string, number>();
  /** 겨누는 사람 → 대상 */
  private readonly pointing = new Map<string, string>();
  /** 겨누는 사람 → 지금 대상에 지금까지 얹은 합 (철회할 때 되돌리는 양) */
  private readonly staked = new Map<string, number>();
  /** 대상별로 이번 몰이 동안 얹은 가산의 합 — 몰이가 풀리면 0 으로 */
  private readonly mobGiven = new Map<string, number>();
  private readonly frozen = new Set<string>();

  constructor(ids: readonly string[]) {
    for (const id of ids) this.value.set(id, 0);
  }

  get(id: string): number {
    return this.value.get(id) ?? 0;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, v] of this.value) out[id] = v;
    return out;
  }

  accusationsSnapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [by, t] of this.pointing) out[by] = t;
    return out;
  }

  accusersOf(target: string): string[] {
    const out: string[] = [];
    for (const [by, t] of this.pointing) if (t === target) out.push(by);
    return out;
  }

  isFrozen(id: string): boolean {
    return this.frozen.has(id);
  }

  /**
   * by 가 target 을 지목하는 **발언** 하나. 다른 대상을 겨누고 있었으면 먼저 철회된다(그 델타가 앞에 온다).
   * 자기 자신 · 격리된 사람 · 모르는 이름은 거절한다 (빈 배열).
   */
  accuse(by: string, target: string): SuspicionDelta[] {
    if (by === target || !this.value.has(target) || !this.value.has(by)) return [];
    if (this.frozen.has(target) || this.frozen.has(by)) return [];

    const out: SuspicionDelta[] = [];
    const prev = this.pointing.get(by);
    if (prev && prev !== target) out.push(...this.withdraw(by));

    const others = this.accusersOf(target).filter((id) => id !== by);
    const repeating = this.pointing.get(by) === target;
    let base: number;
    let why: string;
    if (repeating) {
      base = REPEAT_STEP;
      why = '되풀이';
    } else if (others.length === 0) {
      base = SUSPICION.accuse;
      why = '지목';
    } else {
      base = SUSPICION.agree;
      why = '동조';
    }
    this.pointing.set(by, target);

    // 몰이 — 이 발언 뒤에 2인 이상이 겨누고 있으면 가산. 몰이 한 번에 상한까지만
    let bonus = 0;
    if (others.length >= 1) {
      const given = this.mobGiven.get(target) ?? 0;
      bonus = Math.max(0, Math.min(SUSPICION.mobPer, SUSPICION.mobCap - given));
      if (bonus > 0) {
        this.mobGiven.set(target, given + bonus);
        why = `${why} · 몰이 +${bonus}`;
      }
    }
    const amount = base + bonus;
    this.staked.set(by, (this.staked.get(by) ?? 0) + amount);
    this.bump(target, amount);
    out.push({ target, amount, by, why });
    return out;
  }

  /** by 의 지목을 거둔다 — 그동안 얹은 만큼 되돌린다. 몰이가 풀리면 그 대상의 몰이 상한도 새로 센다 */
  withdraw(by: string): SuspicionDelta[] {
    const target = this.pointing.get(by);
    if (!target) return [];
    const amount = this.staked.get(by) ?? 0;
    this.pointing.delete(by);
    this.staked.delete(by);
    if (this.accusersOf(target).length < 2) this.mobGiven.delete(target);
    this.bump(target, -amount);
    return [{ target, amount: -amount, by, why: '철회' }];
  }

  /**
   * 관리 AI 가 **말을 읽고** 움직이는 눈금 (2026-09-05 사용자: "AI 가 사람들이 하는 말을 보고 의심도를 올려").
   * 지목처럼 「누가 누구를 겨눈다」가 아니라 그 사람의 **말 자체**에 대한 판정이라, 겨눔(pointing)도
   * 되돌림(staked)도 남기지 않는다 — 철회로 걷히지 않는 값이다. 걸음의 크기는 여기서 상한만 지킨다
   * (SUSPICION.readMin ~ readMax): 판정기가 무슨 숫자를 불러도 판이 한 번에 뒤집히지 않게.
   */
  read(id: string, amount: number, why: string): SuspicionDelta | null {
    if (!this.value.has(id) || this.frozen.has(id)) return null;
    const clamped = Math.round(Math.max(SUSPICION.readMin, Math.min(SUSPICION.readMax, amount)));
    if (clamped === 0) return null;
    this.bump(id, clamped);
    return { target: id, amount: clamped, by: 'LEADER', why };
  }

  /** 관리 AI 의 주장 판정 (§4.2) — 그 사람의 눈금이 움직인다 */
  judge(id: string, verdict: 'match' | 'mismatch' | 'unclear'): SuspicionDelta | null {
    if (!this.value.has(id) || this.frozen.has(id) || verdict === 'unclear') return null;
    const amount = verdict === 'match' ? SUSPICION.claimMatch : SUSPICION.claimMismatch;
    this.bump(id, amount);
    return { target: id, amount, by: 'LEADER', why: verdict === 'match' ? '해명이 기록과 일치' : '해명이 기록과 불일치' };
  }

  /** 격리 — 눈금을 얼리고, 그 사람이 건 지목을 거둔다. 그 사람을 겨누던 지목은 정리만 한다(값은 이미 100 이다) */
  freeze(id: string): SuspicionDelta[] {
    this.frozen.add(id);
    const out = this.withdraw(id);
    for (const [by, t] of [...this.pointing]) {
      if (t !== id) continue;
      this.pointing.delete(by);
      this.staked.delete(by);
    }
    this.mobGiven.delete(id);
    return out;
  }

  /** 100 에 닿은 사람 — 아직 얼지 않은 사람만 */
  overCut(): string[] {
    const out: string[] = [];
    for (const [id, v] of this.value) if (v >= SUSPICION.cut && !this.frozen.has(id)) out.push(id);
    return out;
  }

  private bump(id: string, amount: number): void {
    const next = Math.max(0, Math.min(SUSPICION.cut, (this.value.get(id) ?? 0) + amount));
    this.value.set(id, next);
  }
}
