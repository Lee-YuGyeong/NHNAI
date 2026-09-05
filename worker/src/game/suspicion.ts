/**
 * 의심도 상태머신 — 순수 클래스다. 시각도 소켓도 모른다 (PLANNING §1.2 · P1).
 *
 * **전체 규칙은 docs/SUSPICION.md 에 있다.** 이 파일은 그 문서의 집행부다.
 *
 * 물리 테스트의 어떤 수치도 여기로 자동으로 흘러들지 않는다 — 그 값은 화면에 뜨고, 사람이 그걸 보고
 * 말해야만 눈금이 움직인다. 이 파일에 테스트 결과 타입을 import 하지 않는 것이 그 약속이다.
 *
 * 두 층이 있다 (docs/SUSPICION.md 「두 개의 층」):
 *   · **겨눔(pointing)** — 지금 누가 누구를 겨누고 있나 (실시간 공개). 몰이(2인 이상)와 철회의 근거다.
 *     얹은 만큼 되돌아가므로 회계가 필요하다 (staked).
 *   · **표식(tell)** — 그 사람의 **말·몸 자체**에 붙는 판정. 겨눔도 되돌림도 안 남긴다 —
 *     남이 철회해도 안 걷힌다. read · echo · duck · still · backstep 이 전부 이 층이다.
 *
 * 걸음(SUSPICION, game-protocol.ts):
 *   지목            아무도 안 겨누던 대상을 처음 지목하는 발언 +15
 *   동조            이미 남이 겨누는 대상에 얹는 발언 +10
 *   되풀이          같은 사람이 같은 대상을 다시 말하는 발언 +5 — 혼자서 같은 말로 눈금을 밀 수는 있지만 느리다
 *   몰이            2인 이상이 같은 대상을 겨누는 동안, 발언마다 +4 가산 — 몰이 한 번(episode)에 +16 까지
 *   철회            겨누기를 거두면 **그동안 그 대상에 얹은 만큼** 되돌린다 ("건 만큼 되돌림")
 *   주장 판정       일치 −12 · 불일치 +18 (§4.2)
 *   말 읽기         관리 AI 가 몇 마디를 한 장면으로 읽고 −10 ~ +20 (read)
 *   되풀이 말       자기가 아까 한 말을 다시 친다 +8 (echo) — 거듭할수록 +5 씩
 *   말 회피         불렀는데 대답 없이 넘긴다, 2회째부터 +10 (duck) — 몰린 채면 +5 더
 *   굳음 · 뒷걸음   +5 (still · backstep) — 둘을 합쳐 좌석당 bodyCap(30) 까지만
 *   100             격리 — 눈금이 얼어붙고, 그 사람이 건 지목은 전부 철회된다 (죽은 사람은 몰지 못한다)
 *
 * 위 걸음은 전부 **전반의 크기**다. 후반에는 국면 압력이 곱해진다 (scale · SUSPICION_PRESSURE):
 * 압력은 밖에서 함수로 들어오고(now·rand 와 같은 버릇), 이 클래스는 여전히 시각도 국면도 모른다.
 */

import { SUSPICION } from '../../../src/world/mp/game-protocol';

export interface SuspicionDelta {
  target: string;
  amount: number;
  by: string;
  why: string;
}

/**
 * 같은 사람이 같은 대상을 되풀이하는 발언의 걸음 — 제안값은 3 이었다(§10).
 *
 * 5 로 올렸다 (2026-09-05 "의심도 좀 더 빨리 차게 해줘"). 겨눔은 토론이 바뀌어도 안 지워지므로 2차부터는
 * 지목(15)도 동조(10)도 다시 안 열린다 — 몰이가 붙어 버티는 방에서 **후반 내내 열려 있는 문은 이것뿐**이다.
 * 그 문이 3 이면 셋이 계속 몰아도 토론 하나에 눈금이 열 칸 남짓 오른다.
 */
export const REPEAT_STEP = 5;

/** 표식의 종류 — 말 셋(echo · duck · mention)과 몸 둘(still · backstep). 관리 AI 의 말 읽기(read)는 크기를 밖에서 정하므로 따로다 */
export type TellKind = 'echo' | 'duck' | 'mention' | 'still' | 'backstep';

const TELL_BASE: Record<TellKind, number> = {
  echo: SUSPICION.echo,
  duck: SUSPICION.duck,
  mention: SUSPICION.mention,
  still: SUSPICION.still,
  backstep: SUSPICION.backstep,
};

/** 몸에서 오는 표식 — 이것들만 bodyCap 을 함께 나눠 쓴다 */
const BODY_TELLS: readonly TellKind[] = ['still', 'backstep'];
/** 평평한 표식 — 거듭 걸려도 repeatWeight 를 안 탄다. 거론(⑩)은 「스친 이름」과 「몰리는 이름」을 횟수로 가르는 문이라 걸음이 자라면 안 된다 */
const FLAT_TELLS: readonly TellKind[] = ['mention'];

