/**
 * 복도 — 챕터 1 의 이야기. scenario2 가 「언제」의 나머지를 여기로 넘긴다: 방 하나가 1900 줄짜리 파일 안에서 다른 다섯 방과
 * 뒤섞이면 어느 줄이 어느 방 것인지 못 읽는다. 문장은 여전히 script.ts 에만 있다 — 여기는 그 문장이 **켜지는 조건**뿐이다.
 *
 * 이 방에서 일어나는 것 (대본 전문 v8 · 챕터 1):
 *   FIRST_LOOK   들어와서 12 초. **저쪽이 먼저 말을 건다** — 화자가 1.9 m 앞까지 걸어와 나를 보고 「…너 여기 처음이지.」 판당 반드시 한 번, 판정 없음, 값 없음.
 *                걸어오기 · 앞 줄 뒤에 말하기 · 3 초 창(줄이 끝난 시각부터) · Enter 로 멈춤(hold) · 곁 고정 · 「개체에게 말을 걸 수 있다 — Enter」는
 *                전부 address.ts 의 장치다 (2026-09-03 사용자: 「로봇이 직접 나에게 다가와서 얘기해 주고, 내가 대답할 시간을 주고」).
 *                입력줄은 저절로 안 열린다(2026-09-02 사용자: 「대화창이 열리면 움직이지 못해」).
 *   NOTICE       의심도가 **처음** 0 위로 오르는 순간 — 어떤 사유든, 어느 방이든. 곁의 개체 하나가 하던 걸 멈추고 1.2 초 이쪽을 본다,
 *                그리고 과학자 한 줄. HUD 강조도 설명도 없다 — 숫자를 안 쓰는 방식으로 「값을 치렀다」를 알린다.
 *   HALL         FIRST_LOOK 뒤 속마음(HALL_SEE) · 서로 다른 개체 둘에게 사람 물음을 걸었을 때 「…아무도 안 묻는구나」(HALL_NOBODY_ASKS — 복도는 의심도가 안 오르는 방이라 NOTICE 선행 조건은 뺐다)
 *                (꺾임의 「…이 중에 둘」은 2026-09-03 사용자 결정으로 뺐다 — 요원 슬롯이 없어졌다. cast.ts 의 A-051 · A-077 머리말)
 *   NUDGES       막혔을 때 드는 속마음 여덟 — 첫 24 초 · 26 초 간격(문서에 없는 타이밍은 지금 값 유지, D28)
 *
 * ★ 시계는 전부 **조작권**(host.afterControl · sinceControl)부터다 — 12 초 · 24 초는 「들어와서」가 아니라 「손을 대고서」다. 포인터 잠금도 안 잡은 채
 *   화면만 보는 판에 저쪽이 걸어와 말을 걸면 그건 튜토리얼이 아니라 혼잣말이다 (2026-09-03 사용자: 「아무것도 안 했는데 트리거가 지혼자」).
 *   FIRST_LOOK 의 화자가 끝내 말 거는 거리까지 못 오면(address 가 거둔다) 한 번 더 부른다 — 「판당 반드시 한 번」은 멀리서 외치는 것으로는 안 채워진다
 *   DOOR_CHOICE  격납문 1.6 m 안에서 묻는다. E 면 그림 수와 무관하게 다음 방(D8), Q 면 잔류. 3 m 밖으로 물러났다 오면 또 묻는다.
 *
 * ★ 「판당 한 번」은 host.once 로 — 방을 넘어도 유지되는 표(scenario2.runFlags)다. fired(방마다 비움)와 다르다 (D29).
 * ★ 모델을 안 부른다. 화자 선정도 거리, 판정도 없음(FIRST_LOOK 은 뭐라도 치면 「…어. 그래.」, 창이 닫히면 「아니야? 그럼 됐고.」).
 */

import { identity } from '@/world/mp/identity';
import { suspicion } from '@/world/mp/suspicion';
import { CORRIDOR2_EXIT } from '@/world2/map/corridor';

