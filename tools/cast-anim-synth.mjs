// 개체 열의 **걸음·숨을 코드로 짓는다** — Tripo 리타깃 템플릿을 버리고, 리깅된 GLB 의 바인드 뼈대 위에 깨끗한 두 클립을 직접 쓴다.
//   node tools/cast-anim-synth.mjs classify <in_anim.glb>              뼈 분류를 찍어 본다 (root·spine·head·thigh/shin/foot·arm)
//   node tools/cast-anim-synth.mjs metric   <anim.glb ...>             walk·idle 클립을 12 위상에서 재고 한 줄 판정 (good / subtle / broken)
//   node tools/cast-anim-synth.mjs synth [--rerig] <in_anim.glb> <out_anim.glb>   클립 둘을 갈아 끼운다 (--rerig: 뼈대까지 살에서 다시 세운다 — u089) (이름은 preset:biped:walk · preset:biped:idle 그대로 —
//                                                                          features/world2/CastBody.tsx 가 그 이름으로 찾고, bones[0] 의 x·z 만 매 프레임 지운다)
//   이어서 sh tools/scenario2-cast-glb.sh <폴더> --anim <id> 로 줄이고 node tools/cast-walk-sheet.mjs <id> 로 본다.
//
// ★ 왜 (2026-09-03): Tripo animate 는 리거가 **이름표를 붙인 뼈**에만 템플릿 트랙을 얹는다. 이름표가 엉뚱한 사슬에 붙으면
//   (u104 는 왼 허벅지 트랙이 가슴에, u201 은 다리 트랙이 반만) 다리가 제자리에서 떨거나 몸통이 휘청인다. 팔 트랙은 아예 없다.
//   tools/tripo-anim-rebase.mjs 로 오프셋을 걷어내도 **없는 트랙은 못 살린다**. 그래서 이름표를 안 믿고 바인드 자세의 기하로
//   뼈를 나눈 뒤 — 골반 아래로 길게 내려가는 두 사슬이 다리, 위로 가는 사슬이 척추·머리, 척추에서 옆으로 벌어진 사슬이 팔 —
//   각 뼈의 **부모 바인드 프레임**에서 쿼터니언을 다시 계산해 쓴다 (q' = Rp⁻¹ · R_world(t) · Rp · q_bind).
// ★ 걸음(1.0 s 한 바퀴): 허벅지 ±22° 앞뒤(두 다리 역위상) · 정강이 스윙에서 0→35° 접힘 · 발은 반대로 젖혀 수평 유지 ·
//   골반 2 cm 두 번 출렁 · 척추 ±3° 반대 비틀림 · 팔 ±10° 다리와 반대. 숨(4 s): 척추 ±1° · 무게 이동 0.5° · 팔 미세.
// ★ 축은 이름으로 안 정한다 — 두 엉덩이를 잇는 선을 x·z 축 중 가까운 쪽에 붙인 것이 좌우, 앞은 발가락 뼈(발목→발가락) 방향, 없으면 +x (Tripo 는 몸을 +x 로 세운다).
//   살의 발 모양(guard21 의 발은 앞뒤로 같이 뻗은 덩어리)도, Tripo 클립의 루트 이동(몸마다 앞뒤가 다르다)도 못 믿는다 — 열 몸 실측.
// ★ 클립만 갈아 끼워도 다리가 안 움직이는 몸이 있다 — 다리 살이 Root 에 붙어 있어서다(u104 42%). synth 는 엉덩이 아래 정점의 Root·척추 무게를 가장 가까운 다리 마디로 옮긴다.
//   리그가 다리 자체를 못 잡은 몸(u089 r3)은 --rerig 로 살에서 최소 뼈대를 다시 세운다 (팔은 굳는다).
// ★ metric 의 자동 판정: 두 허벅지 진폭 ≥ 12° · 진폭비 0.6~1.6 · 위상차 π±π/4 · 윗몸 뼈 25° 이하 · 몸통 앞뒤 12° 이하 ·
//   발끝이 골반 아래 · 옆 흔들림이 앞뒤의 절반 이하 · 무릎이 뒤로 안 꺾임 → good. 진폭이 모자라면 subtle, 한계를 넘으면 broken.
import fs from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const WALK = { period: 1.0, fps: 24, thigh: 22, knee: 35, kneeStance: 4, bob: 0.02, twist: 3, arm: 10, forearm: 8, foot: 0.55 };
const IDLE = { period: 4.0, fps: 12, spine: 1.0, sway: 0.5, arm: 1.0, lift: 0.003 };
const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

