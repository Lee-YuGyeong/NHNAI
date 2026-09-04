#!/usr/bin/env node
/**
 * 맵 GLB 부품을 Tripo OpenAPI(text-to-model)로 자동 생성한다 — 프롬프트 목록 → 태스크 제출 → 폴링 → GLB 다운로드 → (선택) 경량화.
 *
 *   node tools/tripo-parts.mjs <parts.json> <출력 폴더> [--reduce tools/xxx-glb.sh] [--model v2.5-20250123] [--only id,id]
 *
 * parts.json:  [{ "id": "interrogation_chair", "prompt": "A single interrogation chair …" }, …]
 *   - id 는 assets/manifest.ts 의 에셋 id 와 같게. 결과는 <출력 폴더>/<id>.glb (원본, 수십 MB).
 *   - --reduce 를 주면 원본을 그 스크립트(tools/warehouse-glb.sh 식)로 public/world/… 에 줄여 넣는다. 스크립트의 TABLE 에 id 가 있어야 한다.
 *   - 이미 <출력 폴더>/<id>.glb 가 있으면 건너뛴다 (크레딧 보호). 다시 뽑으려면 파일을 지운다.
 *
 * 인증: TRIPO_API_KEY 변수 → 없으면 ~/.tripo/config.json (npm `tripo-cli` 의 `tripo login` 이 쓰는 파일) 의 활성 프로필 키.
 *   키는 `tsk_…` 형식(developers.tripo3d.ai → API Keys)이어야 한다. ★ 키를 이 저장소 안에 두지 않는다.
 * 리전: 키를 openapi.tripo3d.ai(ov) → openapi.tripo3d.com(cn) 순으로 찔러 받아주는 쪽을 쓴다.
 *
 * 비용: text_to_model 표준 1건 ≈ 10~20 크레딧(모델 버전에 따라 다름). 제출 전에 잔액을 찍어 준다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/** 2026-08-28 확인: tsk_ 키는 api.tripo3d.ai 의 /v2/openapi/… 가 받는다 (openapi.tripo3d.ai 는 같은 경로가 404). cn 리전은 뒤에 */
const HOSTS = ['https://api.tripo3d.ai', 'https://openapi.tripo3d.ai', 'https://openapi.tripo3d.com'];
const POLL_MS = 5000;
const TASK_TIMEOUT_MS = 15 * 60 * 1000;

/* ───────────── 인자 ───────────── */

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const reduceScript = flag('--reduce');
const modelVersion = flag('--model') ?? 'v2.5-20250123';
const only = flag('--only')?.split(',').filter(Boolean);
const [partsPath, outDir] = argv;
if (!partsPath || !outDir) {
  console.error('사용법: node tools/tripo-parts.mjs <parts.json> <출력 폴더> [--reduce tools/xxx-glb.sh] [--model 버전] [--only id,id]');
  process.exit(2);
}

/* ───────────── 인증 ───────────── */

function loadKey() {
  const fromVar = process.env.TRIPO_API_KEY?.trim();
  if (fromVar) return fromVar;
  const cfgPath = join(process.env.TRIPO_HOME ?? join(homedir(), '.tripo'), 'config.json');
  if (!existsSync(cfgPath)) return undefined;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    // tripo-cli 의 형식: { activeProfile, profiles: { name: { apiKey, region } } } — 형식이 바뀌면 apiKey 를 재귀로 찾는다
    const active = cfg.profiles?.[cfg.activeProfile ?? cfg.active_profile ?? 'default'];
    const found = active?.apiKey ?? active?.api_key ?? findDeep(cfg, /^api_?key$/i);
    return typeof found === 'string' ? found : undefined;
  } catch {
    return undefined;
  }
}
function findDeep(o, re) {
  if (!o || typeof o !== 'object') return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (re.test(k) && typeof v === 'string') return v;
    const r = findDeep(v, re);
    if (r) return r;
  }
  return undefined;
}

const apiKey = loadKey();
if (!apiKey) {
  console.error('Tripo 키가 없다. TRIPO_API_KEY 를 주거나 `npx tripo-cli login --key tsk_…` 로 ~/.tripo/config.json 을 만든다.');
  process.exit(3);
}
if (!apiKey.startsWith('tsk_')) console.warn(`경고: 키가 tsk_ 로 시작하지 않는다 (${apiKey.slice(0, 5)}…). OpenAPI 키는 developers.tripo3d.ai → API Keys 에서 만든 tsk_ 형식이다.`);

