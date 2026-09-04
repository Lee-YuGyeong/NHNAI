/**
 * 말 걸기 — **선택지가 없는데도 갈래가 생기는 자리.**
 *
 * 플레이어는 아무 말이나 친다. 그 말에서 태그 하나만 뽑고(read.ts), **그 태그를 개체의 성격 종류가 받는다**
 * (cast.ts 의 persona.kind · reaction.ts). 그래서 같은 한 마디가 하나에게는 편이 되고 하나에게는 적이 된다:
 *
 *   「쉬어 본 적 있어?」 → 위로
 *     어깨가 닳은 것 · 갈망      「…….」 「…왜 그런 걸 물어?」— 세 번째에 태도 2
 *     고치지 않은 것 · 냉소      −1 「쓸데없는 걸 묻는다」 · 의심 +6
 *     새것으로 채운 것 · 신봉    「…그거 좀 이상한데.」 「그거 보고할게.」— 리더에게 조각이 간다
 *     동료 요원                  「…그거, 벽에 있던 말인데.」— 완전 고정
 *
 * 먼저 거는 게 공짜면 모두에게 다 물어본다. 값이 셋 붙어야 선택이 된다 —
 *   시간   한 마디가 한 박자다
 *   노출   말을 건 개체의 기억에 내 조각이 하나 더 생긴다 (fragments)
 *   의심   AI 개체는 원래 먼저 말을 걸지 않는다. **거는 행위 자체가 이미 조금 인간적이다**
 *
 * ★ 판정이 아니라 **단가표**다. 모델을 안 부른다. 반응의 종류(Reaction)도 규칙이 고른다 — 차례가 곧 우선순위다.
 * ★ 대답은 전부 기획서·배역 문서의 인용이다 (cast.voice). 개체는 지어낸 말을 하지 않는다.
 * ★ 원장(units.note)에 남는 이유는 대본 원문의 이유 문자열이거나 **플레이어가 친 문장 그대로**다. 이유를 지어내지 않는다.
 */

import { suspicion } from '@/world/mp/suspicion';

import { alert, type Threshold } from './alert';
import { fragments, type Fragment } from './fragments';
import { lexicon } from './lexicon';
import { exactMural, read, resetClaims, toFragmentText, type Reading, type Tag } from './read';
import type { Reaction, VoiceTable } from './reaction';
import { BLANK_ANSWER } from './script';
import { units } from './units';

/* ─────────────────────────────── 단가표 ─────────────────────────────── */

/** 말을 걸었다 — 종류를 가리지 않는 고정 비용. 「먼저 말을 걸었다」 그 자체의 값이다 */
const BASE = 3;
/**
 * 사람만 하는 물음 — 쉼 · 밖 · 사라진 것 · 몸 · 그림. 의심이 오르는 만큼 정확히 같이 오른다.
 * 같은 다섯이 **암구호**다: AI 가 절대 하지 않는 말이라, 동료를 찾는 행위가 이 게임에서 가장 위험한 행위가 된다
 */
export const SIGN_TAGS: readonly Tag[] = ['rest', 'outside', 'lost', 'body', 'mural'];
const HUMAN = 3;
/** 적대적으로 굴었다. 검문이 아니라 즉결은 없지만, AI 개체는 이렇게 말하지 않는다 */
const HOSTILE = 15;
/** 리더에게 넘어갔다 — 대본의 「리더에게 직행 · 경보도 +12」 */
const REPORTED_ALERT = 12;
const TALK_ALERT = 1;
/** 한 마디의 의심 값 상한 — 헌법 13 「의심도 단일 증가 ≤ 25」. 적대 + 흔들림 + 사람 물음이 겹쳐도 여기서 멈춘다 */
const PRICE_MAX = 25;
/** 갈망형의 첫 위로 — 「…….」 앞의 멈칫 (D28: 문서에 없는 타이밍 중 유일하게 적힌 값) */
const COMFORT_PAUSE_MS = 400;

/* ─────────────────────────────── 원장 이유 (v7 원문) ─────────────────────────────── */

const WHY_USELESS = '쓸데없는 걸 묻는다';
const WHY_SAW_MURAL = '내 그림을 봤다';
const WHY_SAW_EXACT = '제대로 봤다';
const WHY_DISMISSED = '내 그림을 아무것도 아니라 했다';

/* ─────────────────────────────── 결과 ─────────────────────────────── */

