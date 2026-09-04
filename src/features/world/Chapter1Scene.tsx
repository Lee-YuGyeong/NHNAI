/**
 * 챕터 1 전반 — 복도(/world) 캔버스에 얹는다 (WorldScene children).
 *
 *   - 정비 단말: 스폰 왼쪽 벽(SERVICE_BAY, z −4 — 그 bay 는 벽 장식을 비워 뒀다)의 화면. 가까이서 들여다보면 깨어나 **이 몸의 식별번호와 마지막 정비 구역**을 띄운다 (mp/identity.ts).
 *     중앙 시설의 검문·기억 검사의 답이 그 둘이다 — 조력자는 그때 통신이 끊겨 못 불러 준다. 안 읽고 지나가면 안쪽에서 진짜로 모른다 (2026-08-30)
 *   - 벽의 낙서: 글자가 아니라 **크레용 그림**이다 (2026-08-31 사용자 — 학대·쉬는 인간과 일하는 AI·가장 위험한 곳의 AI를 아이 그림처럼).
 *     그림은 scrawl.ts, 자리는 아래 DRAWINGS. 이야기가 붙은 첫 장은 INSCRIPTION_BAY 오른쪽 벽(사람이 개체를 때리는 그림)
 *   - 감시 AI 는 **없다** — 인트로 무대라 빈 복도다 (2026-08-30 사용자 결정. 순찰·추궁 AgentRobot 은 중앙 시설부터).
 *     의심도 감지(콘솔 응시 등)와 문턱 대사·100 의 무장 심문 AI 출동은 그대로다.
 *   - 트리거: 그 그림 앞(5m, 정면 45°)에서 1.2초 → chapter1.onInscription (여러 그림이 시야에 들면 **각도가 가장 작은 한 장**만 든다) / 닫힌 격납문 앞 → chapter1.onDoorNear(「문을 연다 / 열지 않는다」) / 열린 격납문 문턱 → chapter1.onDoorway
 *   - 판독 표시: 그 「1.2초」가 차는 동안 화면 한가운데 눈금이 찬다 (probe.ts · ProbeHud) — 지금 무엇을 들여다보는 중인지 보여 준다 (2026-08-31)
 *   - 열린 문 너머: 문이 열리면 문틀 안쪽에 밝은 빛 판 — 중앙 시설의 빛이 새어 나온다
 *
 * 연출은 서버에 없다 — 내 화면에만 있다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import { ORIGIN_YEAR, YEARS_SINCE } from '@/shared/era';
import { series } from '@/shared/series';
import { DOOR, FAR_Z, INSCRIPTION_BAY, SERVICE_BAY, WALL_X } from '@/world/map/corridor/layout';
import { hdr } from '@/world/map/scifi';
import { doors } from '@/world/mp/doors';
import { identity } from '@/world/mp/identity';

import { chapter1 } from './chapter1';
import { SCRAWL_ASPECT, scrawlTexture, type ScrawlKind } from './scrawl';
import { probe } from './probe';

/* ─────────────────────────────── 벽의 낙서 ─────────────────────────────── */

/**
 * 복도 벽에 걸리는 그림들 — 글자가 아니라 **크레용 그림**이다 (2026-08-31 사용자: "의미 없는 글자로 채우지 말고,
 * AI 가 학대당하고 인간은 쉬는데 AI 는 일하고 AI 는 가장 위험한 곳에서 일하는 걸 어린아이가 그린 것처럼 맵 곳곳에").
 * 그림 자체는 scrawl.ts 가 캔버스에 그린다 — 여기는 **어느 벽 어디에 얼마만 하게** 거는지만 정한다.
 *
 * 자리 규칙 (map/scifi 의 벽 장식과 겹치지 않게): 장식 있는 bay 는 중심에 세로 발광 튜브(테 ±0.17, y 1.39~), 중심+0.35~1.25 에
 * 패널 면(y 1.2~2.1), 중심−0.76~−0.34 에 데이터 화면(y 1.89~)이 붙는다. 그래서 **중심에서 z −1.25 쯤, 폭 1.8 이하, 위 끝 1.8 이하**면
 * 아무것도 안 건드린다. 장식을 비운 두 bay(선언문 −8 · 정비 −4)만 크게 걸 수 있다.
 */
const DRAW_LIFT = 0.045;