// ---------------------------------------------------------------- GLB 읽고 쓰기 (압축 안 된 원본만)
function readGlb(path) {
  const buf = fs.readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${path}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);
  if (json.extensionsRequired?.length) throw new Error(`${path}: compressed glb (${json.extensionsRequired}) — run on the raw export`);
  return { json, bin };
}
function writeGlb(path, json, bin) {
  let js = Buffer.from(JSON.stringify(json));
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  let bb = bin;
  while (bb.length % 4) bb = Buffer.concat([bb, Buffer.alloc(1)]);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bb.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bb.length, 0); bh.write('BIN\0', 4);
  fs.writeFileSync(path, Buffer.concat([head, jh, js, bh, bb]));
}
const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(json, bin, i) {
  const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const n = N[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const size = { 5126: 4, 5123: 2, 5125: 4, 5121: 1, 5120: 1, 5122: 2 }[a.componentType];
  const stride = bv.byteStride || n * size;
  const rd = { 5126: (o) => bin.readFloatLE(o), 5123: (o) => bin.readUInt16LE(o), 5125: (o) => bin.readUInt32LE(o), 5121: (o) => bin.readUInt8(o), 5120: (o) => bin.readInt8(o), 5122: (o) => bin.readInt16LE(o) }[a.componentType];
  const norm = a.normalized ? { 5121: 255, 5123: 65535 }[a.componentType] : 0;
  const wr = { 5126: (o, v) => bin.writeFloatLE(v, o), 5123: (o, v) => bin.writeUInt16LE(Math.round(v), o), 5125: (o, v) => bin.writeUInt32LE(Math.round(v), o), 5121: (o, v) => bin.writeUInt8(Math.round(v), o) }[a.componentType];
  return { n, count: a.count, componentType: a.componentType, get: (k, c) => rd(off + k * stride + c * size) / (norm || 1), set: (k, c, v) => wr(off + k * stride + c * size, norm ? Math.max(0, Math.min(norm, v * norm)) : v) };
}

// ---------------------------------------------------------------- 뼈대 — 바인드 세계 행렬과 기하 분류
function skeleton(json, bin) {
  const parent = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const local = json.nodes.map((n) => { const m = new Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1]))); return m; });
  const world = []; const W = (i) => world[i] ?? (world[i] = parent[i] === undefined ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));
  const skin = json.skins[0]; const joints = skin.joints; const jset = new Set(joints);
  const pos = {}; const rotW = {}; for (const j of joints) { pos[j] = new Vector3().setFromMatrixPosition(W(j)); rotW[j] = new Quaternion().setFromRotationMatrix(W(j)); }
  // 살 ↔ 뼈 — three 는 정점을 (boneWorld · IBM · bindMatrix) 로 옮긴다. 바인드에서 그 곱 D 는 뼈마다 같아야 하고
  //   (Tripo 는 살을 −0.5..0.5 에, 뼈를 0.5 위에 둔다 — D 가 y+0.5 평행이동), 정점을 D 로 옮기면 뼈와 같은 공간이 된다
  const meshNode = json.nodes.findIndex((n) => n.skin === 0); const meshW = meshNode >= 0 ? W(meshNode) : new Matrix4();
  const ibm = accessor(json, bin, skin.inverseBindMatrices); let D = null; let bindErr = 0;
  joints.forEach((j, k) => { const a = []; for (let c = 0; c < 16; c++) a.push(ibm.get(k, c)); const d = W(j).clone().multiply(new Matrix4().fromArray(a)); /* three 는 identity 로 bind 한다 (GLTFLoader) — 메시 노드 변환은 안 낀다 */ if (!D) D = d; else bindErr = Math.max(bindErr, ...d.elements.map((v, i) => Math.abs(v - D.elements[i]))); });
  const kids = {}; joints.forEach((j) => (kids[j] = (json.nodes[j].children || []).filter((c) => jset.has(c))));
  const size = {}; const count = (j) => size[j] ?? (size[j] = 1 + kids[j].reduce((s, c) => s + count(c), 0)); joints.forEach(count);
  const chainChild = (j) => kids[j].length ? kids[j].slice().sort((a, b) => count(b) - count(a) || pos[b].distanceTo(pos[j]) - pos[a].distanceTo(pos[j]))[0] : undefined;
  const chain = (j) => { const out = [j]; let c = chainChild(j); while (c !== undefined) { out.push(c); c = chainChild(c); } return out; };
  /** 겹친 관절(0.02h 안)을 하나로 — Tripo 는 엉덩이·어깨에 길이 0 인 뼈를 둘씩 둔다. 앞의 것을 남기고(자식은 따라온다) 역할은 그것에 붙인다 */
  const reduce = (ch) => { const out = [ch[0]]; for (const j of ch.slice(1)) if (pos[j].distanceTo(pos[out[out.length - 1]]) > 0.02 * h) out.push(j); return out; };
  // 몸 크기 — 살의 상자 (뼈 공간)
  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) }; const verts = [];
  for (const mesh of json.meshes) for (const p of mesh.primitives) { const acc = accessor(json, bin, p.attributes.POSITION); for (let k = 0; k < acc.count; k++) { const v = new Vector3(acc.get(k, 0), acc.get(k, 1), acc.get(k, 2)).applyMatrix4(D); box.min.min(v); box.max.max(v); if (k % 5 === 0) verts.push(v); } }
  const h = box.max.y - box.min.y; const floor = box.min.y;
  // 뼈마다 살이 얼마나 붙었나 — 살이 없는 중간 뼈(Tripo 척추 사슬의 안쪽)는 150° 돌아도 안 보이니 판정에서 뺀다
  const weight = {}; joints.forEach((j) => (weight[j] = 0)); let weightTotal = 0;
  for (const mesh of json.meshes) for (const p of mesh.primitives) { if (p.attributes.JOINTS_0 === undefined) continue; const ja = accessor(json, bin, p.attributes.JOINTS_0), wa = accessor(json, bin, p.attributes.WEIGHTS_0); for (let k = 0; k < ja.count; k++) for (let c = 0; c < 4; c++) { const w = wa.get(k, c); const j = joints[ja.get(k, c)]; if (j !== undefined && w > 0) { weight[j] += w; weightTotal += w; } } }
  const skinned = (j) => weight[j] > 0.003 * weightTotal;
  const legRootShare = () => { let root = 0, all = 0; const hipY = Math.min(...Object.values(legs).filter(Boolean).map((l) => pos[l.thigh].y)); for (const mesh of json.meshes) for (const p of mesh.primitives) { if (p.attributes.JOINTS_0 === undefined) continue; const pa = accessor(json, bin, p.attributes.POSITION), ja = accessor(json, bin, p.attributes.JOINTS_0), wa = accessor(json, bin, p.attributes.WEIGHTS_0); for (let k = 0; k < pa.count; k++) { if (new Vector3(pa.get(k, 0), pa.get(k, 1), pa.get(k, 2)).applyMatrix4(D).y > hipY - 0.05 * h) continue; for (let c = 0; c < 4; c++) { const w = wa.get(k, c); const j = joints[ja.get(k, c)]; if (w <= 0) continue; all += w; if (/^(root|spine|head)$/.test(cls[j])) root += w; } } } return all ? root / all : 0; };
  const roots = joints.filter((j) => parent[j] === undefined || !jset.has(parent[j])).sort((a, b) => count(b) - count(a));
  const root = roots[0];
  const cls = {}; joints.forEach((j) => (cls[j] = 'other'));
  cls[root] = 'root';
  const legs = { L: null, R: null }; const arms = { L: null, R: null }; let spine = []; let head = [];
  // 다리 — 루트(또는 골반) 바로 아래, 엉덩이 높이(바닥 + 0.7h 아래)에서 시작해 아래로 길게(0.22h) 내려가는 사슬. 팔은 어깨(0.8h 위)에서 시작하니 안 섞인다
  const legCands = [];
  const walkDown = (j, depth) => { for (const c of kids[j]) { if (pos[c].y > floor + 0.7 * h) continue; const ch = reduce(chain(c)); const end = pos[ch[ch.length - 1]]; const d = end.clone().sub(pos[c]); const drop = pos[c].y - end.y; const seg = ch.length > 1 ? pos[ch[1]].clone().sub(pos[c]) : d; if (drop > 0.22 * h && d.y < -0.6 * d.length() && seg.y < -0.6 * seg.length() && end.y < floor + 0.3 * h) legCands.push({ start: c, chain: ch, drop }); else if (depth < 1 && ch.length > 1) walkDown(c, depth + 1); } };
  walkDown(root, 0);
  legCands.sort((a, b) => b.drop - a.drop);
  // 좌우 축 — 두 엉덩이를 잇는 수평선을 x·z 축 중 가까운 쪽에 **붙인다** (Tripo 리그는 축 정렬이고, u137 처럼 한 발 앞선 자세면 엉덩이선이 비스듬하다)
  let lateral = null;
  if (legCands.length >= 2) lateral = pos[legCands[0].start].clone().sub(pos[legCands[1].start]);
  else if (legCands.length === 1) lateral = pos[legCands[0].start].clone().sub(pos[root]);
  if (!lateral || lateral.setY(0).length() < 0.02 * h) lateral = new Vector3(0, 0, 1);
  lateral = Math.abs(lateral.x) > Math.abs(lateral.z) ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  // 앞 — 좌우에 수직인 수평축. 부호는 발가락 뼈(발목 → 발가락)가 있으면 그쪽, 없으면 +x (Tripo 는 몸을 +x 를 보게 세운다 — 열 몸 전부 실측)
  //   ★ 살의 발 모양으로는 못 정한다 (guard21 의 발은 앞뒤로 같이 뻗은 덩어리라 반대로 읽혔다). 루트 이동 방향도 못 쓴다 — 몸마다 앞뒤가 뒤죽박죽이다
  let fwd = new Vector3().crossVectors(lateral, Y).normalize(); if (fwd.x < 0 || (fwd.x === 0 && fwd.z < 0)) fwd.negate();
  { let acc = 0; for (const l of legCands) if (l.chain.length >= 4) acc += pos[l.chain[3]].clone().sub(pos[l.chain[2]]).dot(fwd); if (Math.abs(acc) > 0.02 * h && acc < 0) fwd.negate(); }
  const left = new Vector3().crossVectors(Y, fwd).normalize();   // 앞을 보고 선 몸의 왼쪽
  const sideOf = (j) => (pos[j].dot(left) >= pos[root].dot(left) ? 'L' : 'R');
  for (const cand of legCands) { const side = sideOf(cand.start); if (!legs[side]) legs[side] = cand; }
  // 리거가 한쪽 다리를 뼈 하나로만 남겼으면(leader) 그 뼈를 통째로 허벅지로 쓴다 — 무릎 없이 흔들린다
  for (const side of ['L', 'R']) if (!legs[side]) { const other = legs[side === 'L' ? 'R' : 'L']; if (!other) continue; const lone = kids[root].filter((c) => kids[c].length === 0 && sideOf(c) === side && Math.abs(pos[c].y - pos[other.start].y) < 0.1 * h).sort((a, b) => Math.abs(pos[b].dot(left)) - Math.abs(pos[a].dot(left)))[0]; if (lone !== undefined) legs[side] = { start: lone, chain: [lone], drop: 0, lone: true }; }
  for (const side of ['L', 'R']) { const lg = legs[side]; if (!lg) continue; const ch = lg.chain; const names = ['thigh', 'shin', 'foot', 'toe']; ch.forEach((j, i) => (cls[j] = (names[i] || 'toe') + side)); lg.thigh = ch[0]; lg.shin = ch[1]; lg.foot = ch[2]; lg.tip = ch[Math.min(2, ch.length - 1)]; }
  const legSet = new Set(Object.values(legs).flatMap((l) => (l ? l.chain : [])));
  // 척추 — 루트에서 위로 가는 가장 큰 사슬, 갈림길마다 **가장 수직인** 자식을 따른다 (팔·빗장뼈는 옆으로 샌다)
  const upStart = kids[root].filter((c) => !legSet.has(c) && pos[c].y > pos[root].y - 0.02 * h).sort((a, b) => count(b) - count(a))[0];
  if (upStart !== undefined) {
    let j = upStart; const sp = [];
    while (j !== undefined) { sp.push(j); const ups = kids[j].filter((c) => !legSet.has(c)).map((c) => { const d = pos[c].clone().sub(pos[j]); return { c, v: d.length() < 0.02 * h ? 2 : d.y / d.length() }; }).filter((x) => x.v > 0.5).sort((a, b) => b.v - a.v); j = ups[0]?.c; }   // 겹친 뼈(길이 0)는 그냥 따라간다
    const spSet = new Set(sp);
    // 팔 — 척추 뼈에서 갈라져 끝이 옆으로 0.1h 넘게 벌어진 사슬. 윗팔 = 옆으로 0.08h 벌어졌거나 아래로 곧게(0.6) 떨어지는 첫 뼈
    const armCands = [];
    for (const s of sp) for (const c of kids[s]) { if (spSet.has(c) || legSet.has(c)) continue; const ch = reduce(chain(c)); const end = ch[ch.length - 1]; const off = Math.abs(pos[end].dot(left) - pos[s].dot(left)); if (off > 0.1 * h) armCands.push({ from: s, chain: ch, off }); }
    armCands.sort((a, b) => b.off - a.off);
    for (const a of armCands) { const side = pos[a.chain[a.chain.length - 1]].dot(left) >= pos[a.from].dot(left) ? 'L' : 'R'; if (!arms[side]) arms[side] = a; }
    let shoulderY = -Infinity; for (const a of Object.values(arms)) if (a) shoulderY = Math.max(shoulderY, pos[a.from].y);
    for (const s of sp) { if (shoulderY > -Infinity && pos[s].y > shoulderY + 0.02 * h) head.push(s); else spine.push(s); }
    if (shoulderY === -Infinity) { const cut = Math.max(1, sp.length - 1); spine = sp.slice(0, cut); head = sp.slice(cut); }
    spine.forEach((s) => (cls[s] = 'spine')); head.forEach((s) => (cls[s] = 'head'));
    for (const side of ['L', 'R']) {
      const a = arms[side]; if (!a) continue; const ch = a.chain; const sx = pos[a.from].dot(left);
      let ui = ch.findIndex((k, i) => { const off = Math.abs(pos[k].dot(left) - sx); const nx = ch[i + 1]; const d = nx !== undefined ? pos[nx].clone().sub(pos[k]) : new Vector3(); return off > 0.08 * h || (d.length() > 0.05 * h && d.y < -0.6 * d.length()); });
      if (ui < 0) ui = 0; a.upper = ch[ui]; a.fore = ch[ui + 1]; a.hand = ch[ui + 2];
      ch.forEach((k, i) => (cls[k] = i < ui ? 'clav' + side : i === ui ? 'upper' + side : i === ui + 1 ? 'fore' + side : 'hand' + side));
    }
  }
  const front = fwd;
  return { json, bin, joints, jset, parent, kids, local, world, W, pos, rotW, cls, root, legs, arms, spine, head, h, box, floor, fwd, left, front, bindErr, chain, D, weight, skinned, legRootShare };
}

