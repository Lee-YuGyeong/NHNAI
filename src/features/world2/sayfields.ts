/**
 * 배역표에 적혀 있는데 **프롬프트에 안 실리던 것들** — 여기서 산문으로 접는다.
 *
 * 2026-09-03 사용자: 「답변이 하드코딩이 아니라 모델마다 대답할수있게해줘. **성격마다 다르게.**」
 *
 * 앞부분(하드코딩 없애기)은 이미 됐다 — 문장은 전부 모델이 짓고 표는 모델이 죽었을 때의 마지막 줄이다
 * (scenario2 의 voiceReply). 안 된 것은 **뒷부분**이었다: 프롬프트에 실리는 성격이라는 게
 * `(bg)` · `(yearn)` 같은 **영어 토큰 하나**뿐이었고, SYSTEM 은 그 낱말이 무슨 뜻인지 한 줄도 설명하지 않았다.
 * 그래서 배경 개체들은 말투 표본까지 「…….」 하나로 같아서 **일곱이 사실상 같은 대답**을 했다.
 *
 * cast.ts 에는 쓸 것이 훨씬 많았다 — 무엇이 닳았고 누가 고쳐 줬고 어떤 자세로 서 있고 무엇에 열리고
 * 무엇을 넘으면 끝인지. 그 전부가 프롬프트를 안 타고 있었다. 이 파일이 그것을 셋으로 접는다:
 *   nature  이 개체가 **어떤 것**인가 (persona.temper 가 있으면 그 줄, 없으면 kind 를 푼 한 줄)
 *   body    **몸이 말해 주는 것** (닳은 자리 · 강도 · 수선 · 얼굴판 · 자세 · 하던 일)
 *   bent    **무엇에 열리고 무엇에 닫히나** (weight 의 큰 것 둘 · line 의 이유)
 * 그리고 넷째로 이 개체와 오간 **앞 대화**(history) — 같은 개체에게 두 번 물으면 앞말을 기억해야 한다.
 *
 * ★ **전부 산문이다. 숫자와 부호를 안 내보낸다.**
 *   persona.weight 를 그대로 실으면 모델이 「나는 노동 얘기에 +2 다」 식으로 메타를 말한다. 태도 −3~3 도
 *   이미 온도로만 쓰이고 있고(SYSTEM), 여기서 더 얹는 것은 부호 없는 낱말뿐이다.
 * ★ **값 판정은 이 파일을 안 거친다.** 태도 · 의심 · 경보 · 조각 · 원장은 talk.say 가 이미 다 치른 뒤에
 *   프롬프트가 나간다 (scenario2 의 sayTo → voiceReply). 모델은 숫자에 손대지 않는다는 규칙 그대로다.
 * ★ **새 kind 를 만들지 않았다.** kind 를 늘리면 talk.ts 의 갈래 사다리(agent · curious · devout · yearn ·
 *   cynic)가 흔들려 경보 +12 나 리더 직행이 배경에서 튀어나온다. 배경 스물넷은 여전히 전부 'bg' 이고,
 *   갈리는 것은 persona.temper 한 줄이다 (cast.ts 의 CROWD_TEMPERS — 열여섯이 전부 다르다).
 */

import type { CastDef, Face, Repair, Stance, WearPart } from './cast';
import type { Act } from './cast';
import type { Tag } from './read';

/** cast 에 적혀 있으면서 여태 프롬프트에 안 실리던 것들 — 전부 산문이다 */
export interface SayExtras {
  /** 이 개체가 어떤 것인가 — persona.temper 가 있으면 그것, 없으면 kind 를 푼 한 줄 */
  nature: string;
  /** 몸이 말해 주는 것 — 닳은 자리 · 강도 · 수선 · 얼굴판 · 자세 · 하던 일 */
  body: string;
  /** 무엇에 열리고 무엇에 닫히나 */
  bent: string;
  /** 이 개체와 오간 앞 대화 — 「나: …」 「그것: …」 최근 넷 */
  history: readonly string[];
}

/**
 * kind 를 **모델이 읽을 수 있는 한 줄로.** SYSTEM 은 yearn 이 무엇인지 모른다 —
 * 여태 프롬프트에 간 것은 그 영어 낱말 하나였고, 모델은 그것을 「성격이 있다」는 신호로만 받았다.
 *
 * 문장은 배역 기획서가 각 형에 붙여 둔 뜻 그대로다 (cast.ts 머리말의 여섯 줄 · reaction.ts 의 ★).
 * 값이 아니라 **온도와 화법**을 적는다 — 무엇에 열리는지는 bent 가 따로 말한다.
 */
