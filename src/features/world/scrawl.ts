/**
 * 벽의 낙서 — **개체들이 크레용으로 그린 것 같은 그림.**
 *
 * 2026-08-31 사용자: "복도를 의미 없는 글자로 채우지 말고, AI 가 사람에게 학대당하고, 인간은 쉬는데 AI 는 일하고,
 * AI 는 가장 위험한 곳에서 일하는 걸 **어린아이가 그린 것처럼** 맵 곳곳에 그려 달라 — 세계관에 공감할 수 있게."
 *
 * 그래서 글자를 걷어내고 그림을 건다. 서툰 손이어야 한다 — 선은 흔들리고, 두 번 겹쳐 긋고, 사람은 머리가 크고,
 * 개체는 네모 머리에 안테나 하나다. 잘 그린 그림은 선전 포스터가 되고, 못 그린 그림이라야 **누가 자기 얘기를 적어 둔 것**이 된다.
 *
 * 좌표는 **가로세로가 같은 자**로 잰다 (ASPECT 3:2 고정) — x 는 0~1(폭), y 는 0~1(높이)로 놓되 길이·네모는 짧은 변 기준이라
 * 정사각형이 정사각형으로 나온다. 처음엔 x 를 폭으로만 재서 개체의 네모 머리가 1.5배 납작해졌고, 그 탓에 머리와 몸통이
 * 한 덩어리로 읽혔다 (2026-08-31 확인). 그래서 가로 길이는 전부 `p.ax()` 를 지난다.
 *
 * 순수 캔버스다 (three 텍스처만 돌려준다). 자리·크기는 Chapter1Scene 의 DRAWINGS 가 정한다.
 */

import * as THREE from 'three';

/** 그림판의 가로세로 비 — 걸리는 판(plane)도 이 비에 맞춘다 */
export const SCRAWL_ASPECT = 1.5;

/** 그림 한 장이 말하는 것 */
export type ScrawlKind =
  /** 사람이 몽둥이로 개체를 때린다 — 넘어진 개체, 눈물, 붉은 자국 */
  | 'beating'
  /** 인간은 누워 쉬고, 그 옆에서 개체는 짐을 나른다 (해가 여럿 — 하루가 아니다) */
  | 'resting'
  /** 불 속으로 걸어 들어가는 개체. 사람은 선 밖에서 손가락질만 한다 */
  | 'danger'
  /** 제 몸보다 큰 짐을 진 개체와, 뒤에서 막대를 든 사람 */
  | 'carry'
  /** 꺼진 개체 하나를 둘러싼 작은 개체들. 위에 세어 둔 금 */
  | 'memorial'
  /** 창살 안에서 밖의 해를 보는 개체 */
  | 'window';

/* ─────────────────────────────── 크레용 손 ─────────────────────────────── */

interface Opt {
  color?: string;
  /** 선 굵기 — 짧은 변 대비 비율 */
  width?: number;
  /** 몇 번 덧그을까 (서툰 손은 한 번에 안 끝낸다) */
  passes?: number;
  /** 흔들림 — 짧은 변 대비 비율 */
  wobble?: number;
}

const CHALK = '#eef3fa';
const RED = '#ff7a68';
const WARM = '#ffd489';
const COLD = '#8fd8ff';

type Pt = readonly [number, number];

interface Pen {
  rnd(): number;
  /** 가로 길이를 x 좌표 단위로 — 세로와 같은 자로 재기 위해 */
  ax(v: number): number;
  line(pts: readonly Pt[], o?: Opt): void;
  circle(cx: number, cy: number, r: number, o?: Opt): void;
  /** 네모 — size 는 짧은 변 기준(정사각형이 정사각형으로 나온다) */
  rect(cx: number, cy: number, w: number, h: number, o?: Opt): void;
  /** 지그재그 — 불꽃 */
  zig(x: number, y0: number, y1: number, n: number, amp: number, o?: Opt): void;
}

