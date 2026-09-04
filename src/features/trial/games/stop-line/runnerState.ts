/**
 * 프레임마다 바뀌는 값은 Redux 대신 여기(가변 Map)에 — src/world/core/WorldState.ts 와 같은 규칙.
 * TrialRig(내 카메라)과 RunnerAvatar(AI 몸)가 useFrame 에서 읽는다.
 *
 * 한 사람의 기록은 **시행의 타임라인**이다: trial_running(달리기 시작) → trial_stopline_waypoints(브레이크 지점 →
 * 정지 지점) 이 시행마다 한 쌍씩 쌓인다. AI 좌석은 라운드가 열리는 순간 3회분이 한꺼번에 오는데(runtime.ts
 * runAiAttempts), 시각이 미래라 **지금 시각에 맞는 시행 하나**를 골라 그린다 — 덮어쓰면 마지막 시행의 브레이크
 * 지점에 순간이동해 서 있게 된다.
 *
 * 시각은 전부 **서버 시각(epoch ms)** 이다 — 읽을 때도 performance.now() 가 아니라 Date.now() 로 비교한다.
 */
import { STOPLINE_TRACK_LENGTH } from '@/world/mp/constants';
import { runDistance, runTimeMs } from './runModel';

interface Attempt {
  startAt: number;
  brakeAt?: number;
  brakePos?: number;
  stopAt?: number;
  stopPos?: number;
}

/** 정지한 뒤 그 자리에 서 있는 시간(ms). 지나면 출발선으로 돌아가 있다 */
const HOLD_MS = 1500;

const timelines = new Map<string, Attempt[]>();
const lanes = new Map<string, number>();

export interface RunnerFrame {
  /** 출발선에서 달린 거리(m) */
  x: number;
  anim: 'idle' | 'walk';
}

const AT_START: RunnerFrame = { x: 0, anim: 'idle' };

function current(id: string, now: number): Attempt | null {
  const list = timelines.get(id);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].startAt <= now) return list[i];
  return null;
}

export const runnerState = {
  setLane(id: string, lane: number): void {
    lanes.set(id, lane);
  },
  laneOf(id: string): number {
    return lanes.get(id) ?? 0;
  },
  running(id: string, startAt: number): void {
    const list = timelines.get(id) ?? [];
    list.push({ startAt });
    timelines.set(id, list);
  },
  braking(id: string, x0: number, x1: number, t0: number, t1: number): void {
    const list = timelines.get(id) ?? [];
    let last = list.at(-1);
    // 달리기 시작 알림 없이 판정만 왔다(늦게 들어온 사람) — 브레이크 지점에서 출발 시각을 역산해 채운다
    if (!last || last.brakeAt !== undefined) {
      last = { startAt: t0 - runTimeMs(x0) };
      list.push(last);
    }
    last.brakeAt = t0;
    last.brakePos = x0;
    last.stopAt = t1;
    last.stopPos = x1;
    timelines.set(id, list);
  },
  /** 새 라운드 — 전원 출발선으로. 레인 배정은 남긴다(그대로여야 화면이 안 흔들린다) */
  resetAll(): void {
    timelines.clear();
  },
  remove(id: string): void {
    timelines.delete(id);
    lanes.delete(id);
  },
  clear(): void {
    timelines.clear();
    lanes.clear();
  },
  /** 지금 출발선에 서 있는가 — 다음 시행(W)을 받을 수 있는 조건 */
  atStart(id: string, now: number): boolean {
    const f = runnerState.frameAt(id, now);
    return f.x === 0 && f.anim === 'idle';
  },
  frameAt(id: string, now: number): RunnerFrame {
    const a = current(id, now);
    if (!a) return AT_START;

    if (a.brakeAt === undefined || now < a.brakeAt) {
      return { x: Math.min(runDistance(now - a.startAt), STOPLINE_TRACK_LENGTH), anim: 'walk' };
    }
    const { brakePos = 0, stopPos = 0, stopAt = a.brakeAt } = a;
    if (now < stopAt) {
      const u = (now - a.brakeAt) / Math.max(1, stopAt - a.brakeAt);
      const eased = 1 - (1 - u) ** 2; // ease-out — 감속하는 느낌만 낸다, 실제 마찰과는 무관하다
      return { x: brakePos + (stopPos - brakePos) * eased, anim: 'walk' };
    }
    if (now < stopAt + HOLD_MS) return { x: stopPos, anim: 'idle' };
    return AT_START;
  },
};
