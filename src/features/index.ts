import { lazy, type ComponentType } from 'react';

/**
 * 화면은 전부 lazy 다 — 정적으로 물면 three.js·drei 까지 통짜 청크 하나(1.7MB)가 돼서
 * 인트로만 열어도 3D 뭉치를 다 받는다. 각 라우트 청크는 처음 들어갈 때 받는다 (App 의 Suspense 가 받친다).
 */
/*
 * /intro 는 **features/lobby 의 브리핑**이다 (2026-08-30 사용자: "내가 만든 걸 /intro 로 다 옮겨줘").
 *
 * 옮긴 것은 파일이 아니라 주소다. 그 화면은 형제 파일들(console.tsx · lobby.css · live.tsx)을
 * 방 목록·대기방과 나눠 쓰므로 폴더째 옮길 수 없다 — 그래서 등록부의 이 한 줄이 저쪽을 가리킨다.
 * 옛 랜딩(./intro/IntroFeature)은 파일도 시험도 그대로 있고 **경로만 잃었다.** 되돌리려면 이 줄이다.
 */
const IntroFeature = lazy(() => import('./lobby/Intro').then((m) => ({ default: m.LobbyIntro })));
const LobbyFeature = lazy(() => import('./lobby/LobbyFeature').then((m) => ({ default: m.LobbyFeature })));
/**
 * /login 도 **features/lobby 의 화면**이다 (/intro 와 같은 규칙, 위 주석).
 * 로그인에서 방 목록으로 넘어갈 때 화면이 갈아끼워지면 안 돼서 같은 콘솔을 입는다.
 */
const LoginFeature = lazy(() => import('./lobby/Login').then((m) => ({ default: m.LoginFeature })));
/** 이름 짓기 — 로그인 → **이름** → 로비 한 흐름의 가운데 칸 (humanish 의 /account/nickname) */
const NicknameFeature = lazy(() => import('./lobby/Nickname').then((m) => ({ default: m.NicknameFeature })));
const MainFeature = lazy(() => import('./main/MainFeature').then((m) => ({ default: m.MainFeature })));
const GameFeature = lazy(() => import('./game/GameFeature').then((m) => ({ default: m.GameFeature })));
const WorldFeature = lazy(() => import('./world/WorldFeature').then((m) => ({ default: m.WorldFeature })));
const WarehouseFeature = lazy(() => import('./warehouse/WarehouseFeature').then((m) => ({ default: m.WarehouseFeature })));
const CentralFeature = lazy(() => import('./central/CentralFeature').then((m) => ({ default: m.CentralFeature })));
const RecheckFeature = lazy(() => import('./recheck/RecheckFeature').then((m) => ({ default: m.RecheckFeature })));
const PlayFeature = lazy(() => import('./play/PlayFeature').then((m) => ({ default: m.PlayFeature })));
const InterrogationFeature = lazy(() =>
  import('./interrogation/InterrogationFeature').then((m) => ({ default: m.InterrogationFeature })),
);
const ProfileFeature = lazy(() => import('./profile/ProfileFeature').then((m) => ({ default: m.ProfileFeature })));
const LlmFeature = lazy(() => import('./llm/LlmFeature').then((m) => ({ default: m.LlmFeature })));
const TtsFeature = lazy(() => import('./tts/TtsFeature').then((m) => ({ default: m.TtsFeature })));
/**
 * 좌석별 목소리 시연 (docs/VOICE.md). /tts 와 다른 자리다 — 저기는 리더 **한 사람**의 목소리를
 * 고르는 곳이고, 여기는 **아홉이 한꺼번에 떠들 때** 무엇이 소리가 되고 무엇이 조용한가를 듣는 곳이다.
 */
const VoiceFeature = lazy(() => import('./voice/VoiceFeature').then((m) => ({ default: m.VoiceFeature })));
const LabFeature = lazy(() => import('./lab/LabFeature').then((m) => ({ default: m.LabFeature })));
const TalkFeature = lazy(() => import('./talk/TalkFeature').then((m) => ({ default: m.TalkFeature })));
const ArenaFeature = lazy(() => import('./arena/ArenaFeature').then((m) => ({ default: m.ArenaFeature })));
/** 물리 미니게임 — 진짜 서버 권위 멀티플레이(PLANNING §2). 정지선만 실배선(PR1) */
const TrialFeature = lazy(() => import('./trial/TrialFeature').then((m) => ({ default: m.TrialFeature })));
/**
 * 시나리오 2 — 본판(/play)과 **아무것도 나눠 쓰지 않는 두 번째 판**이다.
 * 방은 world2/map, 이야기·저장소는 features/world2 에 따로 있다. 저쪽 챕터·체력·SYNC 는 여기서 안 돈다.
 */