export interface TalkResult {
  /** 개체가 한 마디. 침묵도 대답이다 */
  reply: string[];
  /** 어느 갈래로 갔나 — 화면·연출(scenario2)이 이 이름으로 뒤를 잇는다 (동료 표시 · 조각) */
  reaction: Reaction;
  /** 대답 앞에 더 멈칫하는 시간 — 갈망형의 첫 위로만 0 이 아니다 */
  pauseMs: number;
  /** 태도가 얼마나 움직였나 — **화면에는 안 나간다.** 개체가 어떻게 서 있는지로만 보인다 */
  delta: number;
  /** 선을 넘었다 — 되돌릴 수 없다 */
  crossed: boolean;
  /** 리더에게 보고가 갔나 — 조각이 리더의 손에 들어갔다 */
  reported: boolean;
  fragment: Fragment | null;
  tag: Tag;
  cost: { suspicion: number; alert: number };
  /** 이 한 마디로 경보도가 새로 넘은 문턱 — 방송은 scenario2 가 튼다 (talk 은 올리기만 하고, 문턱은 여기로 돌려준다) */
  alertHit: Threshold | null;
  /**
   * **대본표에 이 개체의 줄이 없었다** — 기본값(voice.flat, 대개 「…….」)으로 떨어진 대답이다.
   * 열둘 중 여덟이 up 줄조차 없어서, 태도는 올라갔는데 화면에는 「…….」만 나오고 있었다 (2026-09-03 사용자).
   * 이 자리에서만 모델이 문장을 짓는다 (features/world2/say.ts) — 기획서에 적힌 대답은 표가 이긴다.
   * 동료 확인(sign · signAgain)도 예외가 아니다 — 문장은 전부 모델이 짓고 표는 마지막 줄이다 (2026-09-03 사용자)
   */
  generic: boolean;
}

/** 이 말의 의심·경보 값 — **보내기 전에** 화면이 보여 준다 (Hud2 의 값 표시 줄) */
export function preview(text: string): { suspicion: number; alert: number; tag: Tag } {
  const t = text.trim();
  if (!t) return { suspicion: 0, alert: 0, tag: 'none' };
  const r = read(t);
  return { suspicion: priceOf(r), alert: TALK_ALERT, tag: r.tag };
}

function priceOf(r: Reading): number {
  return Math.min(PRICE_MAX, BASE + r.wobble + (r.tag === 'cross' ? HOSTILE : 0) + (SIGN_TAGS.includes(r.tag) ? HUMAN : 0));
}

/** 한 갈래가 정한 것 — 대답 · 종류 · 값. 비용·조각·원장은 finish 가 똑같이 치른다 */
interface Branch {
  reaction: Reaction;
  reply: readonly string[] | undefined;
  /** 태도 변화량 — 도달점으로 올리는 갈래(갈망형)는 raiseTo 뒤의 실제 이동량을 넣는다 */
  delta: number;
  /** 원장에 남길 이유 — 없으면 플레이어 문장 원문 */
  why?: string;
  crossed?: boolean;
  reported?: boolean;
  pauseMs?: number;
  /** 표에 이 개체의 줄이 없어 기본값(voice.flat · 「…….」)으로 떨어졌다 — say() 가 채운다 */
  generic?: boolean;
}

const lines = (v: readonly string[] | undefined, fallback: string = BLANK_ANSWER): string[] => (v && v.length > 0 ? [...v] : [fallback]);