// ---------------------------------------------------------------- 클립 샘플링 (LINEAR)
function trackReader(json, bin, anim) {
  const tracks = [];
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler]; const tin = accessor(json, bin, s.input); const out = accessor(json, bin, s.output);
    const times = []; for (let k = 0; k < tin.count; k++) times.push(tin.get(k, 0));
    const vals = []; for (let k = 0; k < out.count; k++) { const v = []; for (let c = 0; c < out.n; c++) v.push(out.get(k, c)); vals.push(v); }
    tracks.push({ node: ch.target.node, path: ch.target.path, times, vals, interp: s.interpolation || 'LINEAR' });
  }
  const duration = Math.max(...tracks.map((t) => t.times[t.times.length - 1]));
  const sample = (tr, t) => {
    const T = tr.times; if (t <= T[0]) return tr.vals[0]; if (t >= T[T.length - 1]) return tr.vals[T.length - 1];
    let i = 0; while (T[i + 1] < t) i++; const f = (t - T[i]) / (T[i + 1] - T[i] || 1); const a = tr.vals[i], b = tr.vals[i + 1];
    if (tr.path === 'rotation') { const qa = new Quaternion(...a), qb = new Quaternion(...b); return qa.slerp(qb, f).toArray(); }
    return a.map((v, c) => v + (b[c] - v) * f);
  };
  return { tracks, duration, sample };
}
/** t 초의 자세 — 노드별 로컬 행렬을 바인드에서 시작해 트랙으로 덮고 세계 행렬을 만든다 */
function poseAt(sk, reader, t) {
  const trs = {}; for (const j of sk.joints) { const p = new Vector3(), q = new Quaternion(), s = new Vector3(); sk.local[j].decompose(p, q, s); trs[j] = { p, q, s }; }
  for (const tr of reader.tracks) { if (!sk.jset.has(tr.node)) continue; const v = reader.sample(tr, t); if (tr.path === 'rotation') trs[tr.node].q.set(...v); else if (tr.path === 'translation') trs[tr.node].p.set(...v); else if (tr.path === 'scale') trs[tr.node].s.set(...v); }
  const world = {}; const Wp = (j) => world[j] ?? (world[j] = (sk.parent[j] !== undefined && sk.jset.has(sk.parent[j]) ? Wp(sk.parent[j]).clone() : sk.parent[j] !== undefined ? sk.W(sk.parent[j]).clone() : new Matrix4()).multiply(new Matrix4().compose(trs[j].p, trs[j].q, trs[j].s)));
  for (const j of sk.joints) Wp(j);
  return world;
}
const angDeg = (qa, qb) => (2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180) / Math.PI;
/** 뼈의 세계 방향(자식 쪽) 을 그 자세에서 — 자식이 없으면 바인드 방향에 회전차를 먹인다 */
function boneDir(sk, world, j) {
  const c = sk.chain(j)[1]; const q = new Quaternion().setFromRotationMatrix(world[j]);
  const base = c !== undefined ? sk.pos[c].clone().sub(sk.pos[j]) : new Vector3(0, -1, 0);
  return base.applyQuaternion(sk.rotW[j].clone().invert()).applyQuaternion(q).normalize();
}
const sag = (d, sk) => (Math.atan2(d.dot(sk.fwd), -d.y) * 180) / Math.PI;   // 앞(+)·뒤(−) 기울기 — 아래를 향한 뼈 기준
const lat = (d, sk) => (Math.atan2(d.dot(sk.left), -d.y) * 180) / Math.PI;  // 옆 기울기

