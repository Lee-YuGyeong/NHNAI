/**
 * 넘어지고 일어나는 그 짧은 순간 — 봉에 맞은 몸이 한 프레임에 딱 눕지 않고 넘어간다.
 *
 * 회전 원판·무너지는 타워는 딱 눕힌다(DiscAvatar). 저쪽은 눕는 일이 드물어서 그래도 됐지만, 이 판은 봉이 돌 때마다
 * 누우므로 **넘어지는 그림이 곧 이 게임이다.** 딱 눕히면 몸이 사라졌다 나타난 것처럼 보인다.
 *
 * 상태는 몸마다 하나(Tip)고 **시각으로만** 센다 — dt 를 안 받는다. 그래야 useFrame 밖(SelfAvatar 의 pose 콜백)에서도
 * 같은 함수를 쓸 수 있다. 다 넘어지기 전에 일어나도(짧게 맞고 바로 다시 맞는다) 지금 각에서 이어 돈다.
 */

/** 넘어지는 데 걸리는 시간(ms) — 봉에 맞은 몸은 빠르게 쓸린다 */
export const TIP_MS = 200;
/** 일어나는 데 걸리는 시간(ms) — 넘어지는 것보다 굼뜨다 */
export const RISE_MS = 280;

export interface Tip {
  /** 지금 누워 있나 */
  down: boolean;
  /** 그 상태로 바뀐 시각(ms) — 0 이면 아직 한 번도 안 바뀌었다 */
  at: number;
  /** 바뀌던 순간의 기울기(rad) */
  from: number;
}

export const makeTip = (): Tip => ({ down: false, at: 0, from: 0 });

/** 지금 몸의 기울기(rad) — 누우면 −π/2 로 넘어가고 일어나면 0 으로 돌아온다 */
export function tiltOf(t: Tip, down: boolean, now: number): number {
  if (down !== t.down) {
    t.from = tiltNow(t, now);
    t.down = down;
    t.at = now;
  }
  return tiltNow(t, now);
}

function tiltNow(t: Tip, now: number): number {
  const goal = t.down ? -Math.PI / 2 : 0;
  if (t.at === 0) return goal;
  const u = Math.min(1, (now - t.at) / (t.down ? TIP_MS : RISE_MS));
  return t.from + (goal - t.from) * (u * u * (3 - 2 * u));
}