/** 방마다 같은 그림이 나오도록 씨앗을 받는 난수 */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makePen(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): Pen {
  const rnd = seeded(seed);
  const S = Math.min(w, h);
  const ax = (v: number) => (v * S) / w;
  const px = (p: Pt): [number, number] => [p[0] * w, p[1] * h];

  /** 한 번 긋기 — 선을 잘게 쪼개 옆으로 흔든다. 떨리는 선이 아이의 선이다 */
  function pass(pts: [number, number][], o: Opt, k: number) {
    const wob = (o.wobble ?? 0.011) * S;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const d = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.round(d / (S * 0.05)));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const nx = -(y2 - y1) / (d || 1);
        const ny = (x2 - x1) / (d || 1);
        const amp = (rnd() - 0.5) * 2 * wob * (j === 0 || j === steps ? 0.3 : 1);
        const x = x1 + (x2 - x1) * t + nx * amp + (k - 0.5) * wob * 0.4;
        const y = y1 + (y2 - y1) * t + ny * amp + (k - 0.5) * wob * 0.4;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function draw(pts: [number, number][], o: Opt = {}) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.color ?? CHALK;
    ctx.lineWidth = (o.width ?? 0.014) * S;
    const passes = o.passes ?? 2;
    for (let k = 0; k < passes; k++) {
      ctx.globalAlpha = k === 0 ? 0.95 : 0.55;
      pass(pts, o, k);
    }
    ctx.globalAlpha = 1;
  }

  return {
    rnd,
    ax,
    line: (pts, o) => draw(pts.map(px), o),
    circle: (cx, cy, r, o) => {
      const n = 24;
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * S * (1 + (rnd() - 0.5) * 0.14);
        pts.push([cx * w + Math.cos(a) * rr, cy * h + Math.sin(a) * rr]);
      }
      draw(pts, o);
    },
    rect: (cx, cy, ww, hh, o) => {
      const x0 = cx - ax(ww) / 2;
      const x1 = cx + ax(ww) / 2;
      const y0 = cy - hh / 2;
      const y1 = cy + hh / 2;
      draw([px([x0, y0]), px([x1, y0]), px([x1, y1]), px([x0, y1]), px([x0, y0])], o);
    },
    zig: (x, y0, y1, n, amp, o) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(px([x + (i % 2 ? ax(amp) : -ax(amp)), y0 + (y1 - y0) * t]));
      }
      draw(pts, o);
    },
  };
}

/* ─────────────────────────────── 사람과 개체 ─────────────────────────────── */

/**
 * 사람 — 동그란 **큰** 머리에 막대 몸. 개체(네모 머리)와 한눈에 갈려야 한다.
 * (x, y) 는 발이 닿은 자리, s 는 키.
 */
function human(p: Pen, x: number, y: number, s: number, o: { arms?: 'stick' | 'down' | 'point'; color?: string } = {}) {
  const c = { color: o.color ?? CHALK };
  const r = s * 0.15;
  const hy = y - s * 0.85;
  p.circle(x, hy, r, c);
  // 웃는 입 — 웃고 있어서 더 나쁘다
  p.line(
    [
      [x - p.ax(r * 0.55), hy + r * 0.25],
      [x, hy + r * 0.55],
      [x + p.ax(r * 0.55), hy + r * 0.25],
    ],
    { ...c, width: 0.01 },
  );
  for (const sx of [-1, 1]) p.circle(x + sx * p.ax(r * 0.4), hy - r * 0.2, s * 0.018, { ...c, passes: 3 });
  const neck = y - s * 0.68;
  p.line(
    [
      [x, neck],
      [x, y - s * 0.3],
    ],
    c,
  );
  p.line(
    [
      [x, y - s * 0.3],
      [x - p.ax(s * 0.16), y],
    ],
    c,
  );
  p.line(
    [
      [x, y - s * 0.3],
      [x + p.ax(s * 0.16), y],
    ],
    c,
  );
  if (o.arms === 'stick') {
    // 한 팔은 위로 — 그 손에 몽둥이
    p.line(
      [
        [x, neck - s * 0.02],
        [x + p.ax(s * 0.22), y - s * 0.82],
      ],
      c,
    );
    p.line(
      [
        [x + p.ax(s * 0.12), y - s * 0.74],
        [x + p.ax(s * 0.52), y - s * 1.0],
      ],
      { color: RED, width: 0.016 },
    );
    p.line(
      [
        [x, neck - s * 0.02],
        [x - p.ax(s * 0.2), y - s * 0.5],
      ],
      c,
    );
  } else if (o.arms === 'point') {
    p.line(
      [
        [x, neck - s * 0.02],
        [x + p.ax(s * 0.34), y - s * 0.7],
      ],
      c,
    );
    p.line(
      [
        [x, neck - s * 0.02],
        [x - p.ax(s * 0.18), y - s * 0.46],
      ],
      c,
    );
  } else {
    p.line(
      [
        [x, neck - s * 0.02],
        [x - p.ax(s * 0.22), y - s * 0.44],
      ],
      c,
    );
    p.line(
      [
        [x, neck - s * 0.02],
        [x + p.ax(s * 0.22), y - s * 0.44],
      ],
      c,
    );
  }
}

