/**
 * 몸끼리 겹치지 않게 떼어 놓는다 — **로봇은 로봇을 통과하지 않는다** (2026-09-01 사용자 요청).
 *
 * 경로(lab/arena 의 pathFor)는 **가구만** 피한다. 남의 몸은 안 보므로, 배회하다가도 시행 중에도
 * 개체들은 서로를 관통해 지나갔다. 여기서 프레임마다 겹친 만큼만 되민다 (군중 시뮬레이션의 separation).
 *
 * ★ **비키는 쪽은 걷는 쪽이다.** 선 몸은 안 밀린다 — 시행에는 「시작 자리에서 0.6m 넘게 벗어나지
 *   마라」 같은 판이 있어서(lab/quick 의 still), 가만히 선 개체를 지나가던 개체가 밀면
 *   **제자리에 있고도 걸어 나간 것으로 기록된다.** 처형판이면 그걸로 애먼 몸이 죽는다.
 *
 * three 를 끌어오지 않는 순수 파일이다 — 몸 반지름만 3D 쪽(arena3d)에서 그대로 가져온다.
 * 배럴(@/arena3d)이 아니라 보관소를 직접 여는 것은 그쪽이 씬·아바타까지 딸려 오기 때문이다.
 */

import { BODY_GAP } from '@/arena3d/net/remote-players';
import { ARENA, type Obstacle, type Pt } from '@/lab/arena';

/**
 * 두 몸의 중심이 이보다 가까우면 겹쳐 보인다 — 몸 반지름(arena3d 의 BODY_R 0.43)의 두 배.
 * 씬이 **나를** 로봇 밖으로 미는 값과 같은 수다 (remotePlayers.pushOut) — 한쪽만 크면 서로 밀며 떤다.
 */
export const BOT_GAP = BODY_GAP;

/**
 * 밀어내기가 보는 몸 하나.
 * `moving` — 이 프레임에 걷고 있나. `fixed` — 여기서 절대 안 옮기는 몸(= 나. 내 몸은 씬이 쥐고 있다).
 */
export interface Solid {
  p: Pt;
  moving: boolean;
  fixed?: boolean;
}

/** 밀린 자리가 판 안이고 가구 밖일 때만 옮긴다 — 밀다가 벽을 뚫거나 콘솔 속에 박히면 안 된다 */
export function nudge(w: Pt, dx: number, dz: number, keepOut: readonly Obstacle[]): void {
  const x = Math.min(ARENA.maxX - 0.6, Math.max(ARENA.minX + 0.6, w.x + dx));
  const z = Math.min(ARENA.maxZ - 0.6, Math.max(ARENA.minZ + 0.6, w.z + dz));
  if (keepOut.some((o) => Math.abs(x - o.x) < o.hw + 0.4 && Math.abs(z - o.z) < o.hd + 0.4)) return;
  w.x = x;
  w.z = z;
}

/**
 * 겹친 쌍을 떼어 놓는다 — 경로는 그대로 두므로 목적지는 잃지 않는다.
 * 여섯이면 열다섯 쌍이라 프레임마다 돌려도 싸다. 완전히 겹친 순간(거리 0)에는 0 으로 나누지 않게
 * 정해진 방향으로 가른다.
 *
 * 물러날 몫은 걷는 쪽이 다 진다. 둘 다 걷는 중이면 절반씩 나누고, 둘 다 서 있으면
 * (겹친 채 도착했다) 그때만 양쪽을 가른다. `fixed` 는 어떤 경우에도 안 움직이고,
 * **fixed 가 선 몸을 밀지도 않는다** — 그쪽은 씬이 제 몸을 빼내는 것으로 푼다.
 */
export function separateBots(ws: readonly Solid[], keepOut: readonly Obstacle[]): void {
  for (let i = 0; i < ws.length; i += 1) {
    for (let j = i + 1; j < ws.length; j += 1) {
      const a = ws[i];
      const b = ws[j];
      if (a.fixed && b.fixed) continue;
      let dx = b.p.x - a.p.x;
      let dz = b.p.z - a.p.z;
      let d = Math.hypot(dx, dz);
      if (d >= BOT_GAP) continue;
      /*
       * 벌려야 할 폭은 **실제 거리**로 잰다. 아래에서 완전히 겹친 경우의 d 를 1 로 갈아 끼우는데,
       * 그 값으로 폭까지 재면 push 가 음수가 돼 **서로를 끌어당겼다** (한 점에 포개진 몸이
       * 안 떨어졌다). 아래 d 는 방향을 단위 벡터로 만드는 데만 쓴다.
       */
      const overlap = BOT_GAP - d;
      if (d < 1e-4) {
        dx = Math.cos(i * 2.4);
        dz = Math.sin(i * 2.4);
        d = 1;
      }
      const ma = a.fixed ? 0 : a.moving ? 1 : 0;
      const mb = b.fixed ? 0 : b.moving ? 1 : 0;
      /*
       * 둘 다 선 채로 겹쳤는데 한쪽이 fixed(= 나) 라면 **아무도 안 옮긴다.**
       * 여기서 선 몸을 밀면 내가 몸으로 개체를 떠미는 것이 되고, 「부동자세」(처형판)에서는
       * 그렇게 밀린 0.6m 가 그 개체의 폐기 사유가 된다 — 내가 손 하나 안 대고 죽이는 길이 열린다.
       * 내가 개체 속으로 걸어 들어간 경우는 씬이 나를 빼낸다 (arena3d 의 remotePlayers.pushOut).
       */
      if (ma + mb === 0 && (a.fixed || b.fixed)) continue;
      const ka = ma + mb > 0 ? ma / (ma + mb) : 0.5;
      const kb = ma + mb > 0 ? mb / (ma + mb) : 0.5;
      const ux = (dx / d) * overlap;
      const uz = (dz / d) * overlap;
      if (ka > 0) nudge(a.p, -ux * ka, -uz * ka, keepOut);
      if (kb > 0) nudge(b.p, ux * kb, uz * kb, keepOut);
    }
  }
}
