#!/usr/bin/env node
/**
 * uxpilot MCP 런처 — `.mcp.json` 이 이걸 띄운다. `.dev.vars` 의 UXPILOT_API_KEY 로 mcp-remote 를 실행한다.
 *
 *   Claude Code  ──stdio──▶  node tools/mcp-uxpilot.mjs  ──stdio──▶  npx mcp-remote https://mcp.uxpilot.net/mcp
 *
 * - 키는 프로세스 인자에 넣지 않는다 (`ps` 에 보인다). AUTH_HEADER 변수로 넘기고 mcp-remote 가 `${AUTH_HEADER}` 를 스스로 푼다.
 * - 팀원은 자기 키를 자기 .dev.vars 에 넣으면 같은 .mcp.json 으로 붙는다. 사용자 스코프(~/.claude.json)에 키를 넣을 필요가 없다.
 * - 키가 없으면 종료코드 3 — Claude Code 의 MCP 목록에서 uxpilot 이 "failed" 로 보이면 `npm run vars:check` 부터.
 */
import { spawn } from 'node:child_process';
import { loadVars, VARS_FILE } from './load-vars.mjs';

const UPSTREAM = 'https://mcp.uxpilot.net/mcp';

loadVars();
const key = process.env.UXPILOT_API_KEY?.trim();
if (!key) {
  console.error(`[mcp-uxpilot] UXPILOT_API_KEY 가 비어 있다 → ${VARS_FILE} 에 넣는다 (이름 목록: .dev.vars.example)`);
  process.exit(3);
}
const authHeader = /^bearer\s/i.test(key) ? key : `Bearer ${key}`;

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(
  npx,
  ['-y', 'mcp-remote', UPSTREAM, '--transport', 'http-only', '--header', 'Authorization:${AUTH_HEADER}'],
  { stdio: 'inherit', env: { ...process.env, AUTH_HEADER: authHeader }, shell: process.platform === 'win32' },
);

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (e) => { console.error(`[mcp-uxpilot] ${e.message}`); process.exit(1); });
