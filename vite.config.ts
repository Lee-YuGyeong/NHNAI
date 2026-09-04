import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { labPlugin } from './tools/vite-lab';

/** 워커 포트. 8787 이 다른 프로젝트에 잡혀 있으면 WORKER_PORT=8788 처럼 넘긴다 (양쪽 터미널에 같은 값) */
const WORKER_PORT = process.env.WORKER_PORT ?? '8787';

/**
 * /api/lab/* 을 **어디서** 처리하나.
 *
 * 기본(끔): 개발 서버가 구독으로 직접 처리한다 (labPlugin — Claude Code CLI 를 자식 프로세스로
 *   띄운다). 키가 필요 없는 대신 **한 줄에 3~55초** 걸린다. 실측: cast 54s · talk 3.6~53s.
 *   개체 대사가 이 지연에 파묻혀서, 즉석 문자열로 바로 나가는 리더 방송만 들리는 화면이 된다.
 * 켬(LAB_VIA_WORKER=1): 워커로 넘긴다 — Anthropic API 를 한 번 부를 뿐이라 한두 초다.
 *   대신 로컬 시크릿 파일에 ANTHROPIC_API_KEY 가 있어야 하고 (README 「키 · 시크릿」 절),
 *   `npm run worker:dev` 가 같이 떠 있어야 한다. **크레딧이 나간다** — 그래서 기본이 아니라
 *   사람이 켜는 스위치다. `npm run dev:api` 가 이걸 켠다.
 */
const LAB_VIA_WORKER = process.env.LAB_VIA_WORKER === '1';

export default defineConfig({
  // labPlugin: /api/lab/* 을 개발 서버가 직접 처리한다 (구독 인증 · 워커 불필요).
  // LAB_VIA_WORKER 면 끼우지 않는다 — 그래야 아래 프록시가 그 경로를 받는다
  plugins: [react(), ...(LAB_VIA_WORKER ? [] : [labPlugin()])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // 3D 월드 워커 (npm run worker:dev → 127.0.0.1:8787).
      // 배포는 프론트와 같은 워커라 같은 오리진의 /world-ws 가 그대로 워커로 간다 (프록시 불필요).
      '/world-ws': {
        target: `ws://127.0.0.1:${WORKER_PORT}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/world-ws/, ''),
      },
      // 리더 방송 합성. /api/lab/* 은 구독으로 개발 서버가 직접 처리하지만(labPlugin),
      // TTS 는 대신할 구독이 없다 → 로컬에서도 키를 쥔 워커로 넘긴다 (npm run worker:dev 가 같이 떠 있어야 한다).
      '/api/tts': { target: `http://127.0.0.1:${WORKER_PORT}` },
      /*
       * 계정 (worker/src/auth.ts). TTS 와 같은 이유로 워커가 받는다 — 입장권 서명 비밀을
       * 브라우저 쪽에 둘 수 없다.
       *
       * ★ 워커를 안 띄워도 화면은 돈다. 여기로 간 요청이 실패하면 shared/supabase.ts 가
       *   조용히 「로그인 없음」으로 떨어진다. 다만 그때는 **이름이 검증되지 않는다** —
       *   로그인해서 이름이 뜨더라도 방에는 게스트로 들어간다 (입장권을 못 받으므로).
       *   검증까지 로컬에서 보려면 `npm run worker:dev` 를 같이 띄운다.
       */
      '/api/config': { target: `http://127.0.0.1:${WORKER_PORT}` },
      '/api/profile': { target: `http://127.0.0.1:${WORKER_PORT}` },
      '/api/world/ticket': { target: `http://127.0.0.1:${WORKER_PORT}` },
      /*
       * 방 목록 · 방 만들기 (worker/src/lobby-do.ts). 등록소는 워커 안의 DO 라 여기도 넘긴다.
       * ★ 워커를 안 띄우면 이 요청은 실패하고, 로비는 목록 자리에 「등록소에 닿지 못했다」를
       *   적는다 (features/lobby/rooms.ts). 목록만 없는 것이고 번호를 아는 방에는 그대로 들어간다.
       */
      '/api/rooms': { target: `http://127.0.0.1:${WORKER_PORT}` },
      // 에이전트 호출을 워커로 — LAB_VIA_WORKER=1 일 때만. 껐으면 labPlugin 이 먼저 받는다
      ...(LAB_VIA_WORKER ? { '/api/lab': { target: `http://127.0.0.1:${WORKER_PORT}` } } : {}),
      /*
       * 시나리오 2 의 개체 한 마디 — /api/world2/say (worker/src 가 이미 이 경로를 들고 있다).
       *
       * ★ 이 한 줄이 없어서 **워커 경로로는 확인할 길이 없었다** (2026-09-03): `npm run dev:api` 로
       *   labPlugin 을 빼도 프록시에 이 경로가 없어 POST 가 SPA 폴백으로 index.html 을 200 으로 받고,
       *   say.ts 의 r.ok 를 통과한 뒤 r.json() 에서 던졌다.
       *
       * ★ **다만 기본 경로(`npm run dev`)로도 잘 돈다** (2026-09-04 실측, 여섯 개체 3.5~4.7 초).
       *   위 머리말의 「한 줄에 3~55 초」는 `/api/lab/*`(cast · talk)의 수치다 — 그쪽은 대본 한 판을 짓지만
       *   이 요청은 **한 문장**이라 훨씬 싸다. say.ts 의 TIMEOUT_MS 8 초 안이므로 키가 없어도 실제 플레이에서
       *   개체가 제 성격대로 답한다. 키(ANTHROPIC_API_KEY)가 있어야만 되는 것이 아니다.
       *
       * 그래도 워커 경로를 두는 이유: 1~2 초로 더 빠르고, 배포본이 실제로 타는 길이 이쪽이라 여기서 한 번은
       * 밟아 봐야 한다. **크레딧이 나간다** — 그래서 기본이 아니라 사람이 켜는 스위치다.
       * 타임아웃을 늘려 때우려 하지 마라: 대화창이 그만큼 머무름을 늘려 대화가 통째로 늘어진다 (say.ts 머리말).
       */
      ...(LAB_VIA_WORKER ? { '/api/world2': { target: `http://127.0.0.1:${WORKER_PORT}` } } : {}),
    },
  },
});