import type { AddressOpts } from './address';
import { alert } from './alert';
import { STARE_MS, type Vec2 } from './corefield';
import { lexicon } from './lexicon';
import type { Tag } from './read';
import type { Room, Scene2State } from './scenario2';
import {
  DOOR_NO_MURAL,
  DOOR_PROMPT,
  DOOR_STAY,
  FIRST_LOOK_ANY,
  FIRST_LOOK_NONE,
  FIRST_LOOK_OPEN,
  HALL_NOBODY_ASKS,
  HALL_SEE,
  NOTICE_LINES,
  NUDGES,
  OBJ_INSPECT,
  type CastLine,
  type Line,
} from './script';
import { SIGN_TAGS } from './talk';
import { units } from './units';

/**
 * 이야기 모듈이 판을 만지는 유일한 통로 — scenario2 가 만들어 넘긴다 (W2 계약).
 * 여기 없는 것은 모듈이 못 한다: 자리 · 타이머 · 대화창 · 화면 상태 전부 이 손잡이를 거친다. 시험이 가짜 host 로 돌릴 수 있는 이유다.
 */
export interface Host {
  /** 판당 한 번 — 처음이면 true 를 돌려주고 기록한다. 방을 넘어도 유지된다 */
  once(key: string): boolean;
  emit(line: Line): void;
  play(lines: readonly Line[], startAt?: number): number;
  speak(who: string, texts: readonly string[], startAt?: number): number;
  playCast(lines: readonly CastLine[], unitId: string | null, startAt?: number): number;
  patch(p: Partial<Scene2State>): void;
  now(): number;
  me(): Vec2;
  /** 반경 안에서 가장 가까운 **서 있는** 명부 개체 — 걷는 것은 대상이 아니다 (patrol 의 ★) */
  nearest(r: number): string | null;
  /** 이 방에 그 개체가 서 있나 — 정해진 화자를 찾을 때 */
  has(id: string): boolean;
  /** 하던 일이 없는 것 중 가장 가까운 것 — 그리던 몸을 붓에서 떼지 않으려고 (cast 의 look.act) */
  nearestIdle(r: number): string | null;
  roomRadius(): number;

  /* ── 복도가 더 쓰는 것 ── */
  room(): Room;
  state(): Scene2State;
  /** 정적인가 — 입력줄이 닫혀 있고 흐르는 대사가 없다. 유도 속마음은 이때만 든다 */
  quiet(): boolean;
  /** 지금 흐르는 대사가 끝나는 시각 — FIRST_LOOK 은 앞 줄이 아직 화면에 있으면 그 뒤로 미룬다 */
  busyUntil(): number;
  /** 타이머 — scenario2 의 later 와 같다 */
  later(ms: number, fn: () => void): void;
  /** 조작권부터 ms 뒤에 — 손을 대기 전이면 줄을 서고, 대는 순간부터 센다 (gates.controlGate). 나에게 일어나는 일의 시계는 전부 이것이다 */
  afterControl(ms: number, fn: () => void): void;
  /** 손을 댄 뒤 흐른 ms — 아직이면 −1 */
  sinceControl(): number;
  /** 이 방을 나간다 — 격납문의 E */
  leave(): void;
  /** 개체가 나를 본다 — patrol.stare 를 내 자리로 (W5 계약) */
  stare(id: string, ms: number): void;

