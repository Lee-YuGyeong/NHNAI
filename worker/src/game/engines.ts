/**
 * 판이 열 수 있는 물리 테스트 — worker/src/trial 의 엔진(GameEngine 계약)을 그대로 조립한다.
 * 색 사냥이 같은 계약으로 들어오면 여기 한 줄이다 (worker/src/trial/colorhunt/ — 물리 미니게임 담당).
 *
 * 화면 위 한 줄 지시문도 여기 둔다 — 조건값(마찰 · 중력 · 차단 파장)은 문장에도 없다 (P8).
 */

import type { TrialGame } from '../../../src/world/mp/protocol';
import type { GameEngine } from '../trial/engine';
import { FallEngine } from '../trial/fall/engine';
import { StoplineEngine } from '../trial/stopline-engine';

export const ENGINES: Partial<Record<TrialGame, () => GameEngine>> = {
  stopline: () => new StoplineEngine(),
  fall: () => new FallEngine(),
};

export const INSTRUCTION: Record<TrialGame, string> = {
  stopline: 'W 로 달리고 S 로 멈춘다. 붉은 정지선에 정확히 서라. 3회.',
  fall: '머리 위에서 떨어지는 것을 피하라. WASD 로 움직인다. 중력은 매번 다르다.',
  colorhunt: '지시된 색의 구슬만 주워라. E 로 줍는다. 빛은 도중에 바뀐다.',
};

export function availableGames(): TrialGame[] {
  return (Object.keys(ENGINES) as TrialGame[]).filter((g) => ENGINES[g]);
}
