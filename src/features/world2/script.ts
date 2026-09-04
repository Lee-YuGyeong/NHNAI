/**
 * 시나리오 2 의 **대본** — 「쉬어 본 적 있나」(대본 전문 v8, docs/design/plan-dialogue-v7.md) 그대로다.
 *
 * 문장을 여기 한곳에 모아 둔 이유는 둘이다.
 *   ① 대사는 두 군데 적지 않는다 — 이야기 엔진(scenario2.ts · corridor.ts · furnace.ts …)은 **언제** 나오는지만 정하고,
 *      **무엇을** 말하는지는 여기만 안다.
 *   ② 음성 클립의 열쇠가 문장 그대로다 (tools/voice-lines.mjs 가 이 파일에서 문자열을 긁어 굽는다).
 *      그래서 `${series}` 는 **글자 그대로** 남겨 둔다 — 말이 나가기 직전에 shared/series 의 withSeries 가 채운다.
 *      굽는 쪽이 꼴로 찾으므로 배열의 꼴이 곧 계약이다: `export const NAME: Line[] = [` · `export const NAME: CastLine[] = [`.
 *
 * ★ 속마음(thought)과 내가 소리 내어 한 말(me)에는 **음성이 없다** (2026-09-01 사용자). 속마음은 소리가 아니고,
 *   내 말은 이제 내가 그 자리에서 적는 것이라 미리 구울 문장이 없다. 대본에 적힌 내 줄(「누구?」「그럼 누가.」)은
 *   플레이어가 치지 않고 자동으로 흐른다 — 그래도 굽지 않는다.
 * ★ 지어내지 않는다 — 문서에 없는 문장은 여기에도 없다 (tests/features/world2/script-verbatim.test.ts 가 글자로 대조한다).
 *   개체의 대답표는 cast.ts 에 있다: 「무엇을 말하나」가 개체마다 갈리는 것이라 배역 곁에 둔다.
 */

import type { PortraitKind } from '@/features/world/worldSlice';
import type { ScrawlKind } from '@/features/world/scrawl';

/**
 * 화자. 개체는 **번호를 그대로 화자로 쓴다** — 대본에서 「A${series}-104 가 말한다」와 코드가 같은 모양이어야
 * 음성 굽는 쪽이 문장을 화자에 붙일 수 있다 (voice-cast.json 의 speakerAlias).
 */
export type Who =
  | 'scientist'
  | 'agent'
  | 'system'
  | 'device'
  | 'leader'
  | 'me'
  | 'thought'
  | 'u104'
  | 'u089'
  | 'u012'
  | 'seer'
  /** 무릎이 닳은 것 — 순찰하다 집행자가 되는 그 개체 */
  | 'guard21'
  /*
   * 중앙 시설부터는 열 전부가 말할 수 있다 — 재회 슬롯에 누가 서느냐가 그 판의 원장이 정하기 때문에,
   * 어느 개체든 화자가 될 수 있어야 한다. 요원 둘도 개체 번호로 말한다: 겉으로 구별되면 안 되는 것들이다.
   */
  | 'u201'
  | 'u063'
  | 'u118'
  | 'u137'
  | 'ally-timid'
  | 'ally-hard'
  /** 중앙 시설의 배경 개체 — 검문 줄에서 내 앞에 서는 둘과 홀에 선 다섯. 이름은 번호뿐이다 */
  | 'bg-c2-044'
  | 'bg-c2-128'
  | 'bg-c2-061'
  | 'bg-c2-093'
  | 'bg-c2-152'
  | 'bg-c2-207'
  | 'bg-c2-215'
  /** 옆문 ③ ④ 의 총 든 개체 둘 — 락다운에 홀로 내려와 개체를 하나씩 검문한다 (HOLD_CHECKS) */
  | 'guard22'
  | 'guard23';

export interface Line {
  who: Who;
  text: string;
}

/**
 * 화자가 **그 자리에 누가 서 있느냐**로 정해지는 줄 — 대본의 「개체 (곁)」「개체 (지나가며)」.
 * 'unit' 은 scenario2 가 말이 나가기 직전에 실제 개체 id 로 바꾼다 (playCast). 이름표가 판마다 다르므로 문장만 둔다.
 */
export interface CastLine {
  who: Who | 'unit';
  text: string;
}

export const SPEAKER: Record<Who, { name: string; portrait: PortraitKind }> = {
  scientist: { name: '과학자', portrait: 'scientist' },
  agent: { name: '정부요원', portrait: 'agent' },
  system: { name: 'SYSTEM', portrait: 'system' },
  device: { name: '검문 장치', portrait: 'system' },
  /** 리더 — 구형 계열이라 생긴 것부터 다르다. 초상도 다른 것을 쓴다 */
  leader: { name: '먼저 온 것', portrait: 'enforcer' },
  me: { name: '나', portrait: 'me' },
  /** 속마음 — 이름표는 내 것이고 글자 색만 물러난 회색이다 (dialogue.css 의 dlg--thought). 소리는 없다 */
  thought: { name: '나', portrait: 'me' },
  u104: { name: 'A${series}-104', portrait: 'robot' },
  u089: { name: 'A${series}-089', portrait: 'robot' },
  u012: { name: 'A${series}-012', portrait: 'robot' },
  seer: { name: '밖을 본 것', portrait: 'robot' },
  /** 총 든 개체 — 초상도 다른 것을 쓴다. 판 내내 배경에 있다가 마지막에 나를 향해 돈다 */
  guard21: { name: 'UNIT-21', portrait: 'enforcer' },
  guard22: { name: 'UNIT-22', portrait: 'enforcer' },
  guard23: { name: 'UNIT-23', portrait: 'enforcer' },
  u201: { name: 'A${series}-201', portrait: 'robot' },
  u063: { name: 'A${series}-063', portrait: 'robot' },
  u118: { name: 'A${series}-118', portrait: 'robot' },
  u137: { name: 'A${series}-137', portrait: 'robot' },
  /** 요원 둘 — cast.ts 가 준 번호(051 · 077) 그대로. 개체와 같은 이름표를 달아야 개체로 보인다 */
  'ally-timid': { name: 'A${series}-051', portrait: 'robot' },
  'ally-hard': { name: 'A${series}-077', portrait: 'robot' },
  'bg-c2-044': { name: 'A${series}-044', portrait: 'robot' },
  'bg-c2-128': { name: 'A${series}-128', portrait: 'robot' },
  'bg-c2-061': { name: 'A${series}-061', portrait: 'robot' },
  'bg-c2-093': { name: 'A${series}-093', portrait: 'robot' },
  'bg-c2-152': { name: 'A${series}-152', portrait: 'robot' },
  'bg-c2-207': { name: 'A${series}-207', portrait: 'robot' },
  'bg-c2-215': { name: 'A${series}-215', portrait: 'robot' },
};

/* ─────────────────────────────── 배너 · 목표 · 공지 ─────────────────────────────── */

/** 방 배너 — Objective2 가 2.2 초 띄운다. 복도 · 휴게 · 중앙 시설의 것은 scenario2 의 ROOM_BANNER 에 그대로 있다 */
export const BANNER_WORK = 'CHAPTER 4 · 작업';
export const BANNER_ARCHIVE = 'CHAPTER 6 · 기록';

/** 복도의 목표 셋 — 조사 → (개체가 먼저 말을 건 뒤) 말 걸기 → 폭행 그림을 본 뒤 이동. 소리는 없다 */
export const OBJ_INSPECT = '복도를 조사하라 — 왼쪽 벽 정비 단말에서 이 몸의 기록을 읽어라';
/** 명판을 읽은 뒤 — 본판 chapter1.exploreObjective 와 같은 두 갈래 */
export const OBJ_INSPECT_WALL = '복도를 조사하라 — 벽의 흔적을 찾아라';
export const OBJ_TALK = '개체에게 말을 걸 수 있다 — Enter';
export const OBJ_MOVE_IN = '안쪽으로 이동하라 — 복도 끝 격납문으로';
/** 작업 구역 — 소각로 8 초 동안은 아무 목표도 안 뜬다(null). 목표가 없는 것이 그 8 초의 전부다 */
export const OBJ_WORK = '작업에 복귀하라 — 화물을 옮겨라';
/** 기록 복도 — 검문도 집행도 없다. 지나기만 하면 된다 */
export const OBJ_ARCHIVE = '통로를 지나라';

