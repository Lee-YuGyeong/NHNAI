/**
 * 검문 감독 호출기 — 관문 하나의 답을 감독(src/lab/director.ts)에게 넘기고 **다음 장면**을 받아 온다.
 *
 *   chapter2.ask (내 한 마디) ──▶ 여기 ──기록·의심도·헌법을 붙여──▶ POST /api/world/direct ──무브──▶ chapter2 가 집행
 *
 * 형제(backstep.ts)와 같은 골격이다 — 타임아웃을 걸고, 실패하면 폴백(judgeDirect)이 같은 모양으로 답한다.
 * 다른 점은 **캐시가 없다**는 것: 같은 질문에 같은 답을 했더라도 그 사이에 기록이 달라졌으면 판정이 달라져야 한다.
 * 그게 이 감독의 존재 이유다.
 *
 * 기다리는 동안 판은 멈춘다 (경비가 말없이 서 있다). 그 정적은 버그가 아니라 연출이라서 굳이 숨기지 않는다 —
 * 다만 무한정 기다릴 수는 없으니 TIMEOUT_MS 에서 끊고 폴백으로 친다.
 *
 * 의심도 반영과 기록 남기기는 여기서 한다. 화면(chapter2)은 **무브를 집행하는 일만** 한다.
 * 판정 한 건이 어떻게 났는지(헌법이 허락한 목록·모델의 선택·읽은 기록·폴백 여부)는 features/world/directorLog.ts 에 열어 둔다 —
 * 화면 오른쪽의 DIRECTOR 판이 그걸 그대로 그린다. 이 게임에서 **가장 좋은 부분이 화면에 안 보이던** 문제를 그걸로 푼다.
 */

import {
  allowMoves,
  judgeDirect,
  type Check,
  type DirectorRequest,
  type DirectorResponse,
  type Fact,
  type MoveBudget,
} from '@/lab/director';
import { suspicion } from '@/world/mp/suspicion';
import { sync } from '@/world/mp/sync';

import { directorLog } from './directorLog';
import { dossier } from './dossier';

/**
 * 이 안에 답이 안 오면 폴백. 구독 개발 서버는 한 호출에 몇 초가 걸리고, 배포 워커(API 키)는 그보다 짧다.
 * 관문 하나를 가르는 판정이라 뒷걸음(6초)보다 조금 더 기다려 준다 — 폴백으로 새면 그 장면의 재미가 통째로 사라진다.
 */
const TIMEOUT_MS = 8000;

export interface DirectAsk {
  check: Check;
  /** 묻는 개체의 호출명 */
  unit: string;
  /** 방금 던진 질문 */
  question: string;
  /** 내 답. null 이면 무응답 */
  answer: string | null;
  /** 몇 번째 문답인가 (press 로 늘어난다) */
  round: number;
  /** 화면만 아는 사실 대조 (mp/identity 가 판정한다) */
  fact: Fact;
  /** 지금 이 무대에서 고를 수 있는 무브를 정하는 값들 */
  budget: MoveBudget;
}

export interface DirectVerdict extends DirectorResponse {
  source: 'llm' | 'fallback';
}

async function post(req: DirectorRequest): Promise<DirectorResponse | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('/api/world/direct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as DirectorResponse;
  } catch {
    return null; // 폴백으로
  } finally {
    window.clearTimeout(timer);
  }
}

/** 판정 사유를 의심도 저장소의 사유로 옮긴다 — 감정이 샌 것과 말투가 어긋난 것은 다른 일이다 */
function reasonOf(v: DirectorResponse): '감정' | '말투' | '보고' {
  if (v.delta > 0) return /감정|공포|두려|웃|당황/.test(v.why) ? '감정' : '말투';
  return '보고';
}

/**
 * 관문 하나를 감독에게 넘긴다. 돌아온 무브는 부르는 쪽이 집행한다.
 * 여기서 하는 일: 기록·의심도·헌법을 붙여 묻고, 의심도를 반영하고, 감독이 남긴 한 줄을 기록에 쌓는다.
 */
export async function direct(ask: DirectAsk): Promise<DirectVerdict> {
  const req: DirectorRequest = {
    kind: 'direct',
    check: ask.check,
    unit: ask.unit,
    question: ask.question,
    answer: ask.answer,
    round: ask.round,
    fact: ask.fact,
    suspicion: suspicion.get().value,
    sync: sync.get().value,
    dossier: dossier.lines(),
    allowed: allowMoves(ask.budget),
  };

  // 묻기 직전에 한 줄 연다 — 화면(DirectorHud)이 「감독이 읽는 중」을 그 몇 초 동안 띄운다
  const id = directorLog.begin(req);

  const res = await post(req);
  const verdict: DirectVerdict = res
    ? { ...res, source: 'llm' }
    : { ...judgeDirect(req), source: 'fallback' };

  if (verdict.delta !== 0) suspicion.bump(verdict.delta, reasonOf(verdict));
  // 감독이 기억해 두라고 한 것 — 다음 관문이 이걸 읽고 대질한다
  if (verdict.note) dossier.note(verdict.note);

  // 의심도를 반영한 **뒤에** 닫는다 — 화면이 보여 줄 것은 판정 뒤의 값이다
  directorLog.finish(id, verdict, suspicion.get().value);

  return verdict;
}