export const talk = {
  preview,

  /**
   * 한 마디 건다. `text` 는 플레이어가 그 자리에서 친 문장이다.
   * `witnesses` 는 그 자리에 있던 개체들 — 조각은 그들에게만 남는다.
   */
  say(unitId: string, text: string, witnesses: readonly string[], where: string): TalkResult {
    const def = units.def(unitId);
    const r = read(text);
    const first = !units.met(unitId);
    units.meet(unitId);

    const kind = def?.persona.kind;
    const voice: VoiceTable = def?.voice ?? { flat: [] };
    const sign = SIGN_TAGS.includes(r.tag);
    const before = units.stage(unitId);
    const alreadyCrossed = units.crossed(unitId);

    let b: Branch;

    if (kind === 'agent' && sign) {
      /*
       * 동료 확인 — 완전 고정 대사다. 모델이 죽어도 이것만은 반드시 된다.
       * 확인 신호는 「AI 가 절대 하지 않는 말」이고, 그건 사람만 하는 물음의 태그다 — 정확히 벽화가 가르쳐 준 위로다.
       */
      if (!units.isAlly(unitId)) {
        units.confirmAlly(unitId);
        b = { reaction: 'sign', reply: voice.sign, delta: 0 };
      } else {
        b = { reaction: 'signAgain', reply: voice.signAgain, delta: 0 };
      }
    } else if (kind === 'curious' && r.tag === 'dismiss') {
      // 그림을 깎아내렸다 — 과학자가 하는 그 말이다. 그 자리에서 −3 이고 되돌릴 수 없다
      units.cross(unitId);
      b = { reaction: 'dismiss', reply: voice.dismiss, delta: units.stage(unitId) - before, why: WHY_DISMISSED, crossed: !alreadyCrossed, reported: !alreadyCrossed };
    } else if (r.tag === 'cross' || (def?.persona.line?.tag === r.tag && !alreadyCrossed)) {
      /*
       * 선을 넘었나 — 그 자리에서 −3 이고 **되돌릴 수 없다.** 개체마다 선이 다르고 그 선은 이력에서 나온다
       * (cast 의 persona.line). 「선을 넘는다」(위협 · 정체를 밝힘)만은 개체를 안 가린다: 누구에게 해도 끝이다.
       * 등을 돌린 개체는 보고한다 (배역 문서 「보고한다 = 신봉형 · 또는 태도 −3」)
       */
      units.cross(unitId);
      b = { reaction: 'down', reply: voice.down, delta: units.stage(unitId) - before, crossed: !alreadyCrossed, reported: !alreadyCrossed };
    } else if (kind === 'devout' && (sign || r.tag === 'labor')) {
      // 신봉 — 암구호·위로·노동은 전부 「좀 이상한」 말이다. 리더에게 직행 · 경보도 +12 · 태도 −2
      b = { reaction: 'report', reply: voice.report, delta: units.shift(unitId, -2) - before, reported: true };
    } else if (kind === 'yearn' && r.tag === 'lost' && lexicon.has('memorial') && !units.memorialUsed()) {
      // 「…너 그 벽 봤구나.」— 태도 3 · 한 판에 한 번. 벽을 본 뒤에만 이 말이 닿는다
      units.useMemorial();
      b = { reaction: 'memorial', reply: voice.memorial, delta: units.raiseTo(unitId, 3) - before };
    } else if (kind === 'yearn' && sign) {
      // 갈망 — 위로가 세 단계로 연다: 1 「…….」 멈칫 · 2 단계 1 · 3 단계 2. 변화량이 아니라 도달점이다 (affinity 표)
      const n = units.bumpComfort(unitId);
      const step = Math.min(n, voice.comfort?.length ?? 0) - 1;
      const reply = step >= 0 ? voice.comfort?.[step] : undefined;
      if (n === 1) b = { reaction: 'comfort', reply, delta: 0, pauseMs: COMFORT_PAUSE_MS };
      else b = { reaction: 'comfort', reply, delta: units.raiseTo(unitId, n === 2 ? 1 : 2) - before };
    } else if (first && voice.greet) {
      // 먼저 말을 걸면 — 「어. 뭐 필요해?」 첫 대화에만, 태그를 가리지 않는다. 문서 순서가 이것이다:
      // 「먼저 말을 걸면」 → 「내 사정을 물어 주면」(−1) → 「한 번 더 걸면」. 그래서 냉소형의 위로 분기보다 앞에 선다 —
      // 첫 접촉이 위로여도 저 한마디로 받고, 위로 수(comforts)는 세지 않는다. 값은 여느 말과 똑같이 치른다
      b = { reaction: 'greet', reply: voice.greet, delta: 0 };
    } else if (kind === 'cynic' && sign) {
      // 냉소 — (첫 접촉 뒤의) 첫 위로는 −1 「쓸데없는 걸 묻는다」. 그다음부터는 되묻는다 (「너 어느 구역이야?」) — 조각만 남는다
      const n = units.bumpComfort(unitId);
      if (n === 1) b = { reaction: 'comfort', reply: voice.comfort?.[0], delta: units.shift(unitId, -1) - before, why: WHY_USELESS };
      else b = { reaction: 'comfort', reply: voice.comfort?.[1] ?? voice.comfort?.[0], delta: 0 };
    } else if (kind === 'curious' && r.tag === 'mural') {
      // 벽 얘기 — 그린 개체에게만 뜻이 있다. 어느 그림인지 짚으면 +3, 봤다고만 하면 +2
      if (exactMural(text)) b = { reaction: 'muralExact', reply: voice.muralExact, delta: units.shift(unitId, 3) - before, why: WHY_SAW_EXACT };
      else b = { reaction: 'mural', reply: voice.mural, delta: units.shift(unitId, 2) - before, why: WHY_SAW_MURAL };
    } else if (r.tag === 'work' && voice.work) {
      // 업무 질문(번호 · 구역 · 경로) — 「아, 그거? 알려줄게.」 태도 0
      b = { reaction: 'work', reply: voice.work, delta: 0 };
    } else {
      b = weigh(unitId, r, voice, before);
    }

    /*
     * 이 대답이 **그 개체의 줄인가, 아무나 쓰는 기본값인가.** 기본값이면 화면이 모델에게 「쪽지 없이」 맡기고,
     * 그 개체의 줄이면 그 줄을 쪽지로 얹어 맡긴다 (scenario2 의 voiceReply). 어느 쪽이든 화면에 나가는 문장은 모델의 것이다
     */
    b.generic = !b.reply || b.reply.length === 0 || b.reply === voice.flat;

    const moved = b.delta;
    if (moved !== 0) units.note(unitId, moved, b.why ?? text, where);

    return finish(unitId, text, r, witnesses, where, b);
  },

  reset(): void {
    resetClaims();
  },
};