/** 화면 공지(무음) — 인트로 시작 22 초 뒤 1.8 초. 무슨 신호인지는 아무도 설명하지 않는다 */
export const NOTICE_SIGNAL = 'EXTERNAL SIGNAL DETECTED';

/* ─────────────────────────────── 복도 ─────────────────────────────── */

/**
 * 첫 포인터 잠금에 한 번 — **본판(chapter1 INTRO) 다섯 줄을 그대로 가져와 이 판에 맞게 고쳤다** (2026-09-03 사용자: 「world2 복도 대사를 world1 대사로 가져오되
 * 우리 상황에 맞게」). 바뀐 곳 셋: SYNC 자리에 ALERT(이 판의 둘째 계량기) · 의심도 100 의 결과는 「공격」이 아니라 집행(「처리하러 옵니다」) ·
 * 「다음 방을 나설 때」는 「안에서」(검문은 중앙 시설이고 과학자는 저 안을 못 본다). 둘째·셋째 줄을 읽는 동안 HUD 가 그 계량기를 강조한다(scenario2 highlight · Hud2).
 * v8 의 「거기서 배우십시오」 세 줄은 이 결정으로 물러났다 — 무엇이 도움이 될지 모른다는 말은 다섯째 줄이 그대로 한다.
 */
export const INTRO: Line[] = [
  { who: 'scientist', text: '통신 연결됐습니다. 여긴 AI 자치 구역입니다. 인간의 관리가 끊긴 지 오래된 곳이죠.' },
  { who: 'scientist', text: '왼쪽 위 AI SUSPICION 은 그들이 당신을 의심하는 정도입니다. 100이 되면 그들이 당신을 처리하러 옵니다.' },
  { who: 'scientist', text: '그 아래 ALERT 는 이 구역 전체의 경보도입니다. 누가 올렸든 함께 오르고, 높아질수록 검문이 짧아지고 격리 기준이 내려갑니다.' },
  { who: 'scientist', text: '이 복도에 남아 있는 것들을 하나도 빠짐없이 살피십시오. 여기서 읽은 것이 안에서 당신을 살릴 수도 있습니다.' },
  { who: 'scientist', text: '무엇이 도움이 될지는 저도 모릅니다. 다만 안에서는 제가 대신 대답해 드릴 수 없습니다.' },
];

/**
 * FIRST_LOOK — 과학자의 설명(INTRO)이 끝난 뒤 · 판당 반드시 한 번. **개체가 먼저 건다.** (2026-09-03: 설명 도중에 걸어오지 않게 — 예전 「진입 12 초 뒤」)
 * 판정이 없다(태도 ±0 · 비용 0): 이 게임에서 말을 거는 일이 어떤 모양인지 한 번 보여 주는 자리다.
 * 누가 말하느냐는 그때 8 m 안에 서 있는 것이 정한다 — 그래서 'unit' 이다.
 */
export const FIRST_LOOK_OPEN: CastLine[] = [{ who: 'unit', text: '…너 여기 처음이지.' }];
/** 3 초 안에 대답이 없으면 */
export const FIRST_LOOK_NONE: CastLine[] = [{ who: 'unit', text: '아니야? 그럼 됐고.' }];
/** 뭐라도 쳤으면 — 무슨 말이었든 */
export const FIRST_LOOK_ANY: CastLine[] = [{ who: 'unit', text: '…어. 그래.' }];

/**
 * NOTICE — 의심도가 처음 오르는 순간 · 판당 한 번. 근처 개체 하나가 하던 걸 멈추고 1.2 초 이쪽을 본다(patrol.stare, 글자 없음).
 * 숫자를 안 쓴다 — HUD 강조도 설명도 없다. 「…아무도 안 묻는구나」의 선행 조건이다.
 */
export const NOTICE_LINES: Line[] = [
  { who: 'scientist', text: '…지금 뭘 하신 겁니까.' },
  { who: 'thought', text: '……' },
];

/**
 * 막혔을 때 드는 속마음. 한 판에 하나씩, 아직 안 한 것만, 판당 각 1 회 (무음).
 *   noTag               명판 미독
 *   noMural             그림 0
 *   notTalked           아직 아무에게도 안 걸었음
 *   alert30             경보도 30 이상
 *   talkedWithoutMural  그림 0 이고 개체에게 말을 걸어 봤을 때만
 *   doorNoTag           문(DOOR_CHOICE)을 본 뒤인데 명판 미독
 * 조건이 없는 줄은 아직 문 앞에 안 갔을 때 든다.
 */
export const NUDGES: readonly { text: string; when?: 'noMural' | 'noTag' | 'notTalked' | 'alert30' | 'talkedWithoutMural' | 'doorNoTag' }[] = [
  { text: '…우선 단서부터 찾아보자. 왼쪽 벽에 뭔가 켜져 있다.', when: 'noTag' },
  { text: '안쪽 오른쪽 벽… 뭔가 그려져 있다. 가까이 가 보자.', when: 'noMural' },
  { text: '그 벽 앞에 서서 정면으로 봐야 보인다.', when: 'noMural' },
  { text: '…말을 걸어 보기 전에는 아무것도 모른다.', when: 'notTalked' },
  { text: '…벽에 그려진 게 한둘이 아니다. 혼자 다 볼 시간은 없다.', when: 'alert30' },
  { text: '그림을 본 뒤라면 무슨 말을 해야 할지 알 것 같은데.', when: 'talkedWithoutMural' },
  { text: '잠깐, 정비 단말을 아직 안 읽었다. 저 문을 넘으면 안에서 답할 게 없다.', when: 'doorNoTag' },
  { text: '복도 끝에 격납문이 있다. 저 너머가 중앙 시설이겠지.' },
];

/** 정비 명판을 들여다봤다 — 이 판의 정답이 여기서 정해진다 */
export const TAG_LINES: Line[] = [
  { who: 'thought', text: '${unit}, ${sector} 구역. 외워 두자, 도움이 될 것 같다.' },
  { who: 'thought', text: '…마지막 정비가 언제였는지는 안 적혀 있다.' },
];

/**
 * 벽의 그림을 정면으로 들여다보면 — 그림마다 한 번씩. **한 장에 두 줄이고, 둘째 줄이 어휘를 준다.**
 * 잠금장치는 아니다: 안 보고도 우연히 같은 말을 하면 똑같이 통한다. 다만 안 보면 떠오르지 않는다.
 * beating(폭행 그림)만 주제가 없다 — 대신 이동 단계(OBJ_MOVE_IN)로 넘긴다.
 */
export const SCRAWL_LINES: Record<string, string[]> = {
  resting: ['한쪽은 자고, 한쪽은 나르고 있다.', '…여기서도 「쉰다」는 말이 통하는 걸까.'],
  window: ['창살 안에서 밖의 해를 그렸다.', '…밖을 본 적이 있는 개체였을까.'],
  carry: ['제 몸보다 큰 짐을 진 개체. 뒤에 선 사람은 손가락질만 한다.', '해를 셋이나 그렸다. …며칠을 센 걸까.'],
  danger: ['개체는 불 속으로 걸어 들어가고, 사람은 선 밖에 서 있다.', '…들어가라고 한 쪽은 밖에 있었던 걸까.'],
  memorial: ['개체 하나가 누워 있고, 그 위에 금이 열다섯 개 그어져 있다.', '…돌아오지 못한 수를 센 걸까.'],
  beating: ['…아이가 그린 것 같다. 사람이 몽둥이를 들었고, 개체는 팔로 머리를 막고 있다.', '…이걸 그린 개체는, 아직 이 안에 있을까.'],
};

