/**
 * 검문소 플레이어의 **몸** — 군인 넷 (2026-09-04 사용자 제공 Tripo 리깅 GLB, public/world/soldier/).
 * 클라이언트(아바타·다리)와 워커(좌석 배정)가 같이 보는 순수 파일이다 — three 를 끌어오지 않는다.
 *
 * 규칙 (2026-09-04 사용자):
 *   · 몸은 **랜덤**으로 잡히되 방 안에서 **서로 다르게** — 넷이서 시연하므로 넷이 전부 다른 몸이어야 한다 (pickBody).
 *   · 클립은 넷이 같다 (걷기 · 달리기 · 점프 · 동의 · 화남). 다만 비만인 둘은 **물리가 다르다** —
 *     달리기가 느리고 점프가 낮다. 걷기는 같다.
 *
 * 점프 최고점 = jump² / (2·GRAVITY) (mp/constants). 5.6 → 1.05m (복도와 같다), 4.4 → 0.65m.
 * 서버는 속도를 검증하지 않는다 (validate.ts 는 자리·높이·anim 만 본다) — 이 값은 클라가 정직하게 쓰는 값이다.
 */

export type BodyId = 'sol_fit_m' | 'sol_fit_f' | 'sol_heavy_m' | 'sol_heavy_f';

export const BODY_IDS: readonly BodyId[] = ['sol_fit_m', 'sol_fit_f', 'sol_heavy_m', 'sol_heavy_f'];

export interface BodySpec {
  /** 화면에 부르는 이름 */
  name: string;
  /** 달리기(Shift+W) 속도 m/s. 걷기는 WALK_SPEED(2.6) 로 넷이 같다 */
  run: number;
  /** 점프 초기 속도 m/s */
  jump: number;
  /** 비만 — 느리고 낮게 뛴다 */
  heavy: boolean;
}

export const BODIES: Record<BodyId, BodySpec> = {
  sol_fit_m: { name: '남군', run: 5.2, jump: 5.6, heavy: false },
  sol_fit_f: { name: '여군', run: 5.2, jump: 5.6, heavy: false },
  sol_heavy_m: { name: '비만 남군', run: 3.9, jump: 4.4, heavy: true },
  sol_heavy_f: { name: '비만 여군', run: 3.9, jump: 4.4, heavy: true },
};

export const isBodyId = (v: unknown): v is BodyId => typeof v === 'string' && (BODY_IDS as readonly string[]).includes(v);

/**
 * 아직 아무도 안 쓴 몸 가운데 하나를 뽑는다. 넷이 다 찼으면(5명째부터) 아무 몸이나 — 겹치는 것을 막지는 못한다.
 * rand 는 [0,1) — 워커는 판의 시드 난수를, 클라는 안 부른다.
 */
export function pickBody(taken: Iterable<BodyId | undefined>, rand: () => number = Math.random): BodyId {
  const used = new Set<BodyId>();
  for (const b of taken) if (b) used.add(b);
  const free = BODY_IDS.filter((b) => !used.has(b));
  const pool = free.length > 0 ? free : BODY_IDS;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
