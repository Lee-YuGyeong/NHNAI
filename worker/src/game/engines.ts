/**
 * 판이 열 수 있는 물리 테스트 — worker/src/trial 의 엔진(GameEngine 계약)을 그대로 조립한다.
 * 3종(PLANNING §2)에 2026-09-05 넷째 「움직이는 플랫폼」(worker/src/trial/platform)이 붙었다 — 점프 정확도를 본다.
 *
 * 화면 위 한 줄 지시문도 여기 둔다 — 조건값(마찰 · 중력 · 차단 파장)은 문장에도 없다 (P8).
 */

import type { TrialGame } from '../../../src/world/mp/protocol';
import { ColorhuntEngine } from '../trial/colorhunt/engine';
import type { GameEngine } from '../trial/engine';
import { FallEngine } from '../trial/fall/engine';
import { PlatformEngine } from '../trial/platform/engine';
import { StoplineEngine } from '../trial/stopline-engine';

export const ENGINES: Partial<Record<TrialGame, () => GameEngine>> = {
  stopline: () => new StoplineEngine(),
  fall: () => new FallEngine(),
  colorhunt: () => new ColorhuntEngine(),
  platform: () => new PlatformEngine(),
  // disc(회전 원판)는 /trial 에만 있다 — 검문소 홀(HallScene)에 원판이 서면 여기 넣는다
};

export const INSTRUCTION: Record<TrialGame, string> = {
  stopline: 'W 로 달리고 S 로 멈춘다. 붉은 정지선에 정확히 서라. 3회.',
  fall: '머리 위에서 떨어지는 것을 피하라. WASD 로 움직인다. 중력은 매번 다르다.',
  colorhunt: '지시된 색의 구슬만 주워라. E 로 줍는다. 빛은 도중에 바뀐다.',
  platform: '움직이는 발판을 점프로 건너라. W 로 나아가고 Space 로 뛴다. 발판 한가운데에 내려라.',
  disc: '도는 원판 위에서 버텨라. WASD 로 걷고 Shift 로 달린다. 밖으로 밀려나면 떨어진다.',
};

export function availableGames(): TrialGame[] {
  return (Object.keys(ENGINES) as TrialGame[]).filter((g) => ENGINES[g]);
}
