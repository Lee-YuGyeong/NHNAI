/**
 * 복도에 걸린 것들 — **벽화 여섯 장과 정비 단말 하나.** 시나리오 2 에서 이 벽은 장식이 아니라 **어휘표**다.
 *
 *   벽화     자는 개체를 봤으면 「쉬어 본 적 있나」가 떠오르고, 창살 안에서 그린 해를 봤으면 「해를 본 적 있나」가 떠오른다.
 *            여기서 본 것만이 뒤에서 개체에게 걸 수 있는 말이 된다 (lexicon.ts) — 관찰이 그대로 어휘가 되는 구조다.
 *            안 보고 지나가도 안쪽으로는 갈 수 있다. 다만 **빈손으로** 간다.
 *   정비 단말  이 몸의 식별번호와 마지막 정비 구역. 대본이 첫 목표로 지목하는 자리이고,
 *            그 둘이 안쪽 검문의 답이다 — 안 읽고 지나가면 안쪽에서 진짜로 모른다 (world/mp/identity).
 *
 * 자리는 **시나리오 2 의 복도**(world2/map/corridor.tsx)가 준다 — 벽화는 맵이 내보낸 꺾임 안쪽 벽의 여섯 자리(MURAL_WALL)에
 * 한 장씩 걸린다. 여기서 ±x 로 자리를 셈하지 않는 이유: 복도가 L 자라 벽이 넷이고, 어느 벽이 「안쪽」인지는 맵만 안다.
 * 좁고 낮은 방이라 그림도 작고 낮게 걸린다: 정면으로 서야 읽히고, 정면으로 서면 통로에 등을 진다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import { probe } from '@/features/world/probe';
import type { ScrawlKind } from '@/features/world/scrawl';
import { series } from '@/shared/series';
import { getTouchMode } from '@/world/input/input';
import { identity } from '@/world/mp/identity';
import { CORRIDOR2_TAG_Z, CORRIDOR2_WALL_X as WALL_X, MURAL_WALL, type WallAnchor } from '@/world2/map/corridor';

import { Scrawl, drawHeight, type Drawing } from './Scrawl';
import { lexicon } from './lexicon';
import { scenario2 } from './scenario2';

interface Mural {
  kind: ScrawlKind;
  at: WallAnchor;
  y: number;
  w: number;
  tilt?: number;
}

/**
 * 벽화 여섯 장 — 설계서가 정한 수 그대로, 맵이 비워 둔 여섯 자리에 안쪽에서 바깥 순서로 건다.
 * 폭은 자리가 허락하는 만큼(span)까지만: 정면으로 서야 한 장이 다 들어오고, 정면으로 서면 통로에 등을 진다.
 *
 * ★ 크기와 높이는 **방을 따라간다** — 6 × 24 · 천장 3 시절의 1.15~1.6 m 짜리를 10 × 40 · 천장 5.6 벽에 그대로 걸었더니
 *   우표만 했다 (2026-09-03 사용자). 폭 1.9~2.05 · 눈높이 1.78~1.95 로 올린다. 폭은 여전히 그 자리의 span 안이다.
 */
const MURALS: readonly Mural[] = [
  // 이야기가 붙은 한 장 — 사람이 몽둥이를 들었다. 가장 안쪽, 나가는 문 곁에
  { kind: 'beating', at: MURAL_WALL[0], y: 1.95, w: 2.05, tilt: -0.012 },
  // 둘째 다리 한가운데 — A-104 가 이 앞에 선다
  { kind: 'danger', at: MURAL_WALL[1], y: 1.8, w: 2.05, tilt: 0.025 },
  { kind: 'resting', at: MURAL_WALL[2], y: 1.85, w: 2.0, tilt: 0.02 },
  // 첫 다리 오른쪽 벽 — A-137 이 제가 그린 이 앞에 선다
  { kind: 'carry', at: MURAL_WALL[3], y: 1.82, w: 2.0, tilt: -0.02 },
  { kind: 'memorial', at: MURAL_WALL[4], y: 1.78, w: 1.9, tilt: 0.03 },
  { kind: 'window', at: MURAL_WALL[5], y: 1.78, w: 1.9, tilt: -0.03 },
];

/** 어느 그림이 어디 걸렸나 — 개체가 제 그림 앞에 서는 자리(Room2Scene)가 읽는다 */
export const MURAL_OF = Object.fromEntries(MURALS.map((m) => [m.kind, m.at])) as Record<
  'beating' | 'danger' | 'resting' | 'carry' | 'memorial' | 'window',
  WallAnchor
