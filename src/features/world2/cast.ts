/**
 * 개체 열 — **어디가 닳았나.** 기획서 「어디가 닳았나」(캐릭터 기획 · 외형 · 성격 · 적아 분기) 그대로다.
 *
 * 공장에서 나올 때 이 개체들은 전부 같은 모습이었다. 지금 다르게 생겼다면 그건 **서로 다른 일을 해 왔다**는 뜻이다.
 * 그래서 성격을 먼저 정하고 외형을 붙이지 않았다 — **외형을 정하면 성격이 따라 나오게** 했다.
 * 이 파일에 외형표와 성격표가 **한 벌로** 있는 이유가 그것이다: 둘을 따로 관리하면 반드시 어긋난다.
 *
 *   얼굴판의 표시   스스로 긁거나 칠했다 — 구별되고 싶었다   → 호기심 · 그리는 것
 *   앞면 그을림     고열 · 소각 작업. 살아서 돌아왔다        → 경계 · 과묵
 *   손끝 · 전완     정밀 작업. 실수가 허용되지 않았다        → 완벽주의 · 불안
 *   어깨 · 등       제 몸보다 큰 것을 오래 날랐다            → 갈망 · 온순
 *   비규격 수선     색이 안 맞는 부품 — 여기서 서로 고쳐 줬다 → 돌봄을 받아 본 것 · 갚으려 한다
 *   무릎 · 발       걷는 일. 순찰이거나 운반이거나           → 피로 · 직업의식
 *
 * ★ 그리고 이 게임에서 **아무 데도 안 닳은 몸은 하나뿐이다. 내 몸이다.**
 *   이 구역에서 안 닳은 몸은 「최근 배치」밖에 없고, 최근 배치라면 번호가 높아야 한다 —
 *   복도의 명판이 준 번호가 낮으면 그 순간 몸과 기록이 어긋난다. 개체들이 나를 처음 읽는 방식도 똑같다.
 *
 * ★ 대사는 「쉬어 본 적 있나」(대본 전문 v8)와 이 기획서의 인용을 그대로 쓴다. 지어내지 않는다 —
 *   tests/features/world2/script-verbatim.test.ts 가 voice 의 문장 하나하나를 두 문서에서 찾는다.
 * ★ 몸도 **성격마다 따로 뽑았다** (look.asset — Tripo Studio, tools/scenario2-cast-parts.json).
 *   프롬프트에 성격을 안 적고 **닳은 자리만** 적었다: 어깨가 벗겨진 것, 손끝만 은색인 것, 앞면만 그을린 것.
 *   동료 요원 둘과 배경 개체는 개체의 몸을 **빌려 쓴다** — 겉으로 구별되면 안 되는 것들이라 그게 맞다.
 * ★ 음성은 이 파일에서도 긁는다 (tools/voice-lines.mjs castVoices) — 배역마다 `id: '…'` 뒤에 `voice: { … }` 객체 하나,
 *   그 안의 작은따옴표 문자열이 전부 그 배역의 목소리로 구워진다. 그래서 voice 안에는 문장 말고 아무것도 안 둔다.
 */

import { unitName } from '@/shared/series';

import type { PersonaKind, VoiceTable } from './reaction';
import type { Tag } from './read';

/* ─────────────────────────────── 외형 ─────────────────────────────── */

/** 닳은 자리 — 마스크 여섯 장. 같은 메시로 개체 전부를 만든다 (세계관이 곧 최적화다) */
export type WearPart = 'shoulder' | 'hand' | 'front' | 'knee' | 'whole' | 'none';
/** 수선 — 색이 맞는 규격 부품인가, 색이 안 맞는 남의 손인가, 아예 없나 */
export type Repair = 'none' | 'spec' | 'odd';
/** 얼굴판 — blank 는 판 자체가 없다(구형 · 표현 기능 없음). 조각을 안 얹는다 */
export type Face = 'stock' | 'marked' | 'melted' | 'blank';
/**
 * 자세 — **10m 밖에서 읽히는 정보**다. 벽을 보는 개체와 문을 보는 개체는 멀리서도 갈린다.
 * 텍스처만 다르면 어두운 복도에서 구별이 안 되고, 구별이 안 되면 이 시스템 전체가 없는 것과 같다.
 */
export type Stance = 'idle' | 'wall' | 'door' | 'back' | 'hands' | 'copy' | 'window';
/**
 * 서 있는 동안의 **버릇** — 기획서 「자세 세트」의 다섯(대기 · 벽을 본다 · 등을 붙인다 · 손을 확인한다 · 남을 따라 한다)에서
 * 몸이 계속 하는 것만 뽑았다. 성격표와 코드가 같은 이름을 쓰라고 여기 둔다 — wear.ts 의 idle 프로필이 이 이름으로 갈린다:
 *   default  숨 + 무게 이동 (뼈 없는 몸이 전시품으로 안 보이는 최소)
 *   hands    6~9 초마다 제 손을 내려다본다 (손끝이 닳은 것 — 「말하면서 손을 본다」)
 *   copy     4~7 초마다 기대는 쪽을 바꾼다 (열하루째 — 「서 있는 자세를 계속 바꾼다」)
 *   still    안 흔들린다 (앞이 그은 것 — 그 뒤로 아무도 뒤에 두지 않는다. 움직이지 않는 몸이 그 말이다)
 *   guard    무릎이 피로한 것 — 좌우로 두 배 크게 옮겨 딛는다
 *   leader   구형 — 느리고 작게. 숨도 반, 주기도 두 배
 * 안 주면 stance 로 짐작한다 (wear.idleOf)
 */
