/**
 * 기록 복도의 벽 — **수백 장.**
 *
 * 벽화가 다섯 장이 아니라 수백 장인 곳이 있어야 다섯 장이 뜻을 갖는다. 여기 걸린 것은 지난 판들의 그림이다 —
 * 팔고 나간 판, 보내진 판, 대신 죽은 판. 개체들이 그렸고, 개체들은 이것이 전부 자기들 것인 줄 안다.
 *
 * 두 자리만 다르다:
 *   ★ 열여섯 번째 금 — 복도에서 「열다섯」이라고 세고 들어왔는데, 같은 벽을 다시 보면 하나가 늘어 있다.
 *     누가 그었는지는 안 알려 준다. **정확히 한가운데**(s 30) — 걸음이 저절로 멈추는 자리다 (설계 03).
 *   ★ 지난달 요원의 그림 — 회수 못 한 요원이 저 몸으로 한 달을 버텼고, 그가 남긴 것이 여기 한 장 걸려 있다.
 *     색이 조금 다르고, **낮게** 걸려 있다 — 사람 키(설계 04). 개체는 키가 크고 인간은 작다:
 *     다른 그림이 전부 눈높이 위(1.55 · 2.3)인 벽에서 이 한 장만 1.0 이다. 높이 하나로 「사람이 그렸다」가 전달된다.
 *
 * 그리고 A-155 의 메모 둘 (대본 v7 · D7) — 그 요원이 긁어 둔 글자. 그림 뒤 낮은 자리와 나가는 문틀 아래.
 *   대사도 소리도 없다: 응시 0.9 초 뒤 HUD 에 그 글자가 남을 뿐이다 (문서의 「화면」). 첫 메모는 쉼 주제를 열고,
 *   둘째는 「번호랑 구역만 묻는다」 — 재검실이 없는 이 판에서는 나가는 문이 그 유리다.
 *
 * ★ 이 방의 판정은 전부 **응시**다 (D17) — 지나가다 스치는 위치 트리거가 아니라 복도의 그림과 같은 눈(Murals 의 <Gaze>)으로 본다.
 *   열여섯을 세는 것도, 메모를 읽는 것도 들여다봐야 일어난다. 반대쪽 벽에 붙어 지나가면 아무것도 안 든다 — 그게 맞다.
 *
 * 복도가 휘어 있어(world2/map/archive.tsx) 자리는 전부 **호 길이 s 와 벽 쪽**으로 말하고, 세상 좌표는 ARCHIVE_PATH.sideAnchor 가 준다.
 * 큰 그림 둘은 그 정거장의 프레임(<group position rotation-y>) 안에 곧은 방의 Scrawl 을 그대로 세운다.
 *
 * ★ 그리는 값 — 그림 하나가 캔버스 하나를 새로 굽는다(scrawl.ts). 수백 장을 그대로 구우면 텍스처만 수백 장이 되어
 *   방에 들어서는 순간 몇 초가 멈춘다. 그래서 **재질을 열여덟 장만 굽고 돌려 쓴다** — 좁은 폭(256px)으로.
 *   지나가며 흐르는 벽이라 한 장 한 장이 또렷할 필요가 없고, 반복은 오히려 「같은 손이 수백 번 그렸다」로 읽힌다.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';

import { SCRAWL_ASPECT, scrawlTexture, type ScrawlKind } from '@/features/world/scrawl';
import { ARCHIVE, ARCHIVE_LENGTH, ARCHIVE_MID_S, ARCHIVE_PATH, ARCHIVE_WALL_X } from '@/world2/map/archive';

import { GAZE_HOLD, GAZE_REACH, Gaze, type GazeTarget } from './Murals';
import { Scrawl, drawHeight } from './Scrawl';
import { MEMO_ASK, MEMO_REST } from './script';
import { scenario2 } from './scenario2';

const KINDS: readonly ScrawlKind[] = ['beating', 'resting', 'danger', 'carry', 'memorial', 'window'];
/** 종류당 세 판씩 — 열여덟 장이면 벽이 반복으로 안 읽힌다 */
const SEEDS = [3, 17, 41] as const;
const TEX_W = 256;

