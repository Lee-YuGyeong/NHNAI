/**
 * 응시 규칙 — 「가운데에 두고, 벽 앞에서, 가까이서, 잠깐 본다」가 넷 다 지켜지는가.
 *
 * 여기 있는 자리는 전부 맵(SPAWN2 · MURAL_OF · ARCHIVE_PATH)에서 받는다 — 벽의 좌표가 바뀌어도 시험은 같은 것을 묻는다:
 * 스폰에서 복도 끝을 보는 동안 아무것도 안 들고, 벽 뒷면의 그림은 안 들고, 정면 2.5 m 는 들고, 화면 가장자리는 안 들고,
 * probe 가 완료 표시를 남기는 동안은 시간이 안 쌓인다. 카메라는 앱과 같은 값(BASE_FOV 60 · 16:9 · EYE_HEIGHT)이다.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { ARCHIVE_TARGETS } from '../../../src/features/world2/ArchiveWall';
import {
  advanceGaze,
  CORRIDOR_TARGETS,
  GAZE_FRONT,
  GAZE_HOLD,
  GAZE_NDC,
  GAZE_REACH,
  MURAL_OF,
  pickGaze,
  wallNormal,
  type GazeCamera,
  type GazeHold,
  type GazeTarget,
} from '../../../src/features/world2/Murals';
import { lexicon } from '../../../src/features/world2/lexicon';
import { BASE_FOV } from '../../../src/world/input/input';
import { WALL_ROT } from '../../../src/world/map/scifi';
import { EYE_HEIGHT } from '../../../src/world/mp/constants';
import { ARCHIVE_PATH, archiveAtExit } from '../../../src/world2/map/archive';
import { CORRIDOR2_FOCUS, CORRIDOR2_PATH } from '../../../src/world2/map/corridor';
import { SPAWN2 } from '../../../src/world2/map/index';

/** 앱의 카메라 그대로 — 자리에 서서 한 점을 본다 */
function cameraAt(pos: { x: number; z: number }, look: { x: number; y: number; z: number }, y = EYE_HEIGHT): GazeCamera {
  const cam = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 0.1, 100);
  cam.position.set(pos.x, y, pos.z);
  cam.lookAt(look.x, look.y, look.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  const v = new THREE.Vector3();
  return {
    pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
    fwd: { x: fwd.x, z: fwd.z },
    project: (x, y2, z) => {
      v.set(x, y2, z).project(cam);
      return v.z > 1 || v.z < -1 ? null : { x: v.x, y: v.y };
    },
  };
}

