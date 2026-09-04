/**
 * 선택 판 — **문 앞에서 내가 고른다** (2026-09-01 사용자: "문에 다가가면 「문을 연다 / 열지 않는다」로
 * 선택권을 주고, 열어서 들어가는 걸로"). 지금 쓰는 자리는 복도 끝 격납문 하나다 (chapter1.state.choice).
 *
 * 화면 아래 가운데, 대화창 위. 고르는 법은 둘 다 열어 둔다:
 *   - 데스크톱은 포인터가 잠겨 있어 클릭이 DOM 에 닿지 않는다 → **E / Q** (자판 배열과 무관하게 e.code)
 *   - 폰(조이스틱)은 잠금이 없다 → 단추를 그냥 누른다
 *
 * 이 판이 떠 있는 동안에도 걷기는 그대로다 — 등을 돌려 걸어 나가면 화면이 거리를 재서 물음을 거둔다 (Chapter1Scene).
 * 저장소를 읽고 두 손잡이(openDoor·refuseDoor)만 당긴다.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { chapter1 } from './chapter1';
import './hud.css';

export function ChoiceHud() {
  const choice = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().choice, () => null);

  // E 예 · Q 아니오. 입력줄에 쓰는 중이면(Enter 로 연 채팅) 건드리지 않는다
  useEffect(() => {
    if (!choice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        chapter1.openDoor();
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        chapter1.refuseDoor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice]);

  if (!choice) return null;
  return (
    <div className="choice">
      <div className="choice__title">{choice.title}</div>
      <div className="choice__hint">{choice.hint}</div>
      <div className="choice__opts">
        <button type="button" className="choice__opt choice__opt--yes" onClick={() => chapter1.openDoor()}>
          <i className="choice__k">E</i>
          {choice.yes}
        </button>
        <button type="button" className="choice__opt" onClick={() => chapter1.refuseDoor()}>
          <i className="choice__k">Q</i>
          {choice.no}
        </button>
      </div>
    </div>
  );
}
