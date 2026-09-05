/**
 * 전체화면 — **화면 전체에 한 번만 단다** (App.tsx). 화면마다 손잡이를 두지 않는다.
 *
 * 2026-09-05 사용자: "브라우저 풀스크린 적용 … 대화를 하거나 클릭을 한다 했을 때 풀리면 안 돼".
 *
 * ┌─ 브라우저의 규칙 둘, 그 사이에서 하는 일 ─────────────────────────────────┐
 * │ 1. 전체화면은 **사람이 누른 직후**에만 들어갈 수 있다. 열자마자 청하면      │
 * │    거절이다. 그래서 여기서는 document 한 곳에서 첫 손길(누름 · 자판)을 듣고 │
 * │    그 손길 위에서 청한다. 어느 화면에서 왔든, 무엇을 눌렀든 상관없다.       │
 * │ 2. 전체화면은 언제든 **풀릴 수 있다** — Esc, 다른 창으로 나감, 로그인하러   │
 * │    구글로 떠났다 돌아옴(supabase), 아레나의 「다시하기」(location.reload).  │
 * │    막을 수 없는 것은 막지 않는다. 대신 **풀린 뒤의 첫 손길에 도로 들어간다**│
 * │    — 이 배선은 한 번 쓰고 버리는 게 아니라 계속 듣고 있다.                 │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 들어간 뒤에는 Esc 를 **잠근다** (navigator.keyboard.lock). 크롬은 잠긴 Esc 를
 *   「꾹 누르고 있어야」 전체화면을 벗긴다 — 채팅 칸을 닫으려고, 메모장을 접으려고
 *   톡 친 Esc 한 번에 화면이 쪼그라드는 일이 없다. 안 되는 브라우저에서는 그냥 넘어간다
 *   (거기서는 규칙 2 가 받는다 — 풀리면 다음 손길에 도로 들어간다).
 *
 * ★ 우리가 들어간 것은 문서 뿌리(documentElement)다 — 특정 화면 조각이 아니라서 라우트가
 *   바뀌어도(SPA) 풀리지 않는다. 오프닝 영상(shared/OpeningVideo)은 자기 칸을 따로 전체화면으로
 *   올리는데, 이미 문서가 전체화면이면 그 일을 건너뛰고, 나갈 때도 **자기가 올린 것만** 벗긴다.
 *
 * 끄는 손잡이: 개발 중에 창 크기를 재거나 개발자 도구를 옆에 붙이려면 전체화면이 방해다.
 * 콘솔에서 `localStorage.fullscreen = 'off'` 를 적어 두면 이 배선이 조용해진다 (지우면 도로 켜짐).
 * 화면 위에 스위치를 두지 않는 이유: 게임을 하는 사람이 우연히 눌러 풀리면 안 되는 것이 요구다.
 *
 * jsdom 에는 requestFullscreen 이 없다 — 있는지 먼저 본다. 없으면 이 부품은 아무 일도 하지 않는다.
 */

import { useEffect } from 'react';

/** localStorage 열쇠. 값이 'off' 면 전체화면을 청하지 않는다 */
export const FULLSCREEN_OFF_KEY = 'fullscreen';

export function fullscreenOff(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_OFF_KEY) === 'off';
  } catch {
    return false;
  }
}

/** Keyboard Lock API — lib.dom 에 아직 없다 (크롬만 있는 문). 없으면 undefined 다 */
type KeyboardLock = { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void };
const keyboard = (): KeyboardLock | undefined => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/** Esc 를 잠근다 — 전체화면 안에서만 뜻이 있다. 못 하는 판에서는 조용히 넘어간다 */
function lockEsc() {
  try {
    void keyboard()?.lock?.(['Escape'])?.catch(() => {});
  } catch {
    /* 이 브라우저에는 잠글 자물쇠가 없다 */
  }
}

function unlockEsc() {
  try {
    keyboard()?.unlock?.();
  } catch {
    /* 없던 자물쇠는 풀 것도 없다 */
  }
}

export function Fullscreen() {
  useEffect(() => {
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== 'function') return; // 이 판에는 전체화면이 없다 (jsdom · 옛 브라우저)
    if (fullscreenOff()) return;

    /** 청해 놓고 답을 기다리는 중 — 누름(pointerdown)과 뗌(pointerup)이 잇따라 두 번 청하지 않게 */
    let pending = false;

    const enter = () => {
      if (pending || document.fullscreenElement) return;
      pending = true;
      let asked: Promise<void> | undefined;
      try {
        asked = root.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        /* 동기로 던지는 구현도 있다 — 거절은 규칙이다 */
      }
      Promise.resolve(asked)
        .then(lockEsc)
        .catch(() => {
          /* 사람이 누른 직후가 아니었다 — 고장이 아니다. 다음 손길에 또 청한다 */
        })
        .finally(() => {
          pending = false;
        });
    };

    /*
     * 어떤 손길이 「사람이 눌렀다」로 치는가는 브라우저가 정한다:
     *   마우스는 pointerdown 에서, 손가락·펜은 pointerup 에서, 자판은 keydown 에서 (Esc 는 아니다).
     * 셋을 다 듣고 그중 통하는 것 위에서 들어간다. 캡처 단계다 — 화면이 stopPropagation 을 해도 듣는다.
     */
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 오른쪽 버튼 · 가운데 버튼은 누른 것이 아니다
      if (e.pointerType && e.pointerType !== 'mouse') return; // 손가락은 뗄 때(pointerup) 받는다
      enter();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // 마우스는 누를 때 이미 받았다
      enter();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.key === 'Escape') return;
      enter();
    };
    /** 풀리면 자물쇠도 푼다 — 다음에 들어갈 때 다시 잠근다 */
    const onChange = () => {
      if (!document.fullscreenElement) unlockEsc();
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  return null;
}