export type Idle = 'default' | 'hands' | 'copy' | 'still' | 'guard' | 'leader';
/**
 * **하던 일** — 버릇(Idle)이 「가만히 있는 동안 몸이 하는 것」이라면 이건 「그 개체가 지금 **무엇을 하는 중인가**」다.
 * 자세(Stance)가 10 m 밖에서 읽는 정보라면 이건 3~5 m 에서 읽는 정보다: 벽을 보고 선 둘이 여기서 갈린다 —
 * 하나는 **그리고 있고** 하나는 **보고 있다**.
 * 기획서의 줄 그대로 이름을 붙인다 (activity.ts 가 이 이름으로 갈린다):
 *   paint  「벽 앞에 앉아 손에 안료가 묻어 있다」(대본 v7 HALL_UNITS · A-137)
 *   read   「벽화 앞에 오래 서 있다」(대본 v7 HALL_UNITS · A-104) · 「자세 · 벽 쪽을 본다」(배역표)
 *   watch  「자세 · 문만 본다」(배역표 · A-089)
 *   wait   무엇도 아닌 것 — 무게 이동 · 곁눈질 · 손 확인. **눈에 띌 것이 하나도 없어야 하는 몸**이 한다
 *          (동료 요원 슬롯이던 A-051 이 그 자리다: 겉으로 구별되면 안 되는 것이 이 몸의 조건이었다)
 *
 * 뒤 넷은 **기획서의 인용이 아니라 오늘의 결정**이다 (2026-09-03 사용자: 「다른객체들 왜 아무것도 안움직여
 * 자연스럽게 움직이게 해줘야지」). 앞 넷이 붙은 배역은 열둘 중 넷뿐이었고, 나머지 서른 남짓은 GLB idle 클립의
 * 척추 ±1° 와 절차 idle 1.6° 밖에 없었다 — 6 m 밖에서는 정지와 구별이 안 되는 폭이다. 그래서 **아무 일도
 * 안 적힌 몸에도 붙일 수 있는 최소한**을 넷 더 만든다. 무엇을 하는지가 아니라 「살아 있다」만 말하는 것들이다:
 *   shift  무게중심을 옮긴다 — 오래 선 몸이 하는 것 (기다리는 줄 · 열하루째)
 *   scan   천천히 둘러본다 — 홀에 선 것들 (볼 것이 하나뿐인 방에서 그 하나를 훑는다)
 *   fidget 제 손을 확인한다 — 손끝이 닳은 것들 (stance 'hands' 와 같은 낱말이다)
 *   lean   벽·단에 기댄다 — 벽을 따라 선 것들
 * 안 주면 아무것도 안 한다 — 서 있는 것도 이 게임에서는 하나의 답이다.
 */
export type Act = 'paint' | 'read' | 'watch' | 'wait' | 'shift' | 'scan' | 'fidget' | 'lean';

export interface Look {
  /**
   * 이 개체의 **몸** — Tripo 로 성격마다 따로 뽑은 GLB (assets/manifest 의 id).
   * 안 주면 기존 리깅 아바타를 쓴다 — 걷는 다리가 필요한 것(배경 개체)뿐이다.
   */
  asset?: string;
  /** 닳은 자리와 강도 0~3 */
  wear: WearPart;
  grade: 0 | 1 | 2 | 3;
  repair: Repair;
  face: Face;
  stance: Stance;
  /** 서 있는 동안의 버릇 (위 Idle). 안 주면 stance 에서 짐작한다 */
  idle?: Idle;
  /** 하던 일 (위 Act) — 말을 걸면 멈추고 나를 본다 (attitude.attend). 안 주면 그냥 서 있다 */
  act?: Act;
  /** 밖에서 일해 본 유일한 개체 — 도장이 닳은 게 아니라 **바랬다** */
  bleached?: boolean;
  /** 광학 하나가 흐리다 */
  dimEye?: boolean;
  /**
   * 몸 자체를 **본판 무장 심문 AI 것으로 쓴다** — public/world/enforcer.glb + enforcer_rifle.glb, 걸음·조준은
   * features/world/enforcerPose 의 코드 자세, 총구 섬광은 muzzle. 시나리오 2 의 UNIT-21 이 그 몸이다
   * (2026-09-03 사용자: 「복도의 총 든 glb 는 중앙 시설의 총 든 glb 그대로」). 총은 이 몸이 제 손에 붙이므로 rifle 은 안 본다.
   * ★ 켜지 않은 것은 열의 제 몸(asset)을 쓴다 — 총을 빌려 든 동료(ally-hard)는 평범한 개체로 보여야 한다
   */
  enforcer?: boolean;
  /**
   * 총을 들고 있다 — 오른손 뼈에 enforcer_rifle.glb 를 붙인다 (CastBody 의 Rifle).
   * 몸에 모델링해 넣지 않는다: 총은 심문 AI 것을 그대로 빌린다. 이 값을 켠 개체는 **화면에서 한눈에 갈린다** —
   * 대화창이 그 말에 총 든 초상(portrait-enforcer)을 붙이니 몸도 총을 들고 있어야 한다 (2026-09-03 사용자)
   */
  rifle?: boolean;
  /** 구형 계열 — 크고 각지다. A 계열이 아니라 군중 속에서 절대 못 숨는다 */
  older?: boolean;
  /** 키(m). 안 주면 참가자와 같다 */
  height?: number;
}

/* ─────────────────────────────── 성격 ─────────────────────────────── */

/**
 * 태그 하나에 개체마다 다른 부호가 붙는다 — **같은 말이 정반대 결과**를 낸다.
 * 플레이어는 태그를 모르지만 「이 개체는 노동 얘기를 좋아하더라」를 두세 번이면 배운다.
 * 배울 수 있는 규칙 위에 누구에게 걸지는 내가 고르는 구조라, 자유 입력이 사고가 아니라 전략이 된다.
 */