  /* ── 작업 · 경비 · 기록(furnace · openers · archiveScene, W3)이 더 쓰는 것 — 같은 손잡이 하나를 넘긴다 ── */
  /** 개체가 내게로 걸어와 선다 — patrol.approach (W5 계약). 경비의 첫마디 · WATCH · 스캔이 쓴다 */
  approach(id: string, to: Vec2, opts: { stopAt: number; then: 'stand' | 'resume' }): void;
  release(id: string): void;
  unitPos(id: string): Vec2 | null;
  /** 이 방의 명부 — 소각로의 「본 개체 전원」 (furnace 의 witnesses) */
  witnesses(): readonly string[];
  /** 지금 이 말을 듣는 것들 — 그 방의 소리 반경 안 (조각 반경) */
  heard(): string[];
  /** 경보도를 올린다 — 문턱 방송까지 (scenario2.raiseAlert) */
  raiseAlert(n: number): void;
  /** 목표 줄 — null 이면 아무것도 안 뜬다 (소각로의 8 초) */
  objective(text: string | null): void;
  /** 개체가 이 판에서 사라진다 — 불에 들어간 것. 몸은 Unit 이 숨기고 자리는 다시 안 받는다 */
  vanish(id: string): void;
  /** 조각 · 원장에 적는 자리 이름 — ROOM_TITLE[room] */
  where(): string;
  /** 지나가는 개체 — crossed 아닌 가장 가까운 명부 개체. 없으면 null (그 줄은 생략된다) */
  passerby(): string | null;
  /** 작업 막대 — Stillness 재사용, 라벨 「작업」. got 이 null 이면 내린다 */
  cycle(got: number | null, need: number): void;
  /** 스캔 막대 — 같은 자리, 라벨 「가만히」 (60 스캔 3.8 초) */
  stillness(got: number | null, need: number): void;
  /** 경비가 이 방에 있나 · 어디 있나 · 서 있나. 없으면 null — 그러면 첫마디도 스캔도 없다 */
  guard(): (Vec2 & { still: boolean }) | null;
  /** 열하루째가 불로 걷는다 / 대체 개체가 걷는다 — Unit 의 pose 'fire' · 'fire-sub' 가 읽는 표 */
  fireWalk(v: boolean): void;
  substituteWalk(v: boolean): void;
  /** 마지막으로 한 마디 보낸 시각 — 첫마디 이유 「발화」(직전 5 초) */
  lastSayAt(): number;
  /** 경비가 말을 걸 수 있는 방 상태인가 — 검문에 묶인 경비는 첫마디 · WATCH · 스캔 · 잡담을 안 한다 (openers 의 guardFree) */
  guardFree(): boolean;
  /** 경비가 잡담해도 되나 — 조작권이 있고 저쪽이 먼저 건 말과 20 초 뜸을 뒀을 때 (openers 의 chatOk) */
  chatOk(): boolean;
  /**
   * 개체가 나에게 **와서** 말한다 — address.ts. 걸어오기 · 보기 · 앞 줄 뒤에 말하기 · 답할 창까지 한 장치다.
   * 개체가 나에게 직접 거는 말은 전부 이걸 탄다 — speak/playCast 로 바로 내보내면 자리와 무관한 자막이 된다
   */
  address(id: string, lines: readonly CastLine[], opts?: Partial<AddressOpts>): void;
}

/**
 * 저쪽이 먼저 말을 거는 때 — **과학자의 설명(INTRO)이 실제로 끝나고** 이만큼 뒤 (2026-09-03 사용자: 「과학자가 설명하는 중에 로봇이 다가와 묻는 트리거를
 * 설명이 끝나면 오는 걸로 — 스킵 버튼도 고려해서」). 예전 「복도 진입 12초 뒤」는 인트로 다섯 줄(≈ 30 초)보다 먼저라 설명 도중에 걸어왔다.
 * 「끝났다」는 시계가 아니라 **대화창이 비는 순간**이다 (scenario2 가 INTRO 의 마지막 줄 뒤 대화창이 비면 introDone 을 부른다) — 상자를 눌러 넘기면 그만큼 당겨진다.
 * 조작권 규칙은 그대로다: 그 시각이 와도 손을 안 댔으면 손을 댈 때 온다 (afterControl(0))
 */
export const FIRST_LOOK_AFTER_INTRO_MS = 1500;
/** 개체 줄이 끝난 뒤 대답을 기다리는 창 (「3초 안에 대답 없으면」) */
export const FIRST_LOOK_WINDOW_MS = 3000;
/**
 * 먼저 말을 거는 개체는 **정해져 있다** — 입구 곁에 서서 아무 일도 안 하는 것(A-051)이다
 * (2026-09-03 사용자: 「물어보는 로봇을 정해서 자연스럽게」). 가장 가까운 것을 그때그때 고르면
 * **그리던 것이 붓을 놓고 걸어온다** — 하던 일이 있는 몸을 그 일에서 떼는 것이 부자연스러웠고,
 * 말이 끝난 뒤 제 벽으로 돌아가지도 않았다(그 자리에 섰다). 일감이 있는 것은 안 부른다.
 */