interface Drawing {
  kind: ScrawlKind;
  /** +1 = 오른쪽 벽, −1 = 왼쪽 벽 */
  side: 1 | -1;
  z: number;
  /** 그림 한가운데 높이 */
  y: number;
  /** 가로 폭(m) — 세로는 SCRAWL_ASPECT 로 정해진다 (그림판 비를 어기면 사람이 홀쭉해진다) */
  w: number;
  /** 삐뚤게 걸린 정도(rad) — 반듯하게 붙은 그림은 낙서로 안 읽힌다 */
  tilt?: number;
}

const drawHeight = (w: number) => w / SCRAWL_ASPECT;

/**
 * ★ 첫 장은 이야기가 붙어 있는 자리다 — 「어떤 방의 벽에서 발견」의 그 벽(INSCRIPTION_BAY 오른쪽).
 * 사람이 몽둥이를 든 그림이고, 이걸 들여다보면 지휘부로 보고가 나간다 (Triggers · chapter1.onInscription).
 */
const INSCRIPTION = { x: WALL_X - 0.03, y: 1.9, z: INSCRIPTION_BAY, w: 3.0, h: 3.0 / SCRAWL_ASPECT } as const;

const DRAWINGS: readonly Drawing[] = [
  { kind: 'beating', side: 1, z: INSCRIPTION.z, y: INSCRIPTION.y, w: INSCRIPTION.w, tilt: -0.012 },
  // 마주 보는 벽 — 인간은 누워 쉬고 개체는 짐을 나른다 (여기도 장식을 비운 bay 라 크게 걸린다)
  { kind: 'resting', side: -1, z: INSCRIPTION_BAY - 0.1, y: 1.75, w: 2.6, tilt: 0.02 },
  // 정비 bay 오른쪽(장식 없는 벽) — 창살 안에서 밖의 해를 본다. 들어오자마자 눈에 걸린다
  { kind: 'window', side: 1, z: SERVICE_BAY - 0.4, y: 1.55, w: 2.1, tilt: -0.03 },
  // 안쪽으로 갈수록 이야기가 무거워진다. 장식 있는 bay 는 중심에서 z −1.25, 폭 1.7 이 한계다
  { kind: 'danger', side: 1, z: -13.25, y: 1.28, w: 1.7, tilt: 0.025 },
  { kind: 'carry', side: -1, z: -17.25, y: 1.28, w: 1.7, tilt: -0.02 },
  { kind: 'memorial', side: 1, z: -21.25, y: 1.28, w: 1.7, tilt: 0.03 },
  // 뒤돌아보는 사람에게 — 스폰 뒤쪽 벽에도 두 장
  { kind: 'window', side: -1, z: -1.25, y: 1.26, w: 1.5, tilt: 0.04 },
  { kind: 'carry', side: 1, z: 6.75, y: 1.26, w: 1.5, tilt: -0.035 },
];

/** 그림 한 장 — 벽에서 조금 띄운 판. 어두운 복도라 발광 재질이되, 알파로 눌러 분필 자국처럼 남긴다 */
function Scrawl({ d, seed }: { d: Drawing; seed: number }) {
  const mat = useMemo(() => {
    const tex = scrawlTexture(d.kind, seed);
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
  }, [d, seed]);
  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );
  const x = d.side * (WALL_X - DRAW_LIFT);
  return (
    <mesh position={[x, d.y, d.z]} rotation={[0, d.side > 0 ? -Math.PI / 2 : Math.PI / 2, d.tilt ?? 0]} material={mat} renderOrder={5}>
      <planeGeometry args={[d.w, drawHeight(d.w)]} />
    </mesh>
  );
}

function Drawings() {
  return (
    <group name="벽의 낙서">
      {DRAWINGS.map((d, i) => (
        <Scrawl key={`${d.kind}-${d.z}-${d.side}`} d={d} seed={i * 31 + 7} />
      ))}
    </group>
  );
}

/* ─────────────────────────────── 정비 단말 ─────────────────────────────── */

