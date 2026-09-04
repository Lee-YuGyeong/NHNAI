/**
 * 구역 상태 — 대화하고, 지목하고, 한 명씩 폐기한다.
 *
 * 한 판 = 3 라운드. 라운드마다 한 명이 폐기되고 **정체가 공개된다.**
 * 사람이 3 라운드를 버티면 사람 승, 중간에 폐기되면 그 순간 끝.
 * (무작위로 찍어도 사람 생존 확률은 5/6 x 4/5 x 3/4 = 50%. 여기서부터 실력이 갈린다)
 *
 * 페르소나 본문을 화면에서 고칠 수 있다 — 고친 내용이 바로 다음 발화부터 반영된다.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { LEADER_ID, LEADER_NAME, PERSONAS, fiveFrom, sampleCallStyle, sampleNames, type CallStyle } from '@/lab/personas';
import { executionLines, resolveName, type CastPersona, type DeadRecord, type TalkLine } from '@/lab/talk';

/** 한 판의 라운드 수 */
export const ROUNDS = 3;
/** 이만큼 발화가 오가면 투표를 걸 수 있다 */
export const TURNS_PER_ROUND = 8;
/** 자동 진행 한 번에 굴러가는 발화 수 */
export const AUTO_BUDGET = 10;

export interface TalkNode {
  id: string;
  title: string;
  /** 시스템 프롬프트에 들어가는 본문 — 화면에서 수정 가능 */
  prompt: string;
  model: string;
  isLeader: boolean;
  /** 남을 부르는 버릇 — 이름표 그대로("013아")냐 앞의 0 을 떼고("13아")냐. 성격과 같이 매판 새로 뽑는다 */
  calls: CallStyle;
  /** 이 자리가 나인가 — **에이전트에게는 절대 안 나간다** */
  isHuman: boolean;
}

export interface Suspicion {
  voterId: string;
  targetId: string;
  reason: string;
  confidence: number;
}

export type Phase = 'talk' | 'vote' | 'result' | 'over';

export interface TalkState {
  started: boolean;
  /** 성격을 즉석에서 만드는 중 — 끝나야 nodes 가 채워지고 대화가 시작된다 */
  casting: boolean;
  phase: Phase;
  round: number;
  nodes: TalkNode[];
  log: TalkLine[];
  /** 이번 라운드가 시작된 log 위치 */
  roundStart: number;
  dead: DeadRecord[];
  input: string;
  speaking: string | null;
  busy: boolean;
  error: string | null;
  suspects: Suspicion[];
  /** 이번 라운드에 폐기된 사람 */
  ejected: DeadRecord | null;
  outcome: 'human' | 'ai' | null;
  showPersonas: boolean;
  /** 자동 진행 — 켜 두면 AI 들이 알아서 주고받는다 */
  auto: boolean;
  /** 남은 자동 발화 수. 켜 둔 채 방치해도 무한히 돌지 않게 한다 */
  autoLeft: number;
  /** 호명당했지만 대답 없이 넘긴 지점 (그때의 log 길이). -1 이면 없음 */
  skipAt: number;
  /** 지금 누가 누구 쪽으로 기울었는지. 전원이 보는 공개 정보이고, 표는 이걸 배신할 수 있다 */
  leanings: Record<string, string>;
  /** 왜 그쪽으로 기울었는지 한 줄 — 표심 보드의 "왜?" 로 펼쳐 본다 */
  leanReasons: Record<string, string>;
  /** 그 의심이 얼마나 확실한지 0~1 — 표심 보드에 % 로 뜬다 */
  leanConfidence: Record<string, number>;
  /**
   * 이번 라운드에 표심이 움직인 자취. to 가 비면 **의심을 접은 것**이다.
   * 화면에도 뜨고 다음 발화의 프롬프트로도 들어간다 — 말 바꾸는 게 티 나야 몰이에 대가가 생긴다.
   */
  shifts: { id: string; from: string; to: string }[];
  /** 이번 라운드에 리더가 **총으로 제거한** 사람. 투표로 폐기된 것과 구분한다 (연출이 다르다) */
  executed: string | null;
  /**
   * 호명당하고도 대답 없이 넘긴 횟수. 판 내내 쌓인다 (라운드로 지우지 않는다).
   * **조용한 것 자체는 근거가 못 되고 이것만 근거가 된다** — 말수는 성격이지만 회피는 선택이다.
   */
  ignored: Record<string, number>;
  /** 최근에 차례를 넘긴 사람들. 같은 개체를 연달아 세우지 않는 데 쓴다 */
  passes: string[];
}

