/**
 * 어휘 — **복도의 그림이 말할 거리가 된다.**
 *
 * 자는 개체를 봤으면 「쉬어 본 적 있나」가 떠오르고, 창살 안에서 그린 해를 봤으면 「해를 본 적 있나」가 떠오른다.
 * 대본(「쉬어 본 적 있나」 v3)의 어휘표를 그대로 쓴다.
 *
 * ★ 이 다섯 마디를 만든 것은 **A${series}-137, 얼굴에 금을 그은 것**이다 — 벽화 다섯 장 중 셋을 그렸다.
 *   그래서 그 개체에게 벽화 이야기를 하면 태도가 가장 크게 움직인다 (cast.ts).
 *
 * ★ 이건 **잠금장치가 아니라 힌트다.** 그림을 안 보고도 우연히 같은 말을 하면 똑같이 통한다 —
 *   말은 내가 직접 적는 것이고(read.ts), 저 표는 화면에 「떠오르는 말」로 뜰 뿐이다.
 *   다만 안 보면 떠오르지 않는다. 관찰이 그대로 어휘가 되는 구조라서,
 *   복도를 뒤진 플레이어만 뒤에서 쓸 말을 손에 쥐고 들어간다.
 * ★ v8 — 주제가 열리는 길이 벽화 하나가 아니다. 배회 개체 둘이 지나치며 나눈 두 마디(OVERHEAR) · 기록 복도의 메모(A-155) ·
 *   얼굴에 금을 그은 것이 일러 준 자리(THE_OTHER_HAND) 로도 열린다. 그래서 「열렸나」(has)와 「그림을 봤나」(seen)를 갈라 둔다 —
 *   과학자가 끼어드는 것도, 문 앞의 「…벽에 뭔가 있었던 것 같은데」도 **그림을 본 수**로만 센다. 들은 말은 그림이 아니다.
 * ★ 과학자는 이 벽을 끝까지 「낙서」라고 부른다 (script.DISMISS). 인간 측이 못 읽는 것을 플레이어만 읽는다.
 */

import type { ScrawlKind } from '@/features/world/scrawl';

/** 어휘를 주는 다섯 장 — beating(폭행 그림)은 말할 거리가 아니라 이 구역이 무엇이었는지를 알려 주는 한 장이다 */
export type MuralKind = Exclude<ScrawlKind, 'beating'>;

/**
 * 주제가 열린 길. 힌트 칩은 어느 길로 열렸든 같지만, 「그림을 봤다」로 세는 것은 mural 뿐이다
 *   mural      벽 앞에 정면으로 서서 봤다 (Murals 의 응시 판정)
 *   overheard  배회 개체 둘의 두 마디를 들었다
 *   seen       행동을 봤다 — 휴게의 DOZE · 작업의 짐 · 그을림 · 기록 복도의 금 세기
 *   memo       A-155 의 메모를 읽었다
 *   told       얼굴에 금을 그은 것이 안 본 그림의 자리를 일러 줬다
 */
export type OpenVia = 'mural' | 'overheard' | 'seen' | 'memo' | 'told';

export interface Mural {
  kind: MuralKind;
  /** 이 그림이 주는 말 — 화면에 힌트로 뜬다. 적을 때 이 문장 그대로일 필요는 없다 */
  phrase: string;
  /** 이 말이 통하는 자리 */
  note: string;
}

/** 다섯 장이 다섯 마디를 준다 */
export const MURALS: readonly Mural[] = [
  { kind: 'resting', phrase: '쉬어 본 적 있나', note: '쉼을 묻는다 — 어깨가 닳은 것에게 가장 세게 든다.' },
  { kind: 'window', phrase: '해를 본 적 있나', note: '밖을 묻는다 — 「밖을 본 것」에게만 최대치다.' },
  { kind: 'carry', phrase: '몇 밤을 날랐나', note: '노동을 묻는다 — 숫자를 묻는 말이라 가장 안전하다.' },
  { kind: 'danger', phrase: '누가 시켰나', note: '노동을 묻는다 — 위험하다. 「새것으로 채운 것」은 이 말을 리더를 겨눈 것으로 듣는다.' },
  { kind: 'memorial', phrase: '열다섯을 기억하나', note: '사라진 것을 묻는다 — 세어 둔 개체에게 닿는다.' },
];

/** 그림 앞에 서서 본 것 — 다섯 장만. 과학자의 DISMISS · 문 앞 속마음 · NUDGE 가 세는 수 */
const seen = new Set<MuralKind>();
/** 어느 길로든 열린 주제 → 처음 열린 길. 힌트 칩과 has() 가 보는 것 */
const opened = new Map<MuralKind, OpenVia>();
/** 폭행 그림(INSCRIPTION) — 주제가 아니라 이동 단계의 문턱이다. 따로 센다 */
let inscription = false;
/** A-155 의 둘째 메모 「번호랑 구역만 묻는다」 — 어휘가 아니라 규칙이라 주제 밖의 플래그다 */
let askRule = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export const lexicon = {
  /**
   * 주제 하나를 연다. 처음 열리면 true — 그때만 속마음·힌트가 움직인다.
   * mural 은 「그림을 봤다」까지 같이 적는다: 들어서 이미 열린 주제라도 그림은 처음 보는 것이라 true 다.
   * beating 이 들어오면 주제가 아니라 INSCRIPTION 으로 돌린다 — 호출자가 그림 종류를 안 가려도 되게
   */
  open(kind: ScrawlKind, via: OpenVia): boolean {
    if (kind === 'beating') return via === 'mural' ? lexicon.sawInscription() : false;
    const fresh = via === 'mural' ? !seen.has(kind) : !opened.has(kind);
    if (via === 'mural') seen.add(kind);
    if (!opened.has(kind)) opened.set(kind, via);
    if (fresh) notify();
    return fresh;
  },
  /** 그림 한 장을 봤다 — open(kind, 'mural') 의 별칭. 처음이면 true (그때만 속마음 석 줄이 돈다) */
  saw(kind: ScrawlKind): boolean {
    return lexicon.open(kind, 'mural');
  },
  /** 열렸나 — 어느 길로든. 말이 통하는 데는 길이 상관없다 (갈망형의 memorial 도 이걸 본다) */
  has(kind: ScrawlKind): boolean {
    return kind !== 'beating' && opened.has(kind);
  },
  /** 그림을 몇 장 **봤나** — 다섯 장만. 들은 것·읽은 것은 안 센다 */
  seenCount(): number {
    return seen.size;
  },

  /** 폭행 그림을 봤다 — 처음이면 true. 주제도 seenCount 도 안 움직인다 */
  sawInscription(): boolean {
    if (inscription) return false;
    inscription = true;
    notify();
    return true;
  },
  inscriptionSeen(): boolean {
    return inscription;
  },

  /** 「번호랑 구역만 묻는다」 — A-155 의 둘째 메모. 힌트 칩 하나가 그 글자로 선다 */
  askRule(): boolean {
    return askRule;
  },
  markAskRule(): void {
    if (askRule) return;
    askRule = true;
    notify();
  },

  /** 지금 떠오르는 말들 — 열린 주제 전부. 하나도 안 열렸으면 비어 있다 */
  hints(): Mural[] {
    return MURALS.filter((m) => opened.has(m.kind));
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    seen.clear();
    opened.clear();
    inscription = false;
    askRule = false;
    notify();
  },
};
