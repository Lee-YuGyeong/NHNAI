/**
 * 순간이동 — 발판에서 떨어져 출발 발판으로 **돌아가는 그 시간**을 눈에 보이게 한다
 * (2026-09-05 사용자: "떨어지면 처음부터 다시 시작하잖아. 이때 텔레포트 같은 모션 넣어줄수있어?").
 *
 * 여태 그 구간은 화면에 아무것도 없었다. 바닥에 닿으면 600ms(PLATFORM_RESPAWN_MS) 동안 입력만 잠기고,
 * 그 다음 프레임에 몸이 출발 발판 위로 **툭 바뀌었다**. 옮겨진 것이 아니라 화면이 튄 것처럼 보인다.
 *
 * 그래서 두 토막으로 나눈다. 회수(out)는 떨어진 자리에서 몸이 가늘어지며 빨려 올라가고, 도착(in)은 출발 발판
 * 위로 빛기둥이 내려꽂히며 몸이 다시 선다. **회수 시간은 여기서 안 정한다** — 게임이 정한 돌아가기 시간
 * (PLATFORM_RESPAWN_MS) 그대로다. 연출이 게임보다 길면 몸이 이미 저쪽에 서 있는데 여기서 아직 사라지는 중이 된다.
 *
 * world/core/WorldState · scene/platformState 와 같은 가변 싱글턴 규칙이다. 그리는 쪽은 Warp.tsx(빛기둥),
 * 몸을 줄이는 쪽은 SelfAvatar(내 몸) · PlatformScene 의 PlatformBot(AI 좌석)이다 — 둘 다 프레임마다 여기 묻는다.
 *
 * 광원은 하나도 안 쓴다 — 발광 재질(MeshBasicMaterial)뿐이다. 홀에서 광원 수가 바뀌면 셰이더가 통째로 다시
 * 링크돼 그 프레임이 통으로 멈춘다 (PlatformCourse 머리말의 작업등과 같은 이유).
 */
import { PLATFORM_RESPAWN_MS } from '@/world/mp/platform';

/** 내 몸의 열쇠 — 좌석 번호가 아니다. 내 몸은 언제나 하나다 */
export const SELF_WARP = '@me';

/** 회수 — 떨어져 있는 동안이다. 돌아가기까지의 그 시간을 꽉 채워 쓴다 */
export const WARP_OUT_MS = PLATFORM_RESPAWN_MS;
/** 도착 — 발판 위에 다시 서기까지 */
export const WARP_IN_MS = 420;

export type WarpKind = 'out' | 'in';

export interface WarpBeam {
  key: string;
  kind: WarpKind;
  /** 시작 시각 (Date.now 기준 — 발판·라운드와 같은 시계) */
  at: number;
  x: number;
  y: number;
  z: number;
}

/** 몸을 얼마나 줄일까 — 가로(xz) · 세로(y) 배율과 띄울 높이(m) */
export interface WarpBody {
  xz: number;
  y: number;
  lift: number;
}

const STILL: WarpBody = { xz: 1, y: 1, lift: 0 };

const live = new Map<string, WarpBeam>();
/** 프레임마다 새 배열을 만들지 않는다 — 그리는 쪽이 그때그때 읽고 버린다 */
const shown: WarpBeam[] = [];

function durOf(kind: WarpKind): number {
  return kind === 'out' ? WARP_OUT_MS : WARP_IN_MS;
}

/** 0(시작) ~ 1(끝) */
function progress(b: WarpBeam, now: number): number {
  const k = (now - b.at) / durOf(b.kind);
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

export const warp = {
  /**
   * 기둥 하나를 건다. 같은 열쇠로 다시 걸면 앞의 것을 덮는다 — 회수 다음에 도착이 오는 것이 정상이다.
   * 몸을 줄이려면 그 몸의 열쇠로 걸어야 한다 (내 몸은 SELF_WARP, AI 좌석은 좌석 id).
   *
   * **`at` 은 앞날이어도 된다** — 그때까지 이 기둥은 없는 것과 같다(안 그려지고 몸도 안 줄인다). 서버가 세우는
   * 게임(회전 원판 · 무게 중심 다리 · 무너지는 타워)이 그렇게 건다: 그쪽은 떨어진 자리에 2~3초를 누워 있는데
   * 회수는 다시 서기 직전에만 돌아야 해서, 걸어 두고 때를 기다린다 (trial/games/common/fallWarp.ts).
   */
  beam(key: string, kind: WarpKind, x: number, y: number, z: number, now = Date.now()): void {
    live.set(key, { key, kind, at: now, x, y, z });
  },
  /**
   * 지금 그릴 기둥들. 다 끝난 도착은 여기서 지운다 —
   * **회수는 안 지운다.** 회수가 끝나는 시각과 몸이 옮겨지는 시각은 같은 600ms 인데, 프레임이 그 사이에 끼면
   * 한 프레임 동안 몸이 원래 크기로 되돌아왔다가 사라진다. 회수는 도착이 덮어 주거나 clear 로만 끝난다.
   */
  beams(now = Date.now()): readonly WarpBeam[] {
    shown.length = 0;
    for (const b of live.values()) {
      if (now < b.at) continue; // 아직 때가 아니다 (beam 머리말)
      const k = progress(b, now);
      if (k >= 1) {
        if (b.kind === 'in') live.delete(b.key);
        continue;
      }
      shown.push(b);
    }
    return shown;
  },
  /** 그 몸을 지금 얼마나 줄여 그릴까 — 걸린 것이 없으면 원래 크기 */
  bodyAt(key: string, now = Date.now()): WarpBody {
    const b = live.get(key);
    if (!b || now < b.at) return STILL;
    const k = progress(b, now);
    if (b.kind === 'out') {
      // 가로는 빠르게 좁아지고, 세로는 늘어났다가(빨려 올라간다) 마지막에 접힌다
      const xz = Math.pow(1 - k, 1.4);
      const y = k < 0.75 ? 1 + 0.6 * (k / 0.75) : 1.6 * Math.pow(1 - (k - 0.75) / 0.25, 1.2);
      return { xz, y, lift: 0.9 * k * k };
    }
    // 도착 — 늘어난 채로 내려와 제 크기로 선다
    const xz = 1 - Math.pow(1 - k, 3);
    return { xz, y: 1 + 0.5 * Math.pow(1 - k, 2), lift: 0.35 * Math.pow(1 - k, 2) };
  },
  clear(): void {
    live.clear();
    shown.length = 0;
  },
};
