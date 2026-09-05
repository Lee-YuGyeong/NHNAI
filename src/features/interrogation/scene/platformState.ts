/**
 * 움직이는 플랫폼의 화면 상태 — 라운드 시작(trial_round_start 의 startAt · pace)을 받아 두고, 프레임마다 발판의 자리를
 * mp/platform.ts 의 **서버와 같은 함수**로 계산한다. 스냅샷을 기다리지 않는다 — 발판은 초당 2m 까지 움직여서
 * 보간 지연만큼 늦게 그리면 중앙 착지가 운이 된다 (platform.ts 머리말).
 *
 * 시계: 서버 startAt(Date.now 기준)과 이 브라우저의 시계 차는 정지선(runnerState)과 같이 「거의 맞다」고 본다.
 * 다리(FreeRig)는 여기서 바닥 높이와 발판이 나를 실어 나르는 이동분을 묻고, 아바타는 「공중인가」를 여기서 묻는다.
 * world/core/WorldState 와 같은 가변 싱글턴 규칙.
 */
import { PAD_FINISH, PAD_START_Z, PAD_TOP, PLATFORM_TELEPORT_M, padAt, padUnder, platformGroundAt, type PadPose } from '@/world/mp/platform';
import { warp } from './warp';

interface PlatformRound {
  startAt: number;
  pace: number;
  /** 출발 발판 위 내 자리 — 떨어지면 여기로 돌아간다 (2026-09-05 사용자) */
  home: { x: number; z: number };
  /** 도착 발판에 내렸다 — 남은 시간은 거기서 기다린다 (다리가 입력을 안 받는다) */
  finished: boolean;
  /** 바닥에 떨어진 시각 — PLATFORM_RESPAWN_MS 뒤 home 으로 */
  fellAt: number | null;
  /**
   * 착지 미끄러짐 — 서버가 `trial_slip` 으로 준 것(발판에 **대한** 속도 m/s 와 0 까지 잦아드는 시각).
   * 발판 윗면의 마찰계수는 여기 없다(P8) — 곱셈이 끝난 결과만 온다
   */
  slip: { vx: number; vz: number; at: number; until: number } | null;
}

let round: PlatformRound | null = null;

interface BotSample {
  t: number;
  x: number;
  z: number;
  y: number;
}
/** /trial 시험 화면의 봇 — 스냅샷(10Hz, y 포함) 두 장 사이를 보간한다. 검문소는 remotePlayers 로 가므로 안 쓴다 */
const bots = new Map<string, { prev: BotSample; next: BotSample }>();
let botOffset: number | null = null;
const BOT_DELAY_MS = 120;

export interface BotPose {
  x: number;
  z: number;
  y: number;
  moving: boolean;
}

