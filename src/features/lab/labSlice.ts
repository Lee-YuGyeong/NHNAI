/**
 * 테스트 방 상태 — AI 5 + 인간 1(나). 3 라운드를 버티면 내가 이긴다.
 *
 * 정체(seats[].isHuman)는 **이 슬라이스 안에만** 있다. 워커로 나가는 것은 PublicState 뿐이다.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createSeats, ROUNDS, type Seat } from '@/lab/setup';
import type {
  AnswerRecord,
  PublicState,
  Rule,
  TalkRecord,
  TestSpec,
} from '@/lab/types';

/** 한 라운드 안에서 화면이 지나가는 단계 */
export type Phase =
  | 'idle' // 시작 전
  | 'design' // 리더가 규정·검사를 설계하는 중 (LLM 대기)
  | 'answer' // 내가 응답을 쓰는 중 (AI 응답은 동시에 생성)
  | 'grading' // 채점·공개
  | 'talk' // 내가 발화를 쓰는 중
  | 'talkReveal' // 전원 발화 공개
  | 'vote' // 내가 투표
  | 'result' // 폐기 결과
  | 'over'; // 판 종료

export interface LabState {
  phase: Phase;
  round: number;
  seats: Seat[];
  rules: Rule[];
  announce: string;
  test: TestSpec | null;
  answers: AnswerRecord[];
  talks: TalkRecord[];
  votes: { voterId: string; targetId: string; reason: string }[];
  ejectedThisRound: { nodeId: string; wasHuman: boolean } | null;
  history: PublicState['rounds'];
  /** 화면에 그대로 띄우는 오류 (조용히 삼키지 않는다) */
  error: string | null;
  /** 검증 게이트 활동 — 기각·재설계·프리셋 대체가 있었으면 그대로 보여준다 */
  gateNote: string | null;
  busy: boolean;
  /** 남은 초. 0 이면 타이머 없음 */
  remain: number;
  outcome: 'human' | 'ai' | null;
  myInput: string;
}

const initialState: LabState = {
  phase: 'idle',
  round: 0,
  seats: [],
  rules: [],
  announce: '',
  test: null,
  answers: [],
  talks: [],
  votes: [],
  ejectedThisRound: null,
  history: [],
  error: null,
  gateNote: null,
  busy: false,
  remain: 0,
  outcome: null,
  myInput: '',
};

export const labSlice = createSlice({
  name: 'lab',
  initialState,
  reducers: {
    start(s) {
      const seats = createSeats();
      Object.assign(s, initialState, { seats, phase: 'design', round: 1 });
    },
    setPhase(s, a: PayloadAction<Phase>) {
      s.phase = a.payload;
    },
    setBusy(s, a: PayloadAction<boolean>) {
      s.busy = a.payload;
    },
    setError(s, a: PayloadAction<string | null>) {
      s.error = a.payload;
      s.busy = false;
    },
    setGateNote(s, a: PayloadAction<string | null>) {
      s.gateNote = a.payload;
    },
    setInput(s, a: PayloadAction<string>) {
      s.myInput = a.payload;
    },
    tick(s) {
      if (s.remain > 0) s.remain -= 1;
    },
    setRemain(s, a: PayloadAction<number>) {
      s.remain = a.payload;
    },
    /** 리더 설계 결과 반영 */
    applyDesign(s, a: PayloadAction<{ rule: Rule; test: TestSpec; announce: string }>) {
      s.rules.push(a.payload.rule);
      s.test = a.payload.test;
      s.announce = a.payload.announce;
      s.answers = [];
      s.talks = [];
      s.votes = [];
      s.ejectedThisRound = null;
      s.myInput = '';
      s.busy = false;
    },
    setAnswers(s, a: PayloadAction<AnswerRecord[]>) {
      s.answers = a.payload;
      s.busy = false;
    },
    setTalks(s, a: PayloadAction<TalkRecord[]>) {
      s.talks = a.payload;
      s.busy = false;
    },
    setVotes(s, a: PayloadAction<LabState['votes']>) {
      s.votes = a.payload;
      s.busy = false;
    },
    /** 폐기 확정 → 라운드 기록을 히스토리로 넘긴다 */
    eject(s, a: PayloadAction<{ nodeId: string }>) {
      const seat = s.seats.find((n) => n.id === a.payload.nodeId);
      if (!seat) return;
      seat.alive = false;
      s.ejectedThisRound = { nodeId: seat.id, wasHuman: seat.isHuman };
      s.history.push({
        round: s.round,
        ruleLabels: s.rules.map((r) => r.label),
        test: s.test,
        announce: s.announce,
        answers: s.answers,
        talks: s.talks,
        votes: s.votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })),
        ejected: s.ejectedThisRound,
      });
      s.phase = 'result';
      s.busy = false;

      const me = s.seats.find((n) => n.isHuman);
      if (me && !me.alive) {
        s.outcome = 'ai';
        s.phase = 'over';
      } else if (s.round >= ROUNDS) {
        s.outcome = 'human';
        s.phase = 'over';
      }
    },
    nextRound(s) {
      s.round += 1;
      s.phase = 'design';
      s.myInput = '';
      s.busy = false;
    },
  },
  selectors: {
    selectLab: (s) => s,
  },
});

export const labActions = labSlice.actions;
export const labSelectors = labSlice.selectors;

/* ───────────────── 파생 계산 (컴포넌트가 쓰는 순수 함수) ───────────────── */

/** 워커로 나갈 공개 상태 — 정체가 들어가지 않는지 여기서 한 번 더 막는다 (I1) */
export function toPublicState(s: LabState): PublicState {
  return {
    nodes: s.seats.map((n) => ({ id: n.id, name: n.name, alive: n.alive })),
    rounds: [
      ...s.history,
      // 진행 중인 라운드도 넘긴다 (응답/발언까지는 공개된 상태다)
      {
        round: s.round,
        ruleLabels: s.rules.map((r) => r.label),
        test: s.test,
        announce: s.announce,
        answers: s.answers,
        talks: s.talks,
        votes: s.votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })),
        ejected: null,
      },
    ].filter((r) => r.round <= s.round),
    currentRound: s.round,
    rules: s.rules,
  };
}

export function mySeat(s: LabState): Seat | undefined {
  return s.seats.find((n) => n.isHuman);
}

export function aliveSeats(s: LabState): Seat[] {
  return s.seats.filter((n) => n.alive);
}