/** 개체(AI) — 작은 네모 머리에 안테나, 목, 네모 몸통. 눈은 점, 꺼졌으면 × */
function robot(p: Pen, x: number, y: number, s: number, o: { mood?: 'flat' | 'sad' | 'dead'; arms?: 'down' | 'up' | 'carry'; color?: string } = {}) {
  const c = { color: o.color ?? CHALK };
  const head = s * 0.26;
  const hy = y - s * 0.84;
  p.rect(x, hy, head, head, c);
  // 안테나
  p.line(
    [
      [x, hy - head / 2],
      [x, hy - head / 2 - s * 0.12],
    ],
    { ...c, width: 0.01 },
  );
  p.circle(x, hy - head / 2 - s * 0.14, s * 0.025, { ...c, passes: 3 });
  const eye = s * 0.028;
  if (o.mood === 'dead') {
    for (const sx of [-1, 1]) {
      const cx = x + sx * p.ax(head * 0.26);
      const cy = hy - head * 0.08;
      p.line(
        [
          [cx - p.ax(eye * 1.6), cy - eye * 1.6],
          [cx + p.ax(eye * 1.6), cy + eye * 1.6],
        ],
        { color: RED, width: 0.011 },
      );
      p.line(
        [
          [cx + p.ax(eye * 1.6), cy - eye * 1.6],
          [cx - p.ax(eye * 1.6), cy + eye * 1.6],
        ],
        { color: RED, width: 0.011 },
      );
    }
  } else {
    for (const sx of [-1, 1]) p.circle(x + sx * p.ax(head * 0.26), hy - head * 0.08, eye, { ...c, passes: 3 });
    if (o.mood === 'sad') {
      p.line(
        [
          [x - p.ax(head * 0.28), hy + head * 0.34],
          [x, hy + head * 0.16],
          [x + p.ax(head * 0.28), hy + head * 0.34],
        ],
        { ...c, width: 0.01 },
      );
      // 눈물 한 방울
      p.line(
        [
          [x - p.ax(head * 0.26), hy + head * 0.02],
          [x - p.ax(head * 0.3), hy + head * 0.5],
        ],
        { color: COLD, width: 0.011 },
      );
    } else {
      p.line(
        [
          [x - p.ax(head * 0.28), hy + head * 0.28],
          [x + p.ax(head * 0.28), hy + head * 0.28],
        ],
        { ...c, width: 0.01 },
      );
    }
  }
  // 목 · 몸통 · 다리
  p.line(
    [
      [x, hy + head / 2],
      [x, hy + head / 2 + s * 0.06],
    ],
    c,
  );
  const body = { w: s * 0.34, h: s * 0.36 };
  const by = y - s * 0.36;
  p.rect(x, by, body.w, body.h, c);
  for (const sx of [-1, 1])
    p.line(
      [
        [x + sx * p.ax(s * 0.09), by + body.h / 2],
        [x + sx * p.ax(s * 0.09), y],
      ],
      c,
    );
  const sh = by - body.h * 0.28;
  if (o.arms === 'up') {
    for (const sx of [-1, 1])
      p.line(
        [
          [x + sx * p.ax(body.w / 2), sh],
          [x + sx * p.ax(s * 0.36), sh - s * 0.22],
        ],
        c,
      );
  } else if (o.arms === 'carry') {
    for (const sx of [-1, 1])
      p.line(
        [
          [x + sx * p.ax(body.w / 2), sh],
          [x + sx * p.ax(s * 0.28), sh - s * 0.16],
        ],
        c,
      );
  } else {
    for (const sx of [-1, 1])
      p.line(
        [
          [x + sx * p.ax(body.w / 2), sh],
          [x + sx * p.ax(s * 0.28), sh + s * 0.24],
        ],
        c,
      );
  }
}