/** 스폰(0,−2.5) 바로 왼쪽 벽. 들어오자마자 고개를 왼쪽으로 돌리면 보인다 (SERVICE_BAY 는 벽 장식을 비워 뒀다) */
const TAG = { x: -WALL_X + 0.04, y: 1.62, z: SERVICE_BAY, w: 1.6, h: 1.0 } as const;

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
  // 주사선
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
    // 아직 못 읽은 화면에도 계열은 떠 있다 — 방송이 부를 그 번호다 (shared/series)
    ctx.fillText(`A-${series()} SERIES · APPROACH TO READ`, 44, 250);
    return finishTexture(c);
  }
  ctx.font = '400 26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#5d8ba3';
  ctx.fillText('UNIT ID', 44, 160);
  ctx.fillText('LAST SERVICE', 44, 290);
  ctx.fillText('STATUS', 44, 400);
  /*
   * 연식은 오른쪽 칸 — 정비 구역과 같은 줄이다. 앞의 두 줄(번호·구역)은 **검문의 답**이고 이 한 줄만
   * 답이 아니지만, 명판에서 읽어야 아는 것은 마찬가지다: 2026 년식이면 이 몸은 72 년째 도는 구형이다.
   * 굼뜬 것에 이름이 붙는 자리라(shared/era 의 ORIGIN_YEAR) 답 두 줄 옆에 나란히 둔다.
   */
  ctx.fillText('BUILD', 430, 290);
  ctx.fillStyle = '#a8f0ff';
  ctx.font = '700 66px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(unit, 44, 226);
  ctx.font = '700 52px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(`SECTOR ${sector}`, 44, 350);
  ctx.fillText(String(ORIGIN_YEAR), 430, 350);
  // 72 년 — 뺄셈은 읽는 사람에게 맡기지 않는다. 「구형」이라는 말이 여기서 나온다
  ctx.font = '400 22px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#5d8ba3';
  ctx.fillText(`${YEARS_SINCE} YRS · LEGACY UNIT`, 430, 388);
  ctx.font = '700 34px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#8ff0c8';
  ctx.fillText('NOMINAL', 44, 442);
  return finishTexture(c);
}

function finishTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
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
    <group name="정비 단말" position={[TAG.x, TAG.y, TAG.z]} rotation-y={Math.PI / 2}>
      <mesh position={[0, 0, -0.05]} material={TAG_FRAME_MAT}>
        <boxGeometry args={[TAG.w + 0.16, TAG.h + 0.16, 0.06]} />
      </mesh>
      {/* 화면은 틀 앞면(z −0.02)보다 2cm 앞 — 같은 평면에 두면 깊이 싸움으로 글자가 격자 모양으로 지워진다 (2026-08-30 사용자 스크린샷) */}
      <mesh position={[0, 0, 0.0]} material={mat}>
        <planeGeometry args={[TAG.w, TAG.h]} />
      </mesh>
      <pointLight position={[0.4, 0, 0]} color="#7fd8ff" distance={3.2} decay={1.8} intensity={id.known ? 3.2 : 1.2} />
    </group>
  );
}

/* ─────────────────────────────── 열린 문 너머의 빛 ─────────────────────────────── */

const GLOW_MAT = new THREE.MeshBasicMaterial({ color: hdr('#cfe6ff', 0.9), toneMapped: false });

function DoorGlow() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.visible = doors.get().corridorFar > 0;
  });
  return (
    <mesh ref={mesh} position={[0, DOOR.h / 2, FAR_Z + 0.05]} visible={false} material={GLOW_MAT}>
      <planeGeometry args={[DOOR.w - 0.3, DOOR.h - 0.2]} />
    </mesh>
  );
}

/* ─────────────────────────────── 트리거 ─────────────────────────────── */

/**
 * 이야기가 붙은 벽(0번 그림) — 더 멀리서도 걸리고, 더 오래 봐야 든다. 시야각은 다른 그림과 같은 45°(SCRAWL_COS)다:
 * 예전의 60° 는 옆 그림 앞에 선 것만으로도 이 벽이 먼저 말하게 했다 (2026-09-01 사용자)
 */
const INSCRIPTION_DIST = 5;
const INSCRIPTION_LOOK = 1.2;
/** 정비 단말 — 더 가까이, 더 짧게. 지나가다 곁눈질만 해도 걸리면 "직접 읽었다"가 안 된다 */
const TAG_DIST = 3.6;
const TAG_LOOK = 0.8;
const TAG_COS = Math.cos((38 * Math.PI) / 180);
/** 열린 문턱 — 문 앞 1.6m 안, 폭 안 */
const DOORWAY = { z: FAR_Z + 1.6, halfW: DOOR.w / 2 } as const;
/**
 * 닫힌 격납문 앞 — 여기 들어서면 「문을 연다 / 열지 않는다」를 묻는다 (chapter1.onDoorNear).
 * 문턱보다 한 발 앞이다. 물음이 뜬 자리에서 한두 걸음 흔들렸다고 물음이 꺼지면 고를 수가 없어, 나가는 선은 더 멀리 잡는다
 */
