/**
 * 검문소 좌석의 이름 — 한국인 이름 (2026-09-05 사용자: "SUBJECT 01~04 가 아니라 한국인 사람 이름 4명으로 랜덤으로").
 *
 * 워커(좌석을 짓는 runtime)와 클라이언트(시험)가 같이 보는 순수 파일이다. 성과 이름을 따로 뽑아 붙이고,
 * 한 판 안에서는 **성도 이름도 서로 다르다** — 채팅에서 "지훈이 AI 같아" 를 좌석으로 되돌릴 때(runtime 의
 * accusationIn) 이름 두 글자만으로 한 사람이 가려져야 한다. 이름은 두 글자, 성은 한 글자라 전원 세 글자다.
 *
 * 이름은 몸의 성별을 따른다 (2026-09-05 사용자: "남군은 남자 이름, 여군은 여자 이름으로") — 남자 몸은 남자 풀,
 * 여자 몸은 여자 풀에서 뽑는다. 두 풀은 통째로 겹치지 않아 남녀가 섞인 판에서도 이름만으로 한 사람이 가려진다.
 * 몸을 모르는 좌석(옛 워커)은 동전을 던져 아무 풀에서나 뽑는다.
 *
 * 난수는 판의 씨앗(runtime.rand)에서 온다 — 같은 판을 다시 열어도 같은 이름이고, 시험이 예측할 수 있다.
 */

export const SURNAMES: readonly string[] = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '유', '홍'];

/** 요즘 흔한 남자 이름 두 글자 — 여자 풀과 통째로 겹치지 않는다 (검문소 최대 9석이 다 남군이어도 남는 수) */
export const GIVEN_NAMES_M: readonly string[] = [
  '지훈', '민준', '도윤', '예준', '시우', '주원', '지호', '준서', '현우', '민재', '건우', '승민', '태민', '재원', '동현', '성민',
];

/** 요즘 흔한 여자 이름 두 글자 — 남자 풀과 통째로 겹치지 않는다 */
export const GIVEN_NAMES_F: readonly string[] = [
  '서연', '서윤', '하은', '하윤', '수아', '채원', '서현', '지아', '수빈', '은서', '다은', '윤서', '소율', '예린', '민지', '하린',
];

function draw<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

/** 몸의 성별 — bodies.genderOf 가 준다. null 은 몸을 모르는 좌석이다 */
export type NameGender = 'm' | 'f';

/**
 * 좌석마다 하나씩, 몸의 성별에 맞는 이름 — 전원 성이 다르고 이름이 다르다 (이름은 남녀 풀이 안 겹쳐 섞여도 다르다).
 * 성·이름 풀보다 많이 달라고 하면 그 뒤로는 겹친다 (검문소는 최대 9석).
 */
export function pickKoreanNames(genders: ReadonlyArray<NameGender | null | undefined>, rand: () => number = Math.random): string[] {
  const n = genders.length;
  const sur: string[] = [];
  while (sur.length < n) sur.push(...draw(SURNAMES, Math.min(n - sur.length, SURNAMES.length), rand));
  const left: Record<NameGender, string[]> = { m: [], f: [] };
  return genders.map((g, i) => {
    const sex: NameGender = g ?? (rand() < 0.5 ? 'm' : 'f');
    if (left[sex].length === 0) {
      const pool = sex === 'm' ? GIVEN_NAMES_M : GIVEN_NAMES_F;
      left[sex] = draw(pool, pool.length, rand);
    }
    return sur[i] + left[sex].pop()!;
  });
}

/** 이름에서 성을 뗀 것 — "김지훈" → "지훈". 채팅은 대개 성 없이 부른다 */
export function givenOf(name: string): string {
  return name.length >= 3 ? name.slice(1) : name;
}
