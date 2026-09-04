/**
 * 테스트 러너 설정 — humanish 의 vitest.config.ts 이식.
 *
 * `npm test` — 순수 함수와 화면 조각을 검사한다.
 *
 * 테스트는 `tests/` 아래에 소스 구조를 그대로 따라 둔다 (tests/lab/…, tests/features/main/…).
 * 소스 옆에 두지 않는 이유는 폴더 소유권 때문이다 (src/features/README.md) —
 * 남의 폴더에 파일을 만들지 않아도 되게.
 *
 * (원작의 supabase 검사 계층과 postcss 우회는 이 프로젝트에 해당 없음이라 뺐다.
 *  워커 쪽 검증이 필요해지면 원작처럼 실제 소켓을 두드리는 스크립트를 따로 둔다 —
 *  DB·서버 동작을 목으로 흉내 내면 로컬만 초록불이 된다는 교훈도 같이 가져온다.)
 */
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 소스가 쓰는 `@/` 별칭. tsconfig.json · vite.config.ts 의 값과 같아야 한다.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // afterEach 전역이 있어야 @testing-library/react 가 테스트 사이에 DOM 을 스스로 치운다.
    // 없으면 두 번째 render 부터 "같은 요소가 여러 개" 로 죽는다.
    globals: true,
    // 기본은 node다. DOM이 필요한 파일만 맨 위에 `// @vitest-environment jsdom`을 적는다.
    // 전부 jsdom으로 돌리면 순수 함수 테스트까지 느려진다.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
