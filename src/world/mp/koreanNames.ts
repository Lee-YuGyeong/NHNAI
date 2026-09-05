/**
 * 검문소 좌석의 이름 — 한국인 이름 (2026-09-05 사용자: "SUBJECT 01~04 가 아니라 한국인 사람 이름 4명으로 랜덤으로").
 *
 * 워커(좌석을 짓는 runtime)와 클라이언트(시험)가 같이 보는 순수 파일이다. 성과 이름을 따로 뽑아 붙이고,
 * 한 판 안에서는 **성도 이름도 서로 다르다** — 채팅에서 "지훈이 AI 같아" 를 좌석으로 되돌릴 때(runtime 의
 * accusationIn) 이름 두 글자만으로 한 사람이 가려져야 한다. 이름은 두 글자, 성은 한 글자라 전원 세 글자다.
 *
 * 난수는 판의 씨앗(runtime.rand)에서 온다 — 같은 판을 다시 열어도 같은 이름이고, 시험이 예측할 수 있다.
 */

export const SURNAMES: readonly string[] = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '유', '홍'];

/** 요즘 흔한 두 글자 이름 — 남녀 어느 쪽으로도 읽히는 것 위주. 서로 한 글자도 안 겹치게 고르지는 않았고, 통째로만 다르다 */
export const GIVEN_NAMES: readonly string[] = [
  '지훈', '서연', '민준', '서윤', '도윤', '하은', '예준', '지우', '시우', '하윤', '주원', '수아', '지호', '지민', '준서', '채원',
  '유진', '현우', '서현', '민재', '지아', '건우', '수빈', '은서', '승민', '다은', '시윤', '윤서', '지안', '태민', '소율', '재원',
];

function draw<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

/**
 * n 명의 이름 — 전원 성이 다르고 이름이 다르다. 성·이름 풀보다 많이 달라고 하면 그 뒤로는 겹친다 (검문소는 최대 9석).
 */
export function pickKoreanNames(n: number, rand: () => number = Math.random): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const k = Math.min(n - out.length, SURNAMES.length, GIVEN_NAMES.length);
    const sur = draw(SURNAMES, k, rand);
    const given = draw(GIVEN_NAMES, k, rand);
    for (let i = 0; i < k; i++) out.push(sur[i] + given[i]);
  }
  return out;
}

/** 이름에서 성을 뗀 것 — "김지훈" → "지훈". 채팅은 대개 성 없이 부른다 */
export function givenOf(name: string): string {
  return name.length >= 3 ? name.slice(1) : name;
}
