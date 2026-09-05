/**
 * 도구 스크립트가 쓰는 **프로젝트 밖 의존성**을 머신에 상관없이 찾아 준다.
 *
 * playwright 는 package.json 에 없다 (설치 200MB, CI 도 안 쓴다) — `npx playwright` 가 만든 npm 캐시에서 집어 온다.
 * sharp 는 프로젝트 의존성이지만 도구가 어디서 실행되든 같은 것을 잡게 여기서 한 번에 푼다.
 *
 *   import { chromium, sharp } from './local-deps.mjs';
 *
 * 캐시가 없으면 `npx --yes playwright@latest --version` 한 번 돌려 받으라고 알려 준다.
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sharp = createRequire(new URL('../package.json', import.meta.url))('sharp');

/** npx 캐시(~/.npm/_npx/<해시>/node_modules/playwright) 를 뒤져 첫 번째 것을 쓴다 */
function findPlaywright() {
  const local = new URL('../node_modules/playwright/index.mjs', import.meta.url);
  if (existsSync(local)) return local;
  const cache = join(homedir(), '.npm', '_npx');
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache)) {
    const entry = join(cache, dir, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(entry)) return pathToFileURL(entry);
  }
  return undefined;
}

const entry = findPlaywright();
if (!entry) {
  console.error('playwright 를 못 찾았다 — `npx --yes playwright@latest --version` 을 한 번 돌려 npx 캐시를 만든다.');
  process.exit(3);
}
export const { chromium } = await import(entry.href);

/** headless 크롬 — 시스템 크롬을 쓴다 (playwright 브라우저를 따로 안 받는다) */
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
