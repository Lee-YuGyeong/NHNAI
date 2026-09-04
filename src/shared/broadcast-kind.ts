/**
 * 방송의 종류 — **아무것도 import 하지 않는 파일이다. 여기에 import 를 추가하지 않는다.**
 *
 * 왜 따로 있나: 이 타입을 양쪽이 같이 쓴다.
 *   브라우저  shared/broadcast.ts  → tts feature · 방송을 보내는 화면들
 *   워커      world/mp/protocol.ts → room-do (와이어 계약)
 *
 * 그런데 두 파일 다 원본을 맡을 수 없다. `shared/broadcast.ts` 는 @reduxjs/toolkit 을
 * 끌어오므로 워커 타입 세계로 못 가고, `world/mp/protocol.ts` 는 워커가 읽는 파일이라
 * 무엇도 끌어오면 안 되는 데다 — 거기에 원본을 두면 **서버에 붙지도 않는 화면(/rules)까지
 * 멀티플레이 프로토콜에 묶인다.**
 *
 * 그래서 의존성 0인 파일 하나를 둔다. 양쪽이 여기서 가져가고, 정의는 한 곳에만 있다.
 *
 * - 'announce' 일반 방송 — 온 순서대로 읽는다
 * - 'readout'  판독 발표 — 대기 순서는 announce 와 같다 (자막·연출을 다르게 쓸 자리)
 * - 'alarm'    긴급 경보 — 재생 중이던 방송을 끊고 맨 앞에 선다 (폐기·위반 경보용)
 */
export type BroadcastKind = 'announce' | 'readout' | 'alarm';

/**
 * 와이어에서 받아들이는 값 전부. 타입과 목록을 여기서 같이 내는 이유는
 * 종류를 하나 더 만들 때 검증 화이트리스트만 낡는 일을 막으려는 것이다.
 */
export const BROADCAST_KINDS: readonly BroadcastKind[] = ['announce', 'readout', 'alarm'];