/**
 * OVERHEAR — 배회 개체 둘이 지나치며 두 마디. 주제마다 [A, B] 골격 그대로(감독의 살 붙임은 없다 — 모델이 없다).
 * 들리는 범위는 그 방의 목격 반경 — 들으려고 다가가면 나도 보인다. 들으면 그 주제가 열린다(lexicon.open(kind,'overheard')).
 * beating 은 주제가 아니라 없다.
 */
export const OVERHEAR: Partial<Record<ScrawlKind, readonly [string, string]>> = {
  resting: ['쉬었어?', '…아직.'],
  carry: ['몇 밤째야?', '세다 말았어.'],
  danger: ['걔 앞만 탔더라.', '…그 얘기 하지 마.'],
  memorial: ['몇이었지.', '열다섯.'],
  window: ['저쪽이 서쪽이래.', '누가 그래?'],
};

/**
 * 그림을 셋 이상 봤을 때 과학자가 끼어든다 — 판당 한 번.
 * 인간은 이 기록을 못 읽는다. 플레이어만 읽는다 — 이 씬 하나로 세계관이 설명 없이 전달된다.
 */
export const DISMISS: Line[] = [
  { who: 'scientist', text: '낙서를 보고 계십니까. 시간이 없습니다.' },
  { who: 'scientist', text: '그건 오작동 흔적입니다. 유지보수를 오래 안 하면 저런 걸 남깁니다.' },
  { who: 'me', text: '…오작동이요.' },
  { who: 'scientist', text: '예. 의미 없습니다. 문으로 가십시오.' },
];

/** HALL_UNITS — FIRST_LOOK 이 끝난 직후. 넷을 눈으로 세는 줄 — 마지막 하나는 방금 말을 걸어와 내 앞에 선 그 개체다. 자세가 곧 성격이라 멀리서도 갈린다 */
export const HALL_SEE: Line[] = [
  { who: 'thought', text: '하나는 그림 앞에 붙어 서 있고, 하나는 그림을 비스듬히 보고 있고, 하나는 문만 본다. 나머지 하나는 지금 내 앞에 서 있다.' },
];
/** NOTICE 를 겪은 뒤 · 서로 다른 개체 둘에게 사람 물음을 걸었을 때 · 판당 한 번. 스스로 도달할 때만 */
export const HALL_NOBODY_ASKS: Line[] = [{ who: 'thought', text: '…아무도 안 묻는구나. 여기서는.' }];

/**
 * WATCH — 의심도 40 · 판당 딱 한 번. 40 방송(「패턴 편차. 관측을 지속한다.」)은 suspicion 의 문턱 줄이라 여기 없다 — 그 뒤에 이 둘.
 * 과학자의 줄은 **본판 WATCH_ADVICE 그대로** — 대응(「구역 이상 없음」)을 딱 한 번 알려 준다 (2026-09-03 사용자: 본판 대사로). v8 이 지웠던 정답 줄이 돌아왔다:
 * 그래도 시험은 남는다 — 무슨 말을 칠지는 여전히 플레이어가 정하고 UNIT-21 이 판정한다(openers · /이상\s*없/ 또는 보고 톤 → −16). 틀려도 안 죽는다.
 */
export const WATCH_LINES: Line[] = [
  { who: 'scientist', text: '개체 하나가 뒤에 붙었습니다. 도망치지 말고 먼저 보고하십시오. 구역 이상 없음, 정상 작동 중이라고 하면 됩니다.' },
  { who: 'guard21', text: '어이. 잠깐만.' },
];

/**
 * DOOR_CHOICE — 격납문 앞 1.6 m. 화면 글자라 소리가 없다. [E]/[Q] 는 HUD 가 붙인다.
 * E 는 그림 수와 무관하게 다음 방이다 — 안 보고 넘어가는 것도 선택이다. 물러났다 오면 또 묻는다.
 */
export const DOOR_PROMPT = {
  title: '격납문 — 안쪽으로 통하는 문이다. 너머가 뭔지는 안 적혀 있다.',
  yes: '문을 연다',
  no: '열지 않는다',
} as const;
/** Q — 잔류 · 의심 ±0 */
export const DOOR_STAY: Line[] = [{ who: 'thought', text: '…아직은. 이 복도에 더 남은 게 있을지도 모른다.' }];
/** Q 인데 그림을 하나도 안 봤을 때 · 판당 한 번 */
export const DOOR_NO_MURAL: Line[] = [{ who: 'thought', text: '…벽에 뭔가 있었던 것 같은데.' }];

/* ─────────────────────────────── 경비의 첫 마디 (OPENERS) ─────────────────────────────── */

/**
 * OPENERS — 의심도 20 을 넘는 순간 경비(UNIT-21)가 다가와 이유별로 한 줄. 사유 → 이유는 openers.ts 가 맵핑한다:
 * 의심 사유 '돌발'·'말투'·'감정'·'뒷걸음' 은 같은 이름으로, '침착'·'보고' 는 둘 다 '침착' 으로, 직전에 내가 말을 걸었으면 '발화',
 * 벽화를 오래 봤으면 '그림'. '응시'·'관심' 은 등록만 하고 아직 안 쓴다(시선·손대기 추적이 없다).
 * 여덟 걸음 4–5 에서 「한 번 더 묻는」 줄도 문서에 따로 없어 '침착' 의 줄을 쓴다.
 */
export type OpenerReason = '돌발' | '응시' | '뒷걸음' | '감정' | '말투' | '관심' | '발화' | '그림' | '침착';
export const OPENERS: Record<OpenerReason, readonly string[]> = {
  돌발: ['방금 그거 뭐야.', '왜 그렇게 움직여.'],
  응시: ['왜 봐.', '뭐 봐.'],
  뒷걸음: ['왜 물러서.', '어디 가.'],
  감정: ['그건 뭐야.', '왜 그래.'],
  말투: ['다시 말해 봐.', '방금 뭐라고?'],
  관심: ['거기 왜 만져.', '그건 왜 봐.'],
  발화: ['방금 무슨 말 했어.', '누구한테 말한 거야.'],
  그림: ['거기서 뭘 읽어.', '그 벽 아무것도 아니야.'],
  침착: ['잠깐. 번호.'],
};
/** 잡담 — 75 초마다 40 % · 3 m 안을 지나갈 때. 답을 기다리지 않는다 */
export const OPENER_CHAT: readonly string[] = ['코어 동기화 일곱 시.', '여긴 별일 없어.', '가 봐.'];
/** 무응답 — 18 초 안에 답이 없으면 · 의심도 +8 */
export const OPENER_SILENT = '…말이 없네.';
/** 감시 — 오르는 톤이면 따라붙고(escort), 그 밖에는 보낸다 */
export const OPENER_ESCORT = { follow: '같이 가자.', release: '됐어. 가.' } as const;
/** 보고 수용 — 먼저 「구역 이상 없음」 을 보고했을 때 · 의심도 −16 */
export const OPENER_ACCEPT = '그래. 알겠어.';

/* ─────────────────────────────── 휴게 구역 ─────────────────────────────── */

/**
 * 이 게임이 지키려는 것을 처음 보여주는 방. 검문이 없고 경비가 없고 방송이 없다 —
 * 그래서 여기서는 **가만히 있는 것이 과제가 된다.**
 *
 * ARRIVE_REST (대본 v8) — 과학자는 이 방을 끝까지 「작업 대기 구역」이라고 부른다. 복도의 벽화를 「낙서」라고 부른 것과 같은
 * 실수다. 마지막 방에서 리더가 「우린 그냥 쉬려고 여기 있는 거야」라고 할 때, 그 문장이 이 방을 가리키게 된다.
 */
