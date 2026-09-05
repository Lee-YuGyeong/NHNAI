/**
 * 검문소 플레이어의 **몸** — 군인 넷 (2026-09-04 사용자 제공 Tripo 리깅 GLB, public/world/soldier/).
 * 클라이언트(아바타·다리)와 워커(좌석 배정)가 같이 보는 순수 파일이다 — three 를 끌어오지 않는다.
 *
 * 규칙 (2026-09-04 사용자):
 *   · 몸은 **랜덤**으로 잡히되 방 안에서 **서로 다르게** — 넷이서 시연하므로 넷이 전부 다른 몸이어야 한다 (pickBody).
 *   · 클립은 넷이 같다 (걷기 · 달리기 · 점프 · 동의 · 화남). 다만 비만인 둘은 **물리가 다르다** —
 *     달리기가 느리고 점프가 낮다. 걷기는 같다.
 *
 * 점프 최고점 = jump² / (2·GRAVITY) (mp/constants). 6.4 → 1.37m, 5.2 → 0.90m.
 *   2026-09-05 사용자: 「점프가 너무 낮게 뛰어진다」 — 복도와 같던 5.6(1.05m) · 4.4(0.65m)에서 올렸다. 발판 0.5m 위에서
 *   0.65m 를 뛰면 뛴 것 같지 않고, 걸어서 뛴 거리가 발판 간격(2m)에 못 미쳤다(fit 1.94 · 비만 1.53). 이제 fit 은 걸어서
 *   2.22m 로 한 칸을 넘고, 비만은 1.80m 로 다음 발판의 앞쪽에 닿는다(발판 반지름 0.8). 움직이는 플랫폼의 봇도 같은
 *   값으로 뛴다 (mp/platform.ts PLATFORM_JUMP_SPEED) — 사람과 봇이 다른 몸이면 안 된다(P9).
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
  /**
   * 회전 원판에서 발이 잡는 마찰 배율 (2026-09-05 사용자: "비만군인은 물리법칙에 의해 더 많이 벗어나게").
   * 무거운 몸은 무게중심이 높고 발놀림이 느려 같은 바닥(μ)에서도 먼저 미끄러지고 더 멀리 밀린다 — 서버가 μ 에 곱한다
   * (worker/src/trial/disc/engine.ts). 1 이 기준.
   */
  grip: number;
  /**
   * 몸무게 배율 — 캐릭터끼리 부딪힐 때 밀리는 몫을 가른다 (net/remote-players.pushOut): 겹침은 질량
   * 반비례로 나눠 무거운 쪽이 덜 밀리고 가벼운 쪽이 많이 밀린다. 1 이 기준.
   */
  mass: number;
}

export const BODIES: Record<BodyId, BodySpec> = {
  sol_fit_m: { name: '남군', run: 5.2, jump: 6.4, heavy: false, grip: 1, mass: 1 },
  sol_fit_f: { name: '여군', run: 5.2, jump: 6.4, heavy: false, grip: 1, mass: 1 },
  sol_heavy_m: { name: '비만 남군', run: 3.9, jump: 5.2, heavy: true, grip: 0.7, mass: 1.8 },
  sol_heavy_f: { name: '비만 여군', run: 3.9, jump: 5.2, heavy: true, grip: 0.7, mass: 1.8 },
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

/** 몸의 원판 마찰 배율 — 몸을 모르면(옛 워커 · AI 좌석에 몸이 없을 때) 기준 1 */
export function gripOf(body: BodyId | undefined | null): number {
  return body ? BODIES[body].grip : 1;
}

/** 몸무게 배율 — 몸을 모르면(로봇 · 옛 워커) 기준 1 */
export function massOf(body: BodyId | undefined | null): number {
  return body ? BODIES[body].mass : 1;
}

/**
 * 점프 초기 속도(m/s) — 몸을 모르면 기준. 낙하 생존은 **서버가** 이 값으로 몸을 띄운다
 * (worker/src/trial/fall/engine.ts): 그 구간의 중력이 숨은 값이라 클라가 스스로 포물선을 그릴 수 없다
 */
export function jumpOf(body: BodyId | undefined | null, fallback: number): number {
  return body ? BODIES[body].jump : fallback;
}

/** 몸의 달리기 상한(m/s) — cap 보다 빠른 몸은 cap. 회전 원판이 걷기 명령을 자르는 데 쓴다 */
export function runCapOf(body: BodyId | undefined | null, cap: number): number {
  return body ? Math.min(cap, BODIES[body].run) : cap;
}
