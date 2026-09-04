/**
 * 폐기된 나 — **바닥으로 무너지는 카메라.** (캔버스 안)
 *
 * 이 방에서 내 몸은 카메라 하나다. 개체들은 선고를 받으면 무대로 걸어가 링 조명 아래에서
 * 소멸하지만(ArenaFeature 의 condemned), 나에게는 걸어갈 몸이 없어서 **내가 죽는 장면만
 * 화면에 아무것도 없었다** — 리더가 쏘고, 붉은 점멸이 한 번 지나가고, 그게 전부였다.
 * 눈높이를 바닥까지 내리고 고개를 옆으로 누인다. 쓰러진 자세는 그 뒤로 그대로다.
 *
 * /world 의 Downed 와 같은 연출이고 같은 방식이다 — 다만 그쪽은 체력 보관소(world/mp/health)를
 * 읽고, 여기는 폐기 시각 하나만 받는다. 이 방에는 체력이라는 것이 없다: 죽는 길은
 * 의심도 100 하나뿐이라 "언제 죽었나" 만 있으면 된다.
 *
 * 카메라를 놓는 것은 씬의 LocalRig 이고(arena3d/scene/WorldScene) 이 컴포넌트는 children 이라
 * **그 뒤에 돈다** — 그 위에 얹는다. 지난 프레임에 얹은 회전은 이번 프레임에 되돌린다
 * (그 사이 PointerLockControls 가 돌린 값은 남긴다 — 누운 채로 둘러보는 것까지 막지는 않는다).
 * 자리(position)는 LocalRig 이 매 프레임 다시 놓으므로 되돌릴 것이 없다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

/** 씬이 쓰는 눈높이. 배럴(@/arena3d)이 아니라 보관소를 직접 여는 것은 separate.ts 와 같은 이유다 */
import { EYE_HEIGHT } from '@/arena3d/mp/constants';

/** 쓰러지는 데 걸리는 시간(초) — /world 의 Downed(1.1)보다 조금 느리다. 총에 맞아 꺾이는 것이 아니라 꺼지는 몸이다 */
const FALL_S = 1.3;
/** 누운 눈높이(m) · 기운 각(rad) — 셋 다 Downed 와 같은 값이다. 같은 세계면 쓰러지는 그림도 같아야 한다 */
const FLOOR_EYE = 0.32;
const FALL_ROLL = 0.62;
const FALL_PITCH = -0.18;

/**
 * @param at 무너지기 시작하는 시각(performance.now). 0 이면 나는 아직 서 있다.
 *
 * **앞선 시각이 올 수 있다** — 선고와 한 발 사이에는 리더가 겨누는 틈이 있고(ArenaFeature 의
 * PURGE_AIM_MS), 무너지는 것은 맞은 뒤다. 그때까지는 아직 서 있는 것이므로 아래에서 0 으로 막는다.
 */
export function Collapse({ at }: { at: number }) {
  const camera = useThree((s) => s.camera);
  /** 지난 프레임에 얹은 [pitch, roll] */
  const cue = useRef<[number, number]>([0, 0]);

  useFrame(() => {
    camera.rotation.x -= cue.current[0];
    camera.rotation.z -= cue.current[1];
    cue.current = [0, 0];
    if (!at) return;
    const now = performance.now();
    // 처음 FALL_S 초 동안 부드럽게 눕고, 그 뒤엔 숨 쉬듯 아주 조금만 움직인다 (멎은 화면으로 보이지 않게)
    const t = Math.max(0, Math.min(1, (now - at) / (FALL_S * 1000)));
    const k = 1 - (1 - t) ** 3;
    const breathe = t >= 1 ? Math.sin(now / 900) * 0.006 : 0;
    camera.position.y -= (EYE_HEIGHT - FLOOR_EYE) * k;
    cue.current = [FALL_PITCH * k + breathe, FALL_ROLL * k];
    camera.rotation.x += cue.current[0];
    camera.rotation.z += cue.current[1];
  });
  return null;
}