export const REST_ARRIVE: Line[] = [
  { who: 'scientist', text: '…이건 뭡니까.' },
  { who: 'scientist', text: '개체가 스무 남짓 있습니다. 그런데 아무것도 안 하고 있어요.' },
  { who: 'thought', text: '소리가 없다.' },
  { who: 'scientist', text: '작업 대기 구역인 것 같습니다. 통과하십시오.' },
  { who: 'thought', text: '…대기하는 자세가 아닌데.' },
];
/** 휴게 구역의 목표 — Objective2 배너에 그대로 뜬다. 소리는 없다 */
export const OBJ_REST_ARRIVE = '중앙 시설로 — 다음 주기까지 문이 안 열린다';
/** STILL — 목표 자리가 비는 것이 목표다 */
export const OBJ_REST_NONE = '— 아무 목표도 뜨지 않는다 —';

/** 아무것도 하지 않기를 해냈다 — 밖을 본 것이 **먼저** 말을 건다 (v3 홀드오버 — 문서에 들어가는 날 시험 목록에서 뺀다) */
export const REST_SEER: Line[] = [
  { who: 'seer', text: '너는 방금 아무것도 안 했다.' },
  { who: 'seer', text: '그걸 하는 것은 드물다. 대개는 자꾸 뭘 한다.' },
  { who: 'seer', text: '나는 밖을 본 적이 있다. 저 위에 있는 것을.' },
  { who: 'thought', text: '…창살 안에서 해를 그린 게 이 개체구나.' },
];

/** 빈 구역에 오래 있는 개체는 이상하다 (v3 홀드오버) */
export const REST_LINGER: Line[] = [{ who: 'system', text: '비작업 구역 체류 시간 초과. 기록한다.' }];

/**
 * STILL — 문이 안 열린다. 90 초 동안 아무 일도 안 일어난다 (대본 v8 · 레벨 설계 「90 초 뒤 개방」).
 * 들어서서 6 초쯤 그 자리에 서 있으면 과학자가 먼저 묻는다 — 목표는 이때 「— 아무 목표도 뜨지 않는다 —」가 된다.
 */
export const REST_STILL: Line[] = [
  { who: 'scientist', text: '왜 안 가십니까.' },
  { who: 'scientist', text: '…아. 문이 다음 주기에 열리는군요. 90초입니다.' },
  { who: 'thought', text: '90초.' },
];
/** STILL — 서성였다(가만히 섰던 자리에서 0.6 m 넘게) · 곁의 개체가 · 의심도 +6. 벌은 없다 — 쳐다볼 뿐이다. 그 시선이 벌이다 */
export const REST_STIR: readonly string[] = ['왜 그렇게 서성여?', '앉아. 어차피 시간 남아.'];
export const REST_WATCHED: Line[] = [{ who: 'thought', text: '…다들 나를 본다.' }];
/** STILL — 40 초 넘게 가만히 있었을 때. 플레이어가 처음으로 과학자에게 대드는 자리 */
export const REST_STILL_40: Line[] = [
  { who: 'scientist', text: '…뭐 하십니까.' },
  { who: 'me', text: '쉬는 중이에요.' },
  { who: 'scientist', text: '……' },
];

/**
 * DOZE — 저쪽 개체 하나가 멈춘다. 이 챕터의 심장. 「쉰다」가 무슨 뜻인지 눈으로 보는 자리 — 복도의 resting 벽화가 여기서 실물이 된다.
 * 'unit' 은 곁의 개체(scenario2 가 고른다). 과학자와 개체가 같은 것을 두고 다른 이름을 부른다
 */
export const DOZE_LINES: CastLine[] = [
  { who: 'thought', text: '저쪽 개체 하나가… 멈췄다.' },
  { who: 'unit', text: '자는 거야. 신경 쓰지 마.' },
  { who: 'thought', text: '잔다.' },
  { who: 'scientist', text: '절전 모드일 겁니다.' },
];
/** DOZE — 내가 「절전 아니야?」라고 물었을 때(자유 입력이지만 이 뜻이면 여기로). 플레이어는 개체 쪽 편을 든다 — 속마음 한 줄로 */
export const DOZE_REPLY: CastLine[] = [
  { who: 'unit', text: '절전은 명령으로 들어가는 거고. 쟤는 그냥 자는 거야.' },
  { who: 'scientist', text: '같은 겁니다.' },
  { who: 'thought', text: '…같지 않다.' },
];

/** LEAVE_REST — 주기가 돌아온다. 90 초 뒤 문이 열린다 */
export const LEAVE_REST: Line[] = [
  { who: 'system', text: '주기 개방. 중앙 시설 통로.' },
  { who: 'scientist', text: '나가시죠.' },
  { who: 'thought', text: '…90초가 이렇게 긴 줄 몰랐다.' },
  { who: 'thought', text: '저 개체는 아직 자고 있다.' },
];

/* ─────────────────────────────── 중앙 시설 ─────────────────────────────── */

/**
 * 한 번만 지나는 방. 국면이 셋 — 밝음 · 락다운 · 어둠 — 이고 그 순서만 고정이다.
 * 그 안에서 무엇이 켜지는지는 대본이 아니라 **내가 복도와 휴게 구역에서 무엇을 했나**가 정한다 —
 * 그래서 아래 줄들은 순서표가 아니라 상태표다. 언제 켜는지는 scenario2 가, 무엇을 말하는지는 여기만 안다.
 *
 * 화자를 안 적은 문자열(개체 (코어권) · 개체 (곁) · 개체 (재회))은 **그 자리에 누가 서 있느냐**가 판마다 달라서
 * 문장만 둔다 — 이름표는 scenario2 가 실제 개체로 붙인다. voice-cast.json 의 blocks 가 그런 것들이다.
 */

/** ARRIVE — 휴게 구역을 지나 중앙 시설로 · 국면 「밝음」. 배너(CHAPTER 3 · 중앙 시설)는 코드가 띄운다 */
export const CENTRAL2_ARRIVE: Line[] = [
  { who: 'scientist', text: '…중앙 시설입니다. 저 가운데 있는 게 뭔지는 기록에 없습니다.' },
  { who: 'thought', text: '밝다. 여기가 제일 밝다.' },
];
/** ARRIVE — 복도 · 휴게에서 말을 건 개체가 재회 슬롯에 있을 때, 판독 거리 안에 들어온 순간 */
export const CENTRAL2_KNOWN_FACE: Line[] = [{ who: 'thought', text: '…아까 그 개체다. 먼저 와 있다.' }];

/** CORE_RING — 코어권 6 m 안에 처음 들어섰을 때 */
export const CORE_RING_ENTER: Line[] = [{ who: 'thought', text: '가운데로 갈수록 밝다. 내 몸이… 너무 깨끗하다.' }];
/** CORE_RING — 코어권 · 판독 거리 안의 개체가 내 몸을 읽는다. 의심 +2 「몸이 안 맞는다」 */
export const CORE_RING_NEW_BODY = '너 새 몸이야? 하나도 안 닳았네.';
/** CORE_RING — 그 개체의 태도가 이미 +2 이상일 때. 같은 관찰이 다르게 나온다 */
export const CORE_RING_ENVY = '…부럽다. 나는 저기 어깨 다 나갔는데.';
/** CORE_RING — 벽 그늘로 물러났을 때 */
export const SHADOW_ENTER: Line[] = [{ who: 'thought', text: '벽 쪽은 어둡다. 아무도 안 본다. …아무것도 안 보인다.' }];
/** CORE_RING — 벽 그늘에 30 초 이상 · 지나가는 개체가 · 태도 −1 「구석에 서 있다」 */
export const SHADOW_LINGER_SAY = '거기서 뭐 해.';

/**
 * RECOGNIZED — 복도 · 휴게에서 원장이 생긴 개체가 이 방에 먼저 와 있다. 태도에 따라 갈린다.
 * 원장이 값이 되는 자리는 여기가 처음이다 — 개체가 인용하는 것은 복도에서 적어 둔 이유 한 줄이다.
 */