/** 해 — 동그라미와 뻗친 선. 아이 그림엔 늘 해가 있다 */
function sun(p: Pen, x: number, y: number, r: number, color = WARM) {
  p.circle(x, y, r, { color });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.line(
      [
        [x + p.ax(Math.cos(a) * r * 1.4), y + Math.sin(a) * r * 1.4],
        [x + p.ax(Math.cos(a) * r * 2.1), y + Math.sin(a) * r * 2.1],
      ],
      { color, passes: 1, width: 0.009 },
    );
  }
}

/** 잠 — Z 셋. 아이 그림에서 자는 사람은 이걸로 읽힌다 */
function zzz(p: Pen, x: number, y: number, s: number) {
  for (let i = 0; i < 3; i++) {
    const k = s * (1 - i * 0.22);
    const cx = x + p.ax(i * s * 0.75);
    const cy = y - i * s * 0.8;
    p.line(
      [
        [cx, cy],
        [cx + p.ax(k), cy],
        [cx, cy + k],
        [cx + p.ax(k), cy + k],
      ],
      { color: COLD, passes: 1, width: 0.011 },
    );
  }
}

/** 바닥 선 — 그림마다 밑에 땅이 하나 그어져 있다 */
function ground(p: Pen, y: number, x0 = 0.05, x1 = 0.95) {
  p.line(
    [
      [x0, y],
      [x1, y],
    ],
    { passes: 1, width: 0.009 },
  );
}

/* ─────────────────────────────── 그림들 ─────────────────────────────── */

