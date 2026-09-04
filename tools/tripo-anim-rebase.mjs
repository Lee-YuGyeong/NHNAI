// Tripo animate 결과를 **바인드 자세에 다시 앉힌다** — 2026-09-03 새로 뽑은 여덟 몸 전부가 같은 식으로 깨져 왔다.
//   node tools/tripo-anim-rebase.mjs <in_anim.glb> <out_anim.glb>
// 실측(tracks.mjs): 리타깃(preset:biped:walk·idle)은 리거가 **이름표를 붙인 뼈**(Root·Spine_*·0/1_Left/Right_Limb_*)에만
//   템플릿 트랙을 이름표대로 얹고, bone_N 사슬(팔이 대부분)은 트랙이 없다. guard21(통과본)도 팔 트랙은 없다 — 팔은 몸통을 따라 흔들릴 뿐.
//   깨지는 방식 셋:
//   ① 이름표가 엉뚱한 사슬에 붙어 트랙이 **상수 오프셋**을 얹는다(팔 180° 위·머리 접힘·몸통 90°) → 회전 트랙의 주기 평균을 바인드로 되돌린다
//   ② (오진이었다) 팔이 T 자로 굳은 것은 **모델링된 팔 자세**다 — 리타깃은 팔 뼈에 트랙을 안 얹는다(guard21 도). 팔을 내린 채 뽑아야 한다
//   ③ 다리용 트랙(정강이 49°)이 가슴 뼈에 얹혀 몸통이 휘청인다 → 바인드 위치로 다리/윗몸을 가려 윗몸 뼈의 흔들림을 20° 로 누른다
// 회전 접근자는 제자리에서 덮어쓰고(지오메트리·텍스처 불변), JSON 청크만 다시 싼다.
import fs from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const CAP_UPPER = 10; // 윗몸(척추·머리·팔) 뼈의 회전 범위 상한(도) — 20 으로는 u118 의 가슴·목이 겹쳐 아직 휘청였다
const [src, dst] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen; const binLen = buf.readUInt32LE(binStart); const binOff = binStart + 8;
if (json.extensionsRequired?.length) throw new Error('compressed glb — run on the raw export');
const accFloats = (i) => { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const off = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0); if (bv.byteStride && bv.byteStride !== n * 4) throw new Error('strided'); return { n, count: a.count, get: (k, c) => buf.readFloatLE(off + (k * n + c) * 4), set: (k, c, v) => buf.writeFloatLE(v, off + (k * n + c) * 4) }; };

const parent = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
const local = json.nodes.map((n) => { const m = new Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1]))); return m; });
const world = []; const W = (i) => world[i] ?? (world[i] = parent[i] === undefined ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));