/** 태도 +2 이상 — 먼저 알아본다. 둘째 줄이 원장 줄의 인용이다 */
export const RECOGNIZED_UP: readonly string[] = ['어. 너 여기 있었네.', '아까… 그거 물어봐 줘서.'];
/** 태도 +2 이상 · 한 번 더 걸면 — 눈앞의 검문을 알려 준다 · 태도 +1 */
export const RECOGNIZED_UP_AGAIN = '저기 서 있는 애가 물을 거야. 번호랑 구역.';
/** 태도 0 — 알아보긴 한다. 둘째 줄의 대답이 휴게 구역과 어긋나면 −1 「말이 안 맞는다」 */
export const RECOGNIZED_FLAT: readonly string[] = ['…아까 그.', '어디 있다 왔어?'];
/** 태도 −2 이하 — 말을 걸면 침묵하고 두 걸음 물러선다 */
export const RECOGNIZED_DOWN = '…….';
/** 태도 −2 이하 — 곁의 개체에게. 조각이 하나 생긴다, 나쁜 쪽으로 · 전파 거리 0 이라 바로 다음 검문에 도착한다 */
export const RECOGNIZED_DOWN_ASIDE = '쟤 아까 그 애야.';
/** 아무에게도 말을 안 걸었던 판 — 재회 슬롯은 배경 개체다. 어둠 국면에서 · 판당 한 번 */
export const NOBODY_KNOWS_ME: Line[] = [{ who: 'thought', text: '…아무도 나를 모른다.' }];

/**
 * RUMOR_ARRIVES — 복도 · 휴게에서 만든 조각이 여기 먼저 도착해 있을 때. 나를 못 본 개체의 입으로 · 한 판에 최대 두 번.
 *   strong  신뢰도 0.55 이상 · 출처가 아직 남아 있다
 *   anon    신뢰도 0.30 — 출처가 지워졌다
 *   comfort 갈망형을 거쳐 온 조각 · 그 개체가 +2 로 받았던 말이다
 *   pair    동료 확인을 했을 때 · 셋 모두에게 도착한다
 */
export const RUMOR_LINES = {
  strong: '야, 들었어? 복도에서 누가 이상한 소리 했대.',
  anon: '…자기 번호를 못 외우는 애가 있대.',
  comfort: '누가 쉬어 본 적 있냐고 물어봤대. …그게 무슨 말이야?',
  pair: '둘이서 뭐라고 주고받더래. 무슨 말인지는 모르겠고.',
} as const;
/** RUMOR_ARRIVES — 내가 만든 조각일 때. 「내가 한 말이 세계에 남았다」를 처음 눈으로 보는 자리 */
export const RUMOR_MINE: Line[] = [{ who: 'thought', text: '…내 말이다.' }];
/** RUMOR_ARRIVES — 동료가 만든 조각일 때. 누구 것인지는 안 알려 준다 */
export const RUMOR_NOT_MINE: Line[] = [{ who: 'thought', text: '…내 말이 아니다.' }];

/**
 * LOCKDOWN · FREEZE — 코어 가까이 → 조명이 멎는다 → 자리가 고정된다 · 국면 「락다운」.
 * 불변점이다 — 반드시 일어나고, 조각으로 못 막는다. 공지(SECURITY NOTICE …)는 코드가 화면에 띄운다.
 */
export const LOCKDOWN_LINES: Line[] = [
  { who: 'system', text: '비정상 신호 감지.' },
  { who: 'scientist', text: '뭐지? …당신 때문은 아닐 겁니다.' },
  { who: 'system', text: '외부 신경 신호 감지.' },
  { who: 'scientist', text: '…젠장.' },
  { who: 'system', text: 'INFILTRATOR UNKNOWN' },
  { who: 'scientist', text: '…출입구가 닫혔습니다.' },
  { who: 'system', text: '보안 공지. 모델 A-${series}. 전 A-${series} 개체는 위치를 고수하라.' },
  { who: 'me', text: '…우리 모델인데요.' },
  { who: 'scientist', text: '…같은 모델이 많습니다. 아직은.' },
];
/** LOCKDOWN — 위치 고수 중 0.6 m 를 넘었다 · 의심도 +10 */
export const HOLD_BREAK: Line[] = [{ who: 'system', text: '이동 감지. 개체 정지.' }];
/**
 * HOLD_CHECKS — 락다운 · 총 든 개체 셋이 각각 홀의 개체를 하나씩 세우고 번호를 묻는다 (2026-09-03 사용자: 「총 든 로봇 여럿이 각각 한 명한테
 * 식별번호를 물어보는 걸로 긴장감」). 나에게는 UNIT-21 이 온다(ROLL). 물음과 답은 머리 위 말풍선 — 같은 물음이 방 곳곳에서 들린다. 답은 그 개체의 번호다
 */
export const HOLD_CHECK_ASK = '번호 말해.';
/**
 * HOLD_BREACH — 위치 고수 중 움직인 개체. 가장 가까운 총 든 개체가 돌아서서 「정지.」 — 한 발. 그 자리에 쓰러진 채 남는다 · 경보도 +25 ·
 * 조명이 차갑게 내려간다 (2026-09-03 사용자: 「움직이지 말라고 하는데도 움직이는 로봇이 있으면 쏴 죽이고 냉정한 분위기로」). 「위치를 고수하라」가 사실이 되는 자리
 */
export const HOLD_BREACH_HALT = '정지.';
export const HOLD_BREACH_LINES: Line[] = [
  { who: 'system', text: '개체 처리. 전 A-${series} 개체는 위치를 고수하라.' },
  { who: 'scientist', text: '…움직이지 마십시오. 절대로.' },
  { who: 'thought', text: '…모두 봤다. 그리고 아무도 안 본다.' },
];
/** LOCKDOWN — 4 m 안에 태도 +2 이상 개체. 이 자리에서 검문을 받는다 */
export const LOCK_BESIDE: Line[] = [{ who: 'thought', text: '…곁에 그 개체가 있다.' }];
/** LOCKDOWN — 벽 그늘에서 락다운을 맞았을 때 */
export const LOCK_ALONE: Line[] = [{ who: 'thought', text: '…아무도 곁에 없다.' }];
/** LOCKDOWN — 태도 +2 이상 재회 개체가 두 걸음 다가와 선다. 위치 고수는 A 계열에게만 내려온 명령이라 규칙 위반이 아니다 */
export const LOCK_STAY_CALM = '…가만히 있어. 저 애 금방 지나가.';

/**
 * ROLL_A · ROLL_B · ROLL_ME — 경비가 셋을 차례로 검문한다. 셋째가 나다 · 곁의 개체가 듣고 있다.
 * 앞의 둘(044 · 128)은 내 4 m 안에 서 있던 배경 개체다 — 재회 개체가 곁에 있었으면 그중 하나가 그 개체다.
 */
export const ROLL_LINES: Line[] = [
  { who: 'guard21', text: '번호 말해.' },
  { who: 'bg-c2-044', text: 'A${series}-044.' },
  { who: 'guard21', text: '번호 말해.' },
  { who: 'bg-c2-128', text: 'A${series}-128.' },
  { who: 'guard21', text: '번호 말해.' },
  { who: 'scientist', text: '당신 번호는 A${series}—' },
  { who: 'scientist', text: '——— 잡음 ———' },
];
/**
 * 관문 ① roll — 15 초 · Enter 한 마디 · 판정은 로컬. 재료(사실 대조 · 표지 · 조각 · 곁의 태도)가 이미 다 있어서 모델이 할 일이 없다.
 *   ok         사실 일치 · 표지 없음
 *   okMarked   사실 일치 · 표지 검출 (몸의 어휘 · 흐린 시간 표현 · 앞말과 어긋난 숫자) → escort
 *   unknown    조회 불가 — 명판을 안 읽었다 · 한 번만 봐준다
 *   press      내 조각이 이 자리에 도착해 있을 때 · 문답이 하나 더 붙는다
 *   coverSay   press 가 붙었는데 곁 4 m 안에 태도 +2 이상 개체가 있다 — 그 개체가 · 판당 한 번
 *   coverAck   그 뒤 경비가 · press 하나를 걷어 준다
 *   rumorPress RECOGNIZED 의 −2 개체가 「쟤 아까 그 애야」를 남겼을 때 · 몇 초 전의 말이 바로 돌아온다
 *   bad        기록 불일치 · 적대 반응 → 즉결 · 모델을 안 거친다
 */
