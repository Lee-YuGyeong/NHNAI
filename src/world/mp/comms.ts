/**
 * 조력자 통신 — 안쪽으로 들어갈수록 **끊긴다.**
 *
 * 2026-08-30 사용자 지적: 과학자가 옆에서 답을 다 불러 주니 긴장이 없다. 그래서 통신에 품질(level 0~1)을 두고,
 * 무대가 깊어질수록 떨어뜨린다 — 중앙 시설 도착 0.72 · 락다운 0.45 · 검증실 행군 0.15 · 검증실 앞 0.
 * 대본(chapter1·chapter2)의 과학자·정부요원 줄은 나갈 때 `garble()` 을 거친다: 품질이 낮을수록 어절이 잡음(—)으로 먹히고,
 * 0 이면 아예 안 온다(`dropped`). 시스템·경비·내 말은 그대로다 — 끊기는 건 **바깥에서 오는 목소리**뿐이다.
 *
 * 갉는 자리는 무작위다(연출). 그래서 결정적인 답(식별번호·정비 구역)은 통신에 실어 보내지 않는다 —
 * 그건 복도의 정비 명판(mp/identity.ts)에서 내가 직접 읽어 왔어야 한다.
 *
 * 순수 저장소다 (three·DOM·React 없음).
 */

export interface CommsState {
  /** 0(두절) ~ 1(맑음) */
  level: number;
  /** 마지막으로 값이 바뀐 시각 — HUD 가 잠깐 반응한다 */
  at: number;
}

/** 이 위로는 아무것도 안 갉는다 */
const CLEAR = 0.9;
/** 이 아래면 통신 자체가 안 온다 */
const DEAD = 0.08;

const state: CommsState = { level: 1, at: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export const comms = {
  get(): CommsState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    state.level = 1;
    state.at = 0;
    emit();
  },
  /** 품질을 이 값으로 (무대가 깊어질 때 대본이 부른다) */
  set(level: number, now = performance.now()): void {
    const v = Math.max(0, Math.min(1, level));
    if (v === state.level) return;
    state.level = v;
    state.at = now;
    emit();
  },
  /** 지금 통신이 아예 안 오나 */
  dropped(): boolean {
    return state.level <= DEAD;
  },
  /**
   * 품질만큼 갉아 먹은 말. **앞은 남기고 뒤를 먹는다** — 무슨 말을 하려 했는지는 들리는데
   * 정작 필요한 알맹이(숫자·이름·지시)가 안 들리는 게 제일 무섭다. 랜덤하게 흩어 먹으면 그냥 안 읽힌다.
   * 갉는 개수는 품질로 정해지고(최대 절반), 자리는 뒤쪽 어절 중에서 고른다.
   */
  garble(text: string, level = state.level): string {
    if (level >= CLEAR) return text;
    if (level <= DEAD) return '—————';
    const words = text.split(' ');
    if (words.length < 3) return level < 0.5 ? `${words[0]}…` : text;
    const eat = Math.min(Math.floor(words.length / 2), Math.round(words.length * (1 - level) * 0.8));
    if (eat <= 0) return text;
    // 앞의 두 어절은 건드리지 않는다
    const pool: number[] = [];
    for (let i = 2; i < words.length; i += 1) pool.push(i);
    for (let n = 0; n < eat && pool.length; n += 1) {
      const at = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      words[at] = '—'.repeat(Math.max(1, Math.min(4, words[at].length)));
    }
    return words.join(' ') + (level < 0.5 ? '…' : '');
  },
};