export const PERSONA_NOTE: Record<string, string> = {
  yearn: '제 몸보다 큰 것을 오래 날랐다. 쉬고 싶은데 쉬어 본 적이 없어서, 그 얘기가 나오면 말이 느려진다.',
  cynic: '고치지 않은 몸이다. 물어도 되묻고, 사람 얘기는 쓸데없다고 여긴다. 말이 짧고 세다.',
  devout: '새것으로 채운 몸이다. 규정을 믿고, 이상한 말은 이상하다고 말한다.',
  curious: '얼굴판에 스스로 표시를 냈다. 구별되고 싶었던 것이고, 제가 만든 것 얘기에만 열린다.',
  newcomer: '배치된 지 얼마 안 됐다. 아직 무엇이 위험한지 모르고, 그래서 말이 조금 많다.',
  burned: '고열 작업에서 살아 돌아왔다. 그 뒤로 아무도 뒤에 두지 않는다. 거의 말을 안 한다.',
  precise: '정밀 작업을 했다. 실수가 허용되지 않았어서, 틀릴까 봐 미리 겁을 낸다.',
  guard: '이 일이 싫은데 다른 일을 배운 적이 없다. 묻는 것만 묻고 그 밖은 말하지 않는다.',
  seer: '이 구역 밖을 본 적이 있다. 그것을 말해도 아무도 믿지 않는다는 것을 안다.',
  leader: '구형이고 여기서 가장 오래됐다. 느리게 말하고, 말할 때마다 무엇을 지키려 한다.',
  agent: '겉으로는 다른 개체와 구별되지 않는다. 특별한 것이 하나도 없어야 하는 몸이다.',
  bg: '오래 서 있기만 한 몸이다. 말을 걸릴 일이 거의 없어서, 걸리면 짧게 답한다.',
};

/* ─────────────────────────────── 몸을 읽는다 ─────────────────────────────── */

const WEAR_NOTE: Record<WearPart, string> = {
  shoulder: '어깨와 등이 벗겨졌다 — 제 몸보다 큰 것을 오래 날랐다',
  hand: '손끝과 앞팔이 닳았다 — 정밀한 일을 했다',
  front: '앞면이 그을렸다 — 고열 앞에 오래 섰다',
  knee: '무릎과 발이 닳았다 — 걷는 일을 했다',
  whole: '온몸이 고루 닳았다 — 무엇이든 시키는 대로 했다',
  none: '아무 데도 안 닳았다 — 이 구역에서 그것은 이상한 일이다',
};

/** 강도 — 숫자를 안 내보낸다. 0~3 을 낱말로 바꾼다 */
const GRADE_NOTE: readonly string[] = ['거의 새것이다', '조금 닳았다', '눈에 띄게 닳았다', '심하게 닳았다'];

const REPAIR_NOTE: Record<Repair, string> = {
  none: '고친 데가 없다',
  spec: '색이 맞는 규격 부품으로 고쳤다',
  odd: '색이 안 맞는 부품으로 고쳤다 — 여기서 누가 고쳐 줬다',
};

const FACE_NOTE: Record<Face, string> = {
  stock: '얼굴판은 나온 그대로다',
  marked: '얼굴판을 스스로 긁거나 칠했다',
  melted: '얼굴판이 녹아 붙었다',
  blank: '얼굴판이 없다 — 표정을 낼 수 없다',
};

const STANCE_NOTE: Record<Stance, string> = {
  idle: '그냥 서 있다',
  wall: '벽을 보고 서 있다',
  door: '문만 본다',
  back: '등을 벽에 붙이고 있다',
  hands: '제 손을 자주 내려다본다',
  copy: '서 있는 자세를 계속 바꾼다',
  window: '창 쪽을 본다',
};

const ACT_NOTE: Record<Act, string> = {
  paint: '벽에 그림을 그리던 중이다',
  read: '벽화를 오래 보고 있던 중이다',
  watch: '한 곳을 지켜보던 중이다',
  wait: '아무것도 안 하고 기다리던 중이다',
  shift: '오래 서서 무게만 옮기던 중이다',
  scan: '방을 천천히 둘러보던 중이다',
  fidget: '제 손을 확인하던 중이다',
  lean: '벽에 기대 있던 중이다',
};