const FIRST_LOOK_SPEAKER = 'ally-timid';
/** 그것이 이 방에 없을 때만 — 이 반경 안에서 **일감이 없는** 가장 가까운 것 */
const FIRST_LOOK_R = 8;
/** NOTICE — 근처 개체 하나가 하던 걸 멈추고 이쪽을 보는 시간 (「1.2초」) — corefield.STARE_MS, 소각로의 응시와 같은 수 */
/** 격납문 — 이 안에서 묻고, 이만큼 물러나면 다시 묻는다 (D8) */
const DOOR_ASK_R = 1.6;
const DOOR_REARM_R = 3;
/** 유도 속마음 — 조작권부터 24 초 · 26 초 간격 (D28: 문서에 없는 타이밍은 지금 값 유지) */
const NUDGE_FIRST_MS = 24_000;
const NUDGE_GAP_MS = 26_000;
/**
 * 무언가를 하고 난 뒤의 뜸 — 유도 속마음은 「막혔을 때」 드는 것이라(대본 NUDGES) **아무 일도 안 일어난 채**
 * 이만큼 지나야 든다. 여태는 26 초 간격만 봤다: 그림 앞에 서서 속마음 석 줄을 읽는 동안 시계가 그대로 흘러,
 * 마지막 줄이 끝나는 순간 「복도 끝에 격납문이 있다」가 같은 속마음 꼴로 이어 붙었다
 * (2026-09-03 사용자: 「그림을 보고 있었는데 저기가 격납문이겠지 하는 대사가 나온다」).
 * 밀어내는 것은 tick 이다 — 대사가 흐르거나 · 입력줄이 열렸거나 · 벽을 들여다보는 중이거나(host.quiet 의 probe)
 * · 물음이 떠 있거나 · 막대가 도는 프레임마다 다음 속마음을 이만큼 뒤로 민다.
 */
const NUDGE_AFTER_MS = 12_000;
/** 화자가 끝내 못 와서 거둬졌을 때 — 이만큼 뒤에 한 번 더 부른다 (한 번만) */
export const FIRST_LOOK_RETRY_MS = 8000;
/** 사람만 하는 물음 — HALL_NOBODY_ASKS 가 세는 태그. talk.SIGN_TAGS 그대로 — 목록을 둘 두면 어긋난다 */
const HUMAN_TAGS: readonly Tag[] = SIGN_TAGS;

let host: Host | null = null;
let unsub: (() => void) | null = null;
/** 저쪽이 먼저 건 말이 걸려 있다 — 화자와, 힌트로 덮기 전의 목표(답이 끝나면 되돌린다) */
let look: { speaker: string; prevObjective: string | null } | null = null;
/** NOTICE 를 겪었다 — 확인용 손잡이(corridor.noticed) 전용. HALL_NOBODY_ASKS 의 선행 조건에서는 뺐다 — 복도는 의심도가 안 오른다 */
let noticed = false;
/** 사람 물음을 건 개체들 — 서로 다른 둘이 되면 「…아무도 안 묻는구나」 */
const askedHuman = new Set<string>();
let doorArmed = true;
let doorSeenFlag = false;
/** 격납문의 물음이 화면에 떠 있다 — 3 m 밖으로 물러나면 내린다(안 내리면 Enter · Space 가 그 물음에 먹힌다) */
let doorChoiceOpen = false;
let opened = false;
let nudgeLeft: number[] = [];
let nudgeAt = 0;

function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/* ─────────────────────────────── FIRST_LOOK ─────────────────────────────── */

/**
 * 인트로가 끝나고(introDone · waitMs 뒤) FIRST_LOOK_AFTER_INTRO_MS 뒤에 — 화자를 고르고 address 에 넘긴다. 그때 조작권이 없으면 손을 댈 때(afterControl(0)).
 * 앞 줄이 아직 흐르면 address 가 그 뒤로 미룬다: 읽지도 못한 줄 밑에서 열렸다 닫히는 3 초 창은 없다
 */
function scheduleFirstLook(waitMs: number) {
  host?.later(Math.max(0, waitMs) + FIRST_LOOK_AFTER_INTRO_MS, () => host?.afterControl(0, startFirstLook));
}

/**
 * 8 m 안의 가장 가까운 서 있는 개체가 **걸어와서** 묻는다. 뭐라도 치면 「…어. 그래.」, 3 초 창이 닫히면 「아니야? 그럼 됐고.」 —
 * 둘 다 판정 없음 · 값 없음 (D1). 그 뒤 목표를 되돌리고(명판 미독이면 「복도를 조사하라…」) HALL_SEE.
 * 판당 한 번(once)은 **부르는 것**에 찍는다 — 화자가 끝내 못 와 거둬지면(onDropped) 같은 판에서 한 번 더 부른다(requestFirstLook)
 */