// ---------------------------------------------------------------- 재기
function metricOne(path) {
  const { json, bin } = readGlb(path); const sk = skeleton(json, bin);
  const walk = (json.animations || []).find((a) => a.name === 'preset:biped:walk') || (json.animations || [])[0];
  const idle = (json.animations || []).find((a) => a.name === 'preset:biped:idle');
  const flags = []; const r = { id: path.split('/').pop().replace(/_anim\.glb$|\.glb$/, ''), src: json.asset?.generator || '' };
  if (!walk) { flags.push('no walk clip'); return { r, flags, verdict: 'broken' }; }
  const rd = trackReader(json, bin, walk); const P = 12; const phases = []; const bindWorld = {}; for (const j of sk.joints) bindWorld[j] = sk.W(j);
  const series = { thighL: [], thighR: [], kneeL: [], kneeR: [], tipL: [], tipR: [], rootY: [], rootXZ: [], torsoPitch: [], torsoRoll: [], upperMax: [] };
  const upperDev = {};
  for (let i = 0; i < P; i++) {
    const t = (i / P) * rd.duration; const w = poseAt(sk, rd, t); phases.push(w);
    const rp = new Vector3().setFromMatrixPosition(w[sk.root]); series.rootY.push(rp.y); series.rootXZ.push([rp.x, rp.z]);
    let hipY = Infinity; for (const side of ['L', 'R']) if (sk.legs[side]) hipY = Math.min(hipY, new Vector3().setFromMatrixPosition(w[sk.legs[side].thigh]).y); (series.hipY ??= []).push(hipY);
    for (const side of ['L', 'R']) {
      const lg = sk.legs[side]; if (!lg) { series['thigh' + side].push(0); series['knee' + side].push(0); series['tip' + side].push(new Vector3()); continue; }
      const td = boneDir(sk, w, lg.thigh); series['thigh' + side].push(sag(td, sk) - sag(boneDir(sk, bindWorld, lg.thigh), sk));
      if (lg.shin !== undefined) { const sd = boneDir(sk, w, lg.shin); const bend = sag(td, sk) - sag(sd, sk); const bind = sag(boneDir(sk, bindWorld, lg.thigh), sk) - sag(boneDir(sk, bindWorld, lg.shin), sk); series['knee' + side].push(bend - bind); } else series['knee' + side].push(0);
      let tip = new Vector3().setFromMatrixPosition(w[lg.tip]);
      if (lg.foot === undefined) { const last = lg.chain[lg.chain.length - 1]; tip.add(boneDir(sk, w, last).multiplyScalar(Math.max(0, sk.pos[last].y - sk.floor))); }   // 발목 뼈가 없으면 마지막 뼈를 바닥까지 늘인다
      series['tip' + side].push(tip.sub(new Vector3(rp.x, 0, rp.z)));
    }
    // 몸통 — 루트에서 척추 끝(머리 첫 뼈 또는 마지막 척추)까지의 방향
    const top = sk.head[0] ?? sk.spine[sk.spine.length - 1]; if (top !== undefined) { const d = new Vector3().setFromMatrixPosition(w[top]).sub(rp).normalize(); series.torsoPitch.push((Math.atan2(d.dot(sk.fwd), d.y) * 180) / Math.PI); series.torsoRoll.push((Math.atan2(d.dot(sk.left), d.y) * 180) / Math.PI); }
    for (const j of sk.joints) { const c = sk.cls[j]; if (/^(thigh|shin|foot|toe|root)/.test(c) || !sk.skinned(j)) continue; const dev = angDeg(new Quaternion().setFromRotationMatrix(w[j]), sk.rotW[j]); upperDev[j] = Math.max(upperDev[j] || 0, dev); }
  }
  const range = (a) => Math.max(...a) - Math.min(...a);
  const amp = (a) => range(a) / 2;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  // 위상차 — 오른 허벅지를 k 칸 밀었을 때 왼 허벅지와 가장 잘 맞는 k
  let bestK = 0, bestC = -Infinity; const L = series.thighL.map((v) => v - mean(series.thighL)), R = series.thighR.map((v) => v - mean(series.thighR));
  for (let k = 0; k < P; k++) { let c = 0; for (let i = 0; i < P; i++) c += L[i] * R[(i + k) % P]; if (c > bestC) { bestC = c; bestK = k; } }
  const phase = (bestK / P) * 2 * Math.PI;
  const rootXZdrift = Math.hypot(series.rootXZ[P - 1][0] - series.rootXZ[0][0], series.rootXZ[P - 1][1] - series.rootXZ[0][1]);
  const hipYmin = Math.min(...(series.hipY || [Infinity]));
  const tipStat = (side) => { const t = series['tip' + side]; if (!sk.legs[side]) return { fwd: 0, side: 0, above: false }; return { fwd: range(t.map((v) => v.dot(sk.fwd))), side: range(t.map((v) => v.dot(sk.left))), maxY: Math.max(...t.map((v) => v.y)) }; };
  const tL = tipStat('L'), tR = tipStat('R');
  const m = {
    thighAmpL: amp(series.thighL), thighAmpR: amp(series.thighR), phase, ratio: amp(series.thighL) / Math.max(1e-6, amp(series.thighR)),
    kneeMinL: Math.min(...series.kneeL), kneeMaxL: Math.max(...series.kneeL), kneeMinR: Math.min(...series.kneeR), kneeMaxR: Math.max(...series.kneeR),
    bob: range(series.rootY) / sk.h * 1.72, rootDrift: rootXZdrift / sk.h * 1.72,
    footFwdL: (tL.fwd / sk.h) * 1.72, footSideL: (tL.side / sk.h) * 1.72, footFwdR: (tR.fwd / sk.h) * 1.72, footSideR: (tR.side / sk.h) * 1.72,
    footAbovePelvis: Math.max(tL.maxY ?? -Infinity, tR.maxY ?? -Infinity) > hipYmin,
    torsoPitch: series.torsoPitch.length ? range(series.torsoPitch) : 0, torsoLean: series.torsoPitch.length ? mean(series.torsoPitch) - (() => { const d = sk.pos[sk.head[0] ?? sk.spine[sk.spine.length - 1]].clone().sub(sk.pos[sk.root]).normalize(); return (Math.atan2(d.dot(sk.fwd), d.y) * 180) / Math.PI; })() : 0, torsoRoll: series.torsoRoll.length ? range(series.torsoRoll) : 0,
  };
  const upperTop = Object.entries(upperDev).sort((a, b) => b[1] - a[1])[0];
  m.upperMax = upperTop ? upperTop[1] : 0; m.upperMaxBone = upperTop ? `${json.nodes[upperTop[0]].name}(${sk.cls[upperTop[0]]})` : '';
  // 떨림 — 회전 트랙의 이웃 키 사이 각
  let jitter = 0; for (const tr of rd.tracks) if (tr.path === 'rotation') for (let k = 1; k < tr.vals.length; k++) jitter = Math.max(jitter, angDeg(new Quaternion(...tr.vals[k - 1]), new Quaternion(...tr.vals[k])));
  m.legStray = sk.legRootShare();
  m.jitter = jitter; m.keys = Math.max(...rd.tracks.map((t) => t.times.length)); m.duration = rd.duration;
  // 팔 — 흔들리나
  m.armSwing = 0; for (const a of Object.values(sk.arms)) if (a?.upper !== undefined) { const s = phases.map((w) => sag(boneDir(sk, w, a.upper), sk)); m.armSwing = Math.max(m.armSwing, amp(s)); }
  // idle — 표류·이탈
  m.idleDrift = 0; m.idleDev = 0;
  if (idle) { const ri = trackReader(json, bin, idle); const w0 = poseAt(sk, ri, 0), w1 = poseAt(sk, ri, ri.duration); m.idleDrift = new Vector3().setFromMatrixPosition(w0[sk.root]).distanceTo(new Vector3().setFromMatrixPosition(w1[sk.root])) / sk.h * 1.72; for (let i = 0; i < 6; i++) { const w = poseAt(sk, ri, (i / 6) * ri.duration); for (const j of sk.joints) if (sk.skinned(j)) m.idleDev = Math.max(m.idleDev, angDeg(new Quaternion().setFromRotationMatrix(w[j]), sk.rotW[j])); } } else flags.push('no idle clip');
  // 판정
  if (!sk.legs.L || !sk.legs.R) flags.push('legs not found');
  if (m.thighAmpL > 60 || m.thighAmpR > 60) flags.push('thigh >60°');
  if (m.kneeMinL < -8 || m.kneeMinR < -8) flags.push(`knee backwards (${m.kneeMinL.toFixed(0)}/${m.kneeMinR.toFixed(0)}°)`);
  if (m.kneeMaxL > 95 || m.kneeMaxR > 95) flags.push('knee >95°');
  if (m.upperMax > 25) flags.push(`upper ${m.upperMaxBone} ${m.upperMax.toFixed(0)}°`);
  if (m.torsoPitch > 12 || m.torsoRoll > 12) flags.push(`torso swings ${m.torsoPitch.toFixed(0)}/${m.torsoRoll.toFixed(0)}°`);
  if (Math.abs(m.torsoLean) > 15) flags.push(`torso leans ${m.torsoLean.toFixed(0)}°`);
  if (m.footAbovePelvis) flags.push('foot above pelvis');
  if ((m.footSideL > 0.5 * m.footFwdL && m.footSideL > 0.05) || (m.footSideR > 0.5 * m.footFwdR && m.footSideR > 0.05)) flags.push('feet swing sideways');
  if (m.thighAmpL >= 12 && m.thighAmpR >= 12) { if (m.ratio < 0.6 || m.ratio > 1.6) flags.push(`L/R ratio ${m.ratio.toFixed(2)}`); if (Math.abs(phase - Math.PI) > Math.PI / 4) flags.push(`phase ${(phase / Math.PI).toFixed(2)}π`); }
  if (m.jitter > 20) flags.push(`jitter ${m.jitter.toFixed(0)}°/key`);
  if (m.legStray > 0.1) flags.push(`leg skin ${(m.legStray * 100).toFixed(0)}% off leg bones`);
  if (m.idleDrift > 0.05) flags.push(`idle drifts ${(m.idleDrift * 100).toFixed(0)}cm`); if (m.idleDev > 20) flags.push(`idle bends ${m.idleDev.toFixed(0)}°`);
  const verdict = flags.length ? 'broken' : m.thighAmpL < 12 || m.thighAmpR < 12 ? 'subtle' : 'good';
  return { r, m, flags, verdict, sk };
}
function metricTable(paths) {
  const rows = paths.map((p) => { try { return metricOne(p); } catch (e) { return { r: { id: p }, m: null, flags: [String(e.message)], verdict: 'error' }; } });
  const f = (v, d = 0) => (v === undefined || v === null ? '-' : Number(v).toFixed(d));
  console.log(['id', 'verdict', 'thigh L/R°', 'phase', 'knee L/R°', 'arm°', 'bob cm', 'footFwd L/R cm', 'footSide L/R cm', 'torso pitch/roll/lean°', 'upper max', 'legSkin stray', 'jitter', 'idle drift/dev', 'flags'].join(' | '));
  for (const x of rows) {
    const m = x.m || {};
    console.log([x.r.id, x.verdict, `${f(m.thighAmpL)}/${f(m.thighAmpR)}`, m.phase === undefined ? '-' : `${f(m.phase / Math.PI, 2)}π`, `${f(m.kneeMinL)}..${f(m.kneeMaxL)}/${f(m.kneeMinR)}..${f(m.kneeMaxR)}`, f(m.armSwing), f(m.bob * 100, 1), `${f(m.footFwdL * 100)}/${f(m.footFwdR * 100)}`, `${f(m.footSideL * 100)}/${f(m.footSideR * 100)}`, `${f(m.torsoPitch)}/${f(m.torsoRoll)}/${f(m.torsoLean)}`, m.upperMaxBone ? `${f(m.upperMax)}° ${m.upperMaxBone}` : '-', m.legStray === undefined ? '-' : `${f(m.legStray * 100)}%`, f(m.jitter), `${f((m.idleDrift || 0) * 100, 1)}cm/${f(m.idleDev)}°`, x.flags.join('; ')].join(' | '));
  }
  return rows;
}