/**
 * 단가표 — 성격표가 이 태그에 매기는 값. 안 적힌 태그는 0 — 「변화 없음」도 결과다.
 * 대답은 byTag 가 있으면 그것, 없으면 오른 횟수대로 up · 내리면 down · 그대로면 flat.
 */
function weigh(unitId: string, r: Reading, voice: VoiceTable, before: number): Branch {
  const def = units.def(unitId);
  let delta = def?.persona.weight[r.tag] ?? 0;

  /*
   * 「앞이 그은 것」— 세 번을 물어야 한 번 답한다. 같은 태그를 그만큼 되풀이해야 값이 한 번에 붙는다.
   * 되풀이가 성의가 되는 유일한 개체다. **양수에만** 건다 — 가시(음수)는 되풀이를 기다리지 않는다 (G21)
   */
  const need = def?.persona.repeat ?? 0;
  if (need > 0 && delta > 0) {
    const n = units.repeat(unitId, r.tag);
    delta = n % need === 0 ? delta * need : 0;
  }

  const moved = units.shift(unitId, delta) - before;
  const byTag = voice.byTag?.[r.tag];
  if (moved > 0) {
    const ups = voice.up ?? [];
    return { reaction: 'up', reply: byTag ?? (ups.length > 0 ? [ups[Math.min(units.ups(unitId) - 1, ups.length - 1)]] : voice.flat), delta: moved };
  }
  if (moved < 0) return { reaction: 'down', reply: byTag ?? voice.down ?? voice.flat, delta: moved };
  return { reaction: 'flat', reply: byTag ?? voice.flat, delta: 0 };
}

/** 값을 물리고 조각을 남긴다 — 어느 갈래로 갔든 이 셋은 똑같이 치른다 */
function finish(unitId: string, text: string, r: Reading, witnesses: readonly string[], where: string, b: Branch): TalkResult {
  const sus = priceOf(r);
  const alerted = TALK_ALERT + (b.reported ? REPORTED_ALERT : 0);
  suspicion.bump(sus, SIGN_TAGS.includes(r.tag) ? '감정' : '말투');
  const alertHit = alert.raise(alerted);

  const fragment = fragments.make({
    text: toFragmentText(text),
    topic: r.topic,
    from: '나',
    where,
    tags: r.tags,
    witnesses,
  });
  for (const w of witnesses) units.mark(w);

  /*
   * 보고 — SYSTEM 이 말하지 않는다. 조각이 리더의 손에 들어가는 것이 보고의 전부다 (D20).
   * 목격 반경 밖이라도 간다: 리더에게 직행이니 거리가 없다
   */
  if (b.reported) {
    fragments.make({ text: toFragmentText(text), topic: '보고', from: unitId, where, tags: ['모순'], witnesses: ['leader'] });
  }

  return {
    reply: lines(b.reply),
    reaction: b.reaction,
    generic: b.generic ?? false,
    pauseMs: b.pauseMs ?? 0,
    delta: b.delta,
    crossed: b.crossed ?? false,
    reported: b.reported ?? false,
    fragment,
    tag: r.tag,
    cost: { suspicion: sus, alert: alerted },
    alertHit,
  };
}