function startFirstLook() {
  if (!host || host.room() !== 'corridor' || !host.once('first-look')) return;
  requestFirstLook(0);
}

function requestFirstLook(attempt: number) {
  if (!host || host.room() !== 'corridor' || look) return;
  // 정해진 화자가 이 방에 있으면 그것이 온다 — 없으면 일감 없는 것 중 가장 가까운 것
  const speaker = host.has(FIRST_LOOK_SPEAKER) ? FIRST_LOOK_SPEAKER : (host.nearestIdle(FIRST_LOOK_R) ?? FIRST_LOOK_SPEAKER);
  look = { speaker, prevObjective: host.state().objective };
  host.address(speaker, FIRST_LOOK_OPEN, {
    // 면제표(address.ts)에 없다 — 이 방의 첫마디도 **걸어온 뒤에** 나간다 (address ⑦). 못 오면 onDropped 로 거둬지고 한 번 더 부른다
    scene: 'FIRST_LOOK_OPEN',
    answerMs: FIRST_LOOK_WINDOW_MS,
    onAnswer: () => {
      if (!host || !look) return;
      const t = host.playCast(FIRST_LOOK_ANY, look.speaker, 700);
      finishFirstLook(700 + t);
    },
    onSilent: () => {
      if (!host || !look) return;
      const t = host.playCast(FIRST_LOOK_NONE, look.speaker);
      finishFirstLook(t);
    },
    // 못 왔다 — 아무 줄도 안 나갔다. 표를 거두고, 한 번은 다시 부른다(그때 가까운 것이 다를 수 있다)
    onDropped: () => {
      look = null;
      if (attempt < 1) host?.afterControl(FIRST_LOOK_RETRY_MS, () => requestFirstLook(attempt + 1));
    },
  });
}

/** 답이 끝났다 — 목표를 되돌리고(명판 미독이면 「복도를 조사하라…」) HALL_SEE */
function finishFirstLook(afterMs: number) {
  if (!host || !look) return;
  const prev = look.prevObjective;
  look = null;
  host.later(afterMs, () => {
    if (!host) return;
    host.patch({ objective: identity.get().known ? prev : OBJ_INSPECT });
    host.play(HALL_SEE, 600);
  });
}

/* ─────────────────────────────── NOTICE ─────────────────────────────── */

/**
 * 의심도가 처음 0 위로 올랐다 — 근처 개체 하나가 하던 걸 멈추고 1.2 초 이쪽을 본다. 다시 돌아선다. 과학자 한 줄.
 * 값 변화 없음 · HUD 강조 없음 · 설명 없음 (D3 · D4). 어느 방이든 — 「처음」은 판에 한 번뿐이라 runFlags 다.
 */
function onSuspicionChanged() {
  if (!host || suspicion.get().value <= 0 || !host.once('notice')) return;
  noticed = true;
  const id = host.nearest(Infinity);
  if (id) host.stare(id, STARE_MS);
  host.later(STARE_MS, () => host?.play(NOTICE_LINES));
}

/* ─────────────────────────────── DOOR_CHOICE ─────────────────────────────── */

/**
 * 격납문의 글 — W1 이 DOOR_PROMPT 의 꼴을 정한다(문서: 화면 두 줄 「격납문 — …」 「[E] 문을 연다 · [Q] 열지 않는다」).
 * 객체({title,yes,no}) · 문자열 하나 · 두 줄 배열 셋 중 무엇이 와도 받는다 — 단추 글자는 문서 그대로다.
 */
function doorPrompt(): { title: string; yes: string; no: string } {
  const p = DOOR_PROMPT as unknown;
  const yes = '문을 연다';
  const no = '열지 않는다';
  if (typeof p === 'string') return { title: p, yes, no };
  if (Array.isArray(p)) {
    const title = String(p[0] ?? '');
    const row = /\[E\]\s*(.+?)\s*·\s*\[Q\]\s*(.+)/.exec(String(p[1] ?? ''));
    return { title, yes: row?.[1] ?? yes, no: row?.[2] ?? no };
  }
  const o = (p ?? {}) as { title?: string; text?: string; yes?: string; no?: string };
  return { title: o.title ?? o.text ?? '', yes: o.yes ?? yes, no: o.no ?? no };
}

