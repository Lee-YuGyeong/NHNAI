/**
 * 채팅창을 언제 닫는가 — 규칙만 떼어 놓은 자리.
 *
 * 여기가 틀리면 **몸이 영영 안 움직인다.** 말하는 동안은 조작이 막히는데(WorldScene 의 active),
 * 닫는 길이 막히면 그 상태에서 못 빠져나온다 — 화면에는 아무 표시도 없어서 사용자는
 * 게임이 멈춘 줄 안다. 실제로 그렇게 갇혔다.
 */

/**
 * 브라우저가 포인터 잠금을 풀었으니 채팅도 무를 자리인가.
 *
 * Esc 는 두 가지를 한꺼번에 한다 — 입력창을 닫고, **포인터 잠금도 푼다.** 뒤엣것은 브라우저가
 * 하는 일이라 막을 수 없다. 그래서 잠금이 풀린 것을 보고 말하던 것도 같이 무른다.
 *
 * **변화**를 본다(wasLocked && !locked). 지금 안 잠겨 있다는 것만으로 닫으면, 잠긴 적 없이
 * 연 채팅이 열리자마자 닫힌다 — 시행을 안 잡고도 말은 걸 수 있어야 한다.
 */
export function unlockClosesChat(wasLocked: boolean, locked: boolean, composing: boolean): boolean {
  return composing && wasLocked && !locked;
}