/** 중심선 위에서 앵커에 가장 가까운 점 — 그 벽 앞의 통로 */
function nearestOnPath(t: { x: number; z: number }): { x: number; z: number } {
  let best = { x: 0, z: 0 };
  let bd = Infinity;
  for (let i = 0; i + 1 < CORRIDOR2_PATH.length; i++) {
    const a = CORRIDOR2_PATH[i];
    const b = CORRIDOR2_PATH[i + 1];
    const ax = b.x - a.x;
    const az = b.z - a.z;
    const len2 = ax * ax + az * az || 1;
    const u = Math.max(0, Math.min(1, ((t.x - a.x) * ax + (t.z - a.z) * az) / len2));
    const p = { x: a.x + ax * u, z: a.z + az * u };
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

const byId = (id: string) => CORRIDOR_TARGETS.find((t) => t.id === id) as GazeTarget;
/** 앵커에서 법선 방향으로 d 만큼 나온 자리 (d < 0 이면 벽 뒤) */
const front = (t: GazeTarget, d: number) => ({ x: t.x + t.nx * d, z: t.z + t.nz * d });
/** 모든 것을 「아직 안 봤다」로 — 저장소가 아니라 기하만 묻는 시험이므로 */
const fresh = (ts: readonly GazeTarget[]) => ts.map((t) => ({ ...t, active: undefined }));
const CORRIDOR = fresh(CORRIDOR_TARGETS);

describe('wallNormal — WallAnchor.rotY 에서 방 안쪽 법선', () => {
  it('WALL_ROT 규약: right(x+) → (−1,0) · left → (1,0) · far(z−) → (0,1) · near → (0,−1)', () => {
    const r = wallNormal(WALL_ROT.right);
    expect(r.nx).toBeCloseTo(-1);
    expect(r.nz).toBeCloseTo(0);
    const l = wallNormal(WALL_ROT.left);
    expect(l.nx).toBeCloseTo(1);
    const f = wallNormal(WALL_ROT.far);
    expect(f.nz).toBeCloseTo(1);
    const n = wallNormal(WALL_ROT.near);
    expect(n.nz).toBeCloseTo(-1);
  });

  it('복도의 여섯 장 · 단말 — 중심선(CORRIDOR2_PATH)에서 가장 가까운 점이 그 벽 앞에 있다: (path − anchor)·n > 0', () => {
    for (const t of CORRIDOR_TARGETS) {
      const c = nearestOnPath(t);
      expect((c.x - t.x) * t.nx + (c.z - t.z) * t.nz, t.id).toBeGreaterThan(GAZE_FRONT.minOff);
      expect(Math.hypot(t.nx, t.nz), t.id).toBeCloseTo(1);
    }
  });

  it('기록 복도 셋 — 중심선에서 반 걸음 못 미친 자리(문 반경 밖)에서 정면으로 보면 든다', () => {
    for (const t of ARCHIVE_TARGETS) {
      const s = ARCHIVE_PATH.progress(t.x, t.z);
      const spot = ARCHIVE_PATH.point(s - 0.5);
      // 나가는 문 곁의 메모 — 읽는 자리가 문 반경 안이면 읽기 전에 방이 넘어간다
      expect(archiveAtExit(spot.x, spot.z), t.id).toBe(false);
      const cam = cameraAt(spot, { x: t.x, y: t.y, z: t.z });
      expect(pickGaze(cam, fresh(ARCHIVE_TARGETS))?.id, t.id).toBe(t.id);
    }
  });

  it('기록 복도 셋 — 같은 s 의 중심선이 그 벽 앞 0.3 m 밖에 있고 reach 안이다', () => {
    for (const t of ARCHIVE_TARGETS) {
      const s = ARCHIVE_PATH.progress(t.x, t.z);
      const c = ARCHIVE_PATH.point(s);
      expect((c.x - t.x) * t.nx + (c.z - t.z) * t.nz, t.id).toBeGreaterThanOrEqual(GAZE_FRONT.minOff);
      expect(Math.hypot(c.x - t.x, c.z - t.z), t.id).toBeLessThanOrEqual(t.reach);
    }
  });
});

describe('pickGaze — 후보 조건 넷', () => {
  it('스폰에서 복도 끝(CORRIDOR2_FOCUS)을 보는 동안은 아무것도 안 든다', () => {
    const cam = cameraAt(SPAWN2.corridor, CORRIDOR2_FOCUS);
    expect(pickGaze(cam, CORRIDOR)).toBeNull();
  });

  it('벽 뒷면 — resting 의 벽 뒤 3.5 m 에서 그 벽을 향해 봐도 안 든다', () => {
    const t = byId('resting');
    const behind = front(t, -3.5);
    const cam: GazeCamera = { pos: { ...behind, y: EYE_HEIGHT }, fwd: { x: t.nx, z: t.nz }, project: () => ({ x: 0, y: 0 }) };
    expect(pickGaze(cam, CORRIDOR)).toBeNull();
    // 같은 거리, 벽 앞이면 든다 — 뒷면 제외가 거리 때문이 아님을 잡아 둔다
    const ahead = cameraAt(front(t, 3.5), { x: t.x, y: t.y, z: t.z });
    expect(pickGaze(ahead, CORRIDOR)?.id).toBe('resting');
  });

  it('carry 정면 2.5 m 에서 그 그림을 보면 carry 가 든다 — 옆에 걸린 memorial 이 아니라', () => {
    const t = byId('carry');
    const cam = cameraAt(front(t, 2.5), { x: t.x, y: t.y, z: t.z });
    expect(pickGaze(cam, CORRIDOR)?.id).toBe('carry');
  });

  it('화면 가장자리 — 앵커가 NDC x 0.6 에 걸리면 안 든다', () => {
    const t = byId('carry');
    const cam: GazeCamera = { pos: { ...front(t, 2.5), y: EYE_HEIGHT }, fwd: { x: -t.nx, z: -t.nz }, project: () => ({ x: 0.6, y: 0 }) };
    expect(pickGaze(cam, CORRIDOR)).toBeNull();
    const edgeY: GazeCamera = { ...cam, project: () => ({ x: 0, y: GAZE_NDC.y + 0.05 }) };
    expect(pickGaze(edgeY, CORRIDOR)).toBeNull();
    const inside: GazeCamera = { ...cam, project: () => ({ x: GAZE_NDC.x - 0.01, y: 0 }) };
    expect(pickGaze(inside, CORRIDOR)?.id).toBe('carry');
  });

  it('발밑을 보며 지나가면 안 든다 — 앵커가 화면 위로 나간다', () => {
    const t = byId('carry');
    const p = front(t, 2.5);
    const cam = cameraAt(p, { x: p.x - t.nx, y: 0.2, z: p.z - t.nz });
    expect(pickGaze(cam, CORRIDOR)).toBeNull();
  });

  it('옆으로 스치며 보면 안 든다 — 시선이 벽과 40° 넘게 어긋난다', () => {
    const t = byId('carry');
    const p = front(t, 2.0);
    // 벽과 나란히(법선에 수직) 본다
    const cam: GazeCamera = { pos: { ...p, y: EYE_HEIGHT }, fwd: { x: -t.nz, z: t.nx }, project: () => ({ x: 0, y: 0 }) };
    expect(pickGaze(cam, CORRIDOR)).toBeNull();
  });

  it('거리 — beating 만 5 m, 나머지는 4.6 m: 4.8 m 정면에서 beating 은 들고 carry 는 안 든다 (복도를 넓히며 3.6 → 4.6)', () => {
    for (const [id, want] of [
      ['beating', 'beating'],
      ['carry', null],
    ] as const) {
      const t = byId(id);
      const cam = cameraAt(front(t, 4.8), { x: t.x, y: t.y, z: t.z });
      expect(pickGaze(cam, CORRIDOR)?.id ?? null, id).toBe(want);
    }
    expect(byId('beating').reach).toBe(GAZE_REACH.story);
    expect(byId('carry').reach).toBe(GAZE_REACH.picture);
    expect(ARCHIVE_TARGETS.find((t) => t.id === 'memoRest')?.reach).toBe(GAZE_REACH.memo);
  });

  it('둘이 창 안에 들면 중앙에 가까운 하나', () => {
    const a = byId('memorial');
    const b = byId('window');
    const mid = { x: (a.x + b.x) / 2 + a.nx * 2.2, z: (a.z + b.z) / 2 + a.nz * 2.2 };
    const cam: GazeCamera = {
      pos: { ...mid, y: EYE_HEIGHT },
      fwd: { x: -a.nx, z: -a.nz },
      project: (x, _y, z) => (Math.abs(x - a.x) + Math.abs(z - a.z) < 1e-6 ? { x: 0.05, y: 0 } : { x: -0.1, y: 0 }),
    };
    expect(pickGaze(cam, CORRIDOR)?.id).toBe('memorial');
  });

  it('이미 본 것(active false)은 안 든다', () => {
    const t = byId('carry');
    const cam = cameraAt(front(t, 2.5), { x: t.x, y: t.y, z: t.z });
    const seen = CORRIDOR.map((x) => (x.id === 'carry' ? { ...x, active: () => false } : x));
    expect(pickGaze(cam, seen)).toBeNull();
  });

  it('이야기 벽(beating)은 각인을 한 번 보면 후보에서 빠진다 — has() 가 늘 false 라도', () => {
    lexicon.reset();
    const t = byId('beating');
    const cam = cameraAt(front(t, 2.5), { x: t.x, y: t.y, z: t.z });
    expect(pickGaze(cam, CORRIDOR_TARGETS)?.id).toBe('beating');
    lexicon.sawInscription();
    expect(lexicon.has('beating')).toBe(false);
    expect(t.active?.()).toBe(false);
    expect(pickGaze(cam, CORRIDOR_TARGETS)).toBeNull();
    lexicon.reset();
  });

  it('MURAL_OF 와 대상의 법선이 같은 벽을 가리킨다 — 앵커 rotY 에서 나온 것', () => {
    for (const t of CORRIDOR_TARGETS) {
      if (t.id === 'tag') continue;
      const at = MURAL_OF[t.id as keyof typeof MURAL_OF];
      const n = wallNormal(at.rotY);
      expect(t.nx).toBeCloseTo(n.nx);
      expect(t.nz).toBeCloseTo(n.nz);
    }
  });
});

describe('advanceGaze — 연속으로 붙잡기', () => {
  const carry = byId('carry');
  const beating = byId('beating');

  it('hold 만큼 연속으로 보면 fire, 그 전엔 aim', () => {
    const h: GazeHold = { id: '', t: 0 };
    for (let i = 0; i < 8; i++) expect(advanceGaze(h, carry, 0.1, false)).toBe('aim');
    expect(h.t).toBeCloseTo(0.8);
    // 0.1 × 9 는 부동소수점으로 0.9 에 조금 못 미칠 수 있다 — 아홉이나 열 프레임째에 연다
    const r9 = advanceGaze(h, carry, 0.1, false);
    expect(r9 === 'fire' ? 'fire' : advanceGaze(h, carry, 0.1, false)).toBe('fire');
    expect(h.id).toBe('');
    expect(h.t).toBe(0);
    expect(carry.hold).toBe(GAZE_HOLD.other);
    expect(beating.hold).toBe(GAZE_HOLD.story);
  });

  it('대상이 바뀌면 처음부터, 없어지면 리셋', () => {
    const h: GazeHold = { id: '', t: 0 };
    advanceGaze(h, carry, 0.1, false);
    expect(advanceGaze(h, beating, 0.1, false)).toBe('aim');
    expect(h.id).toBe('beating');
    expect(h.t).toBeCloseTo(0.1);
    expect(advanceGaze(h, null, 0.1, false)).toBe('none');
    expect(h.t).toBe(0);
  });

  it('probe 가 done 인 동안(frozen)은 시간을 안 쌓는다 — 둘째 장이 눈금 없이 열리지 않게', () => {
    const h: GazeHold = { id: '', t: 0 };
    for (let i = 0; i < 20; i++) expect(advanceGaze(h, carry, 0.1, true)).toBe('aim');
    expect(h.t).toBe(0);
    expect(h.id).toBe('carry');
    // 풀리면 그때부터 센다
    advanceGaze(h, carry, 0.1, false);
    expect(h.t).toBeCloseTo(0.1);
  });

  it('한 프레임이 길어도 0.1 초까지만 — 탭 전환 뒤 한 번에 열리지 않게', () => {
    const h: GazeHold = { id: '', t: 0 };
    expect(advanceGaze(h, carry, 5, false)).toBe('aim');
    expect(h.t).toBeCloseTo(0.1);
  });
});
