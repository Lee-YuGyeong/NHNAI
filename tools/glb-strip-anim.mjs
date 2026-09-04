#!/usr/bin/env node
/**
 * GLB 에서 애니메이션 클립만 뗀다 — 뼈대·스킨은 남긴다.
 *   node tools/glb-strip-anim.mjs <in.glb> <out.glb>
 * 무장 심문 AI: Tripo 프리셋 리타겟이 엉켜서(뼈 이름표 뒤섞임) 클립은 버리고 뼈대만 쓴다 — features/world/enforcerPose.ts 가 코드로 움직인다.
 * gltf-transform 패키지는 glb-simplify-permissive.mjs 와 같은 곳(npx 캐시·GLTF_TRANSFORM_DIR)에서 찾는다.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('사용법: node tools/glb-strip-anim.mjs <in.glb> <out.glb>');
  process.exit(2);
}
const candidates = [process.env.GLTF_TRANSFORM_DIR, join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules'), join(process.cwd(), 'node_modules')].filter(Boolean);
const base = candidates.find((d) => existsSync(join(d, '@gltf-transform/core')));
if (!base) {
  console.error('@gltf-transform/core 를 못 찾았다 — GLTF_TRANSFORM_DIR 로 node_modules 위치를 준다');
  process.exit(3);
}
const require = createRequire(join(base, 'x.js'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const anims = doc.getRoot().listAnimations();
for (const a of anims) {
  for (const ch of a.listChannels()) ch.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
await doc.transform(prune());
await io.write(outPath, doc);
console.log(`${inPath}: 클립 ${anims.length}개 제거 → ${outPath}`);
