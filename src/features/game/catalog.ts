/**
 * 게임 목록의 원본 — /game 이 이 표 하나를 읽어 문을 세운다 (2026-09-05 사용자: "게임 목록
 * 따로 만들고싶은데 /game 만들어서 거기서 각자 들어가서 할수있게").
 *
 * ┌─ 여기 오르는 것 (2026-09-05 사용자가 직접 골랐다) ──────────────────────┐
 * │ "낙하생존 움직이는 플래폼 회전원판 무게중심다리 무너지는 타워 회전 봉    │
 * │  넘기만 넣어 다른거 다 뺴"                                               │
 * │                                                                          │
 * │ 그래서 이 목록은 **여섯**이다. 물리 시험 여덟 중 정지선과 색 사냥이 빠졌  │
 * │ 고, 검문소(본판)와 시나리오 2 도 빠졌다. 넷 다 **지운 게 아니다** —      │
 * │ 주소(/trial?game=stopline · ?game=colorhunt · /interrogation ·           │
 * │ /scenario2)도 라우트도 그대로고 루트 목록(/menu)에도 있다. 여기 이 표에  │
 * │ 만 없다. 되돌리려면 아래 배열에 한 줄이다.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 등록부(features/index.ts)와 **역할이 다르다.** 저기는 라우트를 만드는 표라 화면 스무 개가
 *   다 올라 있다 — 개발용 시연판(/voice · /rules · /llm)까지. 여기 오르는 것은 **판**뿐이고,
 *   문패가 아니라 게임이라 설명 · 물리 · 길이가 붙는다.
 *
 * ★ 길이는 상수에서 온다 (lobby/Intro.tsx 머리말과 같은 규칙 — 화면에 손으로 적은 숫자가
 *   방에 들어가서 틀리면 그 뒤 화면을 전부 의심하게 된다).
 *
 * ★ 설명은 **서버 엔진이 실제로 재는 것**을 적는다 (worker/src/trial/<game>/engine.ts 머리말).
 *   "재밌다"가 아니라 "무엇을 보고 판정하나"다 — 이 게임에서 그게 곧 규칙이라서.
 */
import { PLATFORM_GAME_MS, TRIAL_GAME_MS, TRIAL_PHASE_MS } from '@/world/mp/constants';
import type { TrialGame } from '@/world/mp/protocol';

export interface GameEntry {
  /** 카드에 그릴 그림도 이 이름으로 갈라 그린다 (glyphs.tsx) */
  id: TrialGame;
  /** 짧은 이름. 전광판(trial/scoreboard)도 같은 글자를 쓴다 */
  label: string;
  /** 무엇을 재는 판인가 — 카드의 작은 라벨 */
  physics: string;
  /** 한 줄 설명. 서버가 무엇을 보고 판정하는지까지 적는다 */
  blurb: string;
  /** 한 판 길이(ms) */
  ms: number;
  /** 방 번호를 받아 주소를 만든다 */
  href: (code: string) => string;
}

/**
 * 물리 시험 **여덟 전부**의 짧은 이름 — 전광판이 결과 머리에 쓰는 그 글자
 * (trial/scoreboard/Scoreboard.tsx). 목록(GAMES)에서 빠진 둘도 여기에는 남는다:
 * 주소로 들어가면 그 판은 그대로 돌고, 돌면 결과판이 이름을 찾는다.
 */
export const TRIAL_LABEL: Record<TrialGame, string> = {
  stopline: '정지선',
  fall: '낙하 생존',
  colorhunt: '색 사냥',
  platform: '움직이는 플랫폼',
  disc: '회전 원판',
  seesaw: '무게 중심 다리',
  tower: '무너지는 타워',
  bar: '회전 봉 넘기',
};

/** 목록에 서는 여섯. 순서는 사용자가 적어 온 순서 그대로다 */
export const GAMES: GameEntry[] = [
  {
    id: 'fall',
    label: TRIAL_LABEL.fall,
    physics: '중력 · 낙하 시간',
    blurb: '떨어지는 것들 사이에서 버틴다. 맞았는가와 착지 순간 얼마나 벗어나 있었는가를 서버가 적분해 센다.',
    ms: TRIAL_GAME_MS,
    href: (code) => `/trial?code=${code}&game=fall`,
  },
  {
    id: 'platform',
    label: TRIAL_LABEL.platform,
    physics: '점프 · 발판 마찰',
    blurb: '움직이는 발판으로 건너뛴다. 발판이 그때 어디 있었는지는 서버가 알고, 착지한 발이 얼마나 미끄러지는지가 숨은 값이다.',
    ms: PLATFORM_GAME_MS,
    href: (code) => `/trial?code=${code}&game=platform`,
  },
  {
    id: 'disc',
    label: TRIAL_LABEL.disc,
    physics: '원심력 · 마찰',
    blurb: '도는 원판 위에 남는다. 자리는 클라가 신고하지 않는다 — 걷겠다는 명령만 올리고 밀려난 만큼을 돌려받는다.',
    ms: TRIAL_GAME_MS,
    href: (code) => `/trial?code=${code}&game=disc`,
  },
  {
    id: 'seesaw',
    label: TRIAL_LABEL.seesaw,
    physics: '무게중심 · 토크',
    blurb: '크레인이 판 위에 상자를 내려놓는다. 무리가 반대쪽으로 옮겨 가 균형을 되찾기까지 걸린 시간이 기록이다.',
    ms: TRIAL_GAME_MS,
    href: (code) => `/trial?code=${code}&game=seesaw`,
  },
  {
    id: 'tower',
    label: TRIAL_LABEL.tower,
    physics: '질량 · 충돌',
    blurb: '무게가 몰린 발판이 기울어 떨어진다. 밀치는 것도 규칙 안이다 — 밀린 몸의 낙하도 같은 낙하로 센다.',
    ms: TRIAL_GAME_MS,
    href: (code) => `/trial?code=${code}&game=tower`,
  },
  {
    id: 'bar',
    label: TRIAL_LABEL.bar,
    physics: '타이밍 · 마찰',
    blurb: `도는 봉을 뛰어넘는다. 봉의 속도는 불규칙하지만 그건 공개값이고, 감춘 것은 ${TRIAL_PHASE_MS / 1000}초마다 바뀌는 발밑 바닥뿐이다.`,
    ms: TRIAL_GAME_MS,
    href: (code) => `/trial?code=${code}&game=bar`,
  },
];

/**
 * 목록의 문들이 들고 가는 방 번호 — /world · /trial · /interrogation 이 다 같이 쓰는 값이다.
 * 화면에서 **묻지 않는다** (2026-09-05 사용자: "다 삭제해줘" — 목록 위의 번호 칸을 걷었다).
 * 다른 방으로 가려면 주소의 ?code= 를 고친다. 칸을 도로 세울 때 쓸 규칙은 숫자 1~6자리다
 * (그 밖의 글자면 워커가 붙자마자 connection_failed 로 끊는다).
 */
export const DEFAULT_ROOM_CODE = '1234';