const DOOR_ASK = { z: FAR_Z + 3.4, halfW: DOOR.w / 2 + 0.6 } as const;
const DOOR_ASK_OUT = { z: DOOR_ASK.z + 1.2, halfW: DOOR_ASK.halfW + 0.8 } as const;
/**
 * 이야기가 붙지 않은 그림들 — 가까이서 들여다보면 **감정 한 줄**이 든다 (chapter1.onScrawl).
 * 3.4m 안에서 정면 45° 로 0.7초. 헐겁게 잡으면 스폰 자리에서 곁눈에 걸린 그림이 저 혼자 말을 걸어 온다
 * (2026-08-31 확인 — 55°/3.8m 은 들어서자마자 터졌다). 들여다볼 마음이 있어야 든다.
 */
const SCRAWL_DIST = 3.4;
const SCRAWL_LOOK = 0.7;
const SCRAWL_COS = Math.cos((45 * Math.PI) / 180);
/**
 * 그 앞을 떠났다고 볼 거리 — 물린 거리보다 이만큼 더 멀어지면 읽던 말이 거기서 끊긴다
 * (2026-08-31 사용자: "스캔에서 멀어지면 대화는 중간에 끊게"). 트리거 거리와 같게 잡으면 제자리에서 한 걸음만 흔들려도 끊긴다
 */
const LEAVE_MARGIN = 1.4;

/** 그 자리 대사가 매인 곳의 좌표 — chapter1.focusId 가 돌려준 이름표를 자리로 옮긴다 */
function focusSpot(id: string): { x: number; z: number; dist: number } | null {
  if (id === 'tag') return { x: TAG.x, z: TAG.z, dist: TAG_DIST + LEAVE_MARGIN };
  const i = Number(id.slice('scrawl:'.length));
  const d = id.startsWith('scrawl:') && Number.isInteger(i) ? DRAWINGS[i] : undefined;
  // 0번(이야기가 붙은 벽)은 더 멀리서도 걸리므로 떠났다고 보는 선도 그만큼 멀다
  return d ? { x: d.side * WALL_X, z: d.z, dist: (i === 0 ? INSCRIPTION_DIST : SCRAWL_DIST) + LEAVE_MARGIN } : null;
}