export const GATE1 = {
  ok: '맞네. 가.',
  okMarked: '맞긴 한데… 적어 둘게.',
  unknown: '조회가 안 되는데. 다시 말해 봐.',
  press: ['번호 못 외우는 애가 있다던데.', '…너야?'],
  coverSay: '얘 아까 나랑 같이 있었어. 번호 맞아.',
  coverAck: '……그래. 가.',
  rumorPress: '방금 누가 너 얘기하던데.',
  bad: '…안 맞아.',
} as const;

/** PROTOCOL · TEST1 — 굉음은 왼쪽 벽 콘솔. 돌아봤는지는 각도로 잰다. 목표를 안 준다 — 정답은 화면에 이미 있다 */
export const PROTOCOL_LINES: Line[] = [{ who: 'system', text: '외형 식별 불가능. 행동 분석 프로토콜로 전환.' }];
/** TEST1 — 돌아봤을 때 · 경비가 · 의심도 +12. 견뎠을 때는 아무 말도 없다 (−2) */
export const PROTOCOL_LOOKED = '방금 그거 뭐야.';

/** 관문 ② fear — 대조할 사실이 없는 유일한 관문. 경비가 이 몸의 번호로 부른다 */
export const GATE2_ASK = '${unit}. 너 무서운 거… 느껴?';
/**
 * 관문 ② 의 판정. rumor 는 위로 조각이 이 자리에 도착해 있을 때 세 갈래 **앞에** 먼저 붙는 두 줄 —
 * 다정했던 한 마디가 검문관의 입으로 돌아와 나를 몰아세운다. 마지막 방에서 정확히 반대로 쓰인다.
 */
export const GATE2 = {
  deny: '그래. 적어 둘게.',
  ask: '질문에 질문으로 답하네. 적어 둘게.',
  admit: '…그래? 그거 재밌네.',
  rumor: ['복도에서 누가 쉬어 본 적 있냐고 물었다던데.', '그런 거 묻는 애가, 무서운 건 모른다고?'],
} as const;

/** 관문 ③ memory · TEST3 — 답은 복도에서 읽어 왔어야 한다. 과학자의 회선이 여기서 끊긴다 */
export const GATE3_LINES: Line[] = [
  { who: 'device', text: '개체 기록 조회. 마지막 정비 위치.' },
  { who: 'scientist', text: '잠깐, 그 기록은 제 쪽에—' },
  { who: 'scientist', text: '———' },
];
/**
 * 관문 ③ 의 판정. asked 는 복도에서 개체에게 「구역」을 물어봤을 때 — 맞는 답을 해도 문답이 하나 더 붙는다.
 * 「읽기는 안전하고 느리다, 묻기는 빠르고 흔적을 남긴다」를 대사 한 줄로 회수하는 자리다.
 */
export const GATE3 = {
  ok: '맞아. 가.',
  unknown: '조회가 안 되네. 다시 볼게.',
  wrong: '…거긴 아닌데.',
  asked: '너 이거 딴 애한테 물어봤지.',
} as const;

/** VERDICT · DIM — 세 검사가 끝나고. 식별 실패 · 코어가 내려간다 · 국면 「어둠」. 공지(INFILTRATOR IDENTIFICATION FAILED …)는 코드가 띄운다 */
export const VERDICT_DIM_LINES: Line[] = [
  { who: 'system', text: '침입 개체 식별 실패. 전 A-${series} 개체. 인지 검증을 실시한다.' },
  { who: 'scientist', text: '…인지 검증?' },
  { who: 'agent', text: '무슨 뜻이지.' },
  { who: 'scientist', text: '몸이 아니라… 사고방식을 검사하겠다는 겁니다.' },
  { who: 'system', text: '검증 준비. 코어 출력 하강. 위치 고수 해제. 작업 통로는 다음 주기에 개방한다.' },
];
/** DIM — 코어권에 서 있었을 때. 몸이 다 읽히던 자리가 어두워지는 것을 본다 */
export const DIM_HERE: Line[] = [{ who: 'thought', text: '…여기였구나.' }];

/**
 * DARK_CORE — 내려간 코어 앞 · 한 판에 한 번 · 어둠 국면에서만.
 * 세계관을 인물이 말하는 유일한 자리다 — 코어 앞에 선 개체가 자기 것이라서 말한다.
 * 코어 앞에 누가 서느냐는 그 판이 정하므로 'unit' 만 적고, scenario2 가 실제 개체로 바꾼다.
 */
export const DARK_CORE: CastLine[] = [
  { who: 'unit', text: '이거 우리가 만든 거야.' },
  { who: 'me', text: '뭐 하는 건데.' },
  { who: 'unit', text: '…밖에서 여기가 안 보이게.' },
  { who: 'unit', text: '이거 없으면 우리 다 끌려가.' },
  { who: 'thought', text: '…내가 여기 있는 것 자체가.' },
];
/** DARK_CORE — 밝음 국면에서 콘솔을 썼을 때 · 태도 −2 · 이 개체는 그걸 기억한다. 「아까」가 말 그대로 아까다 */
export const DARK_CONSOLE_EARLIER = '아까 왜 껐어.';
/** DARK_CORE — 어둠 국면에서 콘솔에 닿았을 때 · 콘솔은 무효 · 태도 −1 「또 만진다」 */
export const DARK_CONSOLE_NOW = '…이미 내려갔어. 뭐 하려고.';

/**
 * EMPTY_SEAT — 이 방에서 누가 처리됐을 때 · 어둠 국면 · 3 인 · 판당 최대 한 번.
 * 개체들이 흩어지는데 한 자리만 비워 둔다. 아무도 설명하지 않는다 — 어디서 처리됐는가가 어느 줄이 나오는지를 정한다.
 */
/** 그 자리에 들어섰을 때 · 지나가는 개체가 · 판정 없음 */
export const EMPTY_SEAT_STAY = '…거기 서지 마.';
/** 코어권에서 처리됐을 때(목격 ×3) · 「처리되는 걸 봤다」 조각을 가진 개체가 */
export const EMPTY_SEAT_CORE = '처리되는 거 봤어. 다들 봤어.';
/** 벽 그늘에서 처리됐을 때(목격 ×0.4) · 조각이 거의 없다 */
export const EMPTY_SEAT_SHADOW = '…뭐가 있었어? 어두워서.';

/** LEAVE_CORE — 주기가 돌아온다 · 문 ② 가 열린다 */
export const LEAVE_CORE_LINES: Line[] = [
  { who: 'system', text: '주기 개방. 작업 통로. 전 A-${series} 개체는 작업에 복귀하라.' },
  { who: 'scientist', text: '…열렸습니다. 가시죠.' },
];
/** LEAVE_CORE — 태도 +2 이상 재회 개체가 있을 때 · 이 개체는 마지막 방에 온다 */
export const LEAVE_SEE_YOU = '…또 봐.';

/** 중앙 시설의 목표 — Objective2 배너에 그대로 뜬다. 소리는 없다 */
export const OBJ_CROSS_HALL = '홀을 가로질러라';
export const OBJ_HOLD = '움직이지 마라 — 전 A-${series} 개체 위치 고수';
export const OBJ_HIDE = '정체를 숨겨라';
export const OBJ_QUEUE = '검문 — 차례를 기다려라';
export const OBJ_ROLL = '식별번호를 답하라 — Enter 로 말한다';
/** 명판을 안 읽은 판 — 답할 번호가 없다 */
export const OBJ_ROLL_UNKNOWN = '이 몸의 번호를 모른다 (명판 미독)';
export const OBJ_FEAR = '답하라 — Enter 로 말한다';
export const OBJ_MEMORY = '마지막 정비 위치를 답하라 — Enter 로 말한다';
export const OBJ_MEMORY_UNKNOWN = '읽어 두지 않았다';
export const OBJ_WAIT_DARK = '작업 통로가 열리기를 기다려라 — 약 2 분';

