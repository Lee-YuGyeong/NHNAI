#!/usr/bin/env node
/**
 * UV 섬 경계가 많은 Tripo v3.x 메시용 simplify — meshoptimizer 의 `Permissive` 플래그로 속성 seam 을 넘어 접는다.
 *
 * gltf-transform CLI 의 `simplify` 는 seam 정점을 경계로 잠가서, Tripo Studio v3.1 출력(UV 섬 수천 개)은 오차 상한을 무한으로 줘도
 * 원본의 12% 아래로 못 내려간다 (2026-08-28, 링 조명 137만 → 17만에서 멈춤). 이 스크립트는 같은 라이브러리에 플래그 하나만 더한 것이다.
 *
 *   node tools/glb-simplify-permissive.mjs <in.glb> <out.glb> <ratio> [error=1]
 *
 * gltf-transform 패키지는 npx 캐시(GLTF_TRANSFORM_DIR)나 프로젝트 node_modules 에서 찾는다. 결과는 CLI 의 resize·meshopt 로 이어서 줄인다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [inPath, outPath, ratioArg, errorArg] = process.argv.slice(2);
if (!inPath || !outPath || !ratioArg) {
  console.error('사용법: node tools/glb-simplify-permissive.mjs <in.glb> <out.glb> <ratio> [error=1]');
  process.exit(2);
}
const ratio = Number(ratioArg);
const error = errorArg === undefined ? 1 : Number(errorArg);

const candidates = [process.env.GLTF_TRANSFORM_DIR, join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules'), join(process.cwd(), 'node_modules')].filter(Boolean);
const base = candidates.find((d) => existsSync(join(d, '@gltf-transform/functions')));
if (!base) {
  console.error('@gltf-transform/functions 를 못 찾았다 — GLTF_TRANSFORM_DIR 로 node_modules 위치를 준다');
  process.exit(3);
}
/**
 * 패키지의 **ESM 진입점**을 package.json 에서 찾아 file URL 로 부른다.
 * createRequire 로는 못 부른다 — gltf-transform 4.5 의 CJS 빌드가 ESM 전용 property-graph 를
 * require 해서 ERR_REQUIRE_ESM 으로 죽는다 (2026-09-01, npx 캐시가 4.5 로 갱신되며 터졌다).
 */
async function load(name) {
  const dir = join(base, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const exp = pkg.exports?.['.'] ?? pkg.exports;
  // gltf-transform: exports['.'].default.default · meshoptimizer: exports['.'].default (문자열)
  const entry = exp?.default?.default ?? exp?.default ?? pkg.module ?? pkg.main;
  return import(pathToFileURL(join(dir, entry)).href);
}

const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { simplify, weld } = await load('@gltf-transform/functions');
const { MeshoptSimplifier } = await load('meshoptimizer');

await MeshoptSimplifier.ready;
// functions.simplify 는 flags 를 lockBorder 만 넘긴다 — 여기서 Permissive 를 끼워 넣는다
const orig = MeshoptSimplifier.simplify.bind(MeshoptSimplifier);
MeshoptSimplifier.simplify = (indices, positions, stride, target, err, flags = []) => orig(indices, positions, stride, target, err, [...flags, 'Permissive']);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const tri = (d) => d.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = tri(doc);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
const after = tri(doc);
await io.write(outPath, doc);
console.log(`${inPath}: tri ${Math.round(before)} → ${Math.round(after)} (ratio ${ratio}, error ${error}, Permissive)`);