// ---------------------------------------------------------------- 짓기
/** 뼈 j 에 세계 프레임 회전 R 을 먹인 로컬 쿼터니언 — 부모의 바인드 세계 회전으로 옮긴다 */
function localQuat(sk, j, R) {
  const p = sk.parent[j]; const qp = p !== undefined ? new Quaternion().setFromRotationMatrix(sk.W(p)) : new Quaternion();
  const qb = new Quaternion(); sk.local[j].decompose(new Vector3(), qb, new Vector3());
  return qp.clone().invert().multiply(R).multiply(qp).multiply(qb);
}
const rot = (axis, deg) => new Quaternion().setFromAxisAngle(axis, deg * DEG);
/** 세계 프레임에서 뼈를 「앞으로」 a° 기울인다 — 아래로 향한 뼈의 끝이 앞(fwd)으로 간다 (왼쪽 축 둘레로 −a: left × (−up) = −fwd) */
const pitchFwd = (sk, a) => rot(sk.left, -a);
/** 위 축 둘레 비틀기 — +b 면 왼쪽이 뒤로 간다 */
const twist = (b) => rot(Y, b);
/** 앞 축 둘레 기울기(좌우 흔들림) — +r 면 머리가 왼쪽으로 */
const roll = (sk, r) => rot(sk.fwd, -r);

