/**
 * 이야기의 입구 — 「게임 시작 테스트」 한 번으로 **복도 → 중앙 시설 → 재검실 → 심문소**가 끊기지 않고 이어진다.
 *
 * 그 사이의 길은 이미 이야기 쪽이 쥐고 있다:
 *   복도(/world) chapter1 → 열린 격납문 → /central → chapter1 락다운 → chapter2 검문·줄 → 검증실 문 → /recheck
 *   → chapter3 재검(대본 없는 문답) → 재검실 문 → /interrogation
 * 여기서 하는 일은 **첫 문을 폼 없이 여는 것**뿐이다 — 방 번호는 뽑고, 닉네임은 저장된 게스트 이름을 쓴다.
 *
 * ★ 주소를 미리 만들어 <Link href> 로 거는 이유: 포인터 잠금은 클릭 제스처 안에서만 잡힌다
 *   (WorldFeature 머리말). 중간에 화면을 하나 더 거치면 그 제스처가 만료된다.
 */
import { loadGuestNick, randomRoomCode, saveGuestNick } from './guest';

/** 이야기용 이름 — 저장된 게스트 닉네임이 있으면 그대로, 없으면 하나 지어 남긴다 (로비의 예시와 같은 꼴) */
export function storyNick(): string {
  const saved = loadGuestNick().trim();
  if (saved) return saved;
  const nick = `요원-${randomRoomCode()}`;
  saveGuestNick(nick);
  return nick;
}

/** 복도 자동 입장 주소 (/world?code=…&nick=…) — 방마다 새 번호라 이야기는 늘 처음부터 돈다 */
export function storyStartHref(): string {
  return `/world?code=${randomRoomCode()}&nick=${encodeURIComponent(storyNick())}`;
}