>;

/**
 * Scrawl 은 곧은 벽(±x) 기준으로 자리를 잡는다 — 꺾인 벽에는 그룹으로 돌려 세운다.
 * side +1 · wallX 0 이면 판이 그룹 로컬 (−lift, y, 0) 에 rotation.y −π/2 로 서므로, 그룹을 rotY + π/2 돌리면
 * 판의 정면이 벽의 정면(rotY)이 되고 lift 만큼 방 안쪽으로 뜬다. 판 자체는 모듈 수준에 한 번 — Scrawl 이 참조로 메모한다.
 */
const DRAWINGS: readonly { m: Mural; d: Drawing }[] = MURALS.map((m) => ({
  m,
  d: { kind: m.kind, side: 1, z: 0, y: m.y, w: m.w, tilt: m.tilt },
}));

/**
 * 들여다보는 거리 — 본판(Chapter1Scene)은 이야기 벽만 5 m 이고 일반 그림은 3.4 m 다. 여기서도 같은 구분을 둔다:
 * beating 은 objective(OBJ_MOVE_IN)의 문턱이라 5 m 를 유지하고, 나머지 벽화와 기록 복도의 그림은 3.6 m,
 * 긁은 메모는 글자가 작아 2.6 m. 값은 대상이 쥔다(GazeTarget.reach) — 판정 함수는 숫자를 모른다.
 */
/**
 * picture 3.6 → **4.6** (2026-09-03) — 복도가 10 m 로 넓어지며 벽까지가 중심선에서 5 m 가 됐다.
 * 3.6 이면 벽에 거의 붙어야 눈금이 물려서 「거기 뭐가 있는지」조차 안 보인다. 4.6 은 벽에서 한 걸음(0.4 m) 안쪽부터 물리는 값 —
 * **중심선(5.0 m)에서는 여전히 안 물린다**: 벽 앞으로 걸어가 통로에 등을 지는 것이 이 게임에서 「본다」의 값이다 (설계 01).
 * story(기록 복도) · memo 는 그 방들이 안 넓어졌으므로 그대로다.
 */
export const GAZE_REACH = { story: 5.0, picture: 4.6, memo: 2.6 } as const;
/** 붙잡는 시간 — 연속으로. 이야기 벽만 본판의 1.2 초, 나머지는 0.9 초 */
export const GAZE_HOLD = { story: 1.2, other: 0.9 } as const;
/**
 * 「가운데에 두고 본다」의 폭 — 앵커가 화면 좌표(NDC)로 이 안에 있어야 든다.
 * FOV 60·16:9 면 가로 ±8°·세로 ±7° 쯤: 화면 구석이나 NOTES 판 밑에 걸린 그림은 안 든다. 조준점(ProbeHud 의 점)이 이 창의 중심이다
 */
export const GAZE_NDC = { x: 0.14, y: 0.22 } as const;
/**
 * 벽 정면 판정 — 벽의 법선 n(방 안쪽을 향한다) 기준으로 카메라가 벽 앞에 0.3 m 이상 나와 있고, 시선이 벽을 40° 안에서 마주 본다.
 * 레이캐스트 없이도 L 자 복도의 벽 뒷면과 호의 반대쪽 벽이 이것으로 빠진다
 */
export const GAZE_FRONT = { minOff: 0.3, cos: Math.cos((40 * Math.PI) / 180) } as const;

/**
 * 정비 단말 — **진입부** 왼쪽 벽 (레벨 설계 02: 벽화보다 먼저 만나야 「번호」의 뜻을 안다).
 * 들어와서 두 걸음이면 왼쪽에 있다. rotY 는 판의 정면이 방 안(+x)을 보는 값 — 응시의 법선도 여기서 나온다
 */
const TAG = { x: -WALL_X + 0.04, y: 1.72, z: CORRIDOR2_TAG_Z, w: 1.95, h: 1.24, rotY: Math.PI / 2 } as const;

