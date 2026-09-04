/**
 * 머리 위 말풍선 — **내가 걸어서 저쪽이 답할 때** 그 개체의 머리 위에 뜨는 한 마디 (2026-09-03 사용자: 「내가 대화를 걸어서 상대방이
 * 말할 때는 대화창 UI 가 아니라 말풍선」). 본판 다인 판의 채팅 말풍선(WorldScene RemoteAvatar 의 bubbleText·bubbleUntil)과 같은 물건이다.
 *
 * 값은 셋뿐이다 — 누가 · 무엇을 · 언제까지. Unit.tsx 가 제 id 의 것을 그린다. 저쪽이 먼저 걸어와 하는 말(address)과 대본은
 * 여전히 대화창 상자다 — 말풍선은 **답**에만 쓴다 (scenario2.play 의 inReply).
 */

interface Bubble {
  text: string;
  until: number;
}

const bubbles = new Map<string, Bubble>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

export const bubble = {
  /** 이 개체의 머리 위에 text 를 ms 동안 */
  show(id: string, text: string, ms: number, now = performance.now()): void {
    bubbles.set(id, { text, until: now + ms });
    notify();
  },
  /** 지금 떠 있는 것 — 없거나 지났으면 null */
  get(id: string, now = performance.now()): Bubble | null {
    const b = bubbles.get(id);
    return b && b.until > now ? b : null;
  },
  clear(): void {
    if (!bubbles.size) return;
    bubbles.clear();
    notify();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 바뀔 때마다 오르는 수 — useSyncExternalStore 의 스냅샷 */
  version(): number {
    return version;
  },
};