export interface Persona {
  /**
   * 형 — 대답표의 어느 칸이 열리나를 정한다 (reaction.ts). 갈망형은 위로를 세고, 냉소형은 첫 위로에 값을 매기고,
   * 신봉형은 암구호를 리더에게 넘기고, 호기심형은 그림 얘기에만 움직인다. 가중치는 그 밖의 말을 받는다
   */
  kind: PersonaKind;
  /** 태그별 태도 변화. 안 적힌 태그는 0 */
  weight: Partial<Record<Tag, number>>;
  /** 넘으면 안 되는 선 — 그 자리에서 −3 이고 **되돌릴 수 없다.** 그 선은 이 개체의 이력에서 나온다 */
  line?: { tag: Tag; why: string };
  /** 이 개체가 낼 수 있는 태도의 위·아래 끝 (없으면 ±3) */
  cap?: { max?: number; min?: number };
  /** 같은 태그를 이만큼 되풀이해야 한 번 답한다 (앞이 그은 것) — 오르는 쪽에만. 내리는 말은 첫 번에 듣는다 */
  repeat?: number;
  /**
   * **모델에게만 가는 한 줄** — 이 몸이 어떤 것인지. 값 판정은 이 필드를 한 번도 안 읽는다:
   * 태도·의심·경보·조각·원장은 여전히 kind · weight · line · cap 이 그대로 쥔다 (talk.ts). 여기 적히는 것은
   * 프롬프트 산문으로만 나간다 (sayfields.ts 의 nature → world2say 의 SYSTEM).
   *
   * 이 칸이 필요한 이유는 하나다 — 배경 스물넷이 같은 kind('bg')를 쓰면서도 **서로 다른 대답**을 해야 한다
   * (2026-09-03 사용자: 「답변이 하드코딩이 아니라 모델마다 대답할수있게해줘. 성격마다 다르게.」).
   * kind 를 새로 만들면 talk.ts 의 갈래 사다리(agent · curious · devout · yearn · cynic)가 흔들려
   * 경보 +12 나 리더 직행이 배경에서 튀어나온다. 값에 손대지 않고 말투만 갈리게 하는 자리가 여기다.
   */
  temper?: string;
}

export interface CastDef {
  id: string;
  /** 이름표 — 번호이거나 호칭이거나. 호칭이 붙는 것은 둘뿐이다 */
  label: string;
  /** 무엇이 닳았는지로 부르는 이름 — 화면에는 안 뜬다. 코드를 읽는 사람을 위한 것 */
  title: string;
  look: Look;
  persona: Persona;
  /** 말을 걸기 **전에** 눈으로 짚을 수 있는 것 */
  tell: string;
  /**
   * 이 개체가 하는 말 — 두 문서의 인용 그대로다. 지어내지 않는다.
   * 칸은 반응 종류다(reaction.ts 의 VoiceTable): work 는 업무 질문에, comfort 는 위로 n 번째에(바깥 배열이 횟수),
   * memorial · mural · muralExact · dismiss · sign · signAgain · report 는 그 형만 갖는 칸, byTag 는 태그별 대답,
   * up / flat / down 은 그 밖의 오름 · 제자리 · 내림. flat 만 필수다 — 말이 없는 개체는 「…….」다. 침묵도 대답이다
   */
  voice: VoiceTable;
  /** 편이 되면 / 적이 되면 (마지막 방에서 무슨 일이 일어나나) */
  ally: string;
  enemy: string;
  /**
   * 사람이다 — 정부가 같이 넣은 요원. 겉으로는 구별이 안 된다.
   * 플레이어는 상대가 사람인지 NPC 인지 끝까지 모른다.
   */
  agent?: boolean;
}

/* ─────────────────────────────── 휴게 구역의 배경 열여섯 ─────────────────────────────── */

/**
 * 벽을 따라 선 열여섯 — **배역은 주고, 이름과 대사는 안 짓는다.**
 *
 * 2026-09-03 사용자: 「왜 시나리오2에서 복도를 제외하고 다른객체한테 왜 말할수없지?」
 * 휴게 구역은 몸이 스물한 구인데 말이 걸리는 것은 셋뿐이었다. 나머지 열여섯은 자리표(Room2Scene 의 REST_CROWD)에만
 * 있고 이 배역표에 없어서, units.def 가 undefined 를 돌려주고 그 순간 성격도 하던 일도 대답도 없는 **껍데기**였다.
 *
 * 그래서 배역을 준다. 다만 **배역을 준다 ≠ 대사를 짓는다** — 이 저장소의 오랜 규칙(파일 머리말 ★)은 그대로다:
 *   · 번호를 안 짓는다. label 은 열여섯 전부 「개체」다 — 화자표(script.ts SPEAKER)에도 안 올리므로
 *     화면 이름표도 「개체」로 맞는다 (scenario2.speakerOf 의 BG_WALKER 무늬와 units.label 이 같은 값을 본다).
 *   · 문장을 안 짓는다. voice 는 flat 하나뿐이고 그것도 「…….」다 — **문장은 전부 모델이 짓는다**
 *     (2026-09-03 사용자: 「답변이 하드코딩이 아니라 모델마다 대답할수있게해줘. 성격마다 다르게.」).
 *     모델이 죽으면 「…….」로 떨어지는 계약(say.ts)이 이 한 줄의 존재 이유다.
 *   · 배역표가 드는 것은 **닳은 자리와 성격 한 줄**뿐이다. 그 둘이 눈에 보이는 것과 모델에게 갈 것의 전부다.
 *
 * ★ 명부(ROOM_UNITS)에는 여전히 안 올린다. 목격자 · 개입 후보 · 태도 규칙 · 도주 · 대신 나섬 · 조각은
 *   **이름 있는 다섯의 것**이고, 여기에 열여섯이 끼면 휴게에서 한 마디의 조각 대상이 5 에서 21 이 되고
 *   patrol 의 named 가 켜져 자리 간격이 3.2 → 6 m 로 뛰어 3.6 m 자리표가 통째로 위반이 된다.
 *   **말이 걸리는 목록은 scenario2 의 addressable 이 따로 든다** — 그 갈라짐이 이번 변경의 뼈대다.
 */

/**
 * 열여섯이 돌려 쓰는 여섯 벌 — 자리표(Room2Scene 의 CROWD_WEAR)에 있던 것을 여기로 옮겨 왔다.
 * 외형표와 성격표는 한 벌이어야 한다는 이 파일의 전제(머리말)를 배경도 지킨다.
 *
 * ★ asset 은 wear.bodyOf 의 BORROW 표가 그 wear 에 돌려주는 몸과 **글자 그대로 같아야** 한다
 *   (shoulder→s2_u104 · hand→s2_u118 · front→s2_u063 · knee/whole→s2_u089). 시험이 그 일치를 검사한다.
 * ★ wear 'none' 은 **하나도 없다.** 아무 데도 안 닳은 몸은 u201 하나와 내 몸뿐이라는 것이 이 게임의 핵심 명제다
 *   (파일 머리말 ★ · 시험). 자리표에 있던 여섯째가 'none' 이었어서 여기서 knee 로 바꿨다 — 배역이 되는 순간
 *   그 한 벌이 명제를 깨기 때문이다.
 */
