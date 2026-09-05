/**
 * 떨어졌다 다시 서는 그 몇 초를 **순간이동으로 보여 준다** — 회전 원판 · 무게 중심 다리 · 무너지는 타워가 같이 쓴다
 * (2026-09-05 사용자: 움직이는 플랫폼에 넣은 그 텔레포트를 이 셋에도).
 *
 * 연출 자체는 발판 게임의 것 그대로다 (interrogation/scene/warp.ts · WarpFx.tsx) — 회수(out)는 떨어진 자리에서
 * 몸이 가늘어지며 빨려 올라가고, 도착(in)은 다시 서는 자리로 빛기둥이 내려꽂힌다. **거는 시각만 다르다.**
 *
 *   · 발판 게임은 클라이언트가 스스로 떨어뜨리고 되돌려서 두 순간을 그 자리에서 알았다 (FreeRig).
 *     이 셋은 **서버가 세운다** — 화면이 아는 것은 스냅샷의 「누웠다(f)」뿐이고, 다시 서는 순간은 몸이 이미
 *     옮겨진 뒤에야 온다. 그래서 회수는 **다시 서기 직전 600ms 에** 걸어 둔다(warp.beam 의 at 은 앞날이어도 된다):
 *     누운 시각에 그 게임의 다시서기 시간(2~3초)을 더하면 언제 일어설지 알기 때문이다.
 *   · 떨어지자마자 빨아올리지 않는 이유 — 이 셋은 눕는 시간이 발판 게임의 네 배가 넘는다(0.6초 대 2~3초).
 *     그때 바로 회수하면 남은 두 초가 빈 바닥이 된다. **누워 있는 것도 이 게임들이 보여 주려는 것이다**
 *     (원판 밖으로 미끄러져 나갔다 · 판 끝에서 떨어졌다 · 발판이 꺼져 바닥에 떨어졌다).
 *   · 남의 몸은 스냅샷보다 한 박자 늦게 그려지므로(discState 의 DELAY_MS), 기둥도 그만큼 늦게 세운다 —
 *     스냅샷 시각에 세우면 기둥이 몸보다 먼저 선다. 내 몸은 예측이라 지연이 없다(delayMs 0).
 */
import { WARP_OUT_MS, warp } from '@/features/interrogation/scene/warp';

/**
 * 회수가 다 돌았는데 그 몸이 아직 누워 있으면 이만큼 기다렸다 **다시 건다.**
 * 무너지는 타워만 다시서기 시각이 어긋날 수 있다 — 설 만한 발판이 없으면 서버가 respawn 을 미룬다
 * (worker/src/trial/tower/engine.ts). 그때 회수만 끝내 두면 몸이 안 보이는 채로 바닥에 남는다.
 */
const RETRY_MS = 900;

export interface FallWarp {
  /**
   * 이 몸의 지금. 남의 몸은 스냅샷마다, 내 몸은 프레임마다 부른다 — 같은 것을 여러 번 불러도 탈이 없다.
   * @param key 몸의 열쇠 — 내 몸은 SELF_WARP, 남은 좌석 id (warp.bodyAt 이 그 열쇠로 몸을 줄인다)
   * @param fallen 지금 누워 있나 (원판·다리는 f=1, 타워는 바닥에 누움 f=2 — 떨어지는 중은 아직 아니다)
   * @param x,y,z 지금 그 몸의 월드 자리
   */
  seen(key: string, fallen: boolean, x: number, y: number, z: number, now?: number): void;
  /** 판이 끝났다 — 걸린 기둥과 기억을 다 버린다. 누운 채로 판이 끝나면 덮어 줄 도착이 영영 안 온다 (warp.clear 머리말) */
  clear(): void;
}

/**
 * @param respawnMs 그 게임이 다시 세워 주기까지의 시간 (DISC_RESPAWN_MS · SEESAW_RESPAWN_MS · TOWER_RESPAWN_MS)
 * @param delayMs 화면이 그 몸을 얼마나 늦게 그리나 — 기둥도 같이 늦춘다 (머리말)
 */
export function makeFallWarp(respawnMs: number, delayMs = 0): FallWarp {
  /** 몸마다 — 누웠나 · 회수를 언제로 걸어 뒀나 */
  const tracks = new Map<string, { fallen: boolean; outAt: number }>();
  /** 눕고서 회수가 돌기까지 — 이 시간은 누워 있는 그림이다 */
  const wait = Math.max(0, respawnMs - WARP_OUT_MS);
  return {
    seen(key, fallen, x, y, z, now = Date.now()) {
      const at = now + delayMs;
      let t = tracks.get(key);
      if (!t) {
        t = { fallen: false, outAt: 0 };
        tracks.set(key, t);
      }
      if (!fallen) {
        // 다시 섰다 — 도착. 걸려 있던 회수를 이 기둥이 덮는다 (warp.beam 은 같은 열쇠를 덮어쓴다)
        if (t.fallen) warp.beam(key, 'in', x, y, z, at);
        t.fallen = false;
        return;
      }
      if (!t.fallen) t.outAt = at + wait;
      else if (at > t.outAt + WARP_OUT_MS + RETRY_MS) t.outAt = at + RETRY_MS; // 아직도 누워 있다 (RETRY_MS 머리말)
      t.fallen = true;
      /*
       * 누워 있는 동안 **자리가 바뀌기도 한다** — 원판 밖으로 튕겨 나가 미끄러지다 멎는다. 그래서 스냅샷마다
       * 다시 건다: 열쇠도 시각도 그대로라 이미 돌고 있는 회수가 처음부터 다시 돌지는 않는다
       */
      warp.beam(key, 'out', x, y, z, t.outAt);
    },
    clear() {
      tracks.clear();
      warp.clear();
    },
  };
}