const _fwd = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/** 들여다볼 수 있는 것 하나 — 벽의 그림 · 단말 · 기록 복도의 열여섯과 메모. 방마다 목록을 만들어 <Gaze> 에 넘긴다 */
export interface GazeTarget {
  id: string;
  x: number;
  z: number;
  y: number;
  /** 세로 반폭 — 화면에 그릴 때의 크기. 판정은 앵커 점의 화면 좌표로 한다 */
  half: number;
  /** 이 벽의 법선(단위, 수평) — 벽면에서 방 안쪽을 향한다. 복도는 wallNormal(rotY), 기록 복도는 side·ARCHIVE_PATH.at(s).nx/nz */
  nx: number;
  nz: number;
  /** 이 거리 안에서만 든다 (GAZE_REACH) */
  reach: number;
  /** 이만큼 연속으로 봐야 열린다 (GAZE_HOLD) */
  hold: number;
  label: string;
  hint: string;
  /** 다 봤을 때 HUD 에 남는 글자. 빈 문자열이면 글자 없이 닫는다 (대사가 대신 말하는 것) */
  done: string;
  fire: () => void;
  /** 지금도 들여다볼 것인가 — 이미 본 그림은 안 든다. 프레임마다 묻는다: 목록은 모듈 수준에 한 번이고 상태는 저장소가 쥐므로 */
  active?: () => boolean;
}

/**
 * 벽의 법선 — WallAnchor.rotY(그 벽의 정면이 방 안을 보게 하는 rotation.y)에서. 규약은 world/map/scifi 의 WALL_ROT:
 * right(x +WALL_X) = −π/2 → (−1, 0), left = π/2 → (1, 0), far(z −) = 0 → (0, 1), near = π → (0, −1). gaze.test 가 부호를 잡는다
 */
export function wallNormal(rotY: number): { nx: number; nz: number } {
  return { nx: Math.sin(rotY), nz: Math.cos(rotY) };
}

/** 판정에 주는 카메라 — three 를 모르는 형태. project 는 세상 점을 NDC 로 (뒤에 있으면 null) */
export interface GazeCamera {
  pos: { x: number; y: number; z: number };
  /** 시선의 수평 성분 — 정규화는 안 해도 된다 */
  fwd: { x: number; z: number };
  project: (x: number, y: number, z: number) => { x: number; y: number } | null;
}

export interface GazeRule {
  ndcX: number;
  ndcY: number;
  minOff: number;
  frontCos: number;
}

const DEFAULT_RULE: GazeRule = { ndcX: GAZE_NDC.x, ndcY: GAZE_NDC.y, minOff: GAZE_FRONT.minOff, frontCos: GAZE_FRONT.cos };

/**
 * 지금 무엇을 들여다보고 있나 — 순수 함수. 조건 넷을 **전부** 만족하는 것 중 화면 중앙에 가장 가까운 하나:
 *   ① 거리 — 수평 0.2 m 이상 reach 이하
 *   ② 벽 정면 — 카메라가 벽 앞에 minOff 이상 나와 있고(벽 뒷면 제외), 시선이 벽을 frontCos 안에서 마주 본다(스쳐 지나는 옆벽 제외)
 *   ③ 화면 — 앵커의 NDC 가 |x| ≤ ndcX · |y| ≤ ndcY (위아래 시선도 여기서 걸린다 — 발밑을 보며 지나가면 안 든다)
 *   ④ active — 이미 본 것은 안 든다
 * 가림(레이캐스트)은 안 본다: ②가 L 자의 벽 뒷면과 호의 반대쪽 벽을 이미 막는다.
 */
export function pickGaze(cam: GazeCamera, targets: readonly GazeTarget[], rule: GazeRule = DEFAULT_RULE): GazeTarget | null {
  const flen = Math.hypot(cam.fwd.x, cam.fwd.z);
  // 바닥이나 천장을 똑바로 보고 있다 — 마주 보는 벽이 없다
  if (flen < 1e-6) return null;
  const fx = cam.fwd.x / flen;
  const fz = cam.fwd.z / flen;

  let best: GazeTarget | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    if (t.active && !t.active()) continue;
    const dx = cam.pos.x - t.x;
    const dz = cam.pos.z - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist > t.reach || dist < 0.2) continue;
    // 벽 앞에 서 있나 — (cam − anchor)·n
    if (dx * t.nx + dz * t.nz < rule.minOff) continue;
    // 벽을 마주 보나 — fwd·(−n)
    if (-(fx * t.nx + fz * t.nz) < rule.frontCos) continue;
    const p = cam.project(t.x, t.y, t.z);
    if (!p) continue;
    const sx = p.x / rule.ndcX;
    const sy = p.y / rule.ndcY;
    if (Math.abs(sx) > 1 || Math.abs(sy) > 1) continue;
    const score = sx * sx + sy * sy;
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** 붙잡는 중 — 어느 것을 얼마나 연속으로 보고 있나 */
export interface GazeHold {
  id: string;
  t: number;
}

