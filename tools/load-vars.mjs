#!/usr/bin/env node
/**
 * `.dev.vars` 를 읽어 process.env 에 넣는다 — 셸에 이미 있는 같은 이름의 변수는 건드리지 않는다 (파일은 기본값).
 *
 *   모듈로:   import { loadVars } from './load-vars.mjs';  loadVars();          ← node 도구 첫 줄에서
 *   명령에:   node tools/load-vars.mjs -- <명령> [인자…]                          ← 그 명령 하나에만 변수를 넣는다
 *   점검:     node tools/load-vars.mjs --check [이름…]                            ← 값이 있는지만 (값은 절대 출력 안 함)
 *
 * 파일 형식은 wrangler 의 .dev.vars 와 같은 dotenv: `KEY=value` 한 줄씩, `#` 주석, 빈 줄, 앞뒤 따옴표('…' "…") 벗김,
 * `export KEY=value` 도 허용. 키 이름 목록·용도는 `.dev.vars.example` 에 있다.
 *
 * ★ 값은 어디에도 찍지 않는다. 이 파일은 프로젝트 루트(tools/ 의 부모)의 .dev.vars 만 본다 — cwd 와 무관.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const VARS_FILE = join(PROJECT_ROOT, '.dev.vars');
export const EXAMPLE_FILE = join(PROJECT_ROOT, '.dev.vars.example');

/** dotenv 텍스트 → { 이름: 값 } */
export function parseVars(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ''); // 따옴표 없는 값 뒤의 주석
    out[m[1]] = v;
  }
  return out;
}

/**
 * .dev.vars 를 process.env 에 얹는다.
 * @returns {{ file: string, found: boolean, loaded: string[], skipped: string[] }}
 *   loaded  = 파일에서 들어간 이름, skipped = 셸에 이미 있어서 파일 값을 안 쓴 이름
 */
export function loadVars({ file = VARS_FILE, override = false } = {}) {
  if (!existsSync(file)) return { file, found: false, loaded: [], skipped: [] };
  const vars = parseVars(readFileSync(file, 'utf8'));
  const loaded = [];
  const skipped = [];
  for (const [k, v] of Object.entries(vars)) {
    if (!v) continue; // 빈 값은 "없음"으로 친다 (example 을 그대로 복사한 상태)
    if (!override && process.env[k] !== undefined && process.env[k] !== '') { skipped.push(k); continue; }
    process.env[k] = v;
    loaded.push(k);
  }
  return { file, found: true, loaded, skipped };
}

/** example 파일에 적힌 키 이름 목록 (팀이 합의한 전체 목록) */
export function exampleNames() {
  if (!existsSync(EXAMPLE_FILE)) return [];
  return Object.keys(parseVars(readFileSync(EXAMPLE_FILE, 'utf8')));
}

/** 필요한 이름이 비어 있으면 안내하고 종료 — 도구 첫머리에서 쓴다 */
export function requireVars(names, hint = '') {
  loadVars();
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length) {
    console.error(`없는 값: ${missing.join(', ')}\n→ .dev.vars 에 넣는다 (없으면 cp .dev.vars.example .dev.vars). ${hint}`.trim());
    process.exit(3);
  }
}

/* ───────────── CLI ───────────── */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv[0] === '--check') {
    const r = loadVars();
    const names = argv.length > 1 ? argv.slice(1) : exampleNames();
    if (!r.found) console.log(`(.dev.vars 없음 — cp .dev.vars.example .dev.vars 로 만든다)`);
    for (const n of names) {
      const has = !!process.env[n]?.trim();
      const from = r.loaded.includes(n) ? '.dev.vars' : r.skipped.includes(n) || has ? '셸' : '';
      console.log(`${has ? '✓' : '✗'} ${n}${from ? `  (${from})` : ''}`);
    }
    process.exit(0);
  }

  const sep = argv.indexOf('--');
  const cmd = sep >= 0 ? argv.slice(sep + 1) : argv;
  if (!cmd.length) {
    console.error('사용법: node tools/load-vars.mjs -- <명령> [인자…]   |   node tools/load-vars.mjs --check [이름…]');
    process.exit(2);
  }
  loadVars();
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on('error', (e) => { console.error(e.message); process.exit(1); });
}
