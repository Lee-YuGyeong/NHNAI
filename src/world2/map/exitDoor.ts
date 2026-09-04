/**
 * 나가는 문의 상태 — **열렸나** 하나뿐이다.
 *
 * 방 다섯(복도 · 휴게 · 작업 · 기록 · 창)의 나가는 문은 한때 문짝 없는 구멍이었다 (2026-09-03 사용자: 「맵에 문이 없는 곳이 은근 있어」).
 * 「다음 주기까지 문이 안 열린다」가 목표에 적혀 있는데 화면에는 열린 문간뿐이라 말과 그림이 어긋났다.
 * 이제 방마다 문짝이 서고, 이 저장소가 그 문짝을 올리고 내린다.
 *
 * 값은 이야기(features/world2/scenario2.ts)가 매 프레임 적는다 — 나갈 수 있고(canLeave) 문 앞(WAKE_M)이면 열림.
 * 방(world2/map/*.tsx)은 읽기만 한다: 문짝(SlidingLeaf)이 프레임마다 isOpen() 을 보고 오르내린다.
 * 중앙 시설은 제 문 넷을 제 저장소(features/world2/central2)로 움직이므로 여기를 안 쓴다.
 *
 * 방은 한 번에 하나만 마운트되므로(WorldScene key={room}) 값도 하나다 — 방을 바꿀 때 reset() 으로 닫는다.
 */

/** 이 거리 안에 들면 잠기지 않은 문이 열리기 시작한다 — 문 앞(EXIT_REACH 1.6~2.2)에 닿기 전에 열리는 것이 보이게 */
export const EXIT_DOOR_WAKE_M = 7;

let open = false;

export const exitDoor = {
  set(v: boolean) {
    open = v;
  },
  isOpen(): boolean {
    return open;
  },
  reset() {
    open = false;
  },
};