function buildClips(sk) {
  const bindP = {}; for (const j of sk.joints) { const p = new Vector3(); sk.local[j].decompose(p, new Quaternion(), new Vector3()); bindP[j] = p; }
  const cm = sk.h / 1.72; // 1 m (앱 기준) 가 모델 단위로 얼마인가
  const clips = [];
  const make = (name, period, fps, poseFn) => {
    const n = Math.round(period * fps); const times = []; for (let k = 0; k <= n; k++) times.push((k / n) * period);
    const rotTracks = {}; const posTracks = {};
    for (let k = 0; k <= n; k++) {
      const ph = (k / n) * 2 * Math.PI; const pose = poseFn(ph);   // { rot: {j: Quaternion(world delta)}, pos: {j: Vector3(local)} }
      for (const [j, R] of Object.entries(pose.rot)) { (rotTracks[j] ??= []).push(localQuat(sk, +j, R)); }
      for (const [j, p] of Object.entries(pose.pos)) { (posTracks[j] ??= []).push(p); }
    }
    const tracks = [];
    for (const [j, qs] of Object.entries(rotTracks)) tracks.push({ node: +j, path: 'rotation', times, values: qs.flatMap((q) => q.toArray()) });
    for (const [j, ps] of Object.entries(posTracks)) tracks.push({ node: +j, path: 'translation', times, values: ps.flatMap((p) => p.toArray()) });
    clips.push({ name, tracks });
  };
  const splitSpine = (total) => sk.spine.length ? total / sk.spine.length : 0;
  const armPose = (rotMap, side, fwdDeg, foreDeg, swayDeg = 0) => { const a = sk.arms[side]; if (a?.upper === undefined) return; rotMap[a.upper] = pitchFwd(sk, fwdDeg).multiply(roll(sk, swayDeg)); if (a.fore !== undefined) rotMap[a.fore] = pitchFwd(sk, foreDeg); };

  // 걸음 — ph=0 에 왼발 앞
  make('preset:biped:walk', WALK.period, WALK.fps, (ph) => {
    const R = {}, Pp = {};
    for (const side of ['L', 'R']) {
      const lg = sk.legs[side]; if (!lg) continue; const p = side === 'L' ? ph : ph + Math.PI;
      const thigh = WALK.thigh * Math.cos(p);
      const swing = Math.max(0, -Math.sin(p));                       // 뒤에서 앞으로 나가는 반 바퀴
      const knee = WALK.kneeStance + (WALK.knee - WALK.kneeStance) * swing * swing;
      R[lg.thigh] = pitchFwd(sk, thigh);
      if (lg.shin !== undefined) R[lg.shin] = pitchFwd(sk, -knee);   // 무릎은 뒤로만 접힌다
      if (lg.foot !== undefined) R[lg.foot] = pitchFwd(sk, WALK.foot * knee - 0.5 * thigh);   // 발은 수평 근처로 — 디딜 때 발끝이 들리고 찰 때 내려간다
    }
    const tw = WALK.twist * Math.cos(ph);   // 왼발이 앞이면 왼어깨는 뒤로
    for (const s of sk.spine) R[s] = twist(splitSpine(tw));
    for (const hd of sk.head) R[hd] = twist(-splitSpine(tw) * 0.5);
    armPose(R, 'L', -WALK.arm * Math.cos(ph), WALK.forearm * (0.5 - 0.5 * Math.cos(ph)));   // 팔은 다리와 반대, 앞으로 갈 때 팔꿈치가 더 접힌다
    armPose(R, 'R', WALK.arm * Math.cos(ph), WALK.forearm * (0.5 + 0.5 * Math.cos(ph)));
    const bob = -WALK.bob * cm * (1 + Math.cos(2 * ph)) / 2;
    Pp[sk.root] = bindP[sk.root].clone().add(new Vector3(0, bob, 0));
    return { rot: R, pos: Pp };
  });
  // 숨 — 척추가 앞뒤로 ±1°, 무게가 좌우로 0.5° (척추만 기운다 — 루트를 기울이면 바닥의 루트를 축으로 발이 밀린다), 팔 미세
  make('preset:biped:idle', IDLE.period, IDLE.fps, (ph) => {
    const R = {}, Pp = {};
    const breath = Math.sin(ph); const sway = Math.sin(ph * 0.5 + 1.1) * IDLE.sway;
    for (const s of sk.spine) R[s] = pitchFwd(sk, splitSpine(IDLE.spine * breath)).multiply(roll(sk, splitSpine(sway)));
    for (const hd of sk.head) R[hd] = pitchFwd(sk, -splitSpine(IDLE.spine * breath) * 0.5);
    armPose(R, 'L', IDLE.arm * breath, 0, IDLE.arm * breath * 0.5);
    armPose(R, 'R', IDLE.arm * breath, 0, -IDLE.arm * breath * 0.5);
    Pp[sk.root] = bindP[sk.root].clone().add(new Vector3(0, IDLE.lift * cm * (0.5 + 0.5 * breath), 0));
    return { rot: R, pos: Pp };
  });
  return clips;
}

/** 애니메이션을 갈아 끼우고 안 쓰는 접근자·버퍼뷰를 걷어낸 새 GLB 를 만든다 (메시·텍스처 바이트는 그대로 옮긴다) */
function replaceAnimations(json, bin, clips) {
  const keepAcc = new Set();
  for (const m of json.meshes) for (const p of m.primitives) { for (const v of Object.values(p.attributes)) keepAcc.add(v); if (p.indices !== undefined) keepAcc.add(p.indices); for (const t of p.targets || []) for (const v of Object.values(t)) keepAcc.add(v); }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) keepAcc.add(s.inverseBindMatrices);
  const keepBV = new Set(); for (const a of keepAcc) keepBV.add(json.accessors[a].bufferView); for (const im of json.images || []) if (im.bufferView !== undefined) keepBV.add(im.bufferView);
  const parts = []; let cursor = 0; const bvMap = {}; const newBV = [];
  const push = (buf, extra) => { while (cursor % 4) { parts.push(Buffer.alloc(1)); cursor++; } const off = cursor; parts.push(buf); cursor += buf.length; newBV.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...extra }); return newBV.length - 1; };
  for (const i of [...keepBV].sort((a, b) => a - b)) { const bv = json.bufferViews[i]; const { buffer: _b, byteOffset: _o, byteLength: _l, ...rest } = bv; bvMap[i] = push(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), rest); }
  const accMap = {}; const newAcc = [];
  for (const i of [...keepAcc].sort((a, b) => a - b)) { const a = { ...json.accessors[i], bufferView: bvMap[json.accessors[i].bufferView] }; accMap[i] = newAcc.push(a) - 1; }
  for (const m of json.meshes) for (const p of m.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap[p.attributes[k]]; if (p.indices !== undefined) p.indices = accMap[p.indices]; for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap[t[k]]; }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap[s.inverseBindMatrices];
  for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = bvMap[im.bufferView];
  const floats = (arr) => { const b = Buffer.alloc(arr.length * 4); arr.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  const animations = [];
  for (const clip of clips) {
    const samplers = [], channels = [];
    for (const tr of clip.tracks) {
      const tIn = newAcc.push({ bufferView: push(floats(tr.times), {}), componentType: 5126, count: tr.times.length, type: 'SCALAR', min: [tr.times[0]], max: [tr.times[tr.times.length - 1]] }) - 1;
      const n = tr.path === 'rotation' ? 4 : 3;
      const tOut = newAcc.push({ bufferView: push(floats(tr.values), {}), componentType: 5126, count: tr.values.length / n, type: n === 4 ? 'VEC4' : 'VEC3' }) - 1;
      channels.push({ sampler: samplers.push({ input: tIn, output: tOut, interpolation: 'LINEAR' }) - 1, target: { node: tr.node, path: tr.path } });
    }
    animations.push({ name: clip.name, samplers, channels });
  }
  json.accessors = newAcc; json.bufferViews = newBV; json.animations = animations;
  const out = Buffer.concat(parts); json.buffers = [{ byteLength: out.length }];
  return out;
}