const Scenario2Feature = lazy(() => import('./world2/Scenario2Feature').then((m) => ({ default: m.Scenario2Feature })));

export interface FeatureDef {
  id: string;
  title: string;      // 인트로 버튼 이름
  path: string;       // 라우트
  owner: string;      // 담당자
  Component: ComponentType;
  /**
   * 루트 목록(Launcher)에 세우지 않는다. 라우트는 살아 있다.
   * **흐름 중간에만 들르는 화면**을 위한 것이다 — 메뉴에서 직접 누를 일이 없고,
   * 눌러 봐야 조건이 안 맞으면 곧바로 되돌아 나온다.
   */
  hidden?: boolean;
  /**
   * 루트 목록에 이 화면의 문을 **여러 개** 세운다 — 라우트는 하나인데 들어가는 방식이 여럿일 때
   * (물리 미니게임: 같은 /trial 을 ?game= 으로 갈라 연다). 있으면 title 대신 이것들이 선다.
   */
  doors?: { title: string; to: string }[];
}

/** 서비스 등록부 — 폴더 만들고 여기 한 줄 추가하면 인트로 버튼 + 라우트가 생긴다 */
export const FEATURES: FeatureDef[] = [
  { id: 'intro', title: '인트로',  path: '/intro', owner: 'TBD', Component: IntroFeature },
  { id: 'main',  title: '메인',    path: '/main',  owner: 'TBD', Component: MainFeature },
  /*
   * 인트로에서 넘어오는 칸 — 방 목록과 대기방이다 (브리핑은 위의 /intro 로 갔다).
   *
   * ★ 이 줄은 2026-08-30 23:22 커밋(8937296, 재검실 신설)에서 **실수로 지워졌다** —
   *   재검실 두 줄이 로비 두 줄을 그대로 덮었다. 그동안 /lobby 는 라우트가 없어서
   *   App 의 `path="*"` 에 걸려 루트로 튕겼다. 되살린다.
   */
  { id: 'lobby', title: '방 목록 · 대기방', path: '/lobby', owner: 'TBD', Component: LobbyFeature },
  /*
   * 로그인 — **관문이 아니다.** 아무 화면도 이걸 강제로 거치지 않는다 (RequireLogin 없음).
   * 목록에 세우는 이유는 하나다: 찾을 수 있어야 해서. 머리말의 계정 단추는 키가 없으면
   * 조용히 사라지는데, 그것만 있으면 "로그인이 어디 있냐" 가 된다 (2026-08-31 사용자).
   */
  { id: 'login', title: '로그인 (선택)', path: '/login', owner: 'TBD', Component: LoginFeature },
  // 흐름 중간 칸이라 목록에는 없다. 이름이 이미 있으면 스스로 되돌아 나간다
  { id: 'nickname', title: '닉네임 등록', path: '/account/nickname', owner: 'TBD', hidden: true, Component: NicknameFeature },
  { id: 'world',   title: '3D 월드',       path: '/world',   owner: 'TBD', Component: WorldFeature },
  { id: 'warehouse', title: '창고 3D 맵',  path: '/warehouse', owner: 'TBD', Component: WarehouseFeature },
  { id: 'central', title: '중앙 시설',  path: '/central', owner: 'TBD', Component: CentralFeature },
  // 챕터 3 — 검문에서 감독이 끌고 왔을 때만 열린다 (chapter2 의 detain). 여기 문답에는 대본이 없다
  { id: 'recheck', title: '재검실 (대본 없음)', path: '/recheck', owner: 'TBD', Component: RecheckFeature },
  // 본판 — 복도부터 검문소까지 한 줄로 이어진 길의 입구 (shared/start.ts). 로비의 붉은 케이스가 이것이다
  { id: 'play',  title: '게임 시작 테스트', path: '/play', owner: 'TBD', Component: PlayFeature },
  /*
   * 두 번째 판 — 「짓지 않은 방들」. 복도 → 휴게 구역 → 작업 구역 → 기록 복도 → 창이 있는 방 → **검문소 아레나**.
   * 싸움이 없고, 계량기가 둘(의심도 · 경보도)이고, 먼저 말을 걸 수 있다. 위의 「게임 시작 테스트」와는 길이 아예 다르다.
   */
  { id: 'scenario2', title: '시나리오 2 (짓지 않은 방들)', path: '/scenario2', owner: 'TBD', Component: Scenario2Feature },
  /*
   * 본판 「인간인 척」 (PLANNING.md) — 방에 붙어 도는 판. ?code= 가 방 번호, 방장이 시작한다 (features/interrogation).
   *
   * ★ 문패에 **「검문소」를 도로 넣는다** (2026-09-04 사용자: "검문소 버튼 어디갔지?").
   *   이 문은 리빌드(808662d) 전까지 「검문소 (판만)」이었다. 판을 갈아끼우면서 이름을 「인간인 척 (본판)」으로
   *   바꿨더니, 이 방을 여태 **검문소**라 불러 온 사람에게는 목록에서 문이 통째로 사라진 것으로 보였다
   *   — 목록의 다른 줄들도(재검실 · 시나리오 2 · 중앙 시설) 전부 방 이름으로 서 있어서다.
   *   방 이름(검문소)이 앞, 판 이름(인간인 척)이 뒤다. 주소도 라우트도 그대로다.
   */
  {
    id: 'interrogation',
    title: '검문소 (인간인 척 본판)',
    // ?code= 없이 들어가면 InterrogationFeature 가 기본 방 1234 로 붙는다 — doors 로 그 번호를 따로 적지 않는다
    // (2026-09-04 사용자: "1234 방 키 말고 그냥 http://localhost:5173/interrogation 이걸로 연결해줘. 코드
    // 1234로 다 되어있는데 그냥 없애줘")
    path: '/interrogation',
    owner: 'TBD',
    Component: InterrogationFeature,
  },
  { id: 'game',    title: '라운드 진행',    path: '/game',    owner: 'TBD', Component: GameFeature },
  { id: 'profile', title: '프로필',        path: '/profile', owner: 'TBD', Component: ProfileFeature },
  { id: 'llm',     title: 'LLM 테스트',    path: '/llm',     owner: 'TBD', Component: LlmFeature },
  // 「리더 방송」은 옛 판 이름이다 — 이 기획의 방송자는 관리 AI 고, 이 화면은 좌석 아홉을 고르는 자리이기도 하다
  { id: 'tts',     title: 'TTS 관리 AI · 좌석 캐스팅', path: '/tts', owner: 'hbkim507', Component: TtsFeature },
  { id: 'voice',   title: '좌석별 목소리 (방 울림)',   path: '/voice', owner: 'hbkim507', Component: VoiceFeature },
  // 폴더와 경로가 어긋나 있다: features/talk → /lab (이게 지금 쓰는 판), features/lab → /rules (규정·검사 실험판)
  { id: 'lab',     title: '구역 (AI 5 + 나)',      path: '/lab',   owner: 'TBD', Component: TalkFeature },
  { id: 'rules',   title: '규정·검사판',            path: '/rules', owner: 'TBD', Component: LabFeature },
  { id: 'arena',   title: '검사 (리더가 좌표를 짠다)', path: '/arena', owner: 'TBD', Component: ArenaFeature },
  {
    id: 'trial',
    title: '물리 미니게임',
    path: '/trial',
    owner: 'TBD',
    Component: TrialFeature,
    // 방 코드는 1234 고정 — 루트에서 누르는 건 시험용이고, 같은 코드로 탭을 하나 더 열면 같은 홀에서 만난다
    doors: [
      { title: '물리 미니게임 · 정지선 (마찰 · 관성)', to: '/trial?code=1234&game=stopline' },
      { title: '물리 미니게임 · 낙하 생존 (중력 · 공기저항)', to: '/trial?code=1234&game=fall' },
      { title: '물리 미니게임 · 색 사냥 (빛과 색)', to: '/trial?code=1234&game=colorhunt' },
    ],
  },
];
