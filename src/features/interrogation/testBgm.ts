/**
 * 미니 게임 배경음악 — 시험(phase 'test')마다 세 곡 중 하나를 **뽑되, 한 번 튼 곡은 다시 안 튼다.**
 *
 * 2026-09-06 사용자: "미니 게임할 땐 … 브금 세 개가 랜덤으로 잡히고 한 번 실행한 곡은 다시 재생되지 않게.
 * 미니게임 끝나면 해당 브금 없애고 원래 검문소 브금으로 다시".
 *
 * 한 판의 시험은 셋(game-protocol 의 GAME_TEST_COUNT)이고 곡도 셋이라, 한 판 안에서는 세 곡이 저마다 한 번씩
 * 다른 순서로 난다. 다 쓰고도 시험이 더 오면(다음 판을 같은 화면에서 이어 갈 때) 판을 새로 섞는다 —
 * 곡이 떨어졌다고 조용해지는 것보다 낫다.
 *
 * 세 파일은 사용자가 준 wav 를 AAC 로 굽고 **-18 LUFS 로 맞췄다** — 검문소 곡(checkpoint-bgm)과 같은 크기라
 * 시험으로 넘어갈 때 소리가 갑자기 커지지 않는다 (2026-09-05 "소리 너무 크게 하지 말고").
 *
 * 순수 함수다 — 화면(InterrogationFeature)은 `played` 를 ref 로 들고 시험이 시작될 때 한 번 부른다.
 */

/** 검문소 본곡 — 시험이 아닐 때 흐른다 (Silent Clearance) */
export const CHECKPOINT_BGM = '/audio/checkpoint-bgm.m4a';

/** 시험 곡 셋 — Last Bell Run · Last Trial · Last Minute Arena */
export const TEST_BGMS: readonly string[] = [
  '/audio/test-last-bell-run.m4a',
  '/audio/test-last-trial.m4a',
  '/audio/test-last-minute-arena.m4a',
];

/**
 * 아직 안 튼 곡 중 하나를 뽑아 `played` 에 적고 돌려준다. 다 썼으면 `played` 를 비우고 다시 셋 중에서 뽑는다.
 * @param rand [0,1) — 시험은 고정값을 준다
 */
export function pickTestBgm(played: Set<string>, rand: () => number = Math.random): string {
  let left = TEST_BGMS.filter((s) => !played.has(s));
  if (left.length === 0) {
    played.clear();
    left = [...TEST_BGMS];
  }
  const pick = left[Math.min(left.length - 1, Math.floor(rand() * left.length))];
  played.add(pick);
  return pick;
}
