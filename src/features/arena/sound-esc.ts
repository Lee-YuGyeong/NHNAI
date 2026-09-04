/**
 * Esc 하나로 음향판을 여닫는 규칙 — 키가 **두 갈래로 오기 때문에** 규칙만 떼어 놓았다.
 *
 * ★ 시야가 잠겨 있을 때(걷는 중) 누른 Esc 는 **우리에게 오지 않는다.** 포인터 잠금을 푸는 키라
 *   브라우저가 먹는다 — Chrome·Firefox 둘 다 그 keydown 을 페이지에 주지 않는다. 게임이 사용자를
 *   가두지 못하게 하는 장치라 막을 수도 없다. 그래서 길이 둘이다:
 *     ① 걷다 눌렀다 → 키는 없고 **잠금이 풀린 것**만 보인다 (unlockOpensSound)
 *     ② 이미 풀린 채였다 → 키가 그대로 온다 (escKeySound)
 *   두 길이 다 열려 있으므로, 키까지 주는 브라우저에서는 한 번의 Esc 가 두 번 세일 수 있다 —
 *   열자마자 닫히는 판이 그것이다. sinceUnlockMs 가 그 자리를 막는다.
 *
 * ★ **국면을 보고 막지 않는다** (사용자 2026-09-01: "ESC 한번 누르면 음향 UI 만들어주고"). 한때
 *   시행 중·배역 만드는 중·판이 끝난 뒤에는 안 열리게 했는데, 눌러도 아무 일이 없는 키는 **고장 난
 *   키**로 보인다 — 표시가 없으니 몇 번을 더 누르게 된다. 여기서 가리는 것은 **다른 것이 이미 맡은
 *   Esc** 뿐이다: 말하는 중(입력창을 무르는 키) · 글 치는 칸 · **도착 암전 위의 인계 서류**(veiled —
 *   그 화면이 「아무 키나 눌러 계속」이라 Esc 도 그 「아무 키」다). 잘못 열렸어도 아무 데나 한 번 누르면
 *   게임으로 돌아간다 — 막이 없어 그 클릭이 그대로 시야 잠금이 된다 (SoundPanel).
 */

/** 잠금을 푼 Esc 가 키로도 오는 브라우저 — 이 사이의 키는 같은 한 번으로 본다 */
export const ESC_ECHO_MS = 400;

/**
 * 잠금이 풀렸다 — 걷다 누른 Esc 다. 음향판을 열 자리인가.
 *
 * **변화**를 본다(wasLocked && !locked). 안 잠겼다는 것만으로 열면, 들어오자마자(잠근 적 없이)
 * 판이 떠 있다 — 지금 고치려는 것이 바로 그 화면이다.
 *
 * 말하던 중이면(composing) 그 Esc 는 입력창을 무르는 키다 — 무르면서 소리판까지 열면 손이 두 번 간다.
 */
export function unlockOpensSound(
  wasLocked: boolean,
  locked: boolean,
  composing: boolean,
  veiled: boolean,
  answering = false,
): boolean {
  return wasLocked && !locked && !composing && !veiled && !answering;
}

export type EscKeyState = {
  /** 음향판이 지금 떠 있는가 */
  open: boolean;
  /** 시야가 잠겨 있는가 — 잠긴 채로 온 키는 잠금 해제 쪽(unlockOpensSound)에 맡긴다 */
  locked: boolean;
  /** 말하는 중인가 */
  composing: boolean;
  /** 글 치는 칸에서 온 키인가 (범위 손잡이는 글 치는 칸이 아니다 — 거기서도 Esc 로 닫혀야 한다) */
  inField: boolean;
  /** 잠금이 풀린 지 얼마나 됐나 */
  sinceUnlockMs: number;
  /**
   * 도착 암전(ArenaFeature 의 .arrive)이 아직 덮여 있는가.
   *
   * 그 막 위에는 인계 서류가 떠 있고 서류가 「아무 키나 눌러 계속」이라고 적어 둔다 —
   * **Esc 도 그 「아무 키」다.** 여기서 음향판을 열면 판은 검은 화면 뒤에서 열려 아무도 여는 것을
   * 못 보고, 막이 걷힌 자리에 볼륨 손잡이가 서 있다. 고치려던 화면(위 unlockOpensSound 머리말의
   * "들어오자마자 판이 떠 있다")이 다른 문으로 돌아온 꼴이다.
   */
  veiled: boolean;
  /**
   * **답을 기다리는 판이 떠 있는가** (즉답 시행의 `.ask` — 문제 한 줄과 답 칸, 그리고 시계).
   *
   * 이 한 자리에서만은 음향판을 안 연다. 답판은 z 30 이고 음향판은 z 45 라 **그 위를 덮는데**,
   * 덮인 쪽에는 초가 흐르고 있다 — 사용자에게는 「엔터나 그런 거 누르면 답 입력판이 없어진다」로
   * 보인다 (2026-09-03 사용자). 덮이는 순간 초점도 답 칸을 떠나므로 그 뒤로는 쳐도 안 들어간다.
   *
   * 위 머리말의 「국면을 보고 막지 않는다」와 어긋나지 않는다: 저 규칙이 막는 것은 **아무 일도
   * 안 일어나는 키**이고, 여기서는 Esc 가 할 일이 따로 있다 — 떠난 초점을 답 칸으로 되돌린다
   * (ArenaFeature 가 그 몫을 한다). 눌러서 보이는 것이 있으면 고장 난 키가 아니다.
   */
  answering: boolean;
};

/** 안 잠긴 채로 온 Esc — 열거나, 닫거나, 아무것도 안 한다 */
export function escKeySound(s: EscKeyState): 'open' | 'close' | 'none' {
  if (s.inField) return 'none'; // 글 치는 칸의 Esc 는 그 칸 몫이다
  // 막이 덮여 있으면 이 키의 임자는 서류다 — 넘기는 키지 음향판을 부르는 키가 아니다
  if (s.veiled) return 'none';
  /*
   * 잠금을 푼 그 Esc 가 키로도 오는 브라우저 — 한 번의 Esc 를 두 번 세지 않는다.
   * **여는 쪽만 막아서는 안 된다.** 잠금 해제가 먼저 열어 버렸으면 뒤따라온 키는 여는 자리가 아니라
   * 닫는 자리에 떨어져, 판이 뜨자마자 도로 접힌다 — 눈에는 깜빡임 하나로만 보인다.
   */
  if (s.sinceUnlockMs < ESC_ECHO_MS) return 'none';
  // 닫는 길은 그 뒤로는 언제나 열어 둔다 — 급한 국면이 되어도 판은 걷힌다
  if (s.open) return 'close';
  if (s.answering) return 'none'; // 답판 위에는 안 연다 (answering 머리말) — 이 Esc 는 초점을 되돌린다
  if (s.composing) return 'none';
  if (s.locked) return 'none'; // 키까지 주는 브라우저 — 뒤따라 올 잠금 해제가 연다
  return 'open';
}