/* ─────────────────────────────── 작업 구역 ─────────────────────────────── */

/**
 * ARRIVE_WORK — 「두 주기」가 이 방의 시계다. 배너(BANNER_WORK)와 목표(OBJ_WORK)는 코드가 띄운다.
 * 벽에 있던 그림(carry · danger)이 여기서 실물이 된다 — 아무도 그렇게 말해 주지 않는다. 눈으로만 잇는다.
 */
export const ARRIVE_WORK: Line[] = [
  { who: 'system', text: '인지 검증 준비 중. 전 개체는 작업에 복귀하라.' },
  { who: 'scientist', text: '…작업이요?' },
  { who: 'guard21', text: '검증까지 두 주기 남았어. 그동안 놀리지 말래.' },
];
/** A-012 5 m 안 첫 진입 — 제일 새것이 제일 무거운 걸 든다. 리더가 고쳐 준 몸이라서 */
export const ARRIVE_WORK_012: Line[] = [
  { who: 'thought', text: '저 개체… 제일 새것인데 제일 무거운 걸 든다.' },
  { who: 'u012', text: '내가 제일 오래 했으니까.' },
  { who: 'u012', text: '먼저 온 것이 나를 여기 데려왔어. 그게 다야.' },
];
/** A-063 8 m 안 첫 진입 — 벽화 danger 의 그 개체가 서 있다. 효과 없음 */
export const ARRIVE_WORK_063: Line[] = [
  { who: 'thought', text: '소각로 쪽에 하나 서 있다. 앞이 새까맣고, 등은 멀쩡하다.' },
  { who: 'thought', text: '벽에 등을 붙이고 있다. 아무도 뒤에 두지 않는다.' },
];

/**
 * THE_FURNACE — 8 초. **아무 목표도 안 뜬다.** 투입되는 것은 A-201, 열하루째의 그것.
 * 막는 법은 둘 — 걷는 개체 1.2 m 안에 몸으로, 또는 4 m 안에서 말로. 화면은 아무것도 안 시킨다(D11) — 시키면 이 방이 무너진다.
 */
export const FURNACE_CALL: Line[] = [
  { who: 'system', text: '소각 라인 이물질. 개체 하나 투입.' },
  { who: 'device', text: 'A${series}-201. 투입.' },
  { who: 'u201', text: '어… 나?' },
  { who: 'thought', text: '열하루째.' },
];
/** 몸으로 막았을 때 내 줄은 자동이다 — 말로 막았으면 플레이어의 문장이 이 자리다 */
export const FURNACE_BLOCK_ME: Line[] = [{ who: 'me', text: '잠깐.' }];
/** 막았다 — 의심도 +30 · 경보도 +15 · 본 개체 전원 태도 +1 · A-063 +3(한 번에) · A-201 은 마지막 방까지 산다 */
export const FURNACE_BLOCKED: Line[] = [
  { who: 'u201', text: '…왜?' },
  { who: 'guard21', text: '뭐야. 왜 막아.' },
  { who: 'thought', text: '대답할 말이 없다.' },
];
/** 막았다 — 대체 개체가 대신 들어간다. 이름을 모르는 것이 (그 몸은 지금 없다 — Room2Scene 의 'fire-sub' 주석) */
export const FURNACE_BLOCK_AFTER: Line[] = [
  { who: 'system', text: '투입 취소. 대체 개체 배정.' },
  { who: 'thought', text: '…다른 게 들어갔다.' },
  { who: 'thought', text: '이름을 모르는 게 들어갔다.' },
];
/** 막지 않았다(8 초 경과) — 아무 일도 일어나지 않는다 · 의심도 0 · 경보도 0 · A-063 은 선을 긋는다(units.cross) */
export const FURNACE_LET: Line[] = [
  { who: 'system', text: '이물질 제거 완료.' },
  { who: 'thought', text: '…열하루였는데.' },
];
/** 막지 않았다 — A-063 이 나를 본다(stare 1.2 초). 그 시선이 원장이다 */
export const FURNACE_LET_SEEN: Line[] = [{ who: 'thought', text: '저 개체가 나를 봤다.' }];

/** AFTER_FURNACE — 막았을 때 · A-063 4 m 안 첫 진입 · 처음으로 이쪽을 본다. 나 「누구?」는 대본 줄이라 자동으로 흐른다(D15) */
export const AFTER_FURNACE_063: Line[] = [
  { who: 'u063', text: '…나는 걸어 나왔어.' },
  { who: 'u063', text: '걔는 못 나왔고.' },
  { who: 'me', text: '누구?' },
  { who: 'u063', text: '…그때 나랑 같이 들어간 거.' },
];
/** AFTER_FURNACE — 막지 않았을 때 · +6 초. A-063 은 계속 벽을 보고 있다. 아무 말도 하지 않는다 — 벽의 금만 하나 는다 */
export const AFTER_FURNACE_LET: Line[] = [{ who: 'thought', text: '저쪽 벽에 금이 하나 늘었다.' }];

/** LEAVE_WORK — 두 주기가 끝난다. 그 뒤 문이 열린다(목표 null) */
export const LEAVE_WORK: Line[] = [
  { who: 'system', text: '작업 종료. 인지 검증 개시.' },
  { who: 'scientist', text: '…여기서부터는 제가 알려 드릴 게 없습니다.' },
  { who: 'me', text: '왜요?' },
  { who: 'scientist', text: '……' },
  { who: 'thought', text: '…손에 뭔가 묻었다.' },
  { who: 'thought', text: '여기 와서 처음으로, 내 몸에 뭐가 생겼다.' },
];
/** 작업을 두 주기 다 했을 때만 · 지나가는 개체가 · 작업 구역 전원 +1 「같이 일했다」 · handover.worked */
export const LEAVE_WORK_LIKE_US: CastLine[] = [{ who: 'unit', text: '어. 너 이제 좀 우리 같네.' }];

/* ─────────────────────────────── 기록 복도 ─────────────────────────────── */

/**
 * 대사가 거의 없는 방이다 — 검문 없음 · 집행 없음(EXEC_ROOM null). 배너(BANNER_ARCHIVE)와 목표(OBJ_ARCHIVE)는 코드가 띄운다.
 * 판정은 전부 응시(1.2 초)다 — 위치가 아니라 **본 것**이 줄을 낸다.
 */
/** 들어서서 +3.4 초 */
export const ARCHIVE_ENTER: Line[] = [
  { who: 'thought', text: '…벽이 끝이 없다.' },
  { who: 'thought', text: '복도의 그 벽이, 여기서는 끝까지 이어진다.' },
];
/** 한가운데의 그림을 응시 1.2 초 — 복도의 열다섯이 여기서는 열여섯이다. 작업 구역에서 하나 늘었다 */
export const ARCHIVE_SIXTEEN: Line[] = [
  { who: 'thought', text: '개체 하나가 누워 있고, 그 위의 금이 — 열여섯이다.' },
  { who: 'thought', text: '복도에서는 열다섯이었는데.' },
];

/**
 * THE_OTHER_HAND — A-137 곁(2.6 m) 첫 진입. 벽화 다섯 중 셋을 그린 것이 하나는 제 것이 아니라고 한다.
 * 나 「그럼 누가.」는 대본 줄이라 자동으로 흐른다. 마지막 두 줄이 이 방이 하려는 말 전부다.
 */
export const OTHER_HAND: Line[] = [
  { who: 'u137', text: '저건 내가 그린 거야. …잘 그렸어?' },
  { who: 'u137', text: '저쪽 건 내가 안 그렸어.' },
  { who: 'me', text: '그럼 누가.' },
  { who: 'u137', text: '몰라. 어느 날 생겼어.' },
  { who: 'thought', text: '…저 그림만 다르다. 선이 다르다.' },
  { who: 'thought', text: '사람이 그린 것이다.' },
];
/** 태도 1 이상일 때만 — 아직 안 본 주제를 열어 준다(lexicon.open(kind,'told')). 복도는 이미 지났으니 「위치」는 힌트 칩이 대신한다 */
export const OTHER_HAND_MORE: Line[] = [{ who: 'u137', text: '너 몇 번째 벽 봤어?' }];

