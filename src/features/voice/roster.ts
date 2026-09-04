/**
 * 좌석 배역 — 어느 좌석이 어느 목소리로 말하나 (PLANNING §1.4 P11, docs/VOICE.md §3).
 *
 * 이 파일이 지키는 한 줄: **배정은 역할을 보지 않는다.**
 *
 * 그래서 `assignVoices` 는 역할을 **인자로 받지 않는다.** 받아 놓고 안 쓰는 것과 애초에
 * 못 받는 것은 다르다 — 앞의 것은 언젠가 누가 쓴다. AI 좌석은 이 함수 안에서 다른 좌석과
 * 구별되지 않으며, 구별할 방법도 없다.
 *
 * 목소리는 **번호로만** 다룬다. 실제 ElevenLabs 목소리 id 로 푸는 것은 워커뿐이고,
 * 배정표는 클라이언트로 내려가지 않는다 (docs/VOICE.md §3, P8 과 같은 태도).
 * 브라우저가 받는 것은 어느 목소리인지 알 수 없는 서명 토큰뿐이다.
 */

/**
 * 명부 크기 — 총원 상한(사람 8 + AI 1, PLANNING §1.1)과 같다.
 *
 * 좌석보다 목소리가 모자라면 두 좌석이 같은 목소리를 쓰게 되는데, 그러면 누가 말했는지
 * 귀로 따라갈 수 없어 목소리를 붙인 이유가 사라진다. 그 경우는 조용히 넘어가지 않고 던진다.
 */
export const ROSTER_SIZE = 9;

/** 명부에서의 자리 번호 (0 ~ ROSTER_SIZE-1) */
export type VoiceIndex = number;

/**
 * 명부의 성별 구성 — **화면 표시용이다. 배정에는 아무 영향이 없다.**
 *
 * 2026-09-04 사용자가 제 ElevenLabs 계정의 목소리로 아홉을 채웠다: **앞 다섯이 남, 뒤 넷이 여.**
 * 이 표는 그 사실을 적어 둔 것뿐이라 `assignVoices` 는 이 값을 **읽지 않는다** — 읽는 순간
 * 「목소리 성별을 보고 좌석을 고른다」가 되고, 그건 P11 이 막는 것이다. 순열이 균등하므로
 * 성별은 좌석에 저절로 고르게 흩어진다.
 *
 * ★ 명부(ELEVENLABS_SEAT_VOICE_IDS)를 갈아 끼우면 이 표도 같이 고친다. 안 고치면 캐스팅
 *   화면이 거짓말을 한다 — 「남 5 · 여 4」로 보이는데 실제로는 아닌 상태가 된다.
 */
export const SEAT_GENDERS = ['남', '남', '남', '남', '남', '여', '여', '여', '여'] as const;

/** 그 자리의 성별 표시. 명부보다 큰 번호는 빈 문자열 — 화면이 없는 것을 지어내지 않게 */
export function genderOf(index: VoiceIndex): string {
  return SEAT_GENDERS[index] ?? '';
}

/**
 * 좌석마다 목소리를 하나씩 배정한다 — **판마다 다시 섞인다.**
 *
 * `seats` 에는 **그 판의 좌석을 전부** 넘긴다 (AI 좌석 포함). 빠뜨린 좌석은 목소리가 없고,
 * 목소리 없는 좌석 하나는 그 자체로 정답표다 — P11 이 막으려는 바로 그것이다.
 *
 * 인원이 명부보다 적으면 **앞에서부터 자르지 않는다.** 명부 전체를 섞은 뒤 앞을 취하므로
 * 5인 판이 늘 같은 5개를 쓰는 일이 없다 — 그것도 판을 거듭하면 학습된다.
 *
 * `random` 은 테스트가 씨앗을 심을 수 있게 뚫어 둔 자리다. 실제 판에서는 기본값을 쓴다.
 */
export function assignVoices(
  seats: readonly number[],
  random: () => number = Math.random,
): Map<number, VoiceIndex> {
  if (seats.length > ROSTER_SIZE) {
    throw new RangeError(
      `좌석(${seats.length})이 명부(${ROSTER_SIZE})보다 많다 — 목소리가 겹치면 누가 말했는지 귀로 못 따라간다`,
    );
  }
  if (new Set(seats).size !== seats.length) {
    throw new RangeError(`좌석 번호가 겹친다: [${seats.join(', ')}]`);
  }

  const pool = shuffle([...Array(ROSTER_SIZE).keys()], random);
  return new Map(seats.map((seat, i) => [seat, pool[i]]));
}

/**
 * 피셔–예이츠. 제자리에서 섞고 그대로 돌려준다.
 *
 * 「앞에서 i 개를 뽑는다」가 균등한 부분집합이 되려면 순열이 균등해야 한다 —
 * `sort(() => random() - 0.5)` 같은 흔한 축약은 균등하지 않아서 여기 쓸 수 없다.
 */
function shuffle<T>(xs: T[], random: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
