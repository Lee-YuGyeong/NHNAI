#!/usr/bin/env node
/**
 * GLB 에서 **텍스처를 통째로 뗀다** — 형상만 남긴다.
 *   node tools/glb-strip-tex.mjs <in.glb> <out.glb>
 *
 * 시행 표식 부품(tools/arena-glb.sh)이 쓴다. 그쪽은 색이 파일에 없어야 한다 —
 * 표식의 상태(다음·안·밟음·금지)에 따라 arena3d/map/markers.tsx 가 그때그때 칠하므로,
 * 재질을 통째로 갈아 끼운다. 갈아 끼운 뒤의 텍스처는 **한 픽셀도 안 보이면서 파일과 VRAM 만 먹는다**
 * (검사문: 2048² 석 장 = 파일 766KB · VRAM 67MB).
 *
 * UV 도 같이 나간다 — 텍스처를 쓰는 재질이 없으면 TEXCOORD 는 아무도 안 읽는다(prune 의 keepAttributes).
 * 그래서 이 단계는 simplify **앞**에 선다: UV 이음매가 없으면 접는 쪽이 훨씬 자유롭다.
 *
 * gltf-transform 패키지는 glb-simplify-permissive.mjs 와 같은 방식으로 찾고 같은 이유로 ESM 으로 부른다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('사용법: node tools/glb-strip-tex.mjs <in.glb> <out.glb>');
  process.exit(2);
}
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
const { prune } = await load('@gltf-transform/functions');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();
const n = root.listTextures().length;
// 재질에서 먼저 떼고 나서 버린다 — 매달린 채로 버리면 재질이 빈 슬롯을 가리킨다
for (const m of root.listMaterials()) {
  m.setBaseColorTexture(null);
  m.setNormalTexture(null);
  m.setMetallicRoughnessTexture(null);
  m.setEmissiveTexture(null);
  m.setOcclusionTexture(null);
}
for (const t of root.listTextures()) t.dispose();
await doc.transform(prune({ keepAttributes: false, keepLeaves: false }));
await io.write(outPath, doc);
console.log(`${inPath}: 텍스처 ${n}장 제거 → ${outPath}`);