function askDoor() {
  if (!host) return;
  doorArmed = false;
  doorSeenFlag = true;
  doorChoiceOpen = true;
  const p = doorPrompt();
  host.patch({
    choice: {
      title: p.title,
      yes: p.yes,
      no: p.no,
      onYes: () => {
        if (!host) return;
        opened = true;
        doorChoiceOpen = false;
        host.patch({ choice: null });
        host.leave();
      },
      onNo: () => {
        if (!host) return;
        doorChoiceOpen = false;
        host.patch({ choice: null });
        const t = host.play(DOOR_STAY);
        // 그림을 하나도 안 봤으면 — 판당 한 번
        if (lexicon.seenCount() === 0 && host.once('door-no-mural')) host.play(DOOR_NO_MURAL, t + 400);
      },
    },
  });
}

/* ─────────────────────────────── NUDGES ─────────────────────────────── */

/**
 * 지금 화면이 나에게 무언가를 시키고 있나 — host.quiet() 이 안 보는 것들. 물음(격납문 [E]/[Q] · 도화선) ·
 * 막대(가만히 · 작업 · 스캔) · 개체가 답을 기다리는 창 · 암전. 이 위에 속마음이 겹치면 내가 한 행동과 어긋난 말이 된다
 */
function busy(st: Scene2State): boolean {
  // 있으면 참 — `!== null` 로 재지 않는다. 이 손잡이는 시험의 가짜 host 도 넘기는데, 안 쓰는 칸이 빠져 있으면 undefined 가 「떠 있다」로 잡힌다
  return Boolean(st.choice || st.urgent || st.stillness || st.answer || st.blackout || st.talking);
}

/**
 * 조건 없는 줄(「복도 끝에 격납문이 있다」)을 덮는 거리 — 이만큼 안이면 문이 이미 눈앞이라 안내가 아니다.
 * DOOR_ASK_R(1.6) 은 물음이 뜨는 거리라 그 밖에서도 문은 보인다
 */
const DOOR_IN_SIGHT_R = 7;

/** 막혔을 때 드는 속마음 — 한 판에 하나씩, 아직 안 한 것만, 조건이 맞는 것만. 정적일 때만, 조작권부터 24 초 뒤부터 든다 */
function nudge(now: number, toDoor: number) {
  if (!host || host.room() !== 'corridor' || !host.quiet() || now < nudgeAt || nudgeLeft.length === 0) return;
  if (host.sinceControl() < NUDGE_FIRST_MS) return;
  const talked = units.all().some((u) => units.met(u.id));
  const seen = lexicon.seenCount();
  const known = identity.get().known;
  for (let i = 0; i < nudgeLeft.length; i += 1) {
    const n = NUDGES[nudgeLeft[i]];
    // W1 이 when 유니온을 넓힌다 — 여기서는 글자로 본다. 모르는 조건은 「조건 없음」으로 친다
    const when = (n as { when?: string }).when;
    if (when === 'noMural' && seen > 0) continue;
    if (when === 'noTag' && known) continue;
    if (when === 'talkedWithoutMural' && (seen > 0 || !talked)) continue;
    if (when === 'notTalked' && talked) continue;
    if (when === 'alert30' && alert.get() < 30) continue;
    if (when === 'doorNoTag' && (!doorSeenFlag || known)) continue;
    // 조건 없는 줄(「복도 끝에 격납문이 있다」)은 문이 아직 눈에 안 들었을 때만 — 본 문을, 하물며 눈앞의 문을 가리키면 늦은 말이다
    if (when === undefined && (doorSeenFlag || toDoor <= DOOR_IN_SIGHT_R)) continue;
    nudgeLeft.splice(i, 1);
    host.play([{ who: 'thought', text: n.text }]);
    nudgeAt = now + NUDGE_GAP_MS;
    return;
  }
}

/* ─────────────────────────────── 공개 ─────────────────────────────── */

