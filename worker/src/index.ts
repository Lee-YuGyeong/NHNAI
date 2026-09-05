/**
 * 워커 진입점 — 라우팅만 한다. 프론트(dist)와 같은 워커에 함께 배포된다.
 *
 *   wss://<host>/world-ws/rooms/<방번호>/ws?v=<프로토콜버전>&nick=<닉네임>   방 접속
 *   GET  https://<host>/api/rooms                                          열린 방 목록
 *   POST https://<host>/api/rooms   { name?, code? }                       방 만들기
 *   GET  https://<host>/api/config                                         Supabase 주소·anon 키
 *   GET/PUT https://<host>/api/profile                                     이 게임에서 쓰는 이름
 *   POST https://<host>/api/world/ticket                                   방 입장권 (로그인한 사람만)
 *   POST https://<host>/api/world2/say                                     시나리오 2 개체의 한 마디 (문장만)
 *   https://<host>/health                                                  배포 확인
 *   그 밖의 모든 경로                                                       정적 파일 (ASSETS)
 *
 * /world-ws 접두어는 있어도 되고 없어도 된다 — 개발 서버(vite)는 프록시하면서 떼고 보내고,
 * 배포 환경에서는 붙은 채로 온다. 둘 다 같은 방으로 가야 한다.
 *
 * idFromName(방번호) 가 같으면 전 세계 어디서 접속해도 같은 DO 인스턴스로 모인다.
 */

import { handleConfig, handleProfile, handleWorldTicket } from './auth';
import { handleLabAct, handleLabCast, handleLabFree, handleLabTalk, handleWorldBackstep, handleWorldDirect, handleWorldInterrogate, handleWorld2Say } from './lab';
import { LobbyDO, handleRooms } from './lobby-do';
import { RoomDO } from './room-do';
import { handleTts, handleTtsLeader, handleTtsLibrary, handleTtsVoices } from './tts';
import {
  handleLibraryAdd,
  handleSeatAudition,
  handleSeatClip,
  handleSeatClipMint,
  handleSeatRoster,
} from './seat-voice';

export { LobbyDO, RoomDO };

export interface Env {
  ROOM_DO: DurableObjectNamespace;
  /**
   * 방 등록소 (worker/src/lobby-do.ts) — 열린 방 목록이 사는 곳. 인스턴스 하나다.
   * ★ 없어도 방은 돈다. 그때 로비는 목록 자리에 이유를 적고, 번호를 아는 사람은 그대로 들어간다.
   */
  LOBBY_DO?: DurableObjectNamespace;
  /** wrangler.jsonc 의 assets 바인딩 — 빌드된 프론트(dist) */
  ASSETS: Fetcher;
  /**
   * LLM 호출용 — 판(RoomDO)과 테스트 방(/lab)이 같이 쓴다. 로컬은 .dev.vars, 배포는 워커 시크릿.
   * **이 저장소의 배포에 넣는 것은 OPENAI_API_KEY 하나다** (worker/src/lab/provider.ts):
   * 로컬은 키 없이 Claude 구독(Agent SDK)으로 돌고, 워커 안에서는 그 SDK 를 못 쓴다.
   * 둘 다 있으면 Anthropic 이 이긴다.
   */
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /** 개체 등급을 무시하고 한 모델로 고정할 때 (예: gpt-5.6-terra). 비우면 등급대로 나뉜다 */
  OPENAI_MODEL?: string;
  /** 리더 방송 음성 합성용 (ElevenLabs). 키가 브라우저로 나가면 안 되니 여기서만 쓴다 */
  ELEVENLABS_API_KEY?: string;
  /** 기본 목소리 ID. 대시보드 Voices 에서 고른 값 */
  ELEVENLABS_VOICE_ID?: string;
  /**
   * 관리 AI 갈래별 목소리 — 비우면 위의 기본을 쓴다 (worker/src/tts.ts).
   * 셋을 다 다르게 두면 한 시설에서 세 시스템이 말하는 것처럼 들린다 — 알고 하는 선택이어야 한다.
   */
  ELEVENLABS_VOICE_ID_ANNOUNCE?: string;
  ELEVENLABS_VOICE_ID_READOUT?: string;
  ELEVENLABS_VOICE_ID_ALARM?: string;
  /**
   * 참가자 좌석 목소리 명부 — voice id 를 쉼표로 나열한다. 순서가 곧 명부 번호다.
   * 아홉을 채우는 것이 기본이고, 비거나 모자라면 **그 방은 통째로 조용해진다** —
   * 일부 좌석만 소리가 나면 그게 정답표가 된다 (docs/VOICE.md §3, P11).
   */
  ELEVENLABS_SEAT_VOICE_IDS?: string;
  /** 클립 토큰 서명 열쇠. 비우면 ELEVENLABS_API_KEY 에서 파생한다 (seat-voice.ts) */
  TTS_CLIP_SECRET?: string;
  /** '1' 이면 /voice 가 토큰을 직접 받아 간다. **배포에서는 켜지 않는다** (seat-voice.ts) */
  SEAT_VOICE_DEV?: string;
  /**
   * 계정 (worker/src/auth.ts) — humanish 와 **같은 Supabase 프로젝트**를 쓴다.
   * 셋 중 하나라도 비면 로그인이 통째로 꺼지고, 화면은 게스트 닉네임만으로 돈다.
   * anon 키는 브라우저까지 나가는 공개 값이다 (/api/config). service role 키는 여기 없다 — 쓸 일이 없다.
   */
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  WORLD_TICKET_SECRET?: string;
}