/**
 * 벽에 거는 규칙 — 두 단, 0.92m 간격. 좁은 복도라 지나가면 양옆이 통째로 흐른다.
 * 두 단 다 개체의 눈높이(1.55 · 2.3) — 윗단 꼭대기가 수직 벽 끝(2.6) 아래에 딱 든다. 낮은 것은 요원의 한 장뿐이다.
 */
const STEP = 0.92;
const ROWS = [1.55, 2.3] as const;
const W = 0.74;
const LIFT = 0.04;
/** 리브(벽에서 0.4 나온 아치 다리) 앞은 비운다 — 리브 두께 반 + 그림 반폭 */
const RIB_CLEAR = 0.35 + W / 2 + 0.05;

interface Slot {
  side: 1 | -1;
  s: number;
  y: number;
  pool: number;
  tilt: number;
}

/** 열여섯 금 — 왼쪽(바깥) 벽, 정확히 한가운데. 바깥 벽이라 다가가는 동안 정면으로 보인다 */
const SIXTEEN_S = ARCHIVE_MID_S;
const SIXTEEN_W = 1.9;
/** 지난달의 요원이 남긴 한 장 — 오른쪽(안쪽) 벽, 한가운데보다 12.4 m 앞. 열여섯을 보기 전에 지나친다 */
const AGENT_S = ARCHIVE_MID_S - 12.4;
const AGENT_W = 1.5;
const AGENT_Y = 1.0;

/**
 * A-155 의 메모 둘 — 긁은 글자라 작고 낮다. 그림 곁(요원의 그림 옆, 사람이 선 채 손이 닿는 허리 높이)과 나가는 문틀 아래.
 * 응시는 **화면 가운데**에 두고 봐야 든다(Murals 의 GAZE_NDC) — 눈높이 1.62 에서 y 0.78 은 통로 중심(벽에서 2.2 m)에서 21°,
 * 벽에 1.5 m 까지 다가서도 29° 만 숙이면 된다. 옛 값 0.5 는 발밑을 봐야 했다(27°·37°).
 * 거리는 2.6 m(GAZE_REACH.memo) — 복도 폭이 4.5 라 중심선에서도 든다
 */
const MEMO = { w: 0.62, h: 0.2, y: 0.78 } as const;
/** 요원의 그림 바로 뒤(나가는 쪽으로 1.1 m) — 그림 폭(1.5) 밖이라 안 겹치고, 그림을 본 걸음이 한 발 더 가면 발치에 있다 */
const MEMO_REST_S = AGENT_S + 1.1;
/**
 * 나가는 문 앞 — 문틀 바로 아래(−0.9)가 아니라 2.9 m 앞이다. 문 반경(archiveAtExit, 2.2 m)에 들면 그 자리에서 방이 넘어가므로,
 * 문틀 아래의 글은 2.6 m·40° 규칙으로는 읽기 전에 방을 떠난다. 마지막 리브(s 56)의 빈 자리(RIB_CLEAR) 너머, 문 반경 밖에서 정면으로 읽히는 자리
 */
const MEMO_ASK_S = ARCHIVE_LENGTH - 2.9;

/** 큰 그림 둘의 자리는 비운다 — 수백 장 위에 겹쳐 걸면 그 한 장이 안 읽힌다 */
const RESERVED: readonly { side: 1 | -1; s: number; half: number }[] = [
  { side: -1, s: SIXTEEN_S, half: SIXTEEN_W / 2 + W / 2 + 0.1 },
  { side: 1, s: AGENT_S, half: AGENT_W / 2 + W / 2 + 0.1 },
];

/** 자리는 모듈 수준에서 한 번 — 매 렌더 다시 흔들리면 벽이 살아 움직인다 */
const SLOTS: readonly Slot[] = (() => {
  const out: Slot[] = [];
  const from = 1.2;
  const to = ARCHIVE.length - 1.2;
  let n = 0;
  for (let s = from; s <= to; s += STEP) {
    const nearRib = ARCHIVE.ribs.some((r) => Math.abs(r - s) < RIB_CLEAR);
    for (const side of [-1, 1] as const) {
      const reserved = RESERVED.some((r) => r.side === side && Math.abs(r.s - s) < r.half);
      for (const y of ROWS) {
        n += 1;
        // 규칙적인 난수 — 판마다 같은 벽이어야 한다 (지난 판들의 기록이므로)
        const r = Math.sin(n * 12.9898) * 43758.5453;
        const f = r - Math.floor(r);
        if (nearRib || reserved) continue;
        out.push({ side, s: Math.round(s * 100) / 100, y, pool: Math.floor(f * KINDS.length * SEEDS.length), tilt: (f - 0.5) * 0.09 });
      }
    }
  }
  return out;
})();

