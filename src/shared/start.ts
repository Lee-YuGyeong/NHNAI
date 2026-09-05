/**
 * 게임의 입구 — 「게임 시작」 한 번으로 **검문소(/interrogation)** 가 곧장 열린다.
 *
 * ┌─ 2026-09-05: 앞의 세 방을 건너뛴다 ──────────────────────────────────────┐
 * │ 사용자: "게임 시작하기 누르면 /interrogation 여기로 바로 가야해.          │
 * │ 중간에 다 필요없어 이제".                                                 │
 * │                                                                          │
 * │ 그전까지 이 함수가 연 첫 문은 **복도**였고, 판까지는 걸어서 갔다:         │
 * │   복도(/world) → 중앙 시설(/central) → 재검실(/recheck) → 검문소          │
 * │ 그 길은 라우트도 코드도 이야기도 **그대로 살아 있다** — 루트 목록에서     │
 * │ 여전히 하나씩 열린다. 끊은 것은 길이 아니라 **이 입구가 그리로 걸린 것**  │
 * │ 하나뿐이다. 되돌릴 곳도 아래 한 줄이다.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 여기서 하는 일은 **첫 문을 폼 없이 여는 것**뿐이다 — 방 번호는 뽑고, 닉네임은 저장된 게스트 이름을 쓴다.
 *
 * ★ 주소를 미리 만들어 <Link href> 로 거는 것은 그대로 둔다 — 중간에 화면을 하나 더 거치지 않는
 *   편이 여전히 맞다 (누른 그 순간에 판이 열린다).
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

/** 검문소 자동 입장 주소 (/interrogation?code=…&nick=…) — 방마다 새 번호라 판은 늘 처음부터 돈다 */
export function storyStartHref(): string {
  return `/interrogation?code=${randomRoomCode()}&nick=${encodeURIComponent(storyNick())}`;
}
