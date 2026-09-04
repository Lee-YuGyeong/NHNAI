/**
 * 개체의 **태도** — 이 시나리오가 세계에 대해 기억하는 전부다.
 *
 * 누가 있고 어떻게 생겼고 무엇을 좋아하는지는 cast.ts 가 안다 (외형표가 곧 성격표다).
 * 여기 있는 것은 판이 도는 동안 **변하는 것**뿐이다: 지금 나를 어떻게 대하나, 내 조각을 몇 개 들었나.
 *
 * ★ 태도를 **양쪽으로 연다** (기획서 「어디가 닳았나」). 음수 쪽이 없으면 「적이 된다」가 성립하지 않는다 —
 *   계량기를 새로 만드는 게 아니라 있던 것을 반대로 늘리는 것이다.
 *
 *     −3 앞을 막는다 · −2 보고한다 · −1 피한다 · 0 모른다 · +1 눈을 마주친다 · +2 자리를 비켜 준다 · +3 내 앞에 선다
 *
 * ★ 여전히 **숫자로 안 띄운다.** 개체가 어떻게 서 있는지로만 보인다 —
 *   비켜 주는 개체와 앞을 막는 개체는 눈으로 구별된다.
 * ★ **−3 은 되돌릴 수 없다.** 각 개체마다 넘으면 안 되는 선이 하나씩 있고, 그 선은 그 개체의 이력에서 나온다.
 */

import { CAST, CAST_BY_ID, type CastDef } from './cast';

/** 태도 일곱 단계 */
export type Stage = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export const STAGE_LABEL: Record<Stage, string> = {
  [-3]: '앞을 막는다',
  [-2]: '보고한다',
  [-1]: '피한다',
  0: '모른다',
  1: '눈을 마주친다',
  2: '자리를 비켜 준다',
  3: '내 앞에 선다',
};

export type { CastDef as UnitDef } from './cast';

/**
 * 원장 한 줄 — **왜 그렇게 대했나.** 태도 숫자는 화면에 안 뜨지만, 마지막 방(handover)은 이유를 읽는다.
 * why 는 대본 원문의 이유(「쓸데없는 걸 묻는다」 「내 그림을 봤다」 …)이거나 **플레이어가 친 문장 그대로**다 — 이유를 지어내지 않는다.
 */
export interface LedgerLine {
  delta: number;
  why: string;
  where: string;
  /** performance.now() — 판 안의 순서를 위한 것이지 시계가 아니다 */
  at: number;
}

/** 원장은 최근 넷에 절댓값이 가장 큰 하나를 더한다 — 오래됐어도 가장 세게 움직인 한 줄은 남는다 (대본 「원장」) */
const LEDGER_RECENT = 4;

/** 배역은 cast.ts 하나에만 있다 — 외형과 성격을 따로 관리하지 않는다 */
export const ROSTER: readonly CastDef[] = CAST;

interface UnitState {
  /** −3 … +3. **화면에 숫자로 안 나간다** */
  stage: Stage;
  /** 선을 넘었다 — 되돌릴 수 없다 */
  crossed: boolean;
  /** 내가 이 개체에게 남긴 조각 수 — 재검실의 증인을 고를 때 쓴다 */
  marks: number;
  /** 이 개체에게 말을 건 적이 있나 */
  met: boolean;
  /** 태도가 오른 횟수 — 개체의 대답이 이 수로 갈린다 (voice.up 을 차례로) */
  ups: number;
  /** 같은 태그를 몇 번 되풀이했나 — 세 번 물어야 한 번 답하는 개체가 있다 (persona.repeat) */
  lastTag: string;
  repeats: number;
  /** 동료로 확인됐나 (사람일 때만 켜진다) */
  ally: boolean;
  /** 이유가 붙은 움직임(note) 과 문장 그대로의 기억(remember · delta 0) — 지어낸 이유는 어느 쪽에도 없다 */
  ledger: LedgerLine[];
  /** 위로를 몇 번 받았나 — 갈망형이 세 단계로 열리고, 냉소형이 두 번째부터 되묻는 수 */
  comforts: number;
  /** 나를 위해 나선 적 있다 — 걸음 8 에서 대신 부서질 수 있는 유일한 자격. 태도 3 만으로는 안 찍힌다 (D19) */
  standsFor: boolean;
}

const state = new Map<string, UnitState>();
const listeners = new Set<() => void>();
/** memorial 줄(「…너 그 벽 봤구나.」)은 **한 판에 한 번** — 개체가 아니라 판에 붙는 플래그라 여기 하나다 */
let memorialUsed = false;