const skin = json.skins[0]; const meshNode = json.nodes.findIndex((n) => n.skin === 0); const bindMatrix = meshNode >= 0 ? W(meshNode) : new Matrix4();
const ibm = accFloats(skin.inverseBindMatrices);
const bindWorld = new Map();
skin.joints.forEach((j, k) => { const a = []; for (let c = 0; c < 16; c++) a.push(ibm.get(k, c)); bindWorld.set(j, new Matrix4().fromArray(a).invert().premultiply(bindMatrix)); });
const bindQ = {}, bindPos = {};
let restFixed = 0;
for (const j of skin.joints) {
  const pw = parent[j] !== undefined && bindWorld.has(parent[j]) ? bindWorld.get(parent[j]) : parent[j] !== undefined ? W(parent[j]) : new Matrix4();
  const l = pw.clone().invert().multiply(bindWorld.get(j)); const q = new Quaternion(), p = new Vector3(), s = new Vector3(); l.decompose(p, q, s);
  bindQ[j] = q; bindPos[j] = new Vector3().setFromMatrixPosition(bindWorld.get(j));
  // (②는 뺐다 — 실측으로 rest == 바인드였고, 다시 쓰면 Root 이동이 바뀌어 몸이 떠 버렸다. 확인만 한다)
  const n = json.nodes[j]; const rq = new Quaternion(...(n.rotation || [0, 0, 0, 1]));
  if (2 * Math.acos(Math.min(1, Math.abs(rq.dot(q)))) > 0.01) restFixed++;
}
// ③ 뼈 분류 — 자식 방향이 아래면 다리, 아니면 윗몸 (자식 없는 뼈는 부모 분류)
const kids = {}; skin.joints.forEach((j) => (kids[j] = (json.nodes[j].children || []).filter((c) => bindWorld.has(c))));
const cls = {}; const classify = (j) => { if (cls[j]) return cls[j]; if (kids[j].length === 0) return (cls[j] = parent[j] !== undefined && bindWorld.has(parent[j]) ? classify(parent[j]) : 'root'); const d = new Vector3(); for (const c of kids[j]) d.add(bindPos[c].clone().sub(bindPos[j])); d.divideScalar(kids[j].length); const len = d.length(); return (cls[j] = parent[j] === undefined || !bindWorld.has(parent[j]) ? 'root' : d.y < -0.4 * len ? 'leg' : 'upper'); };
skin.joints.forEach(classify);
const rootChildren = skin.joints.filter((j) => parent[j] !== undefined && !bindWorld.has(parent[j]) || parent[j] === undefined);
// Root 바로 아래에서 위로 가는 뼈(골반→척추)는 root 취급을 풀고 upper 로, 아래로 가는 것은 leg 로 이미 잡힌다

const deg = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;
const jointSet = new Set(skin.joints);
for (const anim of json.animations || []) {
  const report = [];
  for (const ch of anim.channels) {
    if (ch.target.path !== 'rotation' || !jointSet.has(ch.target.node)) continue;
    const j = ch.target.node; const out = accFloats(anim.samplers[ch.sampler].output);
    const qs = []; for (let k = 0; k < out.count; k++) qs.push(new Quaternion(out.get(k, 0), out.get(k, 1), out.get(k, 2), out.get(k, 3)));
    const mean = new Quaternion(0, 0, 0, 0);
    for (const q of qs) { const s = q.dot(qs[0]) < 0 ? -1 : 1; mean.x += s * q.x; mean.y += s * q.y; mean.z += s * q.z; mean.w += s * q.w; }
    mean.normalize();
    const bind = bindQ[j]; const corr = bind.clone().multiply(mean.clone().invert());   // ① 부모 프레임에서 q' = bind · mean⁻¹ · q
    let range = 0; const fixed = qs.map((q) => { const r = corr.clone().multiply(q); range = Math.max(range, deg(bind, r)); return r; });
    const c = cls[j]; const isLeg = c === 'leg' || (c === 'root' && parent[j] !== undefined && false);
    let f = 1; if (c !== 'leg' && range > CAP_UPPER) f = CAP_UPPER / range;   // ③ 윗몸 범위 상한
    fixed.forEach((r, k) => { const q = f < 1 ? bind.clone().slerp(r, f) : r; out.set(k, 0, q.x); out.set(k, 1, q.y); out.set(k, 2, q.z); out.set(k, 3, q.w); });
    report.push(`${(json.nodes[j].name || j).padEnd(24)} ${c.padEnd(5)} offset ${deg(bind, mean).toFixed(0).padStart(3)}° range ${range.toFixed(0).padStart(2)}°${f < 1 ? ' → capped ' + CAP_UPPER + '°' : ''}`);
  }
  console.log(`[${anim.name}] ${report.length} rotation tracks`); console.log(report.map((l) => '   ' + l).join('\n'));
}
console.log(`rest≠bind joints: ${restFixed} (of ${skin.joints.length}) — 0 이어야 정상`);
// JSON 청크를 다시 싼다 (4 바이트 정렬), BIN 은 그대로
let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
const bin = buf.subarray(binStart, binStart + 8 + binLen);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4);
fs.writeFileSync(dst, Buffer.concat([head, jh, js, bin]));
console.log('wrote', dst);