export const corridor = {
  /** 새 판 — 손잡이를 받고 의심도를 듣기 시작한다 (NOTICE 는 방을 가리지 않는다) */
  start(h: Host): void {
    corridor.reset();
    host = h;
    unsub = suspicion.subscribe(onSuspicionChanged);
  },

  /** 복도에 들어섰다 — 저쪽이 먼저 거는 말은 introDone 이 건다 (인트로의 마지막 줄이 뜰 때) */
  enter(now: number): void {
    if (!host) return;
    look = null;
    askedHuman.clear();
    doorArmed = true;
    doorSeenFlag = false;
    doorChoiceOpen = false;
    opened = false;
    nudgeLeft = NUDGES.map((_, i) => i);
    // 첫 속마음은 조작권부터 24 초 — nudge 가 sinceControl 로 본다. 여기서는 간격의 기준만 비운다
    nudgeAt = now;
  },

  /**
   * 과학자의 설명이 **실제로** 끝났다 — 마지막 줄이 나가고 대화창이 빈 순간 scenario2 가 부른다(더 기다릴 것이 있으면 waitMs).
   * 상자를 눌러 줄을 넘기면 대화창이 그만큼 일찍 비므로 저쪽도 그만큼 일찍 걸어온다 — 시계로 재면 그 손을 못 본다
   */
  introDone(waitMs: number): void {
    if (!host || host.room() !== 'corridor') return;
    scheduleFirstLook(waitMs);
  },

  /**
   * 복도를 나갔다 — 저쪽이 먼저 건 말의 표를 거둔다(창 자체는 address.cancel 이 아무것도 틀지 않고 내린다). 문을 여는 순간 창이 열려 있었으면
   * HALL_SEE 가 휴게에서 나오면 안 된다. scenario2.enterRoom 이 부른다
   */
  leave(): void {
    look = null;
    doorChoiceOpen = false;
  },

  /** 한 프레임 — 창 · 꺾임 · 문 · 유도 속마음 */
  tick(now: number, me: Readonly<Vec2>): void {
    if (!host || host.room() !== 'corridor') return;

    const st = host.state();
    const d = dist(me, CORRIDOR2_EXIT);
    if (d > DOOR_REARM_R) {
      doorArmed = true;
      // 물음을 띄운 채 물러났다 — 내린다. 떠 있는 동안은 [E]/[Q] 밖의 자판(Enter · Space)이 전부 죽어 있다
      if (doorChoiceOpen && st.choice) {
        doorChoiceOpen = false;
        host.patch({ choice: null });
      }
    } else if (d <= DOOR_ASK_R && doorArmed && !opened && !st.choice && !st.talking && !st.blackout) askDoor();

    // 무언가 일어나는 중이면 유도 속마음의 시계를 뒤로 민다 — 「막혔을 때」가 조건이라, 하던 일이 끝나자마자 드는 것은 유도가 아니라 끼어들기다
    if (busy(st) || !host.quiet()) nudgeAt = Math.max(nudgeAt, now + NUDGE_AFTER_MS);

    nudge(now, d);
  },

  /** 저쪽이 먼저 건 말이 아직 끝나지 않았나 — 걸어오는 중이거나 창이 열려 있다 (시험 · 확인용). 답의 갈래는 address 가 든다 */
  firstLookPending(): boolean {
    return look !== null;
  },
  firstLookSpeaker(): string | null {
    return look?.speaker ?? null;
  },

  /** 개체에게 한 마디가 갔다 — 사람 물음이면 센다. 서로 다른 둘이면 「…아무도 안 묻는구나. 여기서는.」— 복도의 속마음이라 복도에서만 */
  onSaid(id: string, tag: Tag): void {
    if (!host || host.room() !== 'corridor' || !HUMAN_TAGS.includes(tag)) return;
    askedHuman.add(id);
    if (askedHuman.size >= 2 && host.once('nobody-asks')) host.play(HALL_NOBODY_ASKS, 3000);
  },

  /** 격납문을 열기로 했다 — canLeave 가 이걸 본다. 그림 수 잠금은 없다 (D8) */
  doorOpened(): boolean {
    return opened;
  },
  /** 문 앞에서 한 번은 물었다 — NUDGES 의 doorNoTag 조건 */
  doorSeen(): boolean {
    return doorSeenFlag;
  },
  /** NOTICE 를 겪었나 (시험 · HUD 없음) */
  noticed(): boolean {
    return noticed;
  },

  reset(): void {
    unsub?.();
    unsub = null;
    host = null;
    look = null;
    noticed = false;
    askedHuman.clear();
    doorArmed = true;
    doorSeenFlag = false;
    doorChoiceOpen = false;
    opened = false;
    nudgeLeft = [];
    nudgeAt = 0;
  },
};