/**
 * 한 명이 판에서 빠지는 절차 — 총이든 투표든 이 뒤는 같다.
 * 정체는 이 순간 공개되고, 사람이 빠졌으면 그 자리에서 판이 끝난다.
 */
function kill(s: TalkState, name: string, suspects: Suspicion[]): void {
  const node = s.nodes.find((n) => n.id === name);
  if (!node) return;
  const record: DeadRecord = { name: node.id, wasHuman: node.isHuman };
  s.dead.push(record);
  s.ejected = record;
  s.suspects = suspects;
  s.phase = 'result';
  s.busy = false;
  s.speaking = null;

  if (node.isHuman) s.outcome = 'ai';
  else if (s.round >= ROUNDS) s.outcome = 'human';
  if (s.outcome) s.phase = 'over';
}

/** 표심이 실제로 바뀌었을 때만 자취를 남긴다. 최근 8개만 들고 있는다 */
function noteShift(s: TalkState, id: string, to: string): void {
  const from = s.leanings[id] ?? '';
  if (from === to) return;
  s.shifts.push({ id, from, to });
  if (s.shifts.length > 8) s.shifts.shift();
}

const initialState: TalkState = {
  started: false,
  casting: false,
  phase: 'talk',
  round: 1,
  nodes: [],
  log: [],
  roundStart: 0,
  dead: [],
  input: '',
  speaking: null,
  busy: false,
  error: null,
  suspects: [],
  ejected: null,
  outcome: null,
  showPersonas: false,
  auto: true,
  autoLeft: 0,
  skipAt: -1,
  leanings: {},
  leanReasons: {},
  leanConfidence: {},
  shifts: [],
  executed: null,
  ignored: {},
  passes: [],
};

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 판을 짠다 — **이름도 성격도 자리도 매판 새로.**
 *
 * 성격 다섯은 판을 시작할 때 LLM 이 즉석에서 짓는다 (talk.ts runCast). 생성이 실패하면
 * 손으로 쓴 풀(PERSONAS + EXTRA_PERSONAS)에서 5명을 샘플한다 — 어느 쪽이든 판은 선다.
 * 리더 성격만 고정이다: "판을 끈다"는 기능이 게임 진행에 필요해서다. 이름은 NAMES 에서
 * 무작위 6개를 뽑아 붙이므로 성격과 이름의 짝은 매판 다르다.
 *
 * 내 자리는 리더 성격만 빼고 무작위 — 리더는 대화를 끌고 가야 해서 사람이 맡지 않는다.
 * 내 자리의 페르소나는 **아무도 쓰지 않는다** — 나는 그냥 나로서 말한다.
 * (AI 들은 서로의 성격을 모르므로, 내가 무슨 성격이어야 하는지 대조할 방법도 없다)
 */
function buildNodes(five: { title: string; prompt: string; model: string; calls: CallStyle }[]): TalkNode[] {
  const leader = PERSONAS.find((p) => p.id === LEADER_ID)!;
  const seats = shuffle([
    // 리더도 남을 부를 때는 제 버릇대로 부른다 — 관리 개체라고 이름표를 또박또박 읽을 이유는 없다
    { title: leader.title, prompt: leader.prompt, model: leader.model, calls: sampleCallStyle(), isLeader: true },
    ...five.map((c) => ({ ...c, isLeader: false })),
  ]);
  const names = sampleNames(seats.length);
  const humanSeats = seats.map((c, i) => (c.isLeader ? -1 : i)).filter((i) => i >= 0);
  const mine = humanSeats[Math.floor(Math.random() * humanSeats.length)];
  return seats.map((c, i) => ({
    // 리더는 이름 대신 역할로 부른다 — 이름을 줘도 태그와 목소리로 이미 드러난다
    id: c.isLeader ? LEADER_NAME : names[i],
    title: c.title,
    prompt: c.prompt,
    model: c.model,
    calls: c.calls,
    isLeader: c.isLeader,
    isHuman: i === mine,
  }));
}