// ---------------------------------------------------------------- 다리 살 다시 붙이기
/** 엉덩이 아래 정점 중 Root·척추·머리 뼈에 붙은 무게를 **가장 가까운 다리 마디**로 옮긴다.
 *  Tripo 오토리그가 다리 살의 반을 Root 에 남기는 몸(u104 42%·u201 14%)은 뼈가 돌아도 다리가 굳는다 — 클립 문제가 아니다.
 *  마디: 허벅지(엉덩이→무릎)·정강이(무릎→발목)·발(발목→발가락, 없으면 앞으로 0.08h). 무릎·발목 0.03h 안은 두 마디에 반씩 (접힐 때 살이 안 찢어지게). */
function reskinLegs(sk) {
  const { json, bin } = sk; const kidx = {}; sk.joints.forEach((j, k) => (kidx[j] = k));
  const segs = [];
  for (const side of ['L', 'R']) {
    const lg = sk.legs[side]; if (!lg) continue; const hip = sk.pos[lg.thigh];
    const knee = lg.shin !== undefined ? sk.pos[lg.shin] : hip.clone().add(new Vector3(0, -(hip.y - sk.floor) * 0.5, 0));
    const ankle = lg.foot !== undefined ? sk.pos[lg.foot] : knee.clone().add(new Vector3(0, -(knee.y - sk.floor) * 0.9, 0));
    const toe = lg.chain[3] !== undefined ? sk.pos[lg.chain[3]] : ankle.clone().add(sk.fwd.clone().multiplyScalar(0.08 * sk.h)).setY(sk.floor);
    segs.push({ bone: lg.thigh, a: hip, b: knee, joint: null });
    if (lg.shin !== undefined) segs.push({ bone: lg.shin, a: knee, b: ankle, joint: knee, pair: lg.thigh });
    if (lg.foot !== undefined) segs.push({ bone: lg.foot, a: ankle, b: toe, joint: ankle, pair: lg.shin });
  }
  const hipY = Math.min(...Object.values(sk.legs).filter(Boolean).map((l) => sk.pos[l.thigh].y));
  const distSeg = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return { d: p.distanceTo(a.clone().add(ab.multiplyScalar(t))), t }; };
  let moved = 0, verts = 0;
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    if (p.attributes.JOINTS_0 === undefined) continue;
    const pa = accessor(json, bin, p.attributes.POSITION), ja = accessor(json, bin, p.attributes.JOINTS_0), wa = accessor(json, bin, p.attributes.WEIGHTS_0);
    for (let k = 0; k < pa.count; k++) {
      const v = new Vector3(pa.get(k, 0), pa.get(k, 1), pa.get(k, 2)).applyMatrix4(sk.D); if (v.y > hipY - 0.05 * sk.h) continue;
      let stray = 0; const keep = [];
      for (let c = 0; c < 4; c++) { const w = wa.get(k, c); if (w <= 0) continue; const j = sk.joints[ja.get(k, c)]; if (/^(root|spine|head)$/.test(sk.cls[j])) stray += w; else keep.push([j, w]); }   // 팔·손·기타 뼈의 살은 그대로 — 허벅지 옆에 늘어진 손이 다리를 따라가면 안 된다
      if (stray < 0.01) continue;
      verts++; moved += stray;
      let best = null; for (const sg of segs) { const r = distSeg(v, sg.a, sg.b); if (!best || r.d < best.d) best = { ...r, sg }; }
      const add = (j, w) => { const e = keep.find((x) => x[0] === j); if (e) e[1] += w; else keep.push([j, w]); };
      const near = best.sg.joint && v.distanceTo(best.sg.joint) < 0.03 * sk.h;
      if (near) { add(best.sg.bone, stray * 0.5); add(best.sg.pair, stray * 0.5); } else add(best.sg.bone, stray);
      keep.sort((a, b) => b[1] - a[1]); const top = keep.slice(0, 4); const sum = top.reduce((s, x) => s + x[1], 0);
      for (let c = 0; c < 4; c++) { const e = top[c]; ja.set(k, c, e ? kidx[e[0]] : 0); wa.set(k, c, e ? e[1] / sum : 0); }
    }
  }
  return { verts, moved };
}

// ---------------------------------------------------------------- 뼈대를 살에서 다시 세우기 (--rerig)
/** Tripo 리그가 다리를 못 잡은 몸(u089 r3: 다리 뼈 셋이 한쪽 엉덩이 z −0.15 에 몰려 있다)을 위해 **살만 보고** 최소 뼈대를 다시 세운다:
 *  root(바닥) → spine(0.55h) → head(0.8h), root → 허벅지(0.52h)·정강이(무릎 띠 0.26~0.32h 의 정점 평균)·발(발목 띠 0.05~0.09h)·발가락(앞 0.08h).
 *  기존 관절 노드를 재사용한다(joints[0] 은 Root 그대로 — CastBody 가 bones[0] 의 x·z 를 지운다) · 회전은 전부 단위(로컬 = 세계) · IBM 은 −위치 평행이동.
 *  남는 관절은 root 아래 같은 자리에 두고 살을 안 준다. 살: 0.8h 위 머리 · 0.55h 위 척추 · 엉덩이 띠 root · 그 아래는 reskinLegs 가 마디별로 나눈다. 팔은 척추에 붙어 굳는다. */