/**
 * 한 프레임의 붙잡기 — 순수. 대상이 없거나 바뀌면 처음부터(연속이어야 「들여다봤다」다).
 * frozen(probe 가 done 표시를 남기는 1.4 초)이면 시간을 안 쌓는다 — 안 그러면 첫 장 직후 둘째 장이 눈금도 완료 표시도 없이 열린다.
 * 돌려주는 것: 'none' 아무것도 안 봄 · 'aim' 붙잡는 중 · 'fire' 다 봤다 (hold 는 리셋됐다)
 */
export function advanceGaze(h: GazeHold, target: GazeTarget | null, delta: number, frozen: boolean): 'none' | 'aim' | 'fire' {
  if (!target) {
    h.id = '';
    h.t = 0;
    return 'none';
  }
  if (h.id !== target.id) {
    h.id = target.id;
    h.t = 0;
  }
  if (frozen) return 'aim';
  h.t += Math.min(delta, 0.1);
  if (h.t < target.hold) return 'aim';
  h.id = '';
  h.t = 0;
  return 'fire';
}

/**
 * 응시가 도는 조건 — 조작권이 있을 때만. 포인터가 잠겨 있거나 터치이고, 입력줄이 안 열려 있고, 암전이 아닐 때.
 * 잠금 전(「화면을 클릭하면 계속」이 떠 있는 동안)에는 카메라가 초기 시선으로 서 있을 뿐이라 그때 든 것은 「내가 본 것」이 아니다
 */
function gazeAllowed(): boolean {
  if (typeof document === 'undefined') return false;
  if (!getTouchMode() && document.pointerLockElement === null) return false;
  const s = scenario2.get();
  return !s.talking && !s.blackout;
}

/**
 * 지금 무엇을 들여다보고 있나 — 판정은 pickGaze, 붙잡기는 advanceGaze. 여기는 three 의 카메라를 그 형태로 넘기고 HUD(probe)를 움직일 뿐이다.
 * 방마다 대상만 다르고 규칙은 하나다 — 복도의 그림도 기록 복도의 메모도 같은 눈으로 본다.
 */
export function Gaze({ targets }: { targets: readonly GazeTarget[] }) {
  const camera = useThree((s) => s.camera);
  const held = useRef<GazeHold>({ id: '', t: 0 });
  // 프레임 함수가 늘 최신 목록을 보게 — 목록이 바뀌어도 useFrame 을 다시 걸지 않는다
  const list = useRef(targets);
  list.current = targets;
  const cam = useRef<GazeCamera>({
    pos: { x: 0, y: 0, z: 0 },
    fwd: { x: 0, z: 0 },
    project: (x, y, z) => {
      _ndc.set(x, y, z).project(camera);
      // 카메라 뒤의 점은 NDC z 가 1 을 넘는다 — 투영이 뒤집혀 화면 안에 있는 척한다
      return _ndc.z > 1 || _ndc.z < -1 ? null : { x: _ndc.x, y: _ndc.y };
    },
  });

  useFrame((_, delta) => {
    const h = held.current;
    const c = cam.current;
    let best: GazeTarget | null = null;
    if (gazeAllowed()) {
      camera.getWorldDirection(_fwd);
      c.pos.x = camera.position.x;
      c.pos.y = camera.position.y;
      c.pos.z = camera.position.z;
      c.fwd.x = _fwd.x;
      c.fwd.z = _fwd.z;
      best = pickGaze(c, list.current);
    }
    const wasHolding = h.id !== '';
    const r = advanceGaze(h, best, delta, probe.get().done);
    if (r === 'none') {
      if (wasHolding) probe.clear();
      return;
    }
    const t = best as GazeTarget;
    if (r === 'aim') {
      probe.aim(t.label, t.hint, h.t / t.hold);
      return;
    }
    if (t.done) probe.finish(t.done);
    else probe.clear();
    t.fire();
  });

  return null;
}

/**
 * 복도의 대상 — 단말 하나와 그림 여섯. 모듈 수준에 한 번: 「아직 안 읽었나 · 아직 안 봤나」는 active 가 프레임마다 저장소에 묻는다
 */
