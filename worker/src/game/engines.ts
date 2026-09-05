/**
 * 판이 열 수 있는 물리 테스트 — worker/src/trial 의 엔진(GameEngine 계약)을 그대로 조립한다.
 * 여섯 종이 다 꽂혀 있지만 한 판이 실제로 여는 셋은 판이 열릴 때 후보(game-protocol 의 GAME_TEST_POOL)에서 뽑는다 —
 * 낙하 생존 · 움직이는 플랫폼 · 회전 원판 · 무게 중심 다리 가운데 셋. 정지선과 색 사냥은 후보에 넣으면 그 자리에서 다시 선다.
 *
 * 화면 위 한 줄 지시문도 여기 둔다 — 조건값(마찰 · 중력 · 차단 파장)은 문장에도 없다 (P8).
 */

import type { TrialGame } from '../../../src/world/mp/protocol';
import { BarEngine } from '../trial/bar/engine';
import { ColorhuntEngine } from '../trial/colorhunt/engine';
import { DiscEngine } from '../trial/disc/engine';
import type { GameEngine } from '../trial/engine';
import { FallEngine } from '../trial/fall/engine';
import { PlatformEngine } from '../trial/platform/engine';
import { SeesawEngine } from '../trial/seesaw/engine';
import { StoplineEngine } from '../trial/stopline-engine';

export const ENGINES: Partial<Record<TrialGame, () => GameEngine>> = {
  stopline: () => new StoplineEngine(),
  fall: () => new FallEngine(),
  colorhunt: () => new ColorhuntEngine(),
  platform: () => new PlatformEngine(),
  // 회전 원판 — 홀 가운데 마당(DISC_CENTER)에 원판이 서고, 자리는 서버가 적분한다 (HallScene 의 DiscStage · DiscRig)
  disc: () => new DiscEngine(),
  // 무게 중심 다리 — 마당에 판자(SEESAW_CENTER)가 서고, 자리는 서버가 적분한다 (HallScene 의 SeesawStage · SeesawRig, 2026-09-05)
  seesaw: () => new SeesawEngine(),
  // 무너지는 타워(worker/src/trial/tower)는 **꽂지 않는다** — 검문소 홀(HallScene)에 그 무대가 아직 없다. /trial 에서만 열린다.
  // 차례표 후보에 넣으려면 HallScene 에 TowerStage · TowerRig 를 세우고 InterrogationFeature 가 trial_tower 를 받게 한 뒤 여기 한 줄 + GAME_TEST_POOL
  // 회전 봉 넘기 — 마당에 무대(BAR_CENTER)가 서고, 자리도 점프도 서버가 적분한다. 검문소 후보(GAME_TEST_POOL)에는 아직 없다
  bar: () => new BarEngine(),
};

export const INSTRUCTION: Record<TrialGame, string> = {
  stopline: 'W 로 달리고 S 로 멈춘다. 붉은 정지선에 정확히 서라. 3회.',
  fall: '머리 위에서 떨어지는 것을 피하라. WASD 로 움직이고 Space 로 뛴다.',
  colorhunt: '지시된 색의 구슬만 주워라. E 로 줍는다. 빛은 도중에 바뀐다.',
  platform: '움직이는 발판을 점프로 건너라. W 로 나아가고 Space 로 뛴다. 발판 한가운데에 내려라. 떨어지면 출발로 돌아간다. 30초.',
  disc: '도는 원판 위에서 버텨라. WASD 로 걷고 Shift 로 달린다. 밖으로 밀려나면 떨어진다.',
  seesaw: '축 하나로 선 판자 위에서 무리의 무게중심을 축에 맞춰라. 상자가 떨어지면 반대쪽으로 옮겨 가라. 기울면 미끄러지고, 끝을 넘으면 떨어진다.',
  tower: '탑 위 발판에서 버텨라. 무게가 몰린 발판은 기울어 무너지고, 바깥 발판은 차례로 철거된다. Space 로 뛰고 E 로 남을 밀 수 있다. 떨어지지 마라.',
  bar: '기둥에서 나온 봉이 바닥을 쓸며 돈다. 봉이 오면 Space 로 뛰어넘어라. 맞으면 넘어져 밀려나고, 가장자리 밖은 낙하다.',
};

export function availableGames(): TrialGame[] {
  return (Object.keys(ENGINES) as TrialGame[]).filter((g) => ENGINES[g]);
}