/** 방 번호 모양만 받는다. 아무 문자열이나 받으면 DO 가 무한히 생성된다. (src/world/mp/constants ROOM_CODE_RE 와 같다) */
const ROOM_PATH = /^(?:\/world-ws)?\/rooms\/([0-9]{1,6})\/ws$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  // authorization: /api/world/ticket 이 액세스 토큰을 **헤더로** 받는다 (쿼리에 두지 않는 이유는 auth.ts 머리말)
  'access-control-allow-headers': 'content-type,authorization',
};

export default {
  // ctx 는 좌석 음성이 쓴다 — 엣지 캐시에 넣는 일(cache.put)을 응답 뒤로 미룬다 (seat-voice.ts)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return new Response('ok', { headers: CORS });

    /*
     * 방 목록 · 방 만들기 (worker/src/lobby-do.ts). 계정을 묻지 않는다 — 이 게임에서
     * 로그인은 관문이 아니라 이름의 근거다 (src/shared/supabase.ts).
     */
    if (url.pathname === '/api/rooms') return handleRooms(request, env);

    // 계정 — 브라우저가 Supabase 주소·anon 키를 물어보는 자리와, 방 입장권을 끊는 자리.
    // 둘 다 로그인이 꺼져 있어도 **응답한다** (config 는 null 둘, ticket 은 503) — 화면이 그걸 보고 게스트로 간다.
    if (url.pathname === '/api/config') return handleConfig(env);
    if (url.pathname === '/api/profile') return handleProfile(request, env);
    if (url.pathname === '/api/world/ticket') return handleWorldTicket(request, env);

    // 에이전트 경로 — LLM 호출은 전부 여기 안에서. 개발 서버(tools/vite-lab.ts)와 짝이 맞아야
    // 배포본에서 그 화면이 산다.
    if (url.pathname === '/api/lab/act') return handleLabAct(request, env);
    if (url.pathname === '/api/lab/talk') return handleLabTalk(request, env);
    if (url.pathname === '/api/lab/cast') return handleLabCast(request, env);
    if (url.pathname === '/api/lab/free') return handleLabFree(request, env);
    if (url.pathname === '/api/world/interrogate') return handleWorldInterrogate(request, env);
    if (url.pathname === '/api/world/backstep') return handleWorldBackstep(request, env);
    if (url.pathname === '/api/world/direct') return handleWorldDirect(request, env);
    if (url.pathname === '/api/world2/say') return handleWorld2Say(request, env);

    // 리더 방송 합성 — 이 경로는 개발 서버도 워커로 넘긴다 (vite.config.ts 프록시).
    // /api/lab/* 과 달리 구독으로 대신할 방법이 없어서, 로컬에서도 워커를 띄워야 소리가 난다.
    if (url.pathname === '/api/tts') return handleTts(request, env);
    if (url.pathname === '/api/tts/voices') return handleTtsVoices(request, env);
    if (url.pathname === '/api/tts/library') return handleTtsLibrary(request, env);
    // 갈래(announce·readout·alarm)마다 워커가 실제로 쓰는 목소리 — /tts 의 「관리 AI 세 톤」이 묻는다
    if (url.pathname === '/api/tts/leader') return handleTtsLeader(request, env);

    /*
     * 참가자 좌석 음성 (worker/src/seat-voice.ts). 위의 /api/tts 와 **다른 관로다** —
     * 저쪽은 리더 한 사람이 방송하는 자리라 POST 로 그때그때 합성하지만, 이쪽은 방 안
     * 아홉 명이 같은 줄을 듣는 자리라 서명된 GET 으로 받아 엣지 캐시에 태운다.
     * 안 그러면 한 줄에 크레딧이 아홉 번 나가고, 아홉 번의 왕복이 제각각이라 사람마다
     * 누가 먼저 말한 것처럼 들리는지가 달라진다 (docs/VOICE.md §5).
     */
    if (url.pathname === '/api/tts/clip') return handleSeatClip(request, env, ctx);
    // 시연 화면(/voice)이 토큰을 받아 가는 자리 — SEAT_VOICE_DEV=1 일 때만 산다
    if (url.pathname === '/api/tts/clip/mint') return handleSeatClipMint(request, env);
    /*
     * 명부 캐스팅(/tts) — 역시 SEAT_VOICE_DEV=1 일 때만.
     * 시청은 **게임이 실제로 낼 조리법**으로 낸다(seat-voice.ts 의 SEAT_SETTINGS). 방송용
     * 조리법으로 들려주면 게임이 안 내는 소리를 듣고 아홉을 고르게 된다.
     */
    if (url.pathname === '/api/tts/seat-audition') return handleSeatAudition(request, env, ctx);
    if (url.pathname === '/api/tts/library/add') return handleLibraryAdd(request, env);
    // 지금 워커에 들어간 명부 — 채운 뒤 「제대로 들어갔나」를 눈으로 보는 자리.
    // 진짜 판에서 배정표는 클라이언트로 안 내려간다(P8·§3), 그래서 이것도 개발 뒤에 둔다
    if (url.pathname === '/api/tts/seats') return handleSeatRoster(request, env);

    const match = ROOM_PATH.exec(url.pathname);
    // 방 경로가 아니면 정적 파일로 넘긴다 (없는 경로는 assets 설정에 따라 index.html).
    if (!match) return env.ASSETS.fetch(request);

    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(match[1]));
    // 요청을 그대로 넘긴다. Upgrade 헤더가 붙은 Request 는 다시 만들 수 없다.
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