export const platformState = {
  /** 봇 스냅샷(trial_snapshot 의 ai) — /trial 화면용 */
  pushBots(at: number, ai: readonly { id: string; x: number; z: number; y?: number }[]): void {
    const now = performance.now();
    const est = now - at;
    botOffset = botOffset === null ? est : botOffset + (est - botOffset) * 0.1;
    for (const a of ai) {
      const s: BotSample = { t: at, x: a.x, z: a.z, y: a.y ?? 0 };
      const cur = bots.get(a.id);
      if (cur) {
        /*
         * 스냅샷 두 장 사이(100ms)에 이만큼 넘게 옮겨졌으면 걸은 게 아니라 **돌아간 것**이다 — 봇도 바닥에 떨어지면
         * 출발 발판으로 돌아간다 (worker platform/npc.ts, 사람과 같은 규칙). 여태 그 두 자리를 그냥 보간해서,
         * 봇이 마당을 가로질러 0.1초에 미끄러져 갔다. 보간하지 않고 그 자리에 세우고, 사람과 같은 순간이동을 건다
         * (warp.ts). 회수 기둥은 떠난 자리에, 도착 기둥은 새 자리에 — 봇이 언제 떨어졌는지는 화면이 알 수 없으니
         * (스냅샷은 돌아온 뒤에야 그 사실을 알려 준다) 둘을 같은 시각에 세운다.
         */
        if (Math.hypot(s.x - cur.next.x, s.z - cur.next.z) > PLATFORM_TELEPORT_M) {
          warp.beam(`${a.id}:out`, 'out', cur.next.x, cur.next.y, cur.next.z);
          warp.beam(a.id, 'in', s.x, s.y, s.z);
          cur.prev = s;
          cur.next = s;
        } else {
          cur.prev = cur.next;
          cur.next = s;
        }
      } else bots.set(a.id, { prev: s, next: s });
    }
  },
  botAt(id: string, nowPerf = performance.now()): BotPose | null {
    const b = bots.get(id);
    if (!b || botOffset === null) return null;
    const t = nowPerf - botOffset - BOT_DELAY_MS;
    const span = b.next.t - b.prev.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - b.prev.t) / span)) : 1;
    const x = b.prev.x + (b.next.x - b.prev.x) * k;
    const z = b.prev.z + (b.next.z - b.prev.z) * k;
    const y = b.prev.y + (b.next.y - b.prev.y) * k;
    return { x, z, y, moving: Math.hypot(b.next.x - b.prev.x, b.next.z - b.prev.z) > 0.03 };
  },
  /** 라운드가 도는 중인가 — 발판이 있다 */
  get active(): boolean {
    return round !== null;
  },
  get pace(): number {
    return round?.pace ?? 1;
  },
  start(startAt: number, pace: number | undefined, home: { x: number; z: number } = { x: 0, z: PAD_START_Z }): void {
    round = { startAt, pace: pace ?? 1, home, finished: false, fellAt: null, slip: null };
    warp.clear();
  },
  /** 서버가 준 착지 미끄러짐을 건다 (trial_slip). 내 것만 여기 온다 */
  pushSlip(vx: number, vz: number, ms: number, now = Date.now()): void {
    if (round) round.slip = ms > 0 ? { vx, vz, at: now, until: now + ms } : null;
  },
  /** 지금 프레임에 몸을 밀 속도(m/s). 선형으로 잦아든다 — 다 끝나면 null */
  slipAt(now = Date.now()): { x: number; z: number } | null {
    const s = round?.slip;
    if (!s) return null;
    if (now >= s.until) {
      round!.slip = null;
      return null;
    }
    const left = 1 - (now - s.at) / (s.until - s.at);
    return { x: s.vx * left, z: s.vz * left };
  },
  get home(): { x: number; z: number } {
    return round?.home ?? { x: 0, z: PAD_START_Z };
  },
  get finished(): boolean {
    return round?.finished ?? false;
  },
  /** 도착 발판 번호인가 */
  isFinish(k: number): boolean {
    return k === PAD_FINISH;
  },
  finish(): void {
    if (round) round.finished = true;
  },
  get fellAt(): number | null {
    return round?.fellAt ?? null;
  },
  fell(now: number): void {
    if (round && round.fellAt === null) {
      round.fellAt = now;
      round.slip = null; // 바닥에 떨어졌으면 미끄러질 발판이 없다
    }
  },
  /** 돌아갔다 — 넘어짐 시각을 지운다 */
  respawned(): void {
    if (round) round.fellAt = null;
  },
  clear(): void {
    round = null;
    bots.clear();
    botOffset = null;
    /*
     * 순간이동도 같이 끝낸다. 회수(out)는 도착이 덮어 줄 때까지 몸을 0 으로 줄여 두는데(warp.ts), 떨어져 있는
     * 동안 라운드가 끝나면 덮어 줄 도착이 영영 안 온다 — 그러면 다음 판까지 내 몸이 안 보인다
     */
    warp.clear();
  },
  /** 라운드 시작 뒤 흐른 ms */
  elapsed(now = Date.now()): number {
    return round ? now - round.startAt : 0;
  },
  /** 발 높이 y 에서 (x, z) 의 발판 바닥 — 발판 위면 PAD_TOP, 아니면 0. 라운드가 없으면 0 */
  groundAt(x: number, z: number, feetY: number, now = Date.now()): number {
    if (!round) return 0;
    return platformGroundAt(x, z, feetY, now - round.startAt, round.pace);
  },
  /** (x, z) 아래 발판 — 서 있는 발판을 따라가려고 (carry) */
  padUnder(x: number, z: number, now = Date.now()) {
    if (!round) return null;
    return padUnder(x, z, now - round.startAt, round.pace);
  },
  /** 발판 k 의 지금 자리 */
  pad(k: number, now = Date.now()): PadPose {
    return padAt(k, round ? now - round.startAt : 0, round?.pace ?? 1);
  },
  /** 발판 k 가 dtMs 동안 x 로 움직인 거리 — 그 위에 선 몸을 그만큼 실어 나른다 */
  carryX(k: number, now: number, dtMs: number): number {
    if (!round) return 0;
    const a = padAt(k, now - dtMs - round.startAt, round.pace);
    const b = padAt(k, now - round.startAt, round.pace);
    return b.x - a.x;
  },
  PAD_TOP,
};