function slot(id: string): UnitState {
  let s = state.get(id);
  if (!s) {
    s = { stage: 0, crossed: false, marks: 0, met: false, ups: 0, lastTag: '', repeats: 0, ally: false, ledger: [], comforts: 0, standsFor: false };
    state.set(id, s);
  }
  return s;
}

function notify() {
  for (const fn of listeners) fn();
}

const clampStage = (v: number): Stage => Math.max(-3, Math.min(3, Math.round(v))) as Stage;

/**
 * 되돌아오지 않는 선 — 태도가 여기까지 내려가면 **좋은 말로도 안 오른다** (2026-09-03 사용자).
 * −3(선을 넘음 · crossed)은 그 자리에서 끝나는 것이고, 이 −2 는 「보고한다」의 자리다:
 * 나를 밀고할 개체라 몇 마디 잘한다고 편이 되지 않는다. 내리는 것은 계속 된다 — 더 나빠질 수는 있다.
 */
export const NO_RETURN = -2;

export const units = {
  all(): readonly CastDef[] {
    return ROSTER;
  },
  def(id: string): CastDef | undefined {
    return CAST_BY_ID.get(id);
  },
  label(id: string): string {
    return CAST_BY_ID.get(id)?.label ?? id;
  },

  stage(id: string): Stage {
    return slot(id).stage;
  },
  /** 지금 이 개체는 나를 어떻게 대하나 — 화면에 글자로 나가는 유일한 형태 */
  stageLabel(id: string): string {
    return STAGE_LABEL[slot(id).stage];
  },

  /**
   * 태도를 움직인다. 값은 개체의 성격표가 정하고(cast 의 persona.weight), 여기서는 **한계만** 지킨다:
   * 개체마다 낼 수 있는 위·아래 끝이 다르고(cap), 한 번 선을 넘은 개체는 다시 안 열린다.
   */
  shift(id: string, delta: number): Stage {
    const s = slot(id);
    if (s.crossed || delta === 0) return s.stage;
    // 돌아설 수 없는 자리 — 여기까지 내려간 개체는 아무리 좋은 말을 해도 다시 안 오른다 (NO_RETURN)
    if (delta > 0 && s.stage <= NO_RETURN) return s.stage;
    const cap = CAST_BY_ID.get(id)?.persona.cap;
    const next = clampStage(Math.max(cap?.min ?? -3, Math.min(cap?.max ?? 3, s.stage + delta)));
    if (next > s.stage) s.ups += 1;
    s.stage = next;
    notify();
    return next;
  },

  /**
   * 선을 넘었다 — 그 자리에서 −3 이고 **되돌릴 수 없다.**
   * 이 개체가 무엇 때문에 등을 돌렸는지는 cast 의 persona.line 에 적혀 있다.
   */
  cross(id: string): void {
    const s = slot(id);
    if (s.crossed) return;
    s.crossed = true;
    s.stage = -3;
    notify();
  },

  /**
   * 단계를 **여기까지** 올린다 — 갈망형의 위로가 「태도 단계 1」 「단계 2」로 적혀 있어서다(변화량이 아니라 도달점).
   * 이미 그 위면 안 건드리고, 절대 내리지 않는다. cap 과 선 넘음은 shift 와 똑같이 지킨다.
   *
   * ★ 제약(「shift 는 변화량만 · 절댓값 set 경로 금지」)의 **유일한 예외**다 — 기획서(W4 · affinity 표)가 도달점으로 적은 줄을
   *   그대로 옮긴 것이라 둔다. set 이 아니다: 내리지 못하고, cap 을 못 넘고, 선을 넘은 개체는 안 건드린다.
   *   부르는 곳은 talk 의 위로·memorial 갈래뿐이다. 다른 곳에서 태도를 절댓값으로 놓고 싶으면 여기 오지 말고 shift 를 쓴다
   */
  raiseTo(id: string, stage: number): Stage {
    const s = slot(id);
    if (s.crossed) return s.stage;
    const cap = CAST_BY_ID.get(id)?.persona.cap;
    const next = clampStage(Math.min(cap?.max ?? 3, stage));
    if (next <= s.stage) return s.stage;
    s.ups += 1;
    s.stage = next;
    notify();
    return next;
  },

  /** 원장에 한 줄 — 왜 그렇게 움직였나. delta 0 은 적지 않는다: 움직이지 않은 것은 이유가 없다 */
  note(id: string, delta: number, why: string, where = ''): void {
    if (delta === 0) return;
    slot(id).ledger.push({ delta, why, where, at: performance.now() });
    notify();
  },
  /**
   * 움직이지 않은 말도 **문장 그대로** 한 줄 남긴다 — 경비의 물음에 한 답(openers)처럼, 태도는 안 흔들렸어도
   * 마지막 방이 「내가 뭐라고 했나」를 읽어야 하는 자리다. delta 0 · why 는 플레이어 원문 — 이유를 지어내지 않는다.
   * note 는 여전히 0 을 버린다: 값이 붙은 움직임과 기억을 한 문으로 섞지 않는다
   */
  remember(id: string, text: string, where = ''): void {
    slot(id).ledger.push({ delta: 0, why: text, where, at: performance.now() });
    notify();
  },
  /** 최근 넷 + 절댓값이 가장 큰 하나 — 시간순. 마지막 방이 읽는 것은 이 다섯 줄이 전부다 (remember 의 0 줄도 최근 넷에 든다) */
  ledger(id: string): readonly LedgerLine[] {
    const all = slot(id).ledger;
    const recent = all.slice(-LEDGER_RECENT);
    let peak: LedgerLine | null = null;
    for (const l of all) if (!peak || Math.abs(l.delta) > Math.abs(peak.delta)) peak = l;
    return peak && !recent.includes(peak) ? [peak, ...recent] : recent;
  },

  comforts(id: string): number {
    return slot(id).comforts;
  },
  /** 위로를 하나 더 받았다 — 받은 뒤의 수를 돌려준다 (첫 위로가 1) */
  bumpComfort(id: string): number {
    const s = slot(id);
    s.comforts += 1;
    return s.comforts;
  },

  memorialUsed(): boolean {
    return memorialUsed;
  },
  useMemorial(): void {
    memorialUsed = true;
  },

  standsFor(id: string): boolean {
    return slot(id).standsFor;
  },
  markStandsFor(id: string): void {
    const s = slot(id);
    if (s.standsFor) return;
    s.standsFor = true;
    notify();
  },
  crossed(id: string): boolean {
    return slot(id).crossed;
  },

  /** 태도가 오른 횟수 — 개체가 up 대사를 차례로 꺼내는 데 쓴다 */
  ups(id: string): number {
    return slot(id).ups;
  },

  /**
   * 같은 태그를 되풀이하고 있나 — 「앞이 그은 것」은 세 번을 물어야 한 번 답한다.
   * 되풀이 수를 돌려주고, 태그가 바뀌면 1 부터 다시 센다.
   */
  repeat(id: string, tag: string): number {
    const s = slot(id);
    s.repeats = s.lastTag === tag ? s.repeats + 1 : 1;
    s.lastTag = tag;
    return s.repeats;
  },

  /** 이 개체가 내 조각을 하나 더 들었다 */
  mark(id: string): void {
    slot(id).marks += 1;
    notify();
  },
  marks(id: string): number {
    return slot(id).marks;
  },
  met(id: string): boolean {
    return slot(id).met;
  },
  meet(id: string): void {
    slot(id).met = true;
    notify();
  },

  /** 개체만 — 사람(동료 요원)은 빼고. 마지막 방에서 표를 던지는 것은 개체들이다 */
  onlyUnits(): CastDef[] {
    return ROSTER.filter((u) => !u.agent);
  },
  /** 동료로 확인된 요원들 — 암구호가 통한 상대 */
  allies(): CastDef[] {
    return ROSTER.filter((u) => u.agent && slot(u.id).ally);
  },
  confirmAlly(id: string): void {
    slot(id).ally = true;
    notify();
  },
  isAlly(id: string): boolean {
    return slot(id).ally;
  },

  /** 내 조각을 가장 많이 가진 개체 — 재검실이 증인으로 부르는 그 하나 */
  witness(): CastDef | null {
    let best: { u: CastDef; n: number } | null = null;
    for (const u of ROSTER) {
      const n = slot(u.id).marks;
      if (n > 0 && (!best || n > best.n)) best = { u, n };
    }
    return best?.u ?? null;
  },

  /** 편이 된 개체 · 적이 된 개체 — 마지막 방이 이 둘로 갈린다 */
  friends(): CastDef[] {
    return units.onlyUnits().filter((u) => slot(u.id).stage >= 2);
  },
  enemies(): CastDef[] {
    return units.onlyUnits().filter((u) => slot(u.id).stage <= -2);
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    state.clear();
    memorialUsed = false;
    notify();
  },
};