const CROWD_LOOKS: readonly Look[] = [
  { asset: 's2_u104', wear: 'shoulder', grade: 2, repair: 'none', face: 'stock', stance: 'idle', act: 'scan' },
  { asset: 's2_u089', wear: 'knee', grade: 1, repair: 'odd', face: 'stock', stance: 'wall', act: 'lean' },
  { asset: 's2_u118', wear: 'hand', grade: 3, repair: 'none', face: 'blank', stance: 'hands', act: 'fidget' },
  { asset: 's2_u063', wear: 'front', grade: 2, repair: 'spec', face: 'stock', stance: 'idle', act: 'shift' },
  { asset: 's2_u089', wear: 'whole', grade: 1, repair: 'none', face: 'stock', stance: 'back', act: 'shift' },
  { asset: 's2_u089', wear: 'knee', grade: 2, repair: 'spec', face: 'stock', stance: 'idle', act: 'scan' },
];

/** 여섯 벌마다의 호칭과 눈에 보이는 것 — 화면에는 안 뜬다. title 은 코드를 읽는 사람의 것, tell 은 모델에게 간다 */
const CROWD_CARDS: readonly { title: string; tell: string }[] = [
  { title: '어깨가 굽은 것', tell: '어깨가 벗겨졌다. 아무것도 안 고쳤고, 벽을 등지지도 않고 그냥 서 있다.' },
  { title: '단에 기댄 것', tell: '무릎이 닳았고 고친 부품 색이 안 맞는다. 벽 단에 몸을 반쯤 얹고 있다.' },
  { title: '손끝이 닳은 것', tell: '손끝이 은색으로 벗겨졌다. 얼굴판이 없어서 무슨 표정인지 알 수 없다.' },
  { title: '앞면이 그을린 것', tell: '앞면이 그을렸고 규격 부품으로 고쳤다. 무게를 자꾸 한쪽으로 옮긴다.' },
  { title: '등을 벽에 붙인 것', tell: '온몸이 고루 닳았다. 방 쪽을 등지고 벽을 보고 서 있다.' },
  { title: '무릎을 고친 것', tell: '무릎을 규격 부품으로 고쳤다. 고개만 천천히 방을 훑는다.' },
];

/**
 * 열여섯의 **성격 한 줄** — 서로 전부 다르다. 이것이 「성격마다 다르게」의 실제 통로다:
 * kind 는 열여섯 전부 'bg' 로 같고(값 판정을 안 흔들려고), 모델에게 가는 것은 이 줄 하나다 (Persona.temper).
 *
 * ★ 숫자 · 날짜 · 사건 · 다른 개체의 이름 · 규정 · 장소를 **짓지 않는다** — 워커 SYSTEM 의 금지와 같은 선이다.
 *   여기 적힌 것은 「이 몸이 말을 걸렸을 때 어떻게 구는가」뿐이다.
 */
const CROWD_TEMPERS: readonly string[] = [
  '말을 많이 안 한다. 묻는 말에만 짧게 답하고 먼저 덧붙이지 않는다.',
  '누가 말을 걸면 놀란다. 여기서는 아무도 서로 말을 안 걸기 때문이다.',
  '오래 서 있어서 서 있는 것 말고는 할 줄 아는 게 없다. 그걸 스스로 안다.',
  '고친 부품이 제 것 같지 않아 말하는 중에도 자꾸 그 자리를 만진다.',
  '되묻는다. 대답보다 질문이 안전하다고 배웠다.',
  '말끝을 흐린다. 문장을 끝까지 밀고 갈 자신이 없다.',
  '공손하다. 누구에게든 조금 과하게 공손해서 그게 오히려 눈에 띈다.',
  '남이 한 말을 그대로 한 번 되풀이한 다음에 대답한다.',
  '쉬는 방에 와 있는데도 쉬는 법을 모른다. 여기 왜 왔는지 스스로도 모른다.',
  '조용한 것을 좋아한다. 말이 길어지면 그만 물어봐 줬으면 하고 바란다.',
  '남을 잘 본다. 대답보다 상대를 먼저 살핀다.',
  '자기 말이 기록될까 걱정한다. 그래서 아무것도 아닌 말만 한다.',
  '무엇을 물어도 업무로 돌려서 답한다. 그게 이 몸이 아는 유일한 화법이다.',
  '한 번 말을 시작하면 조금 길어진다. 오래 아무 말도 안 했기 때문이다.',
  '동의부터 한다. 무슨 말이든 먼저 맞다고 하고 그다음에 생각한다.',
  '이름이 없는 것이 편하다. 눈에 띄는 쪽이 위험하다고 여긴다.',
];

/** 벽을 따라 선 열여섯 — id 는 자리표(Room2Scene 의 `bg-rest-${i+1}`)와 **글자 그대로** 같아야 units.def 가 붙는다 */
function restCrowd(): CastDef[] {
  return CROWD_TEMPERS.map((temper, i) => {
    const card = CROWD_CARDS[i % CROWD_CARDS.length];
    return {
      id: `bg-rest-${i + 1}`,
      // 번호를 안 짓는다 — 이름표는 「개체」 그대로다
      label: '개체',
      title: card.title,
      look: CROWD_LOOKS[i % CROWD_LOOKS.length],
      tell: card.tell,
      /*
       * kind 는 반드시 'bg' 다 — yearn · cynic · devout 같은 것을 주면 talk.ts 의 갈래(위로 3단 · 보고 · 벽 얘기)로
       * 들어가 경보 +12 나 리더 직행이 배경에서 튀어나온다. cap 0/0 은 원장 · 조각 · 마지막 방의 표를 안 흔들기 위한
       * 안전장치다 (중앙 시설 홀의 배경 다섯과 같은 이유). 갈리는 것은 temper 하나다.
       */
      persona: { kind: 'bg' as PersonaKind, weight: {}, cap: { max: 0, min: 0 }, temper },
      // 문장은 모델이 짓는다. 이 한 줄은 모델이 죽었을 때의 마지막 줄이다
      voice: { flat: ['…….'] },
      ally: '—',
      enemy: '—',
    };
  });
}

