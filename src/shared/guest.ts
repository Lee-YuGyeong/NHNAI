/**
 * 게스트 정체성 — 로그인 없이 논다.
 *
 * humanish 는 구글 로그인(Supabase)으로 계정·닉네임을 받았지만(components/require-login.tsx),
 * 이 프로젝트는 테스트 단계라 로그인이 없다. 닉네임은 브라우저(localStorage)에만 남는다.
 * 게임 정체(인간/AI 배정)와는 무관한 값이다 — 시작 시 서버가 노드 번호를 재배치한다 (PLANNING §3 I7).
 *
 * localStorage 접근은 전부 try/catch — 시크릿 모드·node 테스트 환경에서는 조용히 빈 값으로 돈다.
 */
import { NICK_MAX_LEN } from '@/world/mp/constants';

const NICK_KEY = 'wih:guest-nick';

/** 저장된 게스트 닉네임. 없으면 빈 문자열 (화면이 placeholder 로 안내한다). */
export function loadGuestNick(): string {
  try {
    return (localStorage.getItem(NICK_KEY) ?? '').slice(0, NICK_MAX_LEN);
  } catch {
    return '';
  }
}

export function saveGuestNick(nick: string): void {
  try {
    localStorage.setItem(NICK_KEY, nick.trim().slice(0, NICK_MAX_LEN));
  } catch {
    /* 저장 못 하면 이번 탭에서만 유지된다 — 게임엔 지장 없다 */
  }
}

/**
 * 방 번호를 뽑는다 — 4자리 숫자.
 *
 * ★ 이 번호가 **방을 만드는 것은 아니다.** 방은 같은 번호를 친 사람끼리 같은 DO 인스턴스로
 *   모이는 것이라(worker/src/index.ts 의 idFromName), 번호만 있으면 방은 언제나 실재한다.
 *   로비의 「방 만들기」가 하는 일은 그 번호와 제목을 **등록소에 적어 목록에 세우는 것**이다
 *   (features/lobby/rooms.ts 의 openRoom · worker/src/lobby-do.ts). 여기는 첫 후보를 뽑아 줄 뿐이고,
 *   그 번호가 이미 열려 있으면 등록소가 거절한다.
 */
export function randomRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
