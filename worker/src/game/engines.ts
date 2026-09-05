/**
 * 판이 열 수 있는 물리 테스트 — worker/src/trial 의 엔진(GameEngine 계약)을 그대로 조립한다.
 * 다섯 종이 다 꽂혀 있지만 한 판이 실제로 여는 셋은 차례표(game-protocol 의 GAME_TEST_ORDER)가 정한다 —
 * 낙하 생존 · 움직이는 플랫폼 · 회전 원판. 정지선과 색 사냥은 차례표를 바꾸면 그 자리에서 다시 선다.
 *
 * 화면 위 한 줄 지시문도 여기 둔다 — 조건값(마찰 · 중력 · 차단 파장)은 문장에도 없다 (P8).
 */

import type { TrialGame } from '../../../src/world/mp/protocol';
import { ColorhuntEngine } from '../trial/colorhunt/engine';
import { DiscEngine } from '../trial/disc/engine';
import type { GameEngine } from '../trial/engine';
import { FallEngine } from '../trial/fall/engine';
import { PlatformEngine } from '../trial/platform/engine';
import { StoplineEngine } from '../trial/stopline-engine';

export const ENGINES: Partial<Record<TrialGame, () => GameEngine>> = {
  stopline: () => new StoplineEngine(),
  fall: () => new FallEngine(),
  colorhunt: () => new ColorhuntEngine(),
  platform: () => new PlatformEngine(),
  // 회전 원판 — 홀 가운데 마당(DISC_CENTER)에 원판이 서고, 자리는 서버가 적분한다 (HallScene 의 DiscStage · DiscRig)
  disc: () => new DiscEngine(),
};

export const INSTRUCTION: Record<TrialGame, string> = {
  stopline: 'W 로 달리고 S 로 멈춘다. 붉은 정지선에 정확히 서라. 3회.',
  fall: '머리 위에서 떨어지는 것을 피하라. WASD 로 움직이고 Space 로 뛴다.',
  colorhunt: '지시된 색의 구슬만 주워라. E 로 줍는다. 빛은 도중에 바뀐다.',
  platform: '움직이는 발판을 점프로 건너라. W 로 나아가고 Space 로 뛴다. 발판 한가운데에 내려라. 떨어지면 출발로 돌아간다. 30초.',
  disc: '도는 원판 위에서 버텨라. WASD 로 걷고 Shift 로 달린다. 밖으로 밀려나면 떨어진다.',
};

export function availableGames(): TrialGame[] {
  return (Object.keys(ENGINES) as TrialGame[]).filter((g) => ENGINES[g]);
}