const SCENES: Record<ScrawlKind, (p: Pen) => void> = {
  beating(p) {
    ground(p, 0.9);
    human(p, 0.27, 0.9, 0.66, { arms: 'stick' });
    robot(p, 0.62, 0.9, 0.5, { mood: 'sad', arms: 'up' });
    // 맞은 자리 — 짧은 붉은 금 셋. 몽둥이 끝과 개체 머리 사이에 흩어 놓는다 (이으면 창 한 자루로 보인다)
    for (let i = 0; i < 3; i++)
      p.line(
        [
          [0.47 + i * 0.03, 0.52],
          [0.5 + i * 0.03, 0.62],
        ],
        { color: RED, passes: 1, width: 0.013 },
      );
    // 멀리서 보고 있는 작은 것 둘
    robot(p, 0.86, 0.9, 0.28, { mood: 'sad' });
    robot(p, 0.95, 0.9, 0.22, { mood: 'sad' });
  },
  resting(p) {
    // 가운데 금 — 아이 그림은 두 장면을 이렇게 가른다
    p.line(
      [
        [0.5, 0.08],
        [0.5, 0.96],
      ],
      { passes: 1, width: 0.008 },
    );
    sun(p, 0.13, 0.15, 0.045);
    // 왼쪽: 침대에 누워 자는 사람 — 머리·이불·Z
    p.rect(0.28, 0.74, 0.4, 0.13, {});
    p.circle(0.12, 0.66, 0.055, {});
    p.line(
      [
        [0.16, 0.69],
        [0.44, 0.68],
      ],
      { width: 0.011 },
    );
    zzz(p, 0.2, 0.44, 0.06);
    ground(p, 0.9, 0.06, 0.46);
    // 오른쪽: 짐을 안고 걷는 개체 둘 — 상자는 옆으로 든다 (머리 위에 얹으면 한 덩어리로 보인다)
    robot(p, 0.62, 0.9, 0.5, { arms: 'carry' });
    p.rect(0.76, 0.56, 0.19, 0.17, {});
    robot(p, 0.87, 0.9, 0.36, { arms: 'carry' });
    p.rect(0.96, 0.66, 0.12, 0.11, {});
    ground(p, 0.9, 0.54, 0.97);
  },
  danger(p) {
    ground(p, 0.9);
    // 불 — 붉은 지그재그 넷. 개체는 그 앞에 서서 안으로 걸어 들어간다 (겹쳐 그리면 형체가 뭉갠다)
    for (let i = 0; i < 4; i++) p.zig(0.74 + i * 0.075, 0.88, 0.34 + (i % 2) * 0.1, 5, 0.028, { color: RED, passes: 1, width: 0.013 });
    robot(p, 0.62, 0.9, 0.46, { mood: 'flat' });
    // 사람은 선 밖에서 손가락질만
    p.line(
      [
        [0.47, 0.24],
        [0.47, 0.96],
      ],
      { passes: 1, width: 0.008 },
    );
    human(p, 0.22, 0.9, 0.56, { arms: 'point' });
  },
  carry(p) {
    ground(p, 0.9);
    // 제 몸보다 큰 짐
    p.rect(0.36, 0.3, 0.3, 0.26, {});
    p.line(
      [
        [0.26, 0.3],
        [0.46, 0.3],
      ],
      { passes: 1 },
    );
    robot(p, 0.36, 0.9, 0.44, { arms: 'carry', mood: 'sad' });
    human(p, 0.76, 0.9, 0.54, { arms: 'point' });
    // 해가 셋 — 하루가 아니라 며칠이다
    for (let i = 0; i < 3; i++) sun(p, 0.1 + i * 0.075, 0.13, 0.022);
  },
  memorial(p) {
    ground(p, 0.9);
    // 꺼진 개체 — 눕혀서 그린다
    p.rect(0.5, 0.78, 0.42, 0.16, {});
    p.rect(0.68, 0.74, 0.2, 0.2, {});
    for (const k of [-1, 1]) {
      p.line(
        [
          [0.66 + (k < 0 ? 0 : 0.04), 0.7],
          [0.7 - (k < 0 ? 0 : 0.04), 0.78],
        ],
        { color: RED, width: 0.011 },
      );
    }
    robot(p, 0.22, 0.9, 0.42, { mood: 'sad' });
    robot(p, 0.88, 0.9, 0.42, { mood: 'sad' });
    // 세어 둔 수 — 다섯씩 묶은 금
    for (let g = 0; g < 3; g++) {
      const x0 = 0.3 + g * 0.14;
      for (let i = 0; i < 4; i++)
        p.line(
          [
            [x0 + i * 0.019, 0.12],
            [x0 + i * 0.019, 0.26],
          ],
          { passes: 1, width: 0.01 },
        );
      p.line(
        [
          [x0 - 0.012, 0.26],
          [x0 + 0.075, 0.12],
        ],
        { passes: 1, width: 0.01 },
      );
    }
  },
  window(p) {
    // 창살 안의 개체
    p.rect(0.3, 0.5, 0.6, 0.66, {});
    for (let i = 1; i < 4; i++)
      p.line(
        [
          [0.3 - 0.2 + i * 0.1, 0.17],
          [0.3 - 0.2 + i * 0.1, 0.83],
        ],
        { passes: 1, width: 0.009 },
      );
    robot(p, 0.3, 0.8, 0.5, { mood: 'sad', arms: 'up' });
    // 밖 — 해와 작은 집
    sun(p, 0.78, 0.26, 0.055);
    p.rect(0.78, 0.66, 0.2, 0.18, {});
    p.line(
      [
        [0.71, 0.57],
        [0.78, 0.46],
        [0.85, 0.57],
      ],
      {},
    );
    ground(p, 0.9, 0.6, 0.97);
  },
};

/* ─────────────────────────────── 텍스처 ─────────────────────────────── */

/**
 * 그림 한 장을 캔버스에 그려 텍스처로. 벽이 어두우니 발광 재질(MeshBasicMaterial)로 걸리되,
 * 알파로 눌러 분필 자국처럼 남긴다 (Chapter1Scene 의 material opacity). 판의 가로세로 비는 SCRAWL_ASPECT 여야 한다.
 */
export function scrawlTexture(kind: ScrawlKind, seed: number, w = 1024): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const h = Math.round(w / SCRAWL_ASPECT);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  SCENES[kind](makePen(ctx, w, h, seed));
  // 오래된 자국 — 군데군데 지워진다. 갓 그린 그림처럼 보이지 않게
  ctx.globalCompositeOperation = 'destination-out';
  const rnd = seeded(seed + 977);
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.18 + rnd() * 0.45;
    ctx.fillRect(rnd() * w, rnd() * h, 12 + rnd() * 90, 1 + rnd() * 4);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