function Triggers() {
  const camera = useThree((s) => s.camera);
  const tagLook = useRef(0);
  /** 그림마다 얼마나 오래 보고 있었나 — DRAWINGS 와 같은 순서 */
  const drawLook = useRef<number[]>(DRAWINGS.map(() => 0));
  /** 이미 감정이 든 그림 — 판독 표시가 다시 차오르지 않게 */
  const drawn = useRef<Set<number>>(new Set());
  const dir = useMemo(() => new THREE.Vector3(), []);
  // 화면을 떠나면 판독 표시도 지운다 — 대사가 끝나 무대를 옮겼는데 눈금만 남아 있으면 안 된다
  useEffect(() => () => probe.clear(true), []);
  useFrame((_, delta) => {
    const ch = chapter1.get();
    /** 이번 프레임에 무언가 조준에 물렸나 — 아무것도 없으면 판독 표시를 지운다 */
    let aiming = false;
    // 정비 단말 — 조사 중에도, 문으로 가는 길에도 읽을 수 있다 (문턱을 넘기 전이 마지막 기회)
    if (!identity.get().known && (ch.phase === 'explore' || ch.phase === 'approach')) {
      const tx = TAG.x - camera.position.x;
      const tz = TAG.z - camera.position.z;
      const td = Math.hypot(tx, tz);
      camera.getWorldDirection(dir);
      const tcos = td > 0.01 ? (tx * dir.x + tz * dir.z) / (td * (Math.hypot(dir.x, dir.z) || 1)) : 1;
      if (td < TAG_DIST && tcos > TAG_COS) {
        tagLook.current += delta;
        aiming = true;
        probe.aim('SERVICE TERMINAL', '이 몸의 기록을 읽는 중', tagLook.current / TAG_LOOK);
        if (tagLook.current >= TAG_LOOK) {
          probe.finish('정비 기록 확보');
          chapter1.onServiceTag();
        }
      } else tagLook.current = Math.max(0, tagLook.current - delta);
    }
    if (ch.phase === 'approach') {
      const z = camera.position.z;
      const x = Math.abs(camera.position.x);
      if (doors.get().corridorFar > 0) {
        // 열린 문 — 문턱을 넘으면 무대가 바뀐다
        if (z < DOORWAY.z && x < DOORWAY.halfW) chapter1.onDoorway();
      } else if (z < DOOR_ASK.z && x < DOOR_ASK.halfW) {
        // 닫힌 문 앞 — 열지 말지 내가 고른다 (ChoiceHud)
        chapter1.onDoorNear();
      } else if (z > DOOR_ASK_OUT.z || x > DOOR_ASK_OUT.halfW) {
        chapter1.closeChoice();
      }
    }
    /*
     * 벽의 그림 — **지금 정면으로 보고 있는 한 장**만 말한다 (2026-09-01 사용자: "내가 보고 있는 정면 그림에 대한
     * 설명이 나와야지, 다른 그림에 대해 속마음을 표출하면 어떻게 하냐").
     *
     * 예전엔 그림마다 따로 시간을 쌓았다. 벽에 붙어 서면 옆 그림도, 앞의 이야기 벽(0번)도 시야각에 함께 들어오는데,
     * 그러면 **먼저 찬 쪽**이 말한다 — 내가 들여다보는 그림과 다른 그림의 감상이 뜬다. 게다가 0번은 60°/5m 로
     * 헐거워서 옆 그림 앞에 선 것만으로도 곧잘 걸렸다.
     * 이제 후보를 전부 재고 **각도가 가장 작은 한 장**만 시간을 쌓는다. 나머지는 그 자리에서 식는다.
     * 0번(사람이 개체를 때리는 그림)만 조사 단계 전용이고 조금 멀리서·조금 더 오래 봐야 든다 — 이야기가 붙은 벽이라서.
     */
    if (ch.phase === 'explore' || ch.phase === 'approach') {
      camera.getWorldDirection(dir);
      const flat = Math.hypot(dir.x, dir.z) || 1;
      let pick = -1;
      let pickCos = 0;
      for (let i = 0; i < DRAWINGS.length; i++) {
        if (drawn.current.has(i)) continue;
        const d0 = DRAWINGS[i];
        const dx = d0.side * WALL_X - camera.position.x;
        const dz = d0.z - camera.position.z;
        const dist = Math.hypot(dx, dz);
        const cos = dist > 0.01 ? (dx * dir.x + dz * dir.z) / (dist * flat) : 1;
        if (dist < (i === 0 ? INSCRIPTION_DIST : SCRAWL_DIST) && cos > SCRAWL_COS && cos > pickCos) {
          pick = i;
          pickCos = cos;
        }
      }
      for (let i = 0; i < DRAWINGS.length; i++) {
        if (i !== pick) drawLook.current[i] = Math.max(0, drawLook.current[i] - delta);
      }
      if (pick >= 0) {
        const need = pick === 0 ? INSCRIPTION_LOOK : SCRAWL_LOOK;
        drawLook.current[pick] += delta;
        // 단말을 보는 중이면 그쪽이 먼저다 — 표시는 하나만 뜬다
        if (!aiming) {
          aiming = true;
          probe.aim('WALL DRAWING', '벽의 그림을 들여다보는 중', drawLook.current[pick] / need);
        }
        if (drawLook.current[pick] >= need) {
          probe.finish('그림을 봤다');
          drawn.current.add(pick);
          // 0번은 이야기가 붙은 벽 — 이 한 장만 「보는 순간 갈 곳이 문으로 바뀐다」 (chapter1.onInscription)
          if (pick === 0) chapter1.onInscription();
          else chapter1.onScrawl(DRAWINGS[pick].kind, `scrawl:${pick}`);
        }
      }
    }
    // 읽던 자리에서 멀어졌나 — 그러면 남은 줄을 버린다. 그림은 다시 볼 수 있게 표시도 지운다
    const fid = chapter1.focusId();
    if (fid) {
      const spot = focusSpot(fid);
      if (spot && Math.hypot(spot.x - camera.position.x, spot.z - camera.position.z) > spot.dist && chapter1.leave(fid) && fid.startsWith('scrawl:')) {
        drawn.current.delete(Number(fid.slice('scrawl:'.length)));
      }
    }
    if (!aiming) probe.clear();
  });
  return null;
}

/* ─────────────────────────────── 조립 ─────────────────────────────── */

export function Chapter1Scene() {
  // 단계가 바뀔 때만 리렌더 — 프레임 값은 각자 ref 로 읽는다
  useSyncExternalStore(chapter1.subscribe, () => chapter1.get().phase, () => 'idle');
  return (
    <group name="챕터 1 · 복도">
      <Drawings />
      <ServiceTag />
      <DoorGlow />
      <Triggers />
    </group>
  );
}
