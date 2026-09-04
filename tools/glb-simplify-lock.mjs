#!/usr/bin/env node
/**
 * 리깅 인체 GLB 의 simplify — **눈 언저리 정점을 잠그고**, UV 를 속성으로 넣어 텍스처가 덜 뭉개지게 줄인다.
 *
 * 왜 따로 있나 (2026-09-04): gltf-transform CLI `weld → simplify` 로 군인 넷을 3% 로 줄였더니 눈이 뭉개져 감은 눈처럼 보였다.
 * 비율을 25% 로 올리고 텍스처를 4096 그대로 둬도, weld 를 빼도 안 돌아왔다 — 눈은 삼각형 몇백 개짜리 작은 자리라
 * 어떤 비율에서든 먼저 접히고, 접힌 정점의 UV 가 홍채 위로 눈꺼풀 텍셀을 끌어온다. 그래서 눈 자리(얼굴 앞면 · 눈높이 띠)의
 * 정점은 meshoptimizer 의 vertex_lock 으로 잠그고, 나머지는 UV 를 가중치로 넣은 simplifyWithAttributes 로 접는다.
 *
 *   node tools/glb-simplify-lock.mjs <in.glb> <out.glb> <ratio> [error=0.01]
 *
 * 눈 자리: 키 H 의 0.85~0.945 높이 띠에서 앞면(그 띠의 최대 z 에서 0.05 안) · 가운데(|x| < 0.075H). 헬멧 챙은 그 위라 안 든다.
 * gltf-transform 패키지는 glb-simplify-permissive.mjs 와 같은 곳에서 찾는다. 결과는 CLI 의 resize·meshopt 로 이어서 줄인다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [inPath, outPath, ratioArg, errorArg] = process.argv.slice(2);
if (!inPath || !outPath || !ratioArg) {
  console.error('사용법: node tools/glb-simplify-lock.mjs <in.glb> <out.glb> <ratio> [error=0.01]');
  process.exit(2);
}
const ratio = Number(ratioArg);
const targetError = errorArg === undefined ? 0.01 : Number(errorArg);

const candidates = [process.env.GLTF_TRANSFORM_DIR, join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules'), join(process.cwd(), 'node_modules')].filter(Boolean);
const base = candidates.find((d) => existsSync(join(d, '@gltf-transform/functions')));
if (!base) {
  console.error('@gltf-transform/functions 를 못 찾았다 — GLTF_TRANSFORM_DIR 로 node_modules 위치를 준다');
  process.exit(3);
}
async function load(name) {
  const dir = join(base, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const exp = pkg.exports?.['.'] ?? pkg.exports;
  const entry = exp?.default?.default ?? exp?.default ?? pkg.module ?? pkg.main;
  return import(pathToFileURL(join(dir, entry)).href);
}

const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptSimplifier } = await load('meshoptimizer');
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);

/* ── 눈 자리 찾기 — 전체 메시의 키와 눈높이 띠의 앞면 ── */
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
let maxY = -Infinity;
let minY = Infinity;
for (const p of prims) {
  const pos = p.getAttribute('POSITION').getArray();
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] > maxY) maxY = pos[i];
    if (pos[i] < minY) minY = pos[i];
  }
}
const H = maxY - minY;
const bandLo = minY + 0.85 * H;
const bandHi = minY + 0.945 * H;
const halfX = 0.075 * H;
let frontZ = -Infinity;
for (const p of prims) {
  const pos = p.getAttribute('POSITION').getArray();
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y >= bandLo && y <= bandHi && Math.abs(pos[i]) < halfX && pos[i + 2] > frontZ) frontZ = pos[i + 2];
  }
}
const zLo = frontZ - 0.05 * H;
// LOCK_HEAD=1 이면 머리 전체(y ≥ 0.80H)를 잠근다 — 눈 띠만으로 부족할 때 비교용
const LOCK_HEAD = process.env.LOCK_HEAD === '1';
const headY = minY + 0.8 * H;

let triBefore = 0;
let triAfter = 0;
let locked = 0;
for (const prim of prims) {
  const posAcc = prim.getAttribute('POSITION');
  const pos = posAcc.getArray();
  const n = posAcc.getCount();
  const idxAcc = prim.getIndices();
  const idx = idxAcc ? new Uint32Array(idxAcc.getArray()) : new Uint32Array(Array.from({ length: n }, (_, i) => i));
  triBefore += idx.length / 3;

  const lock = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    if ((LOCK_HEAD && y >= headY) || (y >= bandLo && y <= bandHi && Math.abs(x) < halfX && z >= zLo)) {
      lock[v] = 1;
      locked++;
    }
  }

  const uvAcc = prim.getAttribute('TEXCOORD_0');
  const uv = uvAcc ? new Float32Array(uvAcc.getArray()) : new Float32Array(0);
  const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3);
  const [out] = uvAcc
    ? MeshoptSimplifier.simplifyWithAttributes(idx, new Float32Array(pos), 3, uv, 2, [0.5, 0.5], lock, target, targetError, ['LockBorder'])
    : MeshoptSimplifier.simplify(idx, new Float32Array(pos), 3, target, targetError, ['LockBorder']);
  triAfter += out.length / 3;

  // 쓰이는 정점만 남긴다 — 접힌 정점을 버퍼에 남겨 두면 파일이 원본만큼 크다
  // ★ 버퍼는 접근자를 버리기 **전에** 잡아 둔다 — 버린 접근자의 getBuffer() 는 null 이라 인덱스가 안 써지고 메시가 산산조각 났다
  const buffer = posAcc.getBuffer() ?? doc.getRoot().listBuffers()[0];
  const remap = new Int32Array(n).fill(-1);
  let used = 0;
  for (let i = 0; i < out.length; i++) if (remap[out[i]] < 0) remap[out[i]] = used++;
  const newIdx = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) newIdx[i] = remap[out[i]];
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const arr = acc.getArray();
    const size = acc.getElementSize();
    const next = new arr.constructor(used * size);
    for (let v = 0; v < n; v++) {
      const r = remap[v];
      if (r < 0) continue;
      for (let k = 0; k < size; k++) next[r * size + k] = arr[v * size + k];
    }
    const na = doc.createAccessor().setType(acc.getType()).setArray(next).setNormalized(acc.getNormalized()).setBuffer(buffer);
    prim.setAttribute(sem, na);
    acc.dispose();
  }
  const ni = doc.createAccessor().setType('SCALAR').setArray(newIdx).setBuffer(buffer);
  prim.setIndices(ni);
  idxAcc?.dispose();
}

await io.write(outPath, doc);
console.log(`${inPath}: tri ${Math.round(triBefore)} → ${Math.round(triAfter)} (ratio ${ratio}, 눈 자리 잠금 ${locked} 정점, 띠 y ${bandLo.toFixed(3)}~${bandHi.toFixed(3)} z ≥ ${zLo.toFixed(3)})`);
