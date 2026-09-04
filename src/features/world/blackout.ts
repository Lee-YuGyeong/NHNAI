/**
 * 무대를 넘는 암전 — 챕터 셋이 각자 세우는 그 값 하나로 읽는 자리.
 *
 * 문턱은 셋이고(복도 → 중앙 시설 → 재검실 → 인지 검증실) 저장소도 셋인데, 암전을 보고
 * 뭔가 해야 하는 쪽(지금은 배경음악)에게는 **어느 챕터인지가 중요하지 않다.** 「지금 장이
 * 닫히는 중인가」 하나면 된다. 그래서 셋을 한 값으로 접는다.
 *
 * 그리는 것은 여전히 NoticeHud 다 — 거기는 어느 챕터냐에 따라 암전 길이가 달라서 셋을 따로 본다.
 */

import { useSyncExternalStore } from 'react';

import { chapter1 } from './chapter1';
import { chapter2 } from './chapter2';
import { chapter3 } from './chapter3';

function subscribe(fn: () => void): () => void {
  const offs = [chapter1.subscribe(fn), chapter2.subscribe(fn), chapter3.subscribe(fn)];
  return () => {
    for (const off of offs) off();
  };
}

/** 셋 중 가장 짙은 것 — 한 번에 하나만 오르므로 사실상 그 하나다 */
function snapshot(): number {
  return Math.max(chapter1.get().blackout, chapter2.get().blackout, chapter3.get().blackout);
}

/** 지금 장이 닫히는 암전이 올라 있나 (0~1). 서버 렌더에는 암전이 없다 */
export function useBlackout(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