async function api(host, path, init = {}) {
  const r = await fetch(host + path, { ...init, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: r.status, json };
}

/** 키를 받아주는 리전을 고른다 */
async function pickHost() {
  for (const host of HOSTS) {
    const { status, json } = await api(host, '/v2/openapi/user/balance');
    if (status === 200 && json.code === 0) return { host, balance: json.data };
  }
  return null;
}

/* ───────────── 태스크 ───────────── */

async function submit(host, prompt) {
  const { status, json } = await api(host, '/v2/openapi/task', {
    method: 'POST',
    body: JSON.stringify({ type: 'text_to_model', prompt, model_version: modelVersion, texture: true, pbr: true }),
  });
  if (status !== 200 || json.code !== 0) throw new Error(`제출 실패 ${status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data.task_id;
}

async function waitTask(host, taskId, label) {
  const t0 = Date.now();
  let lastProgress = -1;
  while (Date.now() - t0 < TASK_TIMEOUT_MS) {
    const { status, json } = await api(host, `/v2/openapi/task/${taskId}`);
    if (status !== 200 || json.code !== 0) throw new Error(`조회 실패 ${status}: ${JSON.stringify(json).slice(0, 300)}`);
    const d = json.data;
    if (d.progress !== lastProgress) {
      lastProgress = d.progress;
      process.stdout.write(`  [${label}] ${d.status} ${d.progress ?? 0}%\n`);
    }
    if (d.status === 'success') return d;
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(d.status)) throw new Error(`태스크 ${d.status}: ${taskId}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`시간 초과: ${taskId}`);
}

async function download(url, to) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok) throw new Error(`다운로드 실패 ${r.status}: ${url}`);
  writeFileSync(to, Buffer.from(await r.arrayBuffer()));
}

/* ───────────── 메인 ───────────── */

const parts = JSON.parse(readFileSync(partsPath, 'utf8')).filter((p) => !only || only.includes(p.id));
mkdirSync(outDir, { recursive: true });

const picked = await pickHost();
if (!picked) {
  console.error('두 리전 모두 키를 거부했다 (401). tsk_ 형식의 OpenAPI 키인지, 키가 살아 있는지 developers.tripo3d.ai 에서 확인한다.');
  process.exit(3);
}
const { host, balance } = picked;
console.log(`리전 ${host} · 잔액 ${JSON.stringify(balance)} · 모델 ${modelVersion} · 부품 ${parts.length}개`);
if (!(balance?.balance > 0)) {
  console.error('크레딧이 0 이다 — developers.tripo3d.ai 의 Billing 에서 충전한 뒤 다시 돌린다. (제출하지 않음)');
  process.exit(4);
}

const todo = parts.filter((p) => {
  const has = existsSync(join(outDir, `${p.id}.glb`));
  if (has) console.log(`  건너뜀 (이미 있음): ${p.id}`);
  return !has;
});

// 전부 제출해 두고 순서대로 기다린다 — Tripo 는 동시 태스크를 받아준다
const submitted = [];
for (const p of todo) {
  const taskId = await submit(host, p.prompt);
  console.log(`제출: ${p.id} → ${taskId}`);
  submitted.push({ ...p, taskId });
}

const done = [];
for (const p of submitted) {
  try {
    const d = await waitTask(host, p.taskId, p.id);
    const url = d.output?.pbr_model ?? d.output?.model ?? d.output?.base_model;
    if (!url) throw new Error(`출력 URL 없음: ${JSON.stringify(d.output)}`);
    const to = join(outDir, `${p.id}.glb`);
    await download(url, to);
    console.log(`저장: ${to}`);
    done.push(p.id);
  } catch (e) {
    console.error(`실패: ${p.id} — ${e.message}`);
  }
}

if (reduceScript && done.length) {
  console.log(`경량화: sh ${reduceScript} ${outDir} ${done.join(' ')}`);
  const r = spawnSync('sh', [resolve(reduceScript), resolve(outDir), ...done], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log(`완료 ${done.length}/${parts.length}`);
