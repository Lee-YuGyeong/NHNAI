#!/usr/bin/env node
/**
 * 총 GLB 를 **소총 기준 좌표**로 돌려 놓는다 — 총열 +z · 위 +y · 길이 1 · z 는 −0.5~0.5 · 총열선은 y 0.2 (features/world/muzzle.ts 의 총구 자리).
 *
 * 사용자가 준 gun.glb(Tripo)는 총이 대각선으로 누워 있다 (2026-09-04 프리뷰: x 0.98 · y 0.89 · z 0.68 상자 — 세 축 모두 기울어짐).
 * enforcerPose.attachRifle 은 총이 이 기준 좌표라고 믿고 손에 쥐어 주므로, 여기서 한 번 돌려 노드 변환에 구워 넣는다.
 *
 *   node tools/gun-orient.mjs <in.glb> <out.glb>     (원본 · 비압축 GLB. 결과는 executioner-glb.sh 가 이어서 줄인다)
 *
 * 총열 축 = 정점 분포의 제1 주성분. 총구 쪽 = 축 양 끝 10% 정점의 축 둘레 반지름이 **작은** 끝 (개머리판·탄창 쪽이 굵다).
 * 위 = 제2 주성분에서, 축에서 더 멀리 뻗은 극단(탄창·손잡이)의 **반대**쪽. 결과는 프리뷰(tools/glb-preview.mjs)로 확인한다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('사용법: node tools/gun-orient.mjs <in.glb> <out.glb>');
  process.exit(2);
}
const candidates = [process.env.GLTF_TRANSFORM_DIR, join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules'), join(process.cwd(), 'node_modules')].filter(Boolean);
const base = candidates.find((d) => existsSync(join(d, '@gltf-transform/core')));
async function load(name) {
  const dir = join(base, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const exp = pkg.exports?.['.'] ?? pkg.exports;
  const entry = exp?.default?.default ?? exp?.default ?? pkg.module ?? pkg.main;
  return import(pathToFileURL(join(dir, entry)).href);
}
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);

/* ── 정점 모으기 (샘플링) ── */
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
const pts = [];
for (const p of prims) {
  const a = p.getAttribute('POSITION').getArray();
  const n = a.length / 3;
  const step = Math.max(1, Math.floor(n / 60000));
  for (let i = 0; i < n; i += step) pts.push([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]);
}
const mean = [0, 0, 0];
for (const p of pts) for (let k = 0; k < 3; k++) mean[k] += p[k] / pts.length;
const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of pts) {
  const d = [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (d[i] * d[j]) / pts.length;
}
/* 대칭 3×3 의 고유벡터 — 거듭제곱 반복 + 수축 */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const mul = (M, v) => M.map((r) => dot(r, v));
function power(M) {
  let v = norm([1, 0.7, 0.3]);
  for (let i = 0; i < 200; i++) v = norm(mul(M, v));
  return v;
}
const e1 = power(C);
const l1 = dot(mul(C, e1), e1);
const C2 = C.map((r, i) => r.map((v, j) => v - l1 * e1[i] * e1[j]));
const e2raw = power(C2);
const e2 = norm(e2raw.map((v, i) => v - dot(e2raw, e1) * e1[i]));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ── 총구 쪽: 축 양 끝 10% 의 축 둘레 반지름 ── */
const along = pts.map((p) => dot([p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]], e1));
const lo = Math.min(...along);
const hi = Math.max(...along);
const len = hi - lo;
const radial = (p) => { const d = [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]]; const t = dot(d, e1); return Math.hypot(d[0] - t * e1[0], d[1] - t * e1[1], d[2] - t * e1[2]); };
let rHi = 0, nHi = 0, rLo = 0, nLo = 0;
pts.forEach((p, i) => { if (along[i] > hi - len * 0.1) { rHi += radial(p); nHi++; } else if (along[i] < lo + len * 0.1) { rLo += radial(p); nLo++; } });
rHi /= Math.max(1, nHi); rLo /= Math.max(1, nLo);
const barrel = rHi < rLo ? e1 : e1.map((v) => -v);
/* ── 위: 제2 주성분에서 더 멀리 뻗은 극단의 반대 ── */
const side = pts.map((p) => dot([p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]], e2));
const sMax = Math.max(...side);
const sMin = Math.min(...side);
const up = sMax > -sMin ? e2.map((v) => -v) : e2;
const right = norm(cross(up, barrel));
const upO = norm(cross(barrel, right));
console.log('barrel', barrel.map((v) => +v.toFixed(3)), 'up', upO.map((v) => +v.toFixed(3)), 'len', +len.toFixed(3), 'r muzzle/stock', +rHi.toFixed(3), +rLo.toFixed(3));

/* ── 회전: 모델축 → 기준축 (right→+x, up→+y, barrel→+z). 행렬 R 의 행이 (right, up, barrel) ── */
const R = [right, upO, barrel];
// 행렬 → 쿼터니언 (R 은 정규직교)
const m00 = R[0][0], m01 = R[0][1], m02 = R[0][2], m10 = R[1][0], m11 = R[1][1], m12 = R[1][2], m20 = R[2][0], m21 = R[2][1], m22 = R[2][2];
const tr = m00 + m11 + m22;
let qx, qy, qz, qw;
if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }

/* ── 크기·자리: 길이 1, z −0.5~0.5, 총열선 y 0.2, x 0 ── */
const scale = 1 / len;
// 회전 뒤 평균점의 위치 (mean 이 총열선 위라 가정 — 주성분 축은 평균을 지난다)
const rot = (p) => [dot(R[0], p), dot(R[1], p), dot(R[2], p)];
const mR = rot(mean).map((v) => v * scale);
const zMid = ((lo + hi) / 2) * scale; // 축 좌표(평균 기준)의 중간
const translation = [-mR[0], 0.2 - mR[1], -mR[2] - zMid];

const root = doc.getRoot().listScenes()[0].listChildren()[0];
const wrap = doc.createNode('gun_oriented').setRotation([qx, qy, qz, qw]).setScale([scale, scale, scale]);
// 회전·배율을 먼저, 그 다음 평행이동 — 노드 TRS 는 T·R·S 순이라 평행이동은 회전된 좌표로 준다
wrap.setTranslation(translation);
const scene = doc.getRoot().listScenes()[0];
scene.removeChild(root);
wrap.addChild(root);
scene.addChild(wrap);
await io.write(outPath, doc);
console.log('wrote', outPath, 'rotation', [qx, qy, qz, qw].map((v) => +v.toFixed(4)), 'scale', +scale.toFixed(4), 'translation', translation.map((v) => +v.toFixed(3)));