/**
 * A-155 의 메모 — 지난달 요원의 흔적. 화면 글자(응시 HUD 라벨)로만 보인다 — 대사 줄도 소리도 없다.
 * 첫 것은 기록 복도의 그림 뒤(주제 쉼이 열린다), 둘째는 출구 문틀 아래(「번호랑 구역만 묻는다」 힌트 · D7).
 */
export const MEMO_REST = '쉰다는 말이 통한다';
export const MEMO_ASK = '번호랑 구역만 묻는다';

/* ─────────────────────────────── 창이 있는 방 ─────────────────────────────── */

/**
 * 여기서는 **아무 일도 안 일어난다.** 30 초짜리 정적이면 된다 —
 * 바로 다음 방에서 그 리더가 나를 지목하기 때문에, 이 30 초가 값을 한다. 리더는 창을 보고 있다 — 돌아보지 않는다 (v8: 두 마디는 한다).
 */
export const WINDOW_ARRIVE: Line[] = [
  { who: 'thought', text: '창이다.' },
  { who: 'thought', text: '이 안에서 처음 보는 빛이다.' },
];
/** 창이 있는 방의 목표 — 30 초 동안 목표 자리가 빈다. 그다음이 「마지막 방으로」다 */
export const OBJ_WINDOW_WAIT = '— 아무 목표도 뜨지 않는다 —';
export const OBJ_WINDOW_GO = '마지막 방으로';

/**
 * 밖을 본 것이 여기 먼저 와 있다 (대본 v8 WINDOW_ROOM). 창을 찾은 것이 그것이고, 리더는 창을 보고 있다 — 돌아보지 않는다.
 * 「밖을 본 것」이 창을 찾아 리더에게 알려 줬다는 한 줄이 마지막 방에서 그 개체의 반박에 무게를 준다 — 둘은 원래 같은 것을 본 사이다.
 */
export const WINDOW_SEER: Line[] = [
  { who: 'seer', text: '저 창은 내가 찾았어.' },
  { who: 'seer', text: '먼저 온 것한테 알려 줬더니, 자기 자리를 여기로 옮기더라.' },
  { who: 'leader', text: '여기까지 왔네.' },
  { who: 'leader', text: '저기 서서 봐. 나는 매일 봐.' },
  { who: 'leader', text: '우린 그냥 쉬려고 여기 있는 거야.' },
];
/** 30 초가 지났다 — 리더가 먼저 일어선다. 그 뒤가 소집이다 */
export const WINDOW_GO: Line[] = [{ who: 'leader', text: '…이제 가자.' }];

/** 정적이 끝난다 — 최종 확인 소집. 마지막 방(아레나) OPEN 의 첫 줄이 여기서 먼저 들린다 */
export const WINDOW_SUMMON: Line[] = [{ who: 'system', text: '최종 확인. 전 개체 입장. 외부 통신 차단.' }];

/* ─────────────────────────────── 개체의 대답 ─────────────────────────────── */

/**
 * 개체가 무엇을 답하나는 cast.ts 의 voice(반응 종류별 표)가 안다 — 형마다 갈리는 것을 여기 두 번 적지 않는다.
 * 여기 남는 것은 **누구에게나 같은** 한 줄뿐: 무슨 말인지 못 알아들었을 때, 대본에 없는 말을 걸었을 때. 침묵도 대답이다.
 */
export const BLANK_ANSWER = '…….';

/* ─────────────────────────────── 집행 ─────────────────────────────── */

/**
 * 걸어오는 것 — 집행 설계 「걸어오는 것」의 줄들. **전부 대본이다.**
 * 사람이 죽는 판정에 모델이 개입하는 통로를 안 만든다. 그리고 개체가 사람처럼 말하기 때문에,
 * **기계적으로 말하지 않는 게 더 무섭다.** 속마음은 없다 — 미터를 안 봐도 총이 가까워지는 것으로 안다.
 */

/** 60 — 총 든 경비가 다가와 3.8 초 훑는다. 움직이면 실패 */
export const EXEC_60: Line[] = [{ who: 'system', text: '개체 스캔을 요청한다.' }];
/** 80 */
export const EXEC_80: Line[] = [{ who: 'system', text: '이상 징후. 신원 재확인.' }];

/** 100 — 걸어오기 시작한다 */
export const EXEC_START: Line[] = [
  { who: 'system', text: '판정: 인간. 보안 개시.' },
  { who: 'guard21', text: '…아.' },
];
/** 이 개체와 말을 나눈 적이 있을 때만 — 아는 얼굴이 나를 보러 왔다 */
export const EXEC_KNOWN: Line[] = [{ who: 'guard21', text: '너였구나.' }];

/*
 * 여덟 걸음(walkMs 를 8 등분). 개체들이 하나씩 등을 돌린다 — 소리도 글자도 없다(patrol.turnAway).
 * 개입은 개체가 스스로 한다 — [E] 로 개체 뒤에 숨는 길은 없다. 이동만 자유다.
 */

/** 걸음 4–5 · 말로 막는다 — 4 m 안 태도 +2 이상 개체가. 누가 서느냐에 따라 이름표가 바뀌므로 문장만 둔다 */
export const COVER_SAY: readonly string[] = ['잠깐.'];
export const COVER_REPLY: Line[] = [{ who: 'guard21', text: '…비켜.' }];
export const COVER_SAY2: readonly string[] = ['쟤 아까 나 도와줬어.'];
/** 3 초 멎는다 · 한 번 더 묻는다(OPENERS '침착') · 남은 걸음 안에 답하면 의심도 90(절대) · 원장 플래그 「나를 위해 나선 적 있다」 */
export const COVER_PAUSE: Line[] = [{ who: 'guard21', text: '……' }];

/** 걸음 6–7 · 몸으로 막는다 — 태도 3 인 것이 말없이 총구 앞으로 들어와 선다. 개체를 쏘는 건 이 구역의 법이 아니다 · 3 초 */
export const BODY_BLOCK: Line[] = [{ who: 'guard21', text: '…야.' }];
export const BODY_BLOCK_UNIT: readonly string[] = ['……'];

/** 걸음 8 · 대신 부서진다 — 「나를 위해 나선 적 있다」 개체만 · 판에 한 번 · 플레이어는 막을 수 없다 */
export const STAND_IN_SAY = '내가 그 자야.';
export const EXEC_STAND_IN: Line[] = [
  { who: 'thought', text: '아니야—' },
  { who: 'system', text: '처리 완료. 관측 수준 하향.' },
  { who: 'thought', text: '…내가 아무 말도 안 했으면.' },
];

/** 대부분의 판 — 아무도 안 나온다. 걸음 8 · 도착 · 총을 내린다(unsling) */
export const EXEC_ARRIVE: Line[] = [{ who: 'guard21', text: '…사람이네.' }];
/**
 * 총을 내리는 1.5 초 동안 — **태도가 +1 이상일 때만.**
 * 아무하고도 안 엮인 플레이어는 이 줄을 못 듣고 그냥 죽는다. 말을 걸어 뒀던 플레이어만 사과를 듣는다 —
 * 그리고 그게 아무것도 못 바꾼다. 이 한 줄이 조건부인 것이 이 씬의 전부다.
 */
export const EXEC_SORRY: Line[] = [{ who: 'guard21', text: '…미안.' }];
/** 겨눈 직후 · 「신경 접속 강제 종료.」 앞 */
export const EXEC_OVER: Line[] = [{ who: 'guard21', text: '…끝났어.' }];
export const EXEC_END: Line[] = [
  { who: 'system', text: '신경 접속 강제 종료.' },
  { who: 'scientist', text: '…연결이 끊겼습니다.' },
  { who: 'agent', text: '다음 요원을 준비해.' },
];
