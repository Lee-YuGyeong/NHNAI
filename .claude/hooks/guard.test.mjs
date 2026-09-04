#!/usr/bin/env node
// guard.mjs 자가 점검:  node .claude/hooks/guard.test.mjs   (실패가 있으면 종료코드 1)
import { check, checkInput } from './guard.mjs';

const DENY = [
  // 파일 이름·변형
  'cat .dev.vars', 'cat ./.dev.vars', 'sed -n 1,5p /Users/x/Who-is-human/.dev.vars', 'cat .dev.vars.local', 'cat .dev_vars', 'cat .dev-vars',
  'cat .dev".vars"', "cat .dev'.'vars", 'cat .DEV.VARS', 'source .dev.vars', 'set -a; . ./.dev.vars; set +a',
  // 글롭 우회
  'cat .dev*', 'cat .dev.*', 'cat .dev.v*', 'cat .d*', 'cat .d?v.vars', 'cat *vars', 'cat *.vars', 'cat .*vars', 'head .*', 'cat .[a-z]*', 'ls .dev',
  'for f in .dev*; do cat $f; done', 'tar czf x.tgz .dev*',
  // .env 계열 — 이름·꼬리·따옴표·글롭
  'cat .env', 'cat .env.local', 'source .env', 'cat ./.env.local', 'sed -n 1,5p /Users/x/Who-is-human/.env.local',
  'cat .env.production', 'cat .env.local.bak', 'cat .ENV.LOCAL', 'cat .e"n"v.local', 'set -a; . ./.env.local; set +a',
  'cat .env*', 'cat .env.*', 'cat .e*', 'cat .en*', 'cat .de*', 'tar czf x.tgz .env*', 'find . -name ".env*"',
  'cp .env.local /tmp/x', 'xxd .env.local', 'grep -r X .env.local', 'ls -la .env.local',
  // gitignore 무시 검색
  'rg --no-ignore TRIPO .', 'rg -uu ep_ .', 'grep -r --no-ignore x .', 'rg --no-ignore-vcs x',
  // wrangler
  'npx wrangler deploy', 'npx wrangler secret put X', 'wrangler delete',
];
const ALLOW = [
  'cat .dev.vars.example', 'cp .dev.vars.example .dev.vars.example', 'cat .env.example', 'node tools/load-vars.mjs --check',
  'node tools/tripo-parts.mjs tools/parts.json out', 'npm run dev', 'npm run worker:dev', 'git status', 'git log --oneline -5',
  'curl https://example.dev/api', 'ls .devcontainer', 'ls -la', 'cat README.md', 'rg -n "TRIPO_API_KEY" tools', 'rg --hidden -n foo .claude',
  'grep -rn foo src', 'sed -i "s/.*//" a.txt', 'cat package.json | head', 'node -e "console.log(process.argv)"', 'npx wrangler dev --port 8787',
  'git diff --cached', 'find . -name "*.mjs"', 'cat src/world/vars.ts', 'echo $DEVICE',
  // .env 옆 이웃들 — 막으면 안 되는 것
  'cat .eslintrc.json', 'ls .eslintrc*', 'node -e "console.log(process.env.PORT)"', 'echo $ENVIRONMENT',
  'cat src/env.ts', 'rg -n "import.meta.env" src', 'cat .env.example', 'cp .env.example x.txt',
];
const DENY_INPUTS = [
  { file_path: '/Users/x/Who-is-human/.dev.vars' }, { file_path: '.dev.vars.local' }, { pattern: 'dev.vars' }, { glob: '.dev*' }, { path: '.env' },
  { edits: [{ file_path: '.dev.vars' }] },
  { file_path: '.env.local' }, { file_path: '/Users/x/Who-is-human/.env.local' }, { glob: '**/.env*' }, { glob: '.e*' },
  { pattern: 'API_KEY', path: '.env.local' }, { edits: [{ file_path: '.env.local' }] },
];
const ALLOW_INPUTS = [
  { file_path: '/Users/x/Who-is-human/.dev.vars.example' }, { file_path: 'tools/load-vars.mjs' }, { pattern: 'TRIPO_API_KEY', path: 'tools' },
  { file_path: 'README.md' }, { glob: '**/*.tsx' },
];

let fail = 0;
for (const c of DENY) if (!check(c, { isCommand: true })) { console.log(`✗ 통과시킴(차단돼야 함): ${c}`); fail++; }
for (const c of ALLOW) { const r = check(c, { isCommand: true }); if (r) { console.log(`✗ 막음(허용돼야 함): ${c}  → ${r}`); fail++; } }
for (const i of DENY_INPUTS) if (!checkInput(i)) { console.log(`✗ 통과시킴(차단돼야 함): ${JSON.stringify(i)}`); fail++; }
for (const i of ALLOW_INPUTS) { const r = checkInput(i); if (r) { console.log(`✗ 막음(허용돼야 함): ${JSON.stringify(i)}  → ${r}`); fail++; } }
console.log(fail ? `${fail}개 실패` : `모두 통과 (차단 ${DENY.length + DENY_INPUTS.length} · 허용 ${ALLOW.length + ALLOW_INPUTS.length})`);
process.exit(fail ? 1 : 0);