export class SuspicionBook {
  private readonly value = new Map<string, number>();
  /** 겨누는 사람 → 대상 */
  private readonly pointing = new Map<string, string>();
  /** 겨누는 사람 → 지금 대상에 지금까지 얹은 합 (철회할 때 되돌리는 양) */
  private readonly staked = new Map<string, number>();
  /** 대상별로 이번 몰이 동안 얹은 가산의 합 — 몰이가 풀리면 0 으로 */
  private readonly mobGiven = new Map<string, number>();
  /** `좌석:종류` → 그 좌석이 그 항목에 걸린 횟수. 통과로 안 지워진다 (SUSPICION.repeatWeight) */
  private readonly tellNth = new Map<string, number>();
  /** 좌석 → 몸이 그 좌석에 물린 총량. SUSPICION.bodyCap 에서 멈춘다 */
  private readonly bodyGiven = new Map<string, number>();
  /** 좌석 → 거론(⑩)으로 물린 총량. SUSPICION.mentionCap 에서 멈춘다 */
  private readonly mentionGiven = new Map<string, number>();
  private readonly frozen = new Set<string>();

  /**
   * @param pressure 지금 국면의 압력을 돌려주는 함수 (game-protocol 의 pressureFor). 값이 아니라 함수로 받는 이유:
   *   압력은 국면을 따라 움직이는데 이 책은 판이 열릴 때 한 번 만들어진다 — 값으로 받으면 1차 토론의 압력에 굳는다.
   *   기본값 1 은 시험용이다 (압력을 안 넘기면 예전 그대로 돈다).
   */
  constructor(
    ids: readonly string[],
    private readonly pressure: () => number = () => 1,
  ) {
    for (const id of ids) this.value.set(id, 0);
  }

  /**
   * **올라가는 걸음에 국면 압력을 곱한다** (docs/SUSPICION.md §7).
   *
   * 내려가는 걸음은 안 부른다 — 압력은 「의심이 빨리 쌓인다」는 규칙이지 「해명이 무거워진다」가 아니다.
   * 철회(withdraw)는 특히 안 부른다: 판정이 아니라 회계라서 **얹은 만큼**이 아니면 눈금이 영구히 떠오른다.
   *
   * 부르는 자리가 지키는 것 둘:
   *   · 합친 뒤에 **한 번만** 곱한다 (기본값 + 몰이 가산 + extra) — 따로 곱하면 반올림이 두 번 붙는다.
   *   · 얹기 전에 곱한다 — staked·bodyGiven 은 **곱해진 값**을 세야 되돌림과 상한이 안 어긋난다.
   */
  private scale(amount: number): number {
    if (amount <= 0) return amount;
    return Math.min(SUSPICION.stepCap, Math.round(amount * this.pressure()));
  }

  /**
   * 토론이 새로 열렸다 — **몰이 상한만** 다시 센다 (runtime.openDiscussion).
   *
   * mobGiven 은 여태 「겨누는 사람이 2명 미만이 될 때」만 풀렸다. 그런데 겨눔은 토론이 바뀌어도 안 지워지므로,
   * 한 번 붙은 몰이는 판 전체에 걸쳐 mobCap 을 딱 한 번만 냈다 — 2차 토론 안에 소진되고 나면 후반에
   * 남는 문은 되풀이(REPEAT_STEP) 하나뿐이었다. 버티는 몰이는 토론마다 다시 값을 내야 한다.
   *
   * staked · tellNth · bodyGiven 은 **안 건드린다** — 되돌릴 빚과 누계는 판이 끝날 때까지 남는다.
   */
  newRound(): void {
    this.mobGiven.clear();
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
    // 기본값과 몰이 가산을 **합친 뒤 한 번** 곱한다. mobGiven 은 곱하기 전 단위로 남는다 — 그래야 mobCap 의 뜻이 안 흔들린다
    const amount = this.scale(base + bonus);
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
    /*
     * 클램프가 **먼저**고 압력은 그다음이다. 순서를 뒤집으면 압력이 readMax 에 눌려 통째로 사라진다.
     * 이 순서 덕에 판정기의 프롬프트(agents.readTalk)는 한 자도 안 고친다 — 판정기는 계속 readMin~readMax 한 자로 재고,
     * 다이얼은 판이 돌린다.
     */
    const clamped = Math.round(Math.max(SUSPICION.readMin, Math.min(SUSPICION.readMax, amount)));
    if (clamped === 0) return null;
    const step = this.scale(clamped);
    this.bump(id, step);
    return { target: id, amount: step, by: 'LEADER', why };
  }