export const CORRIDOR_TARGETS: readonly GazeTarget[] = [
  {
    id: 'tag',
    x: TAG.x,
    z: TAG.z,
    y: TAG.y,
    half: TAG.h / 2,
    ...wallNormal(TAG.rotY),
    reach: GAZE_REACH.picture,
    hold: GAZE_HOLD.other,
    label: '정비 단말',
    hint: '읽는 중',
    done: '이 몸의 기록을 읽었다',
    fire: () => scenario2.readTag(),
    active: () => !identity.get().known,
  },
  ...DRAWINGS.map(({ m }): GazeTarget => ({
    id: m.kind,
    x: m.at.x,
    z: m.at.z,
    y: m.y,
    half: drawHeight(m.w) / 2,
    ...wallNormal(m.at.rotY),
    // 이야기가 붙은 한 장만 본판의 이야기 벽 값 — objective 의 문턱이라 멀리서도 든다
    reach: m.kind === 'beating' ? GAZE_REACH.story : GAZE_REACH.picture,
    hold: m.kind === 'beating' ? GAZE_HOLD.story : GAZE_HOLD.other,
    label: '벽의 그림',
    hint: '들여다보는 중',
    done: '말할 거리를 하나 얻었다',
    fire: () => scenario2.sawScrawl(m.kind),
    // 이야기 벽은 has() 가 늘 false(어휘를 안 준다) — 한 번 본 뒤에도 후보로 남아 2.6 초마다 HUD 가 되풀이됐다. 각인은 각인 플래그로 뺀다
    active: () => (m.kind === 'beating' ? !lexicon.inscriptionSeen() : !lexicon.has(m.kind)),
  })),
];

/* ─────────────────────────────── 정비 단말 ─────────────────────────────── */

/** 단말 화면 — 아직 안 읽었으면 대기 화면, 읽었으면 이 몸의 기록 */
function tagTexture(known: boolean, unit: string, sector: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 486;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#040b13';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(120,220,255,0.05)';
  for (let y = 0; y < c.height; y += 4) ctx.fillRect(0, y, c.width, 1);
  const ink = known ? '#8fe6ff' : '#3f6c84';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, c.width - 36, c.height - 36);
  ctx.fillStyle = ink;
  ctx.font = '700 30px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('SERVICE TERMINAL', 44, 76);
  ctx.fillRect(44, 96, c.width - 88, 2);
  if (!known) {
    ctx.font = '700 46px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = '#5d8ba3';
    ctx.fillText('STANDBY', 44, 200);
    ctx.font = '400 26px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(`A-${series()} SERIES · APPROACH TO READ`, 44, 250);
    return finish(c);
  }
  ctx.font = '400 26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#5d8ba3';
  ctx.fillText('UNIT ID', 44, 160);
  ctx.fillText('LAST SERVICE', 44, 290);
  ctx.fillText('STATUS', 44, 400);
  ctx.fillStyle = '#a8f0ff';
  ctx.font = '700 66px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(unit, 44, 226);
  ctx.font = '700 52px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(`SECTOR ${sector}`, 44, 350);
  ctx.font = '700 34px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#8ff0c8';
  ctx.fillText('NOMINAL', 44, 442);
  return finish(c);
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const TAG_FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#0d151d', metalness: 0.8, roughness: 0.45 });

function ServiceTag() {
  const id = useSyncExternalStore(identity.subscribe, identity.get, identity.get);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => {
    const tex = tagTexture(id.known, id.unit, id.sector);
    mat.map = tex;
    mat.needsUpdate = true;
    return () => tex?.dispose();
  }, [id.known, id.unit, id.sector, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group name="정비 단말" position={[TAG.x, TAG.y, TAG.z]} rotation-y={TAG.rotY}>
      <mesh position={[0, 0, -0.05]} material={TAG_FRAME_MAT}>
        <boxGeometry args={[TAG.w + 0.16, TAG.h + 0.16, 0.06]} />
      </mesh>
      <mesh material={mat}>
        <planeGeometry args={[TAG.w, TAG.h]} />
      </mesh>
      <pointLight position={[0.4, 0, 0]} color="#7fd8ff" distance={3.2} decay={1.8} intensity={id.known ? 3.2 : 1.2} />
    </group>
  );
}

export function Murals() {
  return (
    <group name="복도의 벽">
      {DRAWINGS.map(({ m, d }, i) => (
        <group key={m.kind} position={[m.at.x, 0, m.at.z]} rotation-y={m.at.rotY + Math.PI / 2}>
          <Scrawl d={d} seed={i * 31 + 7} wallX={0} />
        </group>
      ))}
      <ServiceTag />
      <Gaze targets={CORRIDOR_TARGETS} />
    </group>
  );
}
