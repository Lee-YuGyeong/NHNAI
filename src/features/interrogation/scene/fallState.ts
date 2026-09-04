/**
 * 낙하 생존의 화면 상태 — 서버 스냅샷(trial_snapshot, ~10Hz)을 받아 두고 프레임마다 두 스냅샷 사이를 보간한다.
 * 클라는 물체를 스스로 떨어뜨리지 않는다 (중력값이 없다 — P8). world/core/WorldState 와 같은 가변 Map 규칙.
 */

interface ObjSample {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface Obj {
  id: number;
  /** 공의 종류 — mp/constants 의 FALL_BALLS 인덱스 (공개 표). 크기만 여기서 쓴다 */
  k: number;
  prev: ObjSample;
  next: ObjSample;
  /** 마지막 스냅샷에 있었나 — 없으면 착지 후 치워진 것이다 */
  alive: boolean;
}

const objects = new Map<number, Obj>();
/** 서버 시각과 이 브라우저의 performance.now() 사이의 차 — 첫 스냅샷에서 잡고 그 뒤로 조금씩 따라간다 */
let offset: number | null = null;

export const fallState = {
  clear(): void {
    objects.clear();
    offset = null;
  },
  snapshot(at: number, list: { id: number; k?: number; x: number; y: number; z: number }[]): void {
    const now = performance.now();
    const est = now - at;
    offset = offset === null ? est : offset + (est - offset) * 0.1;
    const seen = new Set<number>();
    for (const o of list) {
      seen.add(o.id);
      const cur = objects.get(o.id);
      const s: ObjSample = { t: at, x: o.x, y: o.y, z: o.z };
      if (!cur) objects.set(o.id, { id: o.id, k: o.k ?? 0, prev: s, next: s, alive: true });
      else {
        cur.prev = cur.next;
        cur.next = s;
        cur.alive = true;
      }
    }
    for (const o of objects.values()) if (!seen.has(o.id)) objects.delete(o.id);
  },
  /** 프레임마다 — 지금 그릴 자리를 out 에 채운다. 돌려주는 값은 개수 */
  poses(out: { x: number; y: number; z: number; k: number }[]): number {
    if (offset === null) return 0;
    // 스냅샷 한 칸(100ms)만큼 과거를 그린다 — 최신 샘플을 바로 그리면 패킷이 늦을 때마다 튄다
    const serverNow = performance.now() - offset - 120;
    let n = 0;
    for (const o of objects.values()) {
      const span = Math.max(1, o.next.t - o.prev.t);
      const u = Math.max(0, Math.min(1, (serverNow - o.prev.t) / span));
      const p = out[n] ?? (out[n] = { x: 0, y: 0, z: 0, k: 0 });
      p.k = o.k;
      p.x = o.prev.x + (o.next.x - o.prev.x) * u;
      p.y = o.prev.y + (o.next.y - o.prev.y) * u;
      p.z = o.prev.z + (o.next.z - o.prev.z) * u;
      n += 1;
    }
    return n;
  },
};
