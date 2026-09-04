/**
 * 누르는 소리를 다는 곳 — **화면 전체에 한 번만 단다** (App.tsx).
 *
 * 버튼마다 onClick 에 소리를 붙이지 않는 이유는 shared/sfx.ts 머리말에 있다: 붙이는 걸
 * 잊은 버튼만 조용해지고, 그 한 개가 화면 전체를 고장 난 것처럼 만든다. 그래서 여기서
 * document 한 곳으로 듣고, 눌린 것이 버튼인지 sfx.ts 가 판단한다.
 *
 * ┌─ 언제 듣나 ──────────────────────────────────────────────────────────────┐
 * │ pointerdown  손가락이 닿는 순간. click 을 기다리면 반 박자 늦다 —        │
 * │              게임의 버튼은 누르는 순간 소리가 나야 눌린 것으로 느낀다.    │
 * │ keydown      Enter · Space. 키보드로 누른 버튼도 같은 소리가 나야 한다    │
 * │              (click 은 안 듣는다 — 들으면 마우스에서 두 번 난다).         │
 * │ pointerover  마우스일 때만, 버튼이 바뀔 때만. 손가락·펜은 훑지 않는다.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 캡처 단계에서 듣는다 — 화면이 stopPropagation 을 하든 말든 소리는 나야 한다.
 */

import { useEffect } from 'react';
import { playSfx, pressable, sfxFor } from './sfx';

export function UiSfx() {
  useEffect(() => {
    /** 마우스가 지금 얹혀 있는 버튼. 버튼 안에서 아이콘↔글자로 옮겨 다닐 때 또 울리지 않게 */
    let over: Element | null = null;

    const press = (e: Event) => {
      const name = sfxFor(e.target, 'press');
      if (name) playSfx(name);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 오른쪽 버튼 · 가운데 버튼은 누른 것이 아니다
      press(e);
    };

    const onKey = (e: KeyboardEvent) => {
      // 누르고 있는 동안 반복해서 들어오는 것은 한 번의 누름이다
      if (e.repeat) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      press(e);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const el = pressable(e.target);
      if (el === over) return;
      over = el;
      if (!el) return;
      const name = sfxFor(e.target, 'hover');
      if (name) playSfx(name);
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerover', onOver, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerover', onOver, true);
    };
  }, []);

  return null;
}