  /**
   * 말·몸의 표식 한 걸음 (docs/SUSPICION.md ⑥⑦⑧⑨) — **규칙이 잡는다. LLM 을 안 부른다.**
   *
   * read 와 같은 층이다: 겨눔(pointing)도 되돌림(staked)도 안 남긴다 — 남의 철회로 안 걷히는 값이다.
   *
   * 여기서 지키는 것 둘:
   *   · **누계** — 같은 좌석이 **같은 항목**에 거듭 걸리면 repeatWeight 만큼 무거워진다. 한 번은 실수,
   *     두 번은 우연, 세 번은 정체다. 이 누계는 지워지지 않는다.
   *   · **몸의 상한** — 굳음·뒷걸음이 한 좌석에 물릴 수 있는 총량은 bodyCap 까지다. 몸만으로는 격리 못 시킨다.
   *     자판에서 손을 떼고 돌아왔더니 폐기돼 있으면 그건 게임이 아니다.
   *
   * extra 는 그 자리의 사정으로 더 얹는 양이다 (회피할 때 이미 몰려 있었다 — SUSPICION.duckAccused).
   */
  tell(id: string, kind: TellKind, why: string, extra = 0): SuspicionDelta | null {
    if (!this.value.has(id) || this.frozen.has(id)) return null;
    const key = `${id}:${kind}`;
    const nth = this.tellNth.get(key) ?? 0;
    this.tellNth.set(key, nth + 1);

    // 누계와 extra 까지 합친 뒤 압력을 한 번 — 몸의 상한(bodyCap)은 **곱해진 값**으로 센다:
    // 후반엔 상한에 더 빨리 닿을 뿐, 몸이 물 수 있는 총량 30 은 그대로다
    let amount = this.scale(TELL_BASE[kind] + (FLAT_TELLS.includes(kind) ? 0 : SUSPICION.repeatWeight * nth) + extra);
    if (BODY_TELLS.includes(kind)) {
      const given = this.bodyGiven.get(id) ?? 0;
      amount = Math.max(0, Math.min(amount, SUSPICION.bodyCap - given));
      if (amount === 0) return null; // 이 좌석의 몸은 이미 물릴 만큼 물렸다
      this.bodyGiven.set(id, given + amount);
    }
    if (kind === 'mention') {
      const given = this.mentionGiven.get(id) ?? 0;
      amount = Math.max(0, Math.min(amount, SUSPICION.mentionCap - given));
      if (amount === 0) return null; // 거론으로는 이만큼만 — 이름만으로 격리되지 않는다
      this.mentionGiven.set(id, given + amount);
    }
    this.bump(id, amount);
    return { target: id, amount, by: 'LEADER', why };
  }

  /**
   * 되살린 판의 눈금을 그대로 앉힌다 (runtime.restoreIfNeeded) — **판정이 아니라 복구**다.
   *
   * 그래서 압력도 누계도 안 탄다. 예전엔 저장된 값만큼 judge(mismatch) 를 되풀이해 채웠는데,
   * 그건 걸음 크기(15)와 세는 단위(10)가 어긋나 값이 부풀었고, 국면 압력이 생긴 지금은
   * **되살리는 것만으로 눈금이 배로 뛴다**. 복구에는 복구의 문이 따로 있어야 한다.
   */
  restore(id: string, value: number): void {
    if (!this.value.has(id)) return;
    this.value.set(id, Math.max(0, Math.min(SUSPICION.cut, Math.round(value))));
  }

  /** 그 좌석이 그 항목에 지금까지 몇 번 걸렸나 — 방송 문구가 「세 번째」를 부를 때 쓴다 */
  tellCount(id: string, kind: TellKind): number {
    return this.tellNth.get(`${id}:${kind}`) ?? 0;
  }

  /**
   * 카드 — 지목권 · 진정권 · 답변 강제권의 판정 (game-protocol CARD). 겨눔도 표식도 아닌 **제3의 걸음**이다:
   * 철회로 안 걷히고(겨눔이 아니다), 누계도 상한도 안 탄다(표식이 아니다). 올리는 쪽만 압력을 곱한다.
   */
  boost(id: string, amount: number, by: string, why: string): SuspicionDelta | null {
    if (!this.value.has(id) || this.frozen.has(id) || amount === 0) return null;
    const scaled = amount > 0 ? this.scale(amount) : amount;
    this.bump(id, scaled);
    return { target: id, amount: scaled, by, why };
  }

  /** 관리 AI 의 주장 판정 (§4.2) — 그 사람의 눈금이 움직인다 */
  judge(id: string, verdict: 'match' | 'mismatch' | 'unclear'): SuspicionDelta | null {
    if (!this.value.has(id) || this.frozen.has(id) || verdict === 'unclear') return null;
    // 불일치만 곱한다 — 일치(−12)는 내려가는 걸음이라 압력 밖이다
    const amount = verdict === 'match' ? SUSPICION.claimMatch : this.scale(SUSPICION.claimMismatch);
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
