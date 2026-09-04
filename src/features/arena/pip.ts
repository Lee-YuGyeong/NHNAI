/**
 * 대화창의 색점 하나가 무슨 색인가 — 규칙만 떼어 놓은 자리.
 *
 * 통신 패널(2026-09-02 사용자: 후보 05)은 이름 앞에 색점을 하나 찍는다. 그 색이 **개체 머리 위
 * 이름표와 같아야** 값이 있다 — 로그에서 익힌 색이 방을 볼 때 그 몸에 붙어 있어야 번호를 안 읽고도
 * "저놈이 아까 그 말 한 놈"이 된다. 어긋나면 색점은 그냥 장식이고, 사람은 그걸 **틀린 줄도 모른다.**
 *
 * 그래서 이름표가 쓰는 것과 **같은 함수**(seatColor)로 뽑는다. 3D 쪽 길은 이렇다:
 *   ArenaFeature 가 remotePlayers.add({ seat: i }) 로 자리를 주고 (i = aiNames 의 순번)
 *   → arena3d/scene/WorldScene 이 seatColor(player.seat) 로 이름표 글자색을 칠한다.
 * 여기서는 그 순번을 이름으로 되찾아 같은 색을 얻는다. 3D 캔버스 안에서는 시험할 수가 없어 떼어 둔다.
 *
 * 색은 두 곳에서만 예외다 — 나와 리더. 까닭은 각 상수에 적어 둔다.
 */

import { seatColor } from '@/arena3d/mp/validate';

/**
 * 내 말의 색점. 내 몸에는 이름표가 없으므로(1인칭이라 내 머리 위를 못 본다) 맞출 상대가 없다.
 * 대신 이 화면이 "나"에 쓰는 청록을 그대로 쓴다 — 입력창 초점·내 이름(b.mine)과 같은 색이다.
 */
export const ME_PIP = '#6fd3ff';

/**
 * 명부에 없는 이름의 색점 — 폐기돼 명부에서 빠진 뒤에도 지난 말은 로그에 남는다.
 * 리더도 여기로 떨어지지만 **화면은 리더에게 이걸 안 쓴다**: 리더 줄은 결(tone) 색으로 통째로
 * 물들이므로(CSS 의 --bc) 색점도 그 색을 덮어쓴다. 즉 이 회색은 "누구인지 모르겠다"는 뜻이다.
 */
export const UNKNOWN_PIP = '#7d8fa5';

/**
 * 이 이름의 색점 색.
 *
 * @param id      말한 개체의 이름 (A62-014 꼴)
 * @param me      내 이름
 * @param aiNames 개체 명부 — **순번이 곧 3D 의 자리 번호다.** 순서가 바뀌면 색이 통째로 밀린다.
 */
export function pipColor(id: string, me: string, aiNames: readonly string[]): string {
  if (id === me) return ME_PIP;
  const seat = aiNames.indexOf(id);
  return seat < 0 ? UNKNOWN_PIP : seatColor(seat);
}