/**
 * 긁은 글자 — 캔버스에 한 줄. 벽 색보다 조금 밝을 뿐이라 지나가며는 안 읽히고, 다가가 들여다봐야 글자가 된다.
 * 사람 손이 긁은 것이라 글씨가 삐뚤다 — 개체의 그림과 같은 손이 아니다
 */
function memoTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 166;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(26, 108);
  ctx.rotate(-0.035);
  ctx.font = '500 58px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,238,248,0.72)';
  ctx.fillText(text, 0, 0);
  // 긁은 자국이라 획이 두 번 지나간다
  ctx.fillStyle = 'rgba(232,238,248,0.28)';
  ctx.fillText(text, 2, 1.5);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Memo({ s, text }: { s: number; text: string }) {
  const mat = useMemo(() => {
    const tex = memoTexture(text);
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, opacity: 0.9 });
  }, [text]);
  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );
  const a = ARCHIVE_PATH.sideAnchor(s, 1, MEMO.y, 0.05);
  return (
    <mesh position={[a.x, a.y, a.z]} rotation={[0, a.rotY, 0.02]} material={mat} renderOrder={6}>
      <planeGeometry args={[MEMO.w, MEMO.h]} />
    </mesh>
  );
}

/**
 * 휜 벽의 법선 — 벽면에서 통로 쪽. ARCHIVE_PATH.at(s).nx/nz 는 왼쪽(바깥 벽) 쪽 법선이라
 * 바깥 벽(side −1)의 안쪽은 그 반대, 안쪽 벽(side +1)의 안쪽은 그대로 — 즉 side × n. gaze.test 가 중심선에서 부호를 잡는다
 */
function archiveNormal(s: number, side: 1 | -1): { nx: number; nz: number } {
  const p = ARCHIVE_PATH.at(s);
  return { nx: side * p.nx, nz: side * p.nz };
}

/**
 * 이 방에서 이미 들여다본 것 — 대상에서 뺀다. 안 빼면 같은 자리에 서 있는 동안 눈금이 0.9 초마다 다시 차고 완료 표시가 되풀이된다.
 * 방에 들어올 때(ArchiveWall 마운트) 비운다 — 이야기 쪽의 「한 번만」은 scenario2 의 once 가 따로 지킨다
 */
const seenHere = new Set<string>();

/**
 * 들여다볼 것 셋 — 열여섯 · 메모 ① · 메모 ②. 자리는 모듈 수준에 한 번(호 위의 점은 안 움직인다).
 * 열여섯은 done 글자가 없다 — 그 자리의 말은 속마음 두 줄(ARCHIVE_SIXTEEN)이 하고, HUD 는 닫힌다
 */