function rerig(json, bin) {
  const sk0 = skeleton(json, bin); const { h, floor, D } = sk0; const skin = json.skins[0]; const J = skin.joints;
  if (J.length < 11) throw new Error('rerig needs ≥ 11 joints');
  const lateral = sk0.box.max.z - sk0.box.min.z >= sk0.box.max.x - sk0.box.min.x ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const fwd = new Vector3().crossVectors(lateral, Y).normalize(); if (fwd.x < 0 || (fwd.x === 0 && fwd.z < 0)) fwd.negate();
  const left = new Vector3().crossVectors(Y, fwd).normalize();
  const centre = sk0.box.min.clone().add(sk0.box.max).multiplyScalar(0.5); const cl = centre.dot(left);
  // 띠별 정점 평균 (좌우 따로)
  const bands = { hip: [0.4, 0.46], knee: [0.26, 0.32], ankle: [0.05, 0.09] }; const acc = {}; for (const b of Object.keys(bands)) acc[b] = { L: [new Vector3(), 0], R: [new Vector3(), 0] };
  for (const mesh of json.meshes) for (const p of mesh.primitives) { const pa = accessor(json, bin, p.attributes.POSITION); for (let k = 0; k < pa.count; k += 3) { const v = new Vector3(pa.get(k, 0), pa.get(k, 1), pa.get(k, 2)).applyMatrix4(D); const r = (v.y - floor) / h; for (const [b, [lo, hi]] of Object.entries(bands)) if (r >= lo && r <= hi) { const side = v.dot(left) >= cl ? 'L' : 'R'; acc[b][side][0].add(v); acc[b][side][1]++; } } }
  const mean = (b, side) => acc[b][side][1] ? acc[b][side][0].clone().divideScalar(acc[b][side][1]) : null;
  const P = {}; P.root = centre.clone().setY(floor + 0.02 * h);
  P.spine = centre.clone().setY(floor + 0.55 * h); P.head = centre.clone().setY(floor + 0.8 * h);
  for (const side of ['L', 'R']) { const knee = mean('knee', side), ankle = mean('ankle', side), hipB = mean('hip', side); if (!knee || !ankle) throw new Error('rerig: leg band empty ' + side);
    P['thigh' + side] = (hipB ?? knee).clone().setY(floor + 0.52 * h); P['shin' + side] = knee; P['foot' + side] = ankle; P['toe' + side] = ankle.clone().add(fwd.clone().multiplyScalar(0.08 * h)).setY(floor + 0.02 * h); }
  const order = ['root', 'spine', 'head', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
  const parentOf = { root: null, spine: 'root', head: 'spine', thighL: 'root', shinL: 'thighL', footL: 'shinL', toeL: 'footL', thighR: 'root', shinR: 'thighR', footR: 'shinR', toeR: 'footR' };
  const node = {}; order.forEach((r, i) => (node[r] = J[i])); const spare = J.slice(order.length);
  const armature = sk0.parent[J[0]];   // Root 의 부모(Armature) — 그 아래 자리는 그대로
  const armW = armature !== undefined ? sk0.W(armature) : new Matrix4(); const armInv = armW.clone().invert();
  const worldOf = (r) => P[r]; const place = (j, world, parentWorld, parentNode) => { const n = json.nodes[j]; delete n.rotation; delete n.scale; delete n.matrix; const pw = parentWorld ?? new Vector3().setFromMatrixPosition(armW); n.translation = world.clone().sub(pw).toArray(); n.children = []; if (parentNode !== undefined) (json.nodes[parentNode].children ??= []).push(j); };
  for (const j of J) json.nodes[j].children = [];
  json.nodes[armature].children = json.nodes[armature].children.filter((c) => !J.includes(c)); json.nodes[armature].children.push(J[0]);
  // Armature 가 회전돼 있으면 로컬 = 세계 가 깨진다 — Tripo 는 평행이동뿐이다
  const aq = new Quaternion().setFromRotationMatrix(armW); if (Math.abs(aq.w) < 0.999) throw new Error('rerig: armature is rotated');
  for (const r of order) { const pr = parentOf[r]; place(node[r], worldOf(r), pr ? worldOf(pr) : null, pr ? node[pr] : armature); }
  for (const j of spare) place(j, P.root.clone(), P.root, node.root);
  // IBM = 평행이동 −세계 위치
  const ibm = accessor(json, bin, skin.inverseBindMatrices); const posOf = {}; order.forEach((r) => (posOf[node[r]] = P[r])); spare.forEach((j) => (posOf[j] = P.root));
  J.forEach((j, k) => { const m = new Matrix4().makeTranslation(-posOf[j].x, -posOf[j].y, -posOf[j].z).elements; for (let c = 0; c < 16; c++) ibm.set(k, c, m[c]); });
  // 살 — 높이로 나눈다; 다리 띠는 root 에 몰아 두고 reskinLegs 가 마디로 나눈다
  const kidx = {}; J.forEach((j, k) => (kidx[j] = k)); const hipY = floor + 0.52 * h;
  for (const mesh of json.meshes) for (const p of mesh.primitives) { const pa = accessor(json, bin, p.attributes.POSITION), ja = accessor(json, bin, p.attributes.JOINTS_0), wa = accessor(json, bin, p.attributes.WEIGHTS_0);
    for (let k = 0; k < pa.count; k++) { const v = new Vector3(pa.get(k, 0), pa.get(k, 1), pa.get(k, 2)).applyMatrix4(D); const r = (v.y - floor) / h; let w;
      if (r > 0.86) w = [[node.head, 1]]; else if (r > 0.74) { const t = (r - 0.74) / 0.12; w = [[node.head, t], [node.spine, 1 - t]]; } else if (r > 0.58) w = [[node.spine, 1]]; else if (r > 0.5) { const t = (r - 0.5) / 0.08; w = [[node.spine, t], [node.root, 1 - t]]; } else w = [[node.root, 1]];
      for (let c = 0; c < 4; c++) { const e = w[c]; ja.set(k, c, e ? kidx[e[0]] : 0); wa.set(k, c, e ? e[1] : 0); } } }
  const sk = skeleton(json, bin); sk.cls[node.spine] = 'spine'; sk.spine = [node.spine]; sk.head = [node.head]; sk.cls[node.head] = 'head';
  return sk;
}
// ---------------------------------------------------------------- 명령
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'classify') {
  for (const p of args) {
    const { json, bin } = readGlb(p); const sk = skeleton(json, bin);
    console.log(`${p.split('/').pop()}  h=${sk.h.toFixed(3)} floor=${sk.floor.toFixed(3)} fwd=(${sk.fwd.toArray().map((v) => v.toFixed(2))}) left=(${sk.left.toArray().map((v) => v.toFixed(2))}) bindErr=${sk.bindErr.toExponential(1)} root=${json.nodes[sk.root].name}`);
    for (const j of sk.joints) { const pp = sk.pos[j]; console.log(`   ${String(j).padStart(3)} ${(json.nodes[j].name || '').padEnd(24)} ${sk.cls[j].padEnd(8)} parent=${sk.parent[j] ?? '-'} pos=(${pp.x.toFixed(3)}, ${pp.y.toFixed(3)}, ${pp.z.toFixed(3)})`); }
  }
} else if (cmd === 'metric') {
  metricTable(args);
} else if (cmd === 'synth') {
  const doRerig = args.includes('--rerig'); const [src, dst] = args.filter((a) => !a.startsWith('--')); if (!src || !dst) throw new Error('synth [--rerig] <in> <out>');
  const { json, bin } = readGlb(src); const sk = doRerig ? rerig(json, bin) : skeleton(json, bin);
  if (doRerig) console.log(`[synth] rerig: root=${json.nodes[sk.root].name} legs ${sk.legs.L ? 'L' : '-'}${sk.legs.R ? 'R' : '-'} spine=${sk.spine.length} head=${sk.head.length}`);
  if (!sk.legs.L || !sk.legs.R) throw new Error('legs not found — classify first');
  console.log(`[synth] ${src.split('/').pop()} fwd=(${sk.fwd.toArray().map((v) => v.toFixed(2))}) legs L=${json.nodes[sk.legs.L.thigh].name} R=${json.nodes[sk.legs.R.thigh].name} spine=${sk.spine.length} head=${sk.head.length} arms L=${sk.arms.L?.upper !== undefined ? json.nodes[sk.arms.L.upper].name : '-'} R=${sk.arms.R?.upper !== undefined ? json.nodes[sk.arms.R.upper].name : '-'}`);
  const before = sk.legRootShare(); const rs = reskinLegs(sk); const after = sk.legRootShare();
  console.log(`[synth] leg skin off leg bones: ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}% (${rs.verts} vertices re-weighted)`);
  const clips = buildClips(sk);
  const out = replaceAnimations(json, bin, clips);
  writeGlb(dst, json, out);
  console.log(`[synth] wrote ${dst} (${clips.map((c) => `${c.name}:${c.tracks.length} tracks`).join(', ')})`);
  // 다시 읽어 재 본다 — 발끝이 골반 아래에서 앞뒤로만 움직여야 한다
  metricTable([dst]);
} else {
  console.log('usage: cast-anim-synth.mjs classify|metric|synth ...');
  process.exit(1);
}
