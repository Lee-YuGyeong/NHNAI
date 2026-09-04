/**
 * 대화창이 새 말을 따라갈지 — 규칙만 떼어 놓은 자리.
 *
 * 판이 도는 동안 방의 대화는 계속 쌓인다. 창은 그걸 따라 바닥에 붙어 있어야 하지만,
 * **지난 말을 읽으려고 올려 둔 사람은 끌어내리면 안 된다** — 읽던 자리를 잃는다.
 * 그 둘을 가르는 것이 이 규칙 하나다. ArenaFeature 안에서는 시험할 수가 없어(3D 캔버스)
 * 여기 떼어 둔다 — 창을 굴러가게 만들면서 이미 한 번 어긋났던 자리다.
 */

/** 바닥에서 이만큼(px) 안이면 따라붙는 것으로 친다 */
export const STICK_EDGE = 24;

/**
 * 지금 이 스크롤 위치가 "바닥에 붙어 있다" 인가.
 *
 * 딱 맞아떨어질 때만 참으로 보면 안 된다 — 줄 높이가 소수라 바닥에 닿아도 1~2px 이 남고,
 * 그러면 창이 영영 안 따라간다. 손가락 하나 폭만큼은 봐준다.
 *
 * @param scrollHeight 내용 전체 높이
 * @param scrollTop    지금 위에서 얼마나 내려왔나
 * @param clientHeight 보이는 높이
 */
export function followsBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight < STICK_EDGE;
}