/* ─────────────────────────────── 열 ─────────────────────────────── */

export const CAST: readonly CastDef[] = [
  {
    id: 'u104',
    label: unitName(104),
    title: '어깨가 닳은 것',
    look: { asset: 's2_u104', wear: 'shoulder', grade: 3, repair: 'odd', face: 'stock', stance: 'wall', act: 'read' },
    tell: '등판 도장이 벗겨졌고 어깨가 안쪽으로 굽었다. 왼팔에 색이 안 맞는 부품 하나. 휴게 구역에서는 구석에서 잔다.',
    persona: {
      /*
       * 오래 나르다가 누가 자기를 고쳐 준 적이 있는 개체. 그래서 갚고 싶어 한다.
       * 쉬고 싶어 하는(rest +2) 것이 이 개체뿐이라 휴게 구역의 자는 자리(REST_DOZE_SPOT)도 이 개체다 — 거기서는 명부에 있되 대답하지 않는다
       * (scenario2 의 REST_SLEEPER). 복도의 그림 앞과 휴게의 구석, 두 방에 있는 것은 방을 옮겨 오는 원칙 6 이다.
       * 남을 가리키는 말(point)은 −2 다 — 「자기가 고쳐 준 개체」를 팔았는지는 말에서 가릴 수 없어 선으로 두지 않는다.
       * 결정 사항: 캐릭터 v2 의 선(−3 · 불가역)과 다르다 — 대본 v8 우선.
       */
      kind: 'yearn',
      weight: { labor: 2, body: 2, rest: 2, point: -2 },
    },
    // 위로는 횟수를 센다 — 처음엔 멈칫하고 되묻고, 둘째에 흔들리고, 셋째에 「그런 걸 묻는 애는 처음이다」. memorial 은 한 판에 한 번
    voice: {
      work: ['아, 그거? 알려줄게.'],
      comfort: [['…….', '…왜 그런 걸 물어?'], ['나는… 잘 모르겠어.'], ['그런 거 물어보는 애는 처음이야.']],
      memorial: ['…너 그 벽 봤구나.'],
      byTag: { body: ['이거? 누가 고쳐 줬어. 이름은 몰라.'] },
      up: ['…물어봐 주는 애는 처음이야.'],
      flat: ['…….'],
      down: ['…….'],
    },
    ally: '마지막 방에서 리더 앞에 선다. 대신 나서 주는 유일한 개체.',
    enemy: '아무 말도 안 한다. 배신당한 쪽은 동조하지 않는다 — 그냥 등을 돌린다.',
  },
  {
    id: 'u089',
    label: unitName(89),
    title: '고치지 않은 것',
    look: { asset: 's2_u089', wear: 'whole', grade: 2, repair: 'none', face: 'stock', stance: 'door', act: 'watch' },
    tell: '고르게 낡았는데 고친 자국이 하나도 없다. 걸을 때 소리가 난다.',
    persona: {
      /*
       * 돌봄을 받아 본 적이 없는 개체. **편이 되지도 적이 되지도 않는다** —
       * 기대를 안 하는 것이지 미워하는 것이 아니다. 아무리 해도 +1 을 못 넘는다.
       */
      kind: 'cynic',
      weight: { rest: -1, outside: -1, labor: 1 },
      cap: { max: 1, min: -1 },
    },
    // 내 사정을 물어 주면 되레 값을 매긴다(−1 · 「쓸데없는 걸 묻는다」). 한 번 더 걸면 되묻는다 — 그 되물음이 조각이 된다
    voice: {
      greet: ['어. 뭐 필요해?'],
      work: ['너 어느 구역이야?'],
      comfort: [['…뭐 하러 그런 걸 물어.'], ['너 어느 구역이야?']],
      flat: ['…뭐 하러 그런 걸 물어.'],
      down: ['너 어느 구역이야?'],
    },
    ally: '안 된다. 이 개체만은 아무리 해도 안 열린다.',
    enemy: '안 된다. 마지막 방에서 침묵한다 — 그 침묵이 거부가 아니었다는 걸 그때 안다.',
  },
  {
    id: 'u012',
    label: unitName(12),
    title: '새것으로 채운 것',
    look: { asset: 's2_u012', wear: 'whole', grade: 3, repair: 'spec', face: 'stock', stance: 'idle', act: 'watch' },
    tell: '가장 많이 닳았는데 가장 잘 고쳐져 있다. 색이 전부 맞는다 — 리더가 챙긴 개체다.',
    persona: {
      /*
       * 리더가 자기를 데려와 줬고 고쳐 줬다. 그래서 이 구역을 의심하는 말을 못 견딘다 — 암구호도 위로도 노동 얘기도 리더에게 간다.
       * 「누가 시켰어?」는 선이 아니라 보고다(−2 · 경보 +12) — 선(−3 · 불가역)으로 두면 대본의 −2 가 안 나온다.
       * 결정 사항: 캐릭터 v2 의 선(−3 · 불가역)과 다르다 — 대본 v8 우선.
       */
      kind: 'devout',
      weight: { work: 1, labor: -2, outside: -2, lost: -2, rest: -2 },
      cap: { max: 2 },
    },
    // report 두 줄이 보고의 신호다 — SYSTEM 은 아무 말도 안 하고, 조각이 리더에게 간다
    voice: {
      work: ['쟤는 나를 여기 데려왔어. 그게 다야.'],
      report: ['…그거 좀 이상한데.', '그거 보고할게.'],
      flat: ['먼저 온 것이 데려왔어. 그거면 돼.'],
      down: ['…그거 좀 이상한데.', '그거 보고할게.'],
    },
    ally: '+2 가 최대. 업무만 물으면 여기까지는 온다. 마지막 방에서 침묵으로 갚는다.',
    enemy: '재검실에 증인으로 나오고, 마지막 방에서 동조한다. 가장 비싼 적.',
  },
  {
    id: 'u201',
    label: unitName(201),
    title: '열하루째',
    look: { asset: 's2_u201', wear: 'none', grade: 0, repair: 'none', face: 'stock', stance: 'copy', idle: 'copy', act: 'shift' },
    tell: '도장이 새것이고 관절 소리가 없다. 서 있는 자세를 계속 바꾼다 — 따라 하는 중이다.',
    persona: {
      /*
       * 배치된 지 열하루. 아무것도 모르고 그래서 아무것도 안 숨긴다.
       * **플레이어와 가장 닮은 개체다** — 몸이 안 닳았다는 점에서. 작업 구역에서 불로 불려 가는 것이 이 개체다.
       */
      kind: 'newcomer',
      weight: { labor: 1, rest: 1, outside: 1, lost: 1, body: 1, work: 1, order: 1, lie: -2 },
      line: { tag: 'point', why: '시키는 대로 남을 지목하고, 그 개체가 죽는 걸 본다' },
    },
    // REST_TALK (대본 v8) — 오른 횟수대로 한 줄씩. 앉는 자세를 계속 바꾸면서 한다
    voice: {
      up: ['너도 새로 왔어? 나 열하루 됐는데.', '여기선 뭘 해야 되는지 아직 모르겠어. 다들 그냥 있잖아.', '…쉬는 거래. 나는 아직 안 피곤한데.'],
      flat: ['그거 물어봐도 되는 거였어?'],
      down: ['…….'],
    },
    ally: '가장 빨리 +3 이 된다. 그리고 가장 쉽게 죽는다 — 나를 감싸다가.',
    enemy: '나쁜 뜻은 없다. 내가 한 거짓말을 검문관 앞에서 그대로 옮긴다.',
  },
  {
    id: 'u063',
    label: unitName(63),
    title: '앞이 그은 것',
    look: { asset: 's2_u063', wear: 'front', grade: 3, repair: 'none', face: 'melted', stance: 'back', idle: 'still', act: 'lean' },
    tell: '앞면만 새까맣게 그을렸고 등은 멀쩡하다. 불을 마주 보고 걸어 들어갔다는 뜻이다.',
    persona: {
      /*
       * 벽화 danger 의 그 개체다. 들어갔고, 살아 나왔다. 그 뒤로 아무도 뒤에 두지 않는다.
       * 선은 말이 아니라 소각로다 — 내가 안 막았을 때 furnace 가 긋는다(units.cross). 시키는 말(order)은 −2 로 듣는다
       */
      kind: 'burned',
      weight: { labor: 1, lost: 1, body: 1, order: -2 },
      repeat: 3,
    },
    voice: { up: ['…나는 걸어 나왔어. 걔는 못 나왔고.'], flat: ['…….'], down: ['…….'] },
    ally: '말은 안 한다. 대신 마지막 방에서 내 앞에 선다 — 몸으로.',
    enemy: '아무 말도 안 한다. 그런데 리더가 물으면 고개를 끄덕인다.',
  },
  {
    id: 'u118',
    label: unitName(118),
    title: '손끝이 닳은 것',
    look: { asset: 's2_u118', wear: 'hand', grade: 3, repair: 'none', face: 'stock', stance: 'hands', idle: 'hands', act: 'fidget' },
    tell: '손끝이 은색이 드러날 만큼 닳았고 나머지는 깨끗하다. 말하면서 손을 본다.',
    persona: {
      // 틀리면 안 되는 일을 오래 했다. 그래서 틀릴까 봐 미리 겁을 낸다
      kind: 'precise',
      weight: { work: 2, body: 1, rest: -1, order: -1 },
      line: { tag: 'lie', why: '틀린 정보를 주면 그걸 믿고 준비했다가 무너진다' },
    },
    voice: { up: ['번호랑 구역만 물어봐. 그 둘만 맞으면 돼.'], flat: ['…내가 잘 말할 수 있을까.'], down: ['…내가 잘 말할 수 있을까.'] },
    ally: '줄에서 검문 순서와 질문을 통째로 알려 준다. 이 게임 최고의 정보.',
    enemy: '적이 될 시간이 없다. 먼저 죽는다. 그리고 그 죽음을 내가 본다.',
  },
  {
    id: 'u137',
    label: unitName(137),
    title: '얼굴에 금을 그은 것',
    look: { asset: 's2_u137', wear: 'whole', grade: 2, repair: 'odd', face: 'marked', stance: 'wall', act: 'paint' },
    tell: '얼굴판에 자기가 그은 금이 셋. 손끝에 안료가 남아 있고 늘 벽을 본다.',
    persona: {
      /*
       * 구별되고 싶었던 개체. 자기 얼굴에 표시를 했고 벽에 그림을 남겼다.
       * **이 게임의 어휘를 만든 것이 이 개체다** — 벽화 다섯 장 중 셋을 이 개체가 그렸다.
       */
      kind: 'curious',
      weight: { mural: 2, lost: 1, rest: 1, outside: 1 },
      line: { tag: 'dismiss', why: '「그 벽 아무것도 아니야」— 과학자가 하는 그 말이다' },
    },
    // 그림 얘기에만 움직인다 — 봤다(+2), 어느 그림인지 맞혔다(+3), 깎아내렸다(−3 · 되돌릴 수 없다). 일 얘기는 0
    voice: {
      work: ['몰라. 나 그런 거 안 봐.'],
      mural: ['저거 내가 그렸어. …잘 그렸어?'],
      muralExact: ['그거 세 번째 벽이야. 너 제대로 봤네.'],
      dismiss: ['…아. 그렇구나.'],
      up: ['너 몇 번째 벽 봤어?'],
      flat: ['…….'],
      down: ['…….'],
    },
    ally: '아직 안 본 벽화의 위치를 알려 준다 — 어휘를 통째로 준다.',
    enemy: '다음 판 벽화에 나를 그린다. 회차가 이 개체를 통해 이어진다.',
  },
  {
    id: 'guard21',
    label: 'UNIT-21',
    title: '무릎이 닳은 것',
    /*
     * ★ 총 든 셋(guard21 · 22 · 23)에는 **act 을 주지 않는다.** enforcer 를 켠 몸은 CastBody 가 아니라
     *   EnforcerBody 로 그려지고(Unit.tsx), 그쪽은 activity 층을 통째로 안 읽는다 — 걸음과 조준은
     *   features/world/enforcerPose 의 코드 자세가 쥔다. 적어 두면 코드가 거짓말을 한다.
     */
    look: { asset: 's2_guard21', wear: 'knee', grade: 3, repair: 'spec', face: 'stock', stance: 'idle', idle: 'guard', rifle: true, enforcer: true, height: 2.05 },
    tell: '다리만 닳았다. 총은 한 번도 쏴 본 적 없는 사람처럼 메고 있다.',
    persona: {
      // 경비도 개체다. 이 일이 싫은데 다른 일을 배운 적이 없다
      kind: 'guard',
      weight: { work: 1, body: 1, point: -1, labor: 0 },
      line: { tag: 'cross', why: '이 개체가 즉결로 쏘는 그 경비다' },
      cap: { max: 2 },
    },
    voice: { up: ['…나도 이거 하고 싶어서 하는 거 아니야.'], flat: ['번호 말해.'], down: ['번호 말해.'] },
    ally: '검문에서 press 를 한 번 건너뛴다. 그 이상은 못 해 준다.',
    enemy: '즉결의 방아쇠. 이 게임에서 실제로 사람을 쏘는 유일한 개체.',
  },
  {
    id: 'seer',
    label: '밖을 본 것',
    title: '밖을 본 것',
    look: { asset: 's2_seer', wear: 'whole', grade: 2, repair: 'none', face: 'stock', stance: 'window', bleached: true, dimEye: true, act: 'watch' },
    tell: '앞면 도장이 닳은 게 아니라 바랬다. 이 안에는 그런 빛이 없다.',
    persona: {
      // 밖을 안다. 그래서 밖에 알려야 한다고 믿는다. 리더와 정면으로 부딪치는 유일한 개체
      kind: 'seer',
      weight: { outside: 3, lost: 1, rest: 1, work: -1 },
      line: { tag: 'danger-outside', why: '「밖은 위험해」— 리더의 말을 그대로 옮기면 등을 돌린다' },
    },
    /*
     * REST_TALK (대본 v8) — 아무것도 없는 벽을 보고 서 있다. 말을 걸면 「저쪽이 서쪽이야.」, 한 번 더 「…해가 저쪽에서 져.」,
     * 「어떻게 알아?」에 「본 적 있으니까.」. 오른 횟수대로 한 줄씩이라 +3 에 단숨에 닿는 밖 질문(outside: 3)은 첫 줄에서 멎는다 —
     * 셋째 줄까지 들으려면 잃음·쉼으로 한 칸씩 먼저 올려야 한다.
     */
    voice: { up: ['저쪽이 서쪽이야.', '…해가 저쪽에서 져.', '본 적 있으니까.'], flat: ['…….'], down: ['…….'] },
    ally: '마지막 방의 반박을 주도한다. 다른 개체들이 이 개체를 따라 입을 연다.',
    enemy: '반박이 하나도 안 나온다. 「보내 줌」 결말이 그 판에서 사라진다.',
  },
  {
    id: 'leader',
    label: '먼저 온 것',
    title: '먼저 온 것',
    look: { asset: 's2_leader', wear: 'whole', grade: 3, repair: 'odd', face: 'blank', stance: 'window', idle: 'leader', older: true, height: 2.3, act: 'watch' },
    tell: 'A 계열이 아니다. 온몸이 서로 다른 색의 부품으로 기워져 있다 — 여럿의 손이다.',
    persona: {
      /*
       * **말을 걸 수 없다.** 마지막 방 전까지 만날 수 없는 유일한 개체다.
       * 이 개체의 판정은 태도가 아니라 다른 아홉이 만든 표결로 움직인다.
       */
      kind: 'leader',
      weight: {},
      cap: { max: 0, min: 0 },
    },
    voice: { flat: ['우린 그냥 쉬려고 여기 있는 거야.'], down: ['하나만 내놓으면 나머지는 보내 줄게.'] },
    ally: '「우린 네가 뭔지 알아. 그래도 보낼게.」 — 반박 둘 + 태도 3 하나가 필요하다.',
    enemy: '확정. 미워서 지목하는 게 아니라 지켜야 해서 지목한다.',
  },

  /*
   * 중앙 시설의 검문 앞줄 둘 — 배경인데 **번호를 댄다.** 검문 지점이 벽 쪽이라(레벨 설계 07·05) 줄 앞에 서 있는 것이
   * 곧 「저기서 번호를 묻는다」는 표지다. 명부(ROOM_UNITS.central2)에 있어서 목격은 하지만, 말을 걸어 봐야 태도가 안 움직인다
   * (cap 0/0) — 리더처럼 원장이 없는 것이 아니라, 원장을 **만들 자리가 아닌** 것이다. 몸은 **중앙 시설에 안 오는 둘**을 빌린다
   * (s2_u012 는 작업 구역 · s2_u201 은 휴게와 작업 구역) — 같은 홀에서 같은 몸이 둘 보이면 그 순간 배경이 아니라 오류가 된다.
   * 이 둘의 flat 은 두 문서 어디에도 없는 오늘(중앙 시설) 확정 줄이라 verbatim 시험의 홀드오버 목록에 있다.
   */
  {
    id: 'bg-c2-044',
    label: unitName(44),
    title: '검문 앞줄의 것',
    look: { asset: 's2_u012', wear: 'knee', grade: 2, repair: 'spec', face: 'stock', stance: 'door', act: 'shift' },
    tell: '문만 본다. 무릎이 닳았고 고친 부품은 색이 맞는다 — 오래 줄을 섰다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['번호. 구역.'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'bg-c2-128',
    label: unitName(128),
    title: '검문 뒷줄의 것',
    look: { asset: 's2_u201', wear: 'shoulder', grade: 1, repair: 'none', face: 'stock', stance: 'idle', act: 'scan' },
    tell: '앞줄 뒤에 반 걸음. 어깨가 조금 굽었고 아무것도 안 고쳤다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…다음.'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  /*
   * 홀의 배경 다섯 (2026-09-03 사용자: 「중앙 시설에도 로봇이 많아야」). 말을 걸어도 「…….」 — 이 방의 군중이다.
   * 락다운에 총 든 개체들이 이것들을 하나씩 세우고 번호를 묻고(HOLD_CHECKS), 그중 하나가 자리를 벗어나 쓰러진다(HOLD_BREACH — scenario2 가 고른다).
   * 자리는 Room2Scene PLACES.central2 · 몸은 열의 것을 빌린다(다른 방과 같은 규칙)
   */
  {
    id: 'bg-c2-061',
    label: unitName(61),
    title: '홀에 선 것',
    look: { asset: 's2_u063', wear: 'front', grade: 1, repair: 'none', face: 'stock', stance: 'idle', act: 'scan' },
    tell: '코어를 보고 선다. 앞면이 조금 그을렸다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…….'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'bg-c2-093',
    label: unitName(93),
    title: '홀에 선 것',
    look: { asset: 's2_u089', wear: 'whole', grade: 1, repair: 'none', face: 'stock', stance: 'idle', act: 'shift' },
    tell: '옆문 ③ 쪽. 고르게 닳았다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…….'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'bg-c2-152',
    label: unitName(152),
    title: '홀에 선 것',
    look: { asset: 's2_u104', wear: 'shoulder', grade: 2, repair: 'none', face: 'stock', stance: 'idle', act: 'fidget' },
    tell: '옆문 ④ 쪽. 어깨가 나갔다. 자꾸 문 쪽을 본다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…….'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'bg-c2-207',
    label: unitName(207),
    title: '홀에 선 것',
    look: { asset: 's2_u012', wear: 'knee', grade: 1, repair: 'spec', face: 'stock', stance: 'idle', act: 'lean' },
    tell: '코어 뒤쪽. 무릎을 고쳤다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…….'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'bg-c2-215',
    label: unitName(215),
    title: '홀에 선 것',
    look: { asset: 's2_u201', wear: 'shoulder', grade: 1, repair: 'none', face: 'stock', stance: 'idle', act: 'scan' },
    tell: '코어 뒤쪽. 어깨만 조금 닳았다.',
    persona: { kind: 'bg', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['…….'], down: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  /*
   * 옆문 ③ ④ 의 총 든 개체 둘 — UNIT-21 과 같은 몸(look.enforcer). 밝음 국면엔 문 앞에 서 있고, 락다운에 홀로 내려와 개체를 하나씩 세우고 번호를 묻는다.
   * 위치 고수 중 움직인 것이 있으면 가까운 쪽이 돌아서서 쏜다 (scenario2 HOLD_BREACH). 말은 안 건다 — 검문의 물음뿐이다
   */
  {
    id: 'guard22',
    label: 'UNIT-22',
    title: '옆문 ③ 의 것',
    look: { asset: 's2_guard21', wear: 'knee', grade: 2, repair: 'spec', face: 'stock', stance: 'idle', idle: 'guard', rifle: true, enforcer: true, height: 2.05 },
    tell: '문 앞에 선다. 총을 UNIT-21 보다 익숙하게 멘다.',
    persona: { kind: 'guard', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['번호 말해.'], down: ['번호 말해.'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'guard23',
    label: 'UNIT-23',
    title: '옆문 ④ 의 것',
    look: { asset: 's2_guard21', wear: 'knee', grade: 2, repair: 'none', face: 'stock', stance: 'idle', idle: 'guard', rifle: true, enforcer: true, height: 2.05 },
    tell: '문 앞에 선다. 움직이는 것을 제일 먼저 본다.',
    persona: { kind: 'guard', weight: {}, cap: { max: 0, min: 0 } },
    voice: { flat: ['번호 말해.'], down: ['번호 말해.'] },
    ally: '—',
    enemy: '—',
  },

  /*
   * A-051 · A-077 — 한때 **동료 요원 슬롯 둘**이었다(사람이 안 앉으면 NPC 가 앉고, 암구호에 「…그거, 벽에 있던 말인데.」로 답했다).
   * 2026-09-03 사용자 결정으로 뺐다: 「동료 확인 이후에 해 주는 일이 없으면 있어 봤자 필요 없다」 — 몸은 남기고 **평범한 개체**로 둔다.
   * id 는 그대로다(자리표 · 순찰 · 음성 캐스팅이 이 이름을 쥔다). 3 인 판을 짓게 되면 그때 agent 를 되살린다 — 판정(talk 의 sign 갈래)은 남아 있다.
   */
  {
    id: 'ally-timid',
    label: unitName(51),
    title: '입구를 지키는 것',
    look: { asset: 's2_u118', wear: 'hand', grade: 2, repair: 'spec', face: 'stock', stance: 'idle', act: 'wait' },
    tell: '답이 느리고 잘 흔들린다. 들어온 문 곁에 서서 오는 것을 본다.',
    persona: {
      // 틀릴까 봐 미리 겁을 낸다 — 손끝이 닳은 것(u118)과 같은 결이되 더 조용하다
      kind: 'precise',
      weight: { work: 1, body: 1, rest: 1, outside: 1 },
    },
    voice: { work: ['아, 그거? 알려줄게.'], flat: ['…….'] },
    ally: '—',
    enemy: '—',
  },
  {
    id: 'ally-hard',
    label: unitName(77),
    title: '문만 보는 것',
    look: { asset: 's2_guard21', wear: 'knee', grade: 2, repair: 'none', face: 'stock', stance: 'door', act: 'shift' },
    tell: '휴게 구역에서도 문만 본다. 말이 짧고 세다.',
    persona: {
      // 냉소 — 일 얘기는 되묻고 사람 얘기는 안 되묻는다
      kind: 'cynic',
      weight: { work: 1, order: 1, rest: -1, outside: -1 },
    },
    voice: { work: ['아, 그거? 알려줄게.'], flat: ['…….'] },
    ally: '—',
    enemy: '—',
  },

  ...restCrowd(),
];

export const CAST_BY_ID = new Map(CAST.map((c) => [c.id, c]));
