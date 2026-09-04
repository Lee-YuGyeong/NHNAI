#!/usr/bin/env node
/**
 * PreToolUse 가드 (팀 공통, 의존성 없음)
 *  - .dev.vars / .env 계열(.env, .env.local, .env.production …) 파일 접근 차단 —
 *    이름 변형·따옴표 끼워넣기·글롭(.dev*, .d*, .e*, .en*, .env*, *.vars, .*) 우회까지
 *  - rg/grep 으로 gitignore 를 무시하고 뒤지는 것(--no-ignore, -uu) 차단 — Grep 도구(ripgrep)는 기본으로 gitignore 를 지키므로
 *    .dev.vars 가 검색에 안 잡히지만, 그 옵션을 주면 잡힌다
 *  - wrangler deploy·secret·delete 차단 (배포는 main push 의 Cloudflare 자동 배포로만)
 *
 * 허용: .dev.vars.example / .env.example 은 이름만 있는 템플릿이라 검사 전에 지운다.
 * settings.json 의 permissions.deny 가 1차(Read/Edit/Write/cat), 이 훅이 2차, git 훅(tools/git-hooks)이 3차다.
 * push 차단은 2026-08-27 에 뺐다 — 작업이 끝나면 바로 main 에 push 하기로 (사용자 결정).
 *
 * 자가 점검: node .claude/hooks/guard.test.mjs
 */
import { readFileSync } from 'node:fs';

const REASON_VARS = '.dev.vars 접근 차단: 시크릿 파일입니다. 키 이름은 .dev.vars.example 참조, 값은 사용자에게 요청.';
const REASON_ENV = '.env 계열 파일 접근 차단: 시크릿 파일입니다(.env, .env.local …). 이름만 필요하면 .env.example 을 보세요.';
const REASON_GLOB = '점파일 글롭 차단: .dev.vars / .env 계열이 딸려 나옵니다. 파일 이름을 지정하세요.';

/** 문자열 하나를 검사해 차단 사유를 돌려준다 (없으면 undefined). 테스트에서 import 한다. */
export function check(s, { isCommand = false } = {}) {
  const t = s.replace(/dev[._-]vars\.example/gi, '').replace(/\.env\.(example|sample|template)/g, '');

  // 1) dev.vars 이름 — 사이에 따옴표·구분자 끼워넣기 포함
  if (/dev["'`\\]*[._-]["'`\\]*vars/i.test(t)) return REASON_VARS;
  // 2) 홀로 선 `.dev` 토큰 (.dev* .dev.* .dev? ~/.dev …) — example.dev 같은 도메인·.devcontainer 는 통과
  if (/(^|[^A-Za-z0-9_-])\.dev(?![A-Za-z0-9-])/i.test(t)) return REASON_VARS;
  // 3) *vars / *.vars / .*vars / ?vars / ].vars 글롭
  if (/[*?\]]\.?vars\b/i.test(t) || /\.\*vars/i.test(t)) return REASON_VARS;
  // 4) .env 계열 — 이름 변형(따옴표 끼워넣기)과 꼬리 붙은 것(.env.local, .env*, .env.local.bak)까지.
  //    앞이 구분자일 때만 본다 → process.env.FOO 같은 코드 표현은 통과.
  if (/(^|[\s/"'`=(:,])\.e["'`\\]*n["'`\\]*v(?![A-Za-z0-9_-])/i.test(t)) return REASON_ENV;
  // 5) .dev.vars / .env 로 펼쳐질 수 있는 점파일 글롭 (.d* .d? .de* .dev.v* .e* .en* …)
  if (/(^|[^A-Za-z0-9_])\.(d(e(v(\.(v(a(r(s)?)?)?)?)?)?)?|e(n(v)?)?)["'`\\]*[*?[{]/i.test(t)) return REASON_GLOB;

  if (!isCommand) return undefined;
  // 6) 읽기 명령에 점파일 글롭(.* .[ .? .{)을 준 경우 — `cat .*` 는 .dev.vars 까지 뿌린다
  if (/(^|[\s;&|(`])(cat|head|tail|less|more|xxd|od|strings|bat|nl|base64|hexdump|source|\.)\s+(-\S+\s+)*(\S+\s+)*\.[*?[{]/.test(t))
    return '점파일 글롭(.*) 읽기 차단: .dev.vars 가 딸려 나온다. 파일 이름을 지정해 읽으세요.';
  // 7) rg/grep 이 gitignore 를 무시하도록 하는 옵션
  if (/(^|[\s;&|(`])(rg|grep|ag|ack)\b[^\n;&|]*\s(-uu+|--no-ignore(-\w+)?|--no-ignore-vcs)(\s|$)/.test(t))
    return 'gitignore 무시 검색(--no-ignore, -uu) 차단: .dev.vars 내용이 검색에 잡힙니다.';
  // 8) wrangler deploy / secret / delete
  if (/\bwrangler\b[^\n;&|]*\b(deploy|secret|delete)\b/.test(t)) return 'wrangler deploy/secret/delete 금지: 배포·시크릿은 사용자가 직접.';
  return undefined;
}

/** 훅 입력(tool_input) 전체를 검사 */
export function checkInput(t = {}) {
  const paths = [t.file_path, t.path, t.pattern, t.glob, t.notebook_path, ...(t.edits ?? []).map((e) => e?.file_path)]
    .filter((s) => typeof s === 'string');
  for (const s of paths) { const r = check(s); if (r) return r; }
  if (typeof t.command === 'string') return check(t.command, { isCommand: true });
  return undefined;
}

/* ───────────── 훅 본체 ───────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ''));
if (isMain) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* ignore */ }
  const reason = checkInput(input.tool_input ?? {});
  if (reason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }));
  }
  process.exit(0);
}