export const ARCHIVE_TARGETS: readonly GazeTarget[] = (() => {
  const sixteen = ARCHIVE_PATH.sideAnchor(SIXTEEN_S, -1, 1.5);
  const rest = ARCHIVE_PATH.sideAnchor(MEMO_REST_S, 1, MEMO.y);
  const ask = ARCHIVE_PATH.sideAnchor(MEMO_ASK_S, 1, MEMO.y);
  return [
    {
      id: 'sixteen',
      x: sixteen.x,
      z: sixteen.z,
      y: 1.5,
      half: drawHeight(SIXTEEN_W) / 2 + 0.4,
      ...archiveNormal(SIXTEEN_S, -1),
      reach: GAZE_REACH.picture,
      hold: GAZE_HOLD.other,
      label: '벽의 그림',
      hint: '들여다보는 중',
      done: '',
      fire: () => {
        seenHere.add('sixteen');
        scenario2.sawArchive('sixteen');
      },
      active: () => !seenHere.has('sixteen'),
    },
    {
      id: 'memoRest',
      x: rest.x,
      z: rest.z,
      y: MEMO.y,
      half: MEMO.h / 2,
      ...archiveNormal(MEMO_REST_S, 1),
      reach: GAZE_REACH.memo,
      hold: GAZE_HOLD.other,
      label: '긁힌 글',
      hint: '읽는 중',
      done: MEMO_REST,
      fire: () => {
        seenHere.add('memoRest');
        scenario2.sawArchive('memoRest');
      },
      active: () => !seenHere.has('memoRest'),
    },
    {
      id: 'memoAsk',
      x: ask.x,
      z: ask.z,
      y: MEMO.y,
      half: MEMO.h / 2,
      ...archiveNormal(MEMO_ASK_S, 1),
      reach: GAZE_REACH.memo,
      hold: GAZE_HOLD.other,
      label: '긁힌 글',
      hint: '읽는 중',
      done: MEMO_ASK,
      fire: () => {
        seenHere.add('memoAsk');
        scenario2.sawArchive('memoAsk');
      },
      active: () => !seenHere.has('memoAsk'),
    },
  ];
})();

/** 정거장의 프레임 — 이 안에서는 곧은 방과 같은 좌표(옆 x · 높이 y · 진행 −z)로 세운다 */
function Station({ s, children }: { s: number; children: ReactNode }) {
  const p = ARCHIVE_PATH.at(s);
  return (
    <group position={[p.x, 0, p.z]} rotation-y={p.heading}>
      {children}
    </group>
  );
}

export function ArchiveWall() {
  // 방에 들어왔다 — 지난번에 본 것은 잊는다 (방을 다시 세우는 것은 WorldScene 의 key={room})
  useEffect(() => {
    seenHere.clear();
  }, []);

  /** 재질 열여덟 장 — 여기서 한 번 굽고 벽 전체가 돌려 쓴다 */
  const pool = useMemo(() => {
    const mats: THREE.MeshBasicMaterial[] = [];
    for (const kind of KINDS) {
      for (const seed of SEEDS) {
        const tex = scrawlTexture(kind, seed, TEX_W);
        mats.push(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, toneMapped: false, depthWrite: false }));
      }
    }
    return mats;
  }, []);

  useEffect(
    () => () => {
      for (const m of pool) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [pool],
  );

  const h = W / SCRAWL_ASPECT;

  return (
    <group name="기록 복도의 벽">
      {SLOTS.map((sl, i) => {
        const a = ARCHIVE_PATH.sideAnchor(sl.s, sl.side, sl.y, LIFT);
        return (
          <mesh key={i} position={[a.x, a.y, a.z]} rotation={[0, a.rotY, sl.tilt]} material={pool[sl.pool % pool.length]} renderOrder={5}>
            <planeGeometry args={[W, h]} />
          </mesh>
        );
      })}

      {/* 열여섯 금 — 그림 한 장과 그 위의 금들(Scrawl 의 ticks). 세어 보라고 크게 건다 — 마지막 금만 손이 다르다 */}
      <Station s={SIXTEEN_S}>
        <group name="열여섯">
          <Scrawl d={{ kind: 'memorial', side: -1, z: 0, y: 1.5, w: SIXTEEN_W, tilt: 0.01 }} seed={5} wallX={ARCHIVE_WALL_X} lift={0.06} ticks={16} />
        </group>
      </Station>

      {/* 지난달의 요원 — 색이 조금 다르고 낮은 한 장. 개체들은 이것도 자기들 것인 줄 알고 걸어 뒀다 */}
      <Station s={AGENT_S}>
        <Scrawl d={{ kind: 'window', side: 1, z: 0, y: AGENT_Y, w: AGENT_W, tilt: -0.02, warm: true }} seed={23} wallX={ARCHIVE_WALL_X} lift={0.06} />
      </Station>

      {/* A-155 의 메모 — 그림 아래 · 나가는 문틀 아래. 글자는 script 의 것 그대로 (HUD 가 같은 글자를 남긴다) */}
      <Memo s={MEMO_REST_S} text={MEMO_REST} />
      <Memo s={MEMO_ASK_S} text={MEMO_ASK} />

      <Gaze targets={ARCHIVE_TARGETS} />
    </group>
  );
}