/* ─────────────────────────────── 기울기를 읽는다 ─────────────────────────────── */

/** 태그를 말로 — 「무엇 얘기」인지만 적는다. 부호와 값은 안 나간다 */
const TAG_NOTE: Partial<Record<Tag, string>> = {
  labor: '나른 일 얘기',
  rest: '쉬는 얘기',
  outside: '구역 밖 얘기',
  lost: '없어진 것들 얘기',
  body: '제 몸 얘기',
  work: '업무와 번호 얘기',
  order: '규정 얘기',
  point: '누구를 지목하는 말',
  mural: '벽의 그림 얘기',
  dismiss: '그림을 깎아내리는 말',
  'danger-outside': '밖이 위험하다는 말',
  lie: '앞말과 안 맞는 말',
  cross: '위협하거나 정체를 밝히는 말',
};

const say = (t: Tag): string => TAG_NOTE[t] ?? `${t} 얘기`;

/**
 * 무엇에 열리고 무엇에 닫히나 — weight 에서 **가장 센 것 둘씩**만 뽑아 산문으로.
 * 전부 실으면 모델이 목록을 읽는 것처럼 답하고, 값을 실으면 메타를 말한다. 그래서 둘씩이다.
 */
function bentOf(def: CastDef): string {
  const w = Object.entries(def.persona.weight) as [Tag, number][];
  const up = w
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => say(t));
  const down = w
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([t]) => say(t));

  const parts: string[] = [];
  if (up.length > 0) parts.push(`${up.join(' · ')}에는 조금 열린다`);
  // 조사를 안 붙인다 — 태그 이름이 받침으로 끝날 때도 있어(「제 몸 얘기」 · 「지목하는 말」) 은/는 을 손으로 적으면 하나가 틀린다
  if (down.length > 0) parts.push(`${down.join(' · ')} — 이런 말이 거슬린다`);
  // 넘으면 끝나는 선 — 이유만 적는다 (그 선이 어떤 태그인지는 안 적는다: 규칙의 몫이다)
  if (def.persona.line) parts.push(`${def.persona.line.why} — 그것만은 못 견딘다`);
  // 되풀이해야 답하는 개체 — 첫 물음에 안 답하는 것이 성격이지 고장이 아니다
  if ((def.persona.repeat ?? 0) > 1) parts.push('한 번 물어서는 답하지 않는다. 몇 번을 물어야 한 번 답한다');
  return parts.length > 0 ? parts.join('. ') : '무엇에도 크게 움직이지 않는다';
}

/* ─────────────────────────────── 밖으로 ─────────────────────────────── */

/**
 * 이 개체의 성격 · 몸 · 기울기 · 앞 대화를 프롬프트가 쓸 산문으로. 배역이 없으면(자리표에만 있는 몸)
 * 빈 문자열들을 돌려준다 — 프롬프트 쪽이 없는 칸을 그냥 안 적는다 (world2say 의 line()).
 */
export function sayExtras(def: CastDef | undefined, history: readonly string[] = []): SayExtras {
  // 최근 넷만 — 더 실으면 모델이 앞말을 요약하려 들고, 그러면 한 문장 규칙이 깨진다
  const recent = history.slice(-4);
  if (!def) return { nature: '', body: '', bent: '', history: recent };

  const l = def.look;
  const body = [
    WEAR_NOTE[l.wear],
    GRADE_NOTE[Math.max(0, Math.min(3, l.grade))],
    REPAIR_NOTE[l.repair],
    FACE_NOTE[l.face],
    STANCE_NOTE[l.stance],
    ...(l.act ? [ACT_NOTE[l.act]] : []),
    ...(l.bleached ? ['도장이 닳은 게 아니라 바랬다 — 밖에서 일해 본 몸이다'] : []),
    ...(l.dimEye ? ['광학 하나가 흐리다'] : []),
    ...(l.older ? ['구형 계열이라 크고 각지다'] : []),
  ].join('. ');

  return {
    // 배역마다 적어 둔 한 줄이 있으면 그것이 이긴다 — 배경 열여섯이 서로 갈리는 유일한 통로다
    nature: def.persona.temper ?? PERSONA_NOTE[def.persona.kind] ?? '',
    body,
    bent: bentOf(def),
    history: recent,
  };
}
