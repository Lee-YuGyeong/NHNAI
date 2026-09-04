/**
 * 방 등록소의 계약 — **열린 방 목록의 한 줄**이 어떻게 생겼나. 클라이언트와 워커가 같이 읽는다.
 *
 * ┌─ 왜 이 파일이 생겼나 (2026-08-31) ───────────────────────────────────────┐
 * │ 이 저장소의 방은 Durable Object 하나다 (worker/src/index.ts 의            │
 * │ idFromName). DO 는 **인스턴스를 열거할 수 없다** — 그래서 로비의 방       │
 * │ 목록이 오래 목업이었고, 방 제목은 적어 둘 데가 없어서 만들기 화면에서     │
 * │ 통째로 빠져 있었다 (features/lobby/rooms.ts 의 옛 머리말).                │
 * │                                                                          │
 * │ 없는 것은 열거가 아니라 **적어 두는 자리**였다. 그래서 등록소 DO 를        │
 * │ 하나 세운다 (worker/src/lobby-do.ts): 방들이 스스로 자기 인원을 적고,      │
 * │ 로비는 그 종이를 읽는다. 원작 humanish 의 `rooms` 테이블이 하던 일을      │
 * │ 이 저장소가 이미 가진 것(DO)으로 옮긴 것이다 — 새 DB 표를 파지 않는다.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 이 파일은 **아무것도 import 하지 않는다** (shared/broadcast-kind.ts 와 같은 규칙).
 *   워커 타입 세계로 그대로 넘어가야 해서 react·DOM·three 를 끌어오면 빌드가 깨진다.
 */

/**
 * 방 제목 길이 상한. 원작(humanish rooms.name 체크 제약)과 같은 20자다.
 *
 * ★ 넘치면 **거절하지 않고 자른다.** 원작은 400 을 던졌지만 이 저장소의 규칙은
 *   자르는 쪽이다 (worker/src/auth.ts 의 닉네임 clean — "12자에서 자른다").
 *   한 저장소 안에서 이름은 자르고 제목은 거절하면, 같은 실수가 화면마다 다른 답을 받는다.
 */
export const MAX_ROOM_NAME_LEN = 20;

/**
 * 소식이 끊긴 방을 목록에서 지우기까지. 방은 30초마다 자기 인원을 적는다
 * (room-do.ts 의 청소 알람 SWEEP_ALARM_MS) — 그러니 이 값은 **다섯 번쯤 놓쳐도 버티는** 길이다.
 *
 * 왜 넉넉한가: 짧으면 멀쩡히 사람이 앉아 있는 방이 목록에서 깜빡인다. 왜 무한이 아닌가:
 * DO 가 소식 없이 죽으면(배포 교체·장애) 아무도 없는 방이 목록에 영원히 남고,
 * 그 줄을 누른 사람은 빈 방에 혼자 앉는다. 남은 자국을 스스로 지우는 쪽이 낫다.
 */
export const ROOM_STALE_MS = 150_000;

/** 목록 한 줄. 화면(features/lobby)과 등록소(worker/src/lobby-do)가 같은 모양을 쓴다 */
export interface LobbyRoom {
  /** 방 번호. 그대로 입장 주소가 된다 (/lobby?code=…) */
  code: string;
  /** 방 제목. 없으면 코드가 그 자리에 선다 (원작 roomLabel 과 같은 규칙) */
  name: string | null;
  players: number;
  capacity: number;
  /** 'lobby' = 아직 대기 중, 'playing' = 이미 구역으로 넘어간 방 */
  phase: RoomPhase;
}

export type RoomPhase = 'lobby' | 'playing';

/**
 * 방 만들기가 거절당하는 이유. **문구는 여기 없다** — 화면이 자기 말투로 적는다
 * (features/lobby/rooms.ts 의 OPEN_ERROR_TEXT). 워커는 뜻만 보낸다.
 */
export type OpenRoomError =
  /** 번호 모양이 아니다 (ROOM_CODE_RE) */
  | 'bad_code'
  /** 그 번호로 이미 열려 있는 방이 있다 — 만들기가 아니라 「코드로 입장」이다 */
  | 'code_taken'
  /** 같은 제목의 방이 이미 있다 */
  | 'name_taken'
  /** 빈 번호를 못 뽑았다 (전부 차 있다) */
  | 'no_code'
  /** 등록소가 꽉 찼다. 사람이 아니라 장난이 채운 것이다 — 오래된 줄이 걷히면 다시 열린다 */
  | 'too_many'
  /** 등록소가 꺼져 있다 (워커에 LOBBY_DO 바인딩이 없다) */
  | 'registry_disabled';

/**
 * 방 제목을 다듬는다. **순수 함수다** — 화면과 워커가 같은 함수를 부른다
 * (tests/features/lobby/rooms.test.ts · tests/worker/lobby.test.ts).
 *
 * ┌─ 왜 trim 하나로 끝내지 않나 (원작 normalizeRoomName 의 이유 그대로) ─────┐
 * │ 방 제목은 **남이 지은 문자열이 내 목록에 섞여 들어오는 유일한 통로**다.    │
 * │                                                                          │
 * │  · NFC 로 먼저 합친다. 맥에서 복사한 '한'은 자모가 풀린 세 글자라 눈에는   │
 * │    같고 length 만 3배다 — 합치기 전에 세면 열 글자짜리 제목이 잘린다.      │
 * │  · \p{Cf} 서식문자는 **지운다.** U+202E 하나면 제목이 거꾸로 렌더되고,     │
 * │    U+200B 를 끼우면 눈으로 똑같은 제목을 얼마든지 만들 수 있다 — 남의 방을 │
 * │    사칭하는 제일 싼 방법이다. 글자 사이를 메우라고 있는 것이라 공백으로    │
 * │    바꾸지 않는다 (바꾸면 없던 띄어쓰기가 생긴다).                          │
 * │  · \p{Cc} 제어문자는 **공백으로 바꾼다.** 지우면 '초보\n방' 이 '초보방' 이  │
 * │    되어 원래 없던 낱말이 만들어진다. 자리를 차지하던 글자이므로 자리를 남긴다.│
 * │  · 남은 공백은 한 칸으로 접는다. \s 가 U+3000(전각 공백)도 잡는다 —        │
 * │    그게 없으면 전각 공백만으로 "비어 보이는 제목"을 만들 수 있다.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 자를 때는 **코드포인트로** 센다 ([...s]) — UTF-16 단위로 자르면 이모지가 반 토막 나서
 * 깨진 글자가 목록에 남는다.
 *
 * @returns 이름이 없으면 null. **빈 문자열은 절대 돌려주지 않는다** — 그 둘이 다 존재하면
 *          "이름이 있는데 안 보이는 방"이 생긴다.
 */
export function normalizeRoomName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;
  const cut = [...cleaned].slice(0, MAX_ROOM_NAME_LEN).join('').trim();
  return cut || null;
}

/**
 * 제목이 같은가 — **눈에 같아 보이면 같은 것으로 본다.** 대소문자와 띄어쓰기를 지우고 견준다.
 * 「초보 환영」과 「초보환영」이 목록에 나란히 서면 둘 중 어디로 가야 하는지 알 방법이 없다
 * (원작이 codeFromName 에서 공백을 지운 것과 같은 이유).
 */
export function sameRoomName(a: string, b: string): boolean {
  const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
  return fold(a) === fold(b);
}