export const talkSlice = createSlice({
  name: 'talk',
  initialState,
  reducers: {
    /** 판을 연다 — 성격 생성이 끝나(castReady) 야 대화가 시작된다 */
    start(s) {
      Object.assign(s, initialState, {
        started: true,
        casting: true,
        nodes: [],
        log: [],
        dead: [],
        suspects: [],
        leanings: {},
        shifts: [],
        executed: null,
        ignored: {},
        passes: [],
        autoLeft: AUTO_BUDGET,
      });
    },
    /** 즉석 생성된 성격이 도착했다. null 이면 생성 실패 — fiveFrom 이 손으로 쓴 풀로 폴백한다 */
    castReady(s, a: PayloadAction<CastPersona[] | null>) {
      if (!s.started || !s.casting) return; // 기다리는 동안 리셋했으면 버린다
      s.casting = false;
      s.nodes = buildNodes(fiveFrom(a.payload?.length === 5 ? a.payload : null));
    },
    reset() {
      return { ...initialState, nodes: [], log: [], dead: [], suspects: [] };
    },
    setInput(s, a: PayloadAction<string>) {
      s.input = a.payload;
    },
    setBusy(s, a: PayloadAction<boolean>) {
      s.busy = a.payload;
      if (!a.payload) s.speaking = null;
    },
    setSpeaking(s, a: PayloadAction<string | null>) {
      s.speaking = a.payload;
    },
    say(s, a: PayloadAction<TalkLine & { leaning?: string; why?: string; confidence?: number }>) {
      s.log.push({ nodeId: a.payload.nodeId, text: a.payload.text });
      if (a.payload.leaning !== undefined) {
        // 「013」·「13」처럼 줄여 적은 표도 그 개체에 꽂는다 — 판에 없는 이름이면 적힌 그대로 둔다
        const lean = a.payload.leaning
          ? resolveName(a.payload.leaning, s.nodes.map((n) => n.id)) || a.payload.leaning
          : '';
        noteShift(s, a.payload.nodeId, lean);
        if (lean) {
          s.leanings[a.payload.nodeId] = lean;
          s.leanReasons[a.payload.nodeId] = a.payload.why ?? '';
          s.leanConfidence[a.payload.nodeId] = a.payload.confidence ?? 0.5;
        } else {
          delete s.leanings[a.payload.nodeId];
          delete s.leanReasons[a.payload.nodeId];
          delete s.leanConfidence[a.payload.nodeId];
        }
      }
      // 사람은 AI 가 말을 만드는 중에도 끼어든다 — 남의 발화가 진행 중 표시(…)를 걷으면 안 된다
      if (s.speaking === a.payload.nodeId) s.speaking = null;
    },
    /** 발화 없이 표명만 바꾼다 (내 드롭다운) — 내 이유·확신은 적지 않는다 */
    setLeaning(s, a: PayloadAction<{ id: string; target: string }>) {
      noteShift(s, a.payload.id, a.payload.target);
      if (a.payload.target) s.leanings[a.payload.id] = a.payload.target;
      else delete s.leanings[a.payload.id];
      delete s.leanReasons[a.payload.id];
      delete s.leanConfidence[a.payload.id];
    },
    setError(s, a: PayloadAction<string | null>) {
      s.error = a.payload;
      s.busy = false;
      s.speaking = null;
    },
    /** 대화를 접고 투표로 간다 */
    openVote(s) {
      s.phase = 'vote';
      s.auto = false;
      s.suspects = [];
    },
    /** 표를 다 모았다 → 최다 득표자 폐기, 정체 공개 */
    eject(s, a: PayloadAction<{ name: string; suspects: Suspicion[] }>) {
      kill(s, a.payload.name, a.payload.suspects);
    },
    /**
     * 리더의 즉결 처형 — 몰이 압력이 선을 넘으면 **투표를 건너뛴다.**
     *
     * 선고 두 줄이 리더 이름으로 로그에 남고, 그 사람은 그때부터 말하지 못한다
     * (aliveNodes 에서 빠지므로 발화 순번에도, 남들 프롬프트의 명단에도 없다).
     * 이 라운드의 폐기는 이것으로 끝이다 — 투표는 열리지 않는다.
     */
    execute(s, a: PayloadAction<{ name: string; leaderId: string }>) {
      const target = s.nodes.find((n) => n.id === a.payload.name);
      if (!target || s.dead.some((d) => d.name === target.id)) return;
      executionLines(target.id).forEach((text) => s.log.push({ nodeId: a.payload.leaderId, text }));
      const suspects = Object.entries(s.leanings)
        .filter(([, t]) => t === target.id)
        .map(([voter]) => ({
          voterId: voter,
          targetId: target.id,
          reason: s.leanReasons[voter] ?? '(표명만 했다)',
          confidence: s.leanConfidence[voter] ?? 0.5,
        }));
      s.executed = target.id;
      s.auto = false;
      kill(s, target.id, suspects);
    },
    nextRound(s) {
      s.round += 1;
      s.leanings = {};
      s.leanReasons = {};
      s.leanConfidence = {};
      s.shifts = [];
      s.executed = null;
      s.passes = [];
      s.phase = 'talk';
      s.roundStart = s.log.length;
      s.ejected = null;
      s.suspects = [];
      s.input = '';
      s.auto = true;
      s.autoLeft = AUTO_BUDGET;
      s.skipAt = -1;
    },
    editPersona(s, a: PayloadAction<{ id: string; prompt: string }>) {
      const node = s.nodes.find((n) => n.id === a.payload.id);
      if (node) node.prompt = a.payload.prompt;
    },
    togglePersonas(s) {
      s.showPersonas = !s.showPersonas;
    },
    setAuto(s, a: PayloadAction<boolean>) {
      s.auto = a.payload;
      if (a.payload) s.autoLeft = AUTO_BUDGET;
    },
    /** 호명당했는데 대답하지 않고 넘긴다 — 침묵도 대화에 남는다 */
    skipTurn(s, a: PayloadAction<{ id: string }>) {
      s.skipAt = s.log.length;
      s.ignored[a.payload.id] = (s.ignored[a.payload.id] ?? 0) + 1;
      s.auto = true;
      s.autoLeft = AUTO_BUDGET;
    },
    /**
     * 개체가 차례를 넘겼다 — 로그에는 아무것도 남지 않는다.
     *
     * 넘김이 로그에 남으면 그게 발화가 되어 "조용하다"는 상태 자체가 사라진다.
     * 대신 불렸는데 넘긴 경우만 세어 둔다 — 그게 유일하게 근거로 쓸 수 있는 형태다.
     */
    passTurn(s, a: PayloadAction<{ nodeId: string; wasCalled: boolean }>) {
      s.passes.push(a.payload.nodeId);
      if (s.passes.length > 4) s.passes.shift();
      if (a.payload.wasCalled) s.ignored[a.payload.nodeId] = (s.ignored[a.payload.nodeId] ?? 0) + 1;
      // say 와 같은 이유 — 넘긴 개체의 표시만 걷는다 (사람이 끼어든 사이일 수 있다)
      if (s.speaking === a.payload.nodeId) s.speaking = null;
    },
    /** 자동 발화 하나를 썼다 */
    useAutoTurn(s) {
      s.autoLeft = Math.max(0, s.autoLeft - 1);
      if (s.autoLeft === 0) s.auto = false;
    },
  },
  selectors: { selectTalk: (s) => s },
});

export const talkActions = talkSlice.actions;
export const talkSelectors = talkSlice.selectors;

/** 에이전트로 나가는 자기 정보 (정체 필드 없음) */
export function selfOf(node: TalkNode) {
  return { id: node.id, prompt: node.prompt, model: node.model, isLeader: node.isLeader, calls: node.calls };
}

/** 아직 살아 있는 사람들 */
export function aliveNodes(s: TalkState): TalkNode[] {
  const dead = new Set(s.dead.map((d) => d.name));
  return s.nodes.filter((n) => !dead.has(n.id));
}
