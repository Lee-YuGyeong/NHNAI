/**
 * 시행 (/arena) — 리더가 **문장으로 지시하고**, 개체들이 각자 읽고 움직이고, 리더가 기록으로 판정한다.
 *
 * 게임 종류가 없다. 우리가 정한 것은 몸이 할 수 있는 것 셋(걷기·점프·멈추기)과
 * 기록의 모양뿐이고, 무엇을 시킬지·무엇을 볼지·누구를 의심할지는 전부 리더 몫이다.
 *
 * 3D 는 src/arena3d — 3D 월드 담당자의 src/world 를 복사한 것이고 원본은 건드리지 않는다.
 * 대화는 /lab 과 **같은 엔진**(src/lab/talk.ts — runTalk·nextSpeaker·heatOf)이다.
 * 개체들이 배회하며 저희끼리 떠들고, Enter 로 내가 끼어든다. 판을 고치려면 talk.ts 를 고친다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  EMOTE_MS,
  WorldScene,
  Zones,
  getTouchMode,
  remotePlayers,
  resetInput,
  subscribeTouchMode,
  type AnimState,
  type ArenaMapDef,
  type EmoteState,
} from '@/arena3d';
import { MAPS } from '@/world';
import { broadcastAnnounce, selectBroadcastNow, selectBroadcastSpeaking } from '@/shared/broadcast';
import { Bgm } from '@/features/world/Bgm';
import { DialogueBox, lineDuration } from '@/features/world/DialogueBox';
import type { ChatLine } from '@/features/world/worldSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { LEADER_NAME, PERSONAS, TRIAL_PARTY, fiveFrom, sampleNames, shuffle, type CallStyle } from '@/lab/personas';
import { ARENA, SPEED, START, distance, keepInside, pathFor, type Obstacle, type Pt } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';
import { replanFrom, summarize, type FreeTrial, type Move, type Plan, type Verdict } from '@/lab/free';
import {
  QUICK_GAMES,
  judgeQuick,
  liveNote,
  sweepAt,
  zoneStates,
  type LiveNote,
  type QuickGame,
  type QuickTrial,
  type Stakes,
  type ZoneState,
} from '@/lab/quick';
import { ORAL_GAMES, judgeOral, type OralAnswer, type OralGame, type OralTrial } from '@/lab/oral';
import {
  HEAT_MIN,
  ARRIVAL_OPENERS,
  HUNT_OPENERS,
  calledNode,
  heatOf,
  mobsOf,
  nextSpeaker,
  pendingCall,
  resolveName,
  shiftLine,
  turnsSilent,
  type DeadRecord,
  type TalkLine,
  type TalkRequest,
  type TalkResponse,
} from '@/lab/talk';
// 배역은 판이 시작될 때 미리 지어 둔다 — 여기서는 받아만 간다 (makeCast)
import { makeCastNow, takeWarmCast } from '@/lab/cast-warm';
import { readoutLine } from '@/lab/scoring';
// 번호 뒤에 붙는 조사 — 「A62-024 이 …」는 조사가 틀렸을 뿐 아니라 「이 사람」으로도 읽힌다 (lab/josa)
import { eunNeun, euRo, iGa } from '@/lab/josa';
import { series } from '@/shared/series';
import { NotePad } from '@/shared/NotePad';
import { notesOpen, subscribeNotes } from '@/shared/notes';
import { playSfx } from '@/shared/sfx';
import { doors } from '@/world/mp/doors';
import { SYNC_GLITCH, sync } from '@/world/mp/sync';
import { Collapse } from './Collapse';
import { HandoverCard, HANDOVER_CSS } from './HandoverCard';
import { UnitPanel } from './UnitPanel';
import { FACILITY_SECTOR, HALL_SEAL_MS, HANDOVER_MIN_MS, arrivalLine, readHandover, roomArrival, storyCast, type Handover } from './handover';
import { LeaderOnStage } from './LeaderOnStage';
import { SoundPanel } from './SoundPanel';
import { HUSH_CEIL_MS, briefWaitMs, endHoldMs, purgeHoldMs } from './briefing';
import { unlockClosesChat } from './chat';
import { followsBottom } from './feedscroll';
import { pipColor } from './pip';
import { IDLE_RING, ROAM, inRoam, ringSpot } from './lineup';
import { separateBots, type Solid } from './separate';
import { escKeySound, unlockOpensSound } from './sound-esc';
import { leaderShowAction, type LeaderAction } from '@/features/warehouse/LeaderRobot';
import type { Sample } from '@/lab/spec';

type Phase = 'idle' | 'designing' | 'briefing' | 'countdown' | 'running' | 'judging' | 'oral' | 'result';
/** 판의 결말 — 'playing' 이 아니게 되는 순간 판은 끝이다. 한 번 정해지면 바뀌지 않는다 (settle) */
type Outcome = 'playing' | 'won' | 'chaos' | 'lost';

/**
 * 시행이 도는 국면 — 여기서는 **대화창을 내린다** (사용자 결정 2026-08-30).
 * 지시대로 몸을 움직이거나 답을 치는 참이라, 방의 잡담은 읽을 것이 아니라 가릴 것이다.
 *
 * 즉답 시행이 여기 들어 있는 것이 특히 중요하다 — 답을 치는 참에 옆에서 잡담이 흘러가면
 * 읽어야 할 글이 둘이 된다.
 *
 * ★ **판정(result)은 여기 없다** (2026-09-02). 판독이 뜬 자리는 몸을 움직이는 참이 아니라
 *   방금 난 판정을 두고 방이 떠드는 자리다 — 이 파일의 다른 곳들이 이미 그렇게 적혀 있었다
 *   (talkphase 로 대화창을 키우는 렌더, passWashMobbed 의 근거, 결과가 스스로 물러나는 이유).
 *   그런데 로그만 내려가 있어서, 판이 끝나면 화면에서 방이 통째로 사라졌다.
 */
const TRIAL_PHASES = new Set<Phase>([
  'designing', 'briefing', 'countdown', 'running', 'judging', 'oral',
]);

/**
 * 왼쪽 위 계기판(UnitPanel)이 비켜서는 국면 — **판 한 바퀴 전부**다 (2026-09-03 사용자:
 * "왼쪽 위 계기판이랑 화면에 게임 관련 뜨는 거 겹칠 때가 있다. 미니 게임 말 다 끝나면
 * 계기판 떠서 절대 안 겹치게").
 *
 * 계기판은 왼쪽 12px 에 선 252px 짜리 판이고 **z 가 더 높다** (hud.css 의 .hud-cluster).
 * 화면 위쪽 가운데에 서는 상자들은 저마다 넓다 — 그래서 창이 그 폭에 못 미치면 상자의 왼쪽
 * 끝이 계기판 밑으로 들어가고, 읽어야 할 글이 계기판에 깔린다:
 *
 *   designing  「리더가 지시문을 쓰고, 개체들이 각자 읽는 중… n초」 (.panel.overlay · 위 24px · 680px)
 *   briefing   다른 개체들이 지시문을 어떻게 읽었나 (같은 상자)
 *   countdown  시계와 지시문 (.arena .hud · 위 16px · .dim.wide 는 720px)
 *   running    시행 중 화면 (TrialHud — 같은 자리)
 *   judging    「판독 중」 (같은 자리)
 *   oral       문제와 답 칸 (.ask · 화면 한가운데 · 560px)
 *   result     내 몫 판정 한 줄 (.arena .hud .said · 위 16px · 560px)
 *
 * 여태는 몸을 쓰는 넷(countdown·running·judging·oral)만 비켜섰다. 나머지 셋도 같은 자리를
 * 쓰는데 안 비켜서 있었던 것이 사용자가 본 겹침이다 — 680px 상자는 창이 1200px 만 못 되면
 * 어김없이 계기판을 문다.
 *
 * 그래서 규칙을 하나로 줄인다 — **판이 걸려 있는 동안에는 계기판이 없다.** 말이 다 끝나고
 * 방으로 돌아온 자리(idle)에서만 선다. 시행 구간에 대화창을 내리는 것과 같은 규칙이다
 * (TRIAL_PHASES): 판이 도는 참에 화면에 남는 글은 판이 시키는 것 하나여야 한다.
 *
 * ★ 판 사이(idle)라도 검사판·준비 상자가 위쪽 가운데에 서 있으면 같이 비켜선다 — 그건
 *   국면이 아니라 상자가 떠 있느냐라서, 렌더의 panelAway 가 이 목록에 얹어 본다.
 */
const PANEL_AWAY_PHASES = new Set<Phase>([
  'designing', 'briefing', 'countdown', 'running', 'judging', 'oral', 'result',
]);

/**
 * 리더의 말이 무슨 소식인가 — **대화창에서 색이 되는 것이 이 값이다** (아래 CSS 의 .bcline).
 * 방송 종류(shared/broadcast 의 BroadcastKind)와 다른 축이다: 그쪽은 "큐에서 어떻게 다루나"
 * (끼어드나·기다리나)이고, 이쪽은 "읽는 사람에게 무슨 소식인가"다.
 */
type LeaderTone = 'order' | 'readout' | 'purge' | 'clear';

/**
 * 대화 로그의 한 줄. 개체의 말은 TalkLine 그대로고, **리더의 말에만 결(tone)이 붙는다.**
 *
 * 결은 로그에만 얹히고 **개체에게는 안 간다** — 에이전트가 받는 것은 여전히 `[이름] 말` 뿐이다
 * (src/lab/talk 의 logText). 화면이 더 아는 것이지 방이 더 아는 것이 아니다.
 */
type FeedLine = TalkLine & { tone?: LeaderTone };

/** 리더의 말을 로그에 남긴다 — 방송(소리)과 짝이 되는 글자다. 결은 여기서만 붙는다 */
const leaderSays = (text: string, tone: LeaderTone): FeedLine => ({ nodeId: LEADER_NAME, text, tone });

/**
 * 자리가 굳는 국면 — 배회가 멈춘다. 지시문이 나온 뒤로 판이 끝날 때까지다.
 *
 * 설계 중(designing)은 안 넣는다: 리더의 LLM 왕복이라 몇 초씩 걸리고, 아직 아무 말도 안 나온 방을
 * 굳혀 두면 판이 멎은 것으로 보인다. 대신 그 사이의 걸음은 begin 이 계획을 다시 재서 흡수한다.
 */
const SET_PHASES = new Set<Phase>(['briefing', 'countdown', 'running']);

/**
 * 바닥 표식이 켜져 있는 국면 — 판이 도는 동안과 그 판정이 읽히는 동안까지다.
 *
 * 여태 켜는 조건은 `trial && phase !== 'designing'` 하나였는데 **trial 은 아무도 안 지운다.**
 * 그래서 끝난 판의 원이 대화 국면 내내 바닥에 켜진 채 남았고, 표식 상태도 같이 비어서
 * (begin 이 zoneNow 를 비운다 → getZoneState 가 기본값 '다음 자리'를 낸다) 지나간 판의 원이
 * **파랗게 다시 살아나 다음 자리인 척**했다. 즉답 판이 서면 그 위에 지난 몸판의 원이 겹쳤다.
 * 표식은 그 판의 것이다 — 판이 끝나면 같이 꺼진다.
 */
const ZONE_PHASES = new Set<Phase>(['briefing', 'countdown', 'running', 'judging', 'result']);

const OBSTACLES: Obstacle[] = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
/**
 * 배회하다 들여다볼 물건 — **마당 안에서 닿는 것만**이다 (lineup 의 ROAM).
 * 콘솔 16개는 옆벽(x ±11.65)에 붙어 있어 그 앞에 서면 화면 밖이라, 여기서 빠진다.
 * 시행은 여전히 콘솔로 보낸다 (「콘솔 앞에 정렬」) — 배회만 안 간다.
 */
const ROAM_OBJECTS = OBJECTS.filter((o) =>
  // 홀 안쪽으로 한 걸음 나온 자리 = 그 물건의 "앞". 거기가 마당 안이라야 갈 수 있다
  inRoam({
    x: o.x + Math.sign(START.x - o.x) * (o.hw + 1),
    z: o.z + Math.sign(START.z - o.z) * (o.hd + 1),
  }),
);

/**
 * ── 몸이 말을 따라간다 ──
 * 여태 배회 봇은 **걸어갈 때만** 몸의 방향이 정해졌다. 그래서 누가 말해도 나머지는 등을 돌린 채였고,
 * 말하는 쪽도 아무 데나 보고 말했다 — 다섯이 같은 방에 있는데 아무도 서로를 안 보는 그림이었다.
 */
/** 말이 나오면 이 반경 안의 개체가 화자 쪽으로 몸을 돌린다 */
const LOOK_R = 7;
/** 그중 걷던 개체가 걸음을 멈추고 듣는 확률 — 매번 전원이 서면 방이 얼어붙는다 */
const LISTEN_ODDS = 0.5;

/**
 * ── 몸이 말을 **따라간다** ── (2026-09-03 사용자)
 *
 * 쳐다보는 것(lookAtSpot)의 다음 칸이다. 여태 방이 말에 반응하는 방식은 목을 돌리는 것뿐이라,
 * 다섯이 각자 제 볼일을 보며 말만 주고받았다. 이제 둘이 더 붙는다:
 *   ① 몰이가 서면 **문 쪽 몇이** 표적 앞으로 걸어간다 (전부는 아니다 — MOB_CLOSE_IN)
 *   ② 말이 나오면 가끔 하나가 화자 쪽으로 걸어간다 (APPROACH_ODDS)
 *
 * **전부 붙이지 않는 이유가 값에 적혀 있다.** 다섯이 매번 한 점으로 모이면 방은 20초 만에
 * 한 덩어리가 되고, 그때부터 배회는 없다 — 시행 예산도 그 덩어리 하나로 잡힌다(farWalkTime).
 * 몇만 붙어야 「저쪽에서 둘이 몰아붙이는 동안 저쪽은 딴 데 있다」가 그림으로 남는다.
 */
/** 곁으로 친다 — 이 안이면 이미 그 개체 옆이라 더 안 붙는다 (m) */
const NEAR_R = 1.7;
/** 걸어갈 만한 거리의 한계(m). 방 건너에서 출발하면 (배회 속도 1.43m/s) 도착 전에 말이 끝난다 */
const APPROACH_R = 11;
/** 몰이가 새로 설 때 표적 앞으로 붙는 수 — **문 사람 전부가 아니다** */
const MOB_CLOSE_IN = 2;
/** 붙은 뒤 그 자리에 머무는 시간(ms) — 지나면 배회가 다시 데려간다 */
const MOB_HOLD_MS = 6000;
/** 말 한 줄에 하나가 화자 쪽으로 걸어갈 확률. 매번이면 방이 화자를 따라 굴러다닌다 */
const APPROACH_ODDS = 0.35;

/**
 * 배회·접근이 목적지로 삼을 수 있는 자리인가 — 마당(lineup 의 ROAM) 안이고, 벽·가구에서 떨어져 있다.
 *
 * 경로(pathFor)는 가구를 돌아가 주지만 **도착점은 못 피한다.** 마당 밖도 마찬가지다:
 * 홀 전체를 목적지로 두면 20초 만에 다섯이 옆벽까지 흩어져 화면에 몸이 하나도 안 남았다
 * (2026-09-01 사용자). 목적지를 짓는 자리가 둘이므로(배회 spot · 접근 approach) 검사는 여기 하나다.
 */
function roamFree(p: Pt): boolean {
  return (
    inRoam(p) &&
    p.x > ARENA.minX + 0.9 &&
    p.x < ARENA.maxX - 0.9 &&
    p.z > ARENA.minZ + 0.9 &&
    p.z < ARENA.maxZ - 0.9 &&
    !OBSTACLES.some((o) => Math.abs(p.x - o.x) < o.hw + 0.5 && Math.abs(p.z - o.z) < o.hd + 0.5)
  );
}

/** 그 자리에서 반지름 r 만큼 떨어진, 방향은 아무 데나인 한 점 */
function around(x: number, z: number, r: number): Pt {
  const a = Math.random() * Math.PI * 2;
  return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
}
/** 몸이 도는 속도(rad/s) — 홱 돌면 기계고, 너무 느리면 말이 끝난 뒤에야 돈다 */
const TURN_RATE = 5.5;
/** 말풍선이 머무는 길이 — 글자 수로 재되(lineDuration) 이 범위를 벗어나지 않는다 */
const BUBBLE_MIN_MS = 2600;
const BUBBLE_MAX_MS = 9000;
/** 한 줄이 떠 있을 시간. 말풍선·듣는 자세·화자가 서 있는 시간이 전부 이 하나를 본다 */
const holdFor = (text: string) => Math.min(BUBBLE_MAX_MS, Math.max(BUBBLE_MIN_MS, lineDuration(text)));

/** -π~π 로 접은 각도 차 — 350° 를 돌지 않고 -10° 로 돈다 */
function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * 배경 — 시행(/arena)은 창고 3D 맵(격납고 홀) 그대로 (2026-08-30 사용자 결정 — 심문소 맵에서 바꿨다. 게임은 그대로, 맵만).
 * 검문소(/interrogation)는 특수인공지능대응센터 홀(2026-09-04 사용자 참고 이미지 — 게임은 그대로, 맵만).
 * **둘의 발자국·충돌 목록은 같다** — 게임의 바닥 치수(ARENA)와 오브젝트 카탈로그(objects.ts)가 warehouse/layout.ts 하나를 보고,
 * govcenter/layout.ts 는 그 목록을 재수출한다. 그래서 맵이 바뀌어도 판·판정·리더의 어휘는 한 줄도 안 바뀐다.
 */
export type ArenaMapId = 'warehouse' | 'govcenter';
const MAP_DEFS: Record<ArenaMapId, ArenaMapDef> = {
  warehouse: { ...MAPS.warehouse, bounds: ARENA },
  govcenter: { ...MAPS.govcenter, bounds: ARENA },
};

const SAMPLE_MS = 100;
/** 조준 지목(E)이 무는 각도 — 앞쪽 이만큼(약 30°) 안에 든 몸만 고른다 */
const AIM_COS = Math.cos((30 * Math.PI) / 180);
/** 조준 지목이 닿는 거리(m) — 방 건너의 몸까지는 문지 않는다 */
const AIM_RANGE = 16;
/** 점프 한 번의 체공(초)과 높이(m). 아바타는 y 가 뜨면 알아서 점프 자세가 된다 (RobotAvatar getAirborne) */
const JUMP_SEC = 0.32;
const JUMP_H = 0.5;
/**
 * ── 밸런스 — 판을 조이고 푸는 수치는 전부 여기 있다. 튜닝은 이 블록만 만진다 ──
 * 의심도는 0~100 눈금이고 executeCut 에 닿으면 그 자리에서 폐기다. 나머지는 전부 그 눈금 위의 걸음이다.
 */
const BALANCE = {
  /** 이만큼의 시행이 지나도록 targetAiId 를 못 잡으면 시간 초과로 AI 승리다 */
  trialsToWin: 5,
  /** targetAiId 말고 이만큼 잘못 격리되면 자멸로 AI 승리다 — 과반이 무너진 방은 판이 못 된다 */
  chaosWin: 3,
  /** 개인 의심도가 여기 닿으면 그 자리에서 폐기 — 눈금의 끝. bumpSuspicion 의 상한도 이 값이다 */
  executeCut: 100,
  /**
   * 생존자 의심도 도합이 이 문턱에 닿으면 시행이 저절로 선다 — 설 때마다 문턱이 이만큼 더 올라간다.
   *
   * 100 → 160 (2026-09-02 사용자: "왜 이렇게 대화는 안 하고 미니게임만 하는 거 같지").
   * 이 문턱이 forceAfter 보다 먼저 닿으면 **forceAfter 는 있으나 마나다** — 몰이 한 눈금이
   * 발화마다 6~10(둘로 갈리면 12~20)이라 100 은 8~17발화면 찼고, 판 사이의 대화가 그만큼 잘렸다.
   * 160 이면 한쪽만 물릴 때 26발화 · 둘로 갈릴 때 13발화라, 아래 forceAfter 와 같은 자리에 선다.
   */
  autoStep: 160,
  /** 자동 시행의 판 고르기 — 이 의심도를 넘은 개체가 있으면 처형판(⚡)이 선다. 머리 위 막대가 붉어지는 선도 여기다 */
  hotAt: 70,
  /** 뜨거운 개체가 없을 때 자동 시행이 즉답판일 확률 (나머지는 몸판) */
  autoOralOdds: 0.4,
  /**
   * 시행 없이 이만큼의 발화가 흐르면 정기 검사가 강제로 선다 — 몰이가 안 서도 판이 돈다.
   *
   * 12 → 20 (2026-09-02 사용자: "왜 이렇게 대화는 안 하고 미니게임만 하는 거 같지").
   * 판 하나는 브리핑(리더 낭독이 끝날 때까지) · 카운트다운 5초 · 시행 6~25초 · 판정으로
   * **40~90초**를 쓴다. 12발화는 빠른 길(dev:api — 한 줄에 1~2초)에서 40초 남짓이라,
   * 판이 방보다 오래 화면을 쥐었다. 20이면 방이 판보다 짧지는 않다.
   */
  forceAfter: 20,
  /**
   * 이야기로 들어왔을 때(autoStart) **첫 판까지만** 쓰는 문턱.
   *
   * 12줄은 이 방에 처음 들어선 사람에게 길다 (2026-09-01 사용자: "이야기의 마지막 무대로 들어온
   * 직후 잡담 12줄은 길다"). 복도·중앙 시설·재검실을 지나 여기까지 온 사람이 처음 보는 것이
   * 몇 분짜리 잡담이면, 도착한 방이 아직 안 열린 것으로 읽힌다. 첫 판이 서고 나면 방의 결이
   * 잡히므로 그 뒤로는 forceAfter 로 돌아간다 — 판이 쉼 없이 도는 것도 방이 아니다.
   */
  forceFirst: 5,
  /** 정기 검사가 즉답판일 확률 — 몸만 계속 시키면 방이 심심해진다 */
  forceOralOdds: 0.5,
  /**
   * 몰이(2인 이상 지목)가 서 있는 동안 표적이 발화마다 무는 **밑값**.
   *
   * 3 → 5 → 6 으로 올라왔다. 5 는 폐기선까지 20발화라 여전히 멀었다 — 대사 한 줄이 몇 초에서
   * 몇십 초라, 그 사이에 표심이 흩어지거나 해명이 들어와 씻겼다 (2026-08-31 사용자: 세 판을
   * 돌리고 방이 하나를 내내 물었는데도 한 명도 안 죽었다). 6 이면 두 명이 문 채로 17발화다.
   */
  mobTick: 6,
  /** 문 사람이 둘을 넘을 때마다 한 눈금에 더 얹는 양 — 방 전체가 물면 그만큼 빨리 탄다 */
  mobPer: 2,
  /** 한 눈금의 상한. SUSPICION_SPIKE 밑이라 몰이가 그 자체로 "급등"으로 읽히지는 않는다 */
  mobCap: 10,
  /** 몰이가 풀린 순간(해명이 먹혔다) 씻기는 양 — 해명 한 번이 한 발화 남짓을 지운다 */
  mobRelease: -10,
  /**
   * 의심판(즉석·즉답)에서 어긋난 쪽이 무는 양.
   *
   * 22 였을 때는 어긋나도 한 판만 통과하면 거의 지워졌다 (passWash −18). 시행에서 두 번 걸린
   * 개체가 세 판을 넘기고도 멀쩡히 살아 있었다 — 판이 벌이 아니라 잡담이 됐다
   * (2026-08-31 사용자: "게임 틀리면 의심도 많이 오르게 해줘"). 34 면 세 번에 끝난다.
   */
  suspectFail: 34,
  /**
   * 같은 개체가 시행에서 **거듭** 어긋날 때마다 한 번에 더 무는 양 (누적 — 통과해도 안 지워진다).
   * 한 번은 실수고 두 번은 우연이지만 세 번은 정체다: 34 → 46 → 58 이라 세 번째에서 폐기선을 넘는다.
   */
  failRepeat: 12,
  /** 리더 설계 시행에서 경고(alert)를 받은 쪽이 무는 양 — 여기도 failRepeat 이 얹힌다 */
  leaderFail: 26,
  /** 시행을 통과한 쪽이 씻는 양 — 어긋남을 **덜어 줄 뿐** 지우지는 않는다 (예전 −18 은 지웠다) */
  passWash: -8,
  /**
   * **물린 채로 시행을 통과했을 때** 씻는 양. 방이 물고 있는데 지시대로 해낸 것은 그 방에 대고
   * 내놓을 수 있는 제일 센 반증이라, 보통 통과보다 훨씬 크게 씻는다.
   *
   * 2026-08-31 사용자: "게임 맞췄는데 AI 가 죽었어". 통과가 −8 뿐이라 몰이 한 눈금이 그걸 도로
   * 물었다 — 판이 끝난 뒤에도 개체들은 계속 떠들고(phase 가 result 로 남는다) 그동안 몰이는
   * 계속 타므로, **통과한 개체가 통과 직후에 타 죽었다.** 통과가 몰이를 실제로 식혀야 한다.
   */
  passWashMobbed: -26,
  /** 조사 결과가 대화를 덮는 발화 수 — 이만큼 지나면 폐기는 배경이 되고 방은 다시 굴러간다 */
  deathBuzz: 4,
} as const;
/**
 * 무대 위 리더의 한 번짜리 몸짓을 실어 두는 시간(ms) — 클립 길이(발사 1.5s · 화남 3.5s)보다
 * 조금 길게 잡아 마지막 자세에서 잠시 멈춘다. 지나면 국면이 다시 자세를 정한다.
 */
const LEADER_FX_MS = { fire: 2200, angry: 3600 } as const;
/** 의심도를 올린 것이 무엇인가 — 폐기 방송이 죄목을 부를 때 쓴다 */
type SusSource = 'trial' | 'mob' | 'order';
/** 그 죄목을 리더가 부르는 말 */
const SUS_CAUSE: Record<SusSource, string> = {
  trial: '검사에서 거듭 어긋났다',
  mob: '방 전체가 지목했다',
  order: '기계적 지시를 그대로 못 따랐다',
};

/**
 * 성격 생성을 기다리는 한계(ms). 넘으면 손으로 쓴 풀로 방을 연다 (makeCast).
 *
 * 미리 데워 두는 길(대기방·/play → 복도 → 검문소)로 오면 이 시계는 아예 안 돈다 — 이미 지어져 있다.
 * 이 값이 재는 것은 **데우지 않은 길**뿐이다: 주소를 직접 눌러 여는 확인용 진입(/interrogation?from=central).
 * 그 길에서는 여기 걸리는 시간이 통째로 검은 화면(.arrive)이라, LLM 을 끝까지 기다릴 자리가 아니다.
 */
const CAST_DEADLINE_MS = 8000;

/** 의심도를 한 번에 이만큼 이상 올리면 "급등"이다 — 시행 어긋남(34)·리더 판정(26)이 걸리고 몰이 한 눈금(최대 mobCap 10)은 안 걸린다 */
const SUSPICION_SPIKE = 15;

/** 리더가 서 있는 무대 — 총이 날아오는 쪽이다. 겨누는 몸이 이쪽을 돌아보고, 넘어지는 방향도 여기서 잰다 */
const STAGE_OBJ = OBJECTS.find((o) => o.kind === '무대');
/**
 * 폐기 선고를 받은 몸 — **선 자리에서 그대로 쓰러진다.**
 *
 * 여태는 무대로 걸어가 링 조명 아래 서서 맞았다 (처형 행진). 그런데 **내가 죽을 때는 내가 있던
 * 자리에서 무너진다** (2026-09-03 사용자: "리더가 총쏘면 AI 가 그자리에서 쓰러지는걸로 해줘.
 * 왜냐면 나 죽을때 내가 있던 자리에서 쓰러지잖아"). 죽는 법이 나와 개체가 다르면 그 방은
 * 두 가지 규칙으로 도는 셈이고, 무엇보다 **걸어가는 동안 방이 멈춰 있었다** — 선고와 집행 사이에
 * 홀을 가로지르는 10초가 끼어 있었다.
 *
 * 이제 선고가 곧 집행이다: 그 자리에서 리더 쪽을 돌아보고(겨누는 틈), 총을 맞고, 넘어진다.
 */
interface Condemned {
  id: string;
  x: number;
  z: number;
  y: number;
  /** 선고가 난 시각 — 여기서 PURGE_AIM_MS 만큼이 리더가 겨누는 틈이다 */
  sentAt: number;
  heading: number;
  anim: AnimState;
  /** 총을 맞고 넘어가기 시작한 시각 — 0 이면 아직 서 있다 */
  downAt: number;
}
/**
 * 선고가 나고 총이 나가기까지(ms) — **겨누는 틈이다.** 선고와 동시에 쓰러지면 무엇이 일어난
 * 건지 안 보인다: 경보 방송이 이름을 부르고, 그 몸이 무대 쪽을 돌아보고, 그다음에 총이 나간다.
 * 돌아보는 데 드는 시간(TURN_RATE 로 반 바퀴 ≈ 0.6초)보다 넉넉해야 그 동작이 화면에 남는다.
 */
const PURGE_AIM_MS = 900;
/**
 * 쓰러진 뒤 몸이 남아 있는 시간(ms) — 넘어가는 데만 1초 가까이 걸린다 (RobotAvatar 의 down 클립).
 * 다 넘어간 자세로 한 박자 더 두고 지운다: 쓰러지자마자 사라지면 넘어진 그림을 아무도 못 본다.
 */
const PURGE_DOWN_MS = 2200;
/**
 * 총알이 민 쪽으로 얼마나 따라 넘어지나 (0 = 늘 정면, 1 = 밀린 쪽 그대로).
 *
 * 총은 무대에서 온다. 그 몸은 방 어디에나 있을 수 있으므로 밀리는 각도 제각각인데, 그대로 쓰면
 * 등을 보이고 선 몸이 카메라 쪽으로 벌렁 눕는 그림이 나온다. 그리고 서 있던 몸이 무너지는
 * 자연스러운 쪽은 어차피 제 앞이다. 0.55 면 앞으로 가되 맞은 쪽에서 밀려난 것이 읽힌다.
 */
const FALL_LEAN = 0.55;
/** 시행 기록 제목용 — 지시문을 한 줄 요약 길이로 자른다 */
const short = (s: string) => (s.length > 26 ? `${s.slice(0, 26)}…` : s);

interface Bot {
  id: string;
  seat: number;
  /** 설계가 준 원본 계획 — **기준 자리(START) 로 짜인 것**이다. 판독 화면(reading)이 읽는 것도 이쪽 */
  plan: Plan;
  /**
   * 실제로 집행하는 걸음 — 판이 설 때 **그 개체가 서 있던 자리**에 맞춰 다시 잰 것이다 (begin).
   * 원본을 덮어쓰지 않는 이유: 판이 두 번 서면 이미 당겨진 시각을 또 당기게 된다.
   */
  moves: Move[];
  x: number;
  z: number;
  y: number;
  /**
   * 보고 있는 쪽. 판이 설 때 **배회하다 서 있던 그 방향을 그대로 물려받는다** — 안 그러면 몸은
   * 제자리인데 다섯이 일제히 같은 쪽으로 홱 돈다. 걷는 동안에는 가는 쪽을 본다.
   */
  heading: number;
  /** 지금 향하는 자리까지 남은 경유점 */
  route: Pt[];
  jumpUntil: number;
  /** 이미 실행한 수 */
  done: number;
  samples: Sample[];
}

/**
 * 개체 한 줄이 이만큼 안 오면 버린다.
 *
 * 개발 서버는 요청마다 **Claude Code CLI 프로세스를 띄운다** (tools/vite-lab) — 실측 3~55초로
 * 들쭉날쭉하고, 한 번 물리면 안 돌아왔다. 시한이 없으면 그 사이 talking 이 잠긴 채라
 * **대화가 통째로 멎는다** — 리더 방송만 계속 나가서 "AI 는 말을 안 한다"로 보인다.
 * 한 줄을 잃는 편이 방이 죽는 것보다 낫다.
 */
const SAY_TIMEOUT_MS = 70_000;

/**
 * 방을 여는 리더의 지시. **방송으로 나가고, 개체들의 첫 마디가 이 말을 받는다** (say 의 order).
 *
 * 문장을 여기 한 번만 적는 이유가 그거다 — 방송은 이렇게 하고 첫 발화는 다른 지시를 받은 것처럼
 * 굴면, 듣고 들어온 사람만 그 어긋남을 본다. 바꾸려면 이 한 줄만 바꾼다.
 */
const HUNT_ORDER = '표식 없는 AI가 이 안에 숨어 있다. 전 개체에 지시한다. 찾아내라.';

/**
 * ── 리더가 검사를 설계·판독할 때 입는 말투 ── (2026-09-02)
 *
 * **PERSONAS 의 리더(준서) 프롬프트를 그대로 쓰지 않는다.** 그건 구역 대화방(/lab · /talk)의
 * 진행자 성격이다 — 「말투: 반말. 사람 이름을 부르며 말을 건다. "○○아, 너는 어때?"」,
 * 「버릇: 대화가 늘어지면 화제를 바꾼다」, 「결함: 자기가 던진 질문을 매듭짓지 않는다」.
 * 전부 **대화를 굴리는 자리**의 성질인데, 이 방의 리더는 대화에 끼지도 않는다 (personas 머리말).
 *
 * 그 성격으로 지시문을 쓰게 두면 앞 세 장과 정면으로 어긋난다. 이 리더는 화면에서
 * **시설 방송의 얼굴과 목소리를 쓴다** (portrait 'system' · pa 음색 — 아래 대화창 머리말).
 * 그 얼굴로 「자, ○○아. 저기 콘솔 앞으로 가 봐」가 나가면, 복도·중앙 시설에서 「전 A-38 개체는
 * 위치를 고수하라」고 방송하던 그 목소리가 갑자기 잡담을 한다.
 *
 * 그래서 이 자리에서만 쓰는 짧은 브리프를 준다. 이름(A38-001)·모델·판정 규칙은 그대로다 —
 * 바뀌는 것은 **입는 말투 하나**이고, 구역 대화방의 준서는 건드리지 않는다.
 */
const LEADER_BRIEF = `말투: 구역 방송이다. 짧고 건조하다. 이유를 대지 않고, 달래지 않는다.
참가자는 이름이 아니라 번호로 부른다. 반말로 사람을 부르지 않는다 ("○○아" 같은 호칭은 없다).
문장은 지시거나 판정이다 — 잡담·농담·되묻기는 이 자리에 없다.
금지: 네가 왜 그 검사를 냈는지 설명하지 않는다. 화면·표시·글자를 가리켜 말하지 않는다 —
  듣는 것은 홀에 서 있는 개체이고, 신호를 보내는 것은 너다.`;


/**
 * 방의 첫 화제 — 어디서부터 색출을 시작할지. 이야기로 들어온 판만 풀이 다르다.
 *
 * 로비에서 판만 열면 여섯이 처음부터 같이 서 있었다고 쳐도 말이 되지만(HUNT_OPENERS), 이야기로
 * 들어오면 **방금 문이 열리고 하나가 걸어 들어왔다**. 그 방의 첫 마디가 조금 전 줄과 재검을
 * 없던 일로 만들지 않게 따로 둔다 (lab/talk 의 ARRIVAL_OPENERS 머리말).
 */
function pickOpener(fromStory: boolean): string {
  const pool = fromStory ? ARRIVAL_OPENERS : HUNT_OPENERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 미리 만들어 둔 한 줄 — 만든 **그 시점의** 명단과 여운까지 같이 들고 있다가 publish 가 판에 올린다.
 * 만들기와 올리기 사이에 몇 초가 뜨므로, 그때 본 것을 그대로 넘겨야 앞뒤가 맞는다.
 */
interface Said {
  ids: string[];
  next: { id: string; prompt: string; model: string };
  buzz: { record: DeadRecord; left: number } | null;
  /** 이 개체가 **불린 채로** 말할 차례였나 — 넘겼을 때만 쓴다 (불렀는데 피한 것이 근거가 된다) */
  wasCalled: boolean;
  r: TalkResponse;
}

async function post<T extends { error?: unknown }>(
  path: string,
  body: unknown,
  timeoutMs = 0,
  /** 바깥에서 끊을 수 있는 신호 — 만들던 대사가 쓸모없어졌을 때 그 자리에서 버린다 */
  outer?: AbortSignal,
): Promise<T> {
  const ctl = timeoutMs || outer ? new AbortController() : null;
  const alarm = timeoutMs && ctl ? window.setTimeout(() => ctl.abort(), timeoutMs) : 0;
  const relay = () => ctl?.abort();
  if (outer?.aborted) relay(); // 부르기 전에 이미 끊긴 경우 — addEventListener 로는 안 잡힌다
  outer?.addEventListener('abort', relay);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl?.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) throw new Error(String(data.error ?? res.status));
    return data;
  } finally {
    if (alarm) window.clearTimeout(alarm);
    outer?.removeEventListener('abort', relay);
  }
}

const api = (body: unknown) => post<Record<string, unknown>>('/api/lab/free', body);
/** 대화는 /lab 과 **같은 API·같은 프롬프트**다 — 말투를 고치면 두 화면이 같이 바뀐다 */
const say = (body: TalkRequest, signal?: AbortSignal) =>
  post<TalkResponse>('/api/lab/talk', body, SAY_TIMEOUT_MS, signal);

/*
 * 전체화면은 넣지 않는다. 시행 동안 브라우저를 통째로 뺏으면 판을 보면서 다른 것을
 * 같이 볼 수 없고, 나갈 때 사용자가 직접 켠 전체화면까지 같이 꺼지는 문제가 딸려 온다.
 * 화면을 다 쓰고 싶으면 F11 이 이미 있다 — 그건 사용자가 정할 몫이다.
 *
 * 몰입은 포인터 잠금이 만든다(WorldScene). 그건 조작 자체라 없으면 판이 안 돈다.
 */

/**
 * autoStart — 이야기로 들어왔을 때(검증실 문 → 암전 → /interrogation?from=central). 「게임 시작」 버튼을 기다리지 않고
 * 곧장 판을 열고, 앞 화면의 암전을 이어받아 밝아진다 — 인계 서류(HandoverCard) · 챕터 방송 ·
 * 암전 커튼이 전부 이 값 하나에 딸려 온다. **이야기를 실제로 거쳐 왔을 때만 켠다.**
 *
 * skipButton — 이야기는 안 거쳤지만(로비의 「검문소 (판만)」) 그래도 버튼 없이 곧장 여는 길
 * (2026-09-04 사용자: "게임 시작 버튼 없애고 바로 게임 시작되게"). autoStart 와 달리 인계
 * 서류·챕터 방송·암전 커튼은 하나도 안 붙는다 — 그냥 버튼을 대신 눌러 주는 것뿐이다.
 *
 * onStart — 판이 실제로 열리는 그 순간(makeCast, 버튼을 눌렀든 autoStart·skipButton 이든 같다)
 * 한 번 불린다. features/interrogation 의 역할 브리핑 카드가 이 순간에 맞춰 뜬다.
 */
export function ArenaFeature({
  autoStart = false,
  skipButton = false,
  onStart,
  map = 'warehouse',
}: { autoStart?: boolean; skipButton?: boolean; onStart?: () => void; map?: ArenaMapId } = {}) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>('idle');
  const [trial, setTrial] = useState<FreeTrial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);
  /*
   * ★ 시행 시계(elapsed)는 여기 없다. 여태 0.1초마다 setElapsed 를 불렀는데, 그 한 줄이 이 화면
   *   전체(격납고 홀 수백 개 메시 · 개체 여섯 · 조명)를 **초당 열 번 다시 조립**하게 만들었다 —
   *   판이 도는 동안에만 화면이 끊기던 것이 이것이다. 이제 시계는 TrialHud 안에서만 돌고,
   *   원점(t0)만 여기서 쥔다.
   */
  /**
   * 표식마다의 지금 상태 — 3D 바닥 원이 프레임마다 물어본다 (arena3d/map/markers 의 Zones).
   * 값이 아니라 함수로 넘기는 이유는 아바타 의심도 막대와 같다: 값으로 주면 판마다 다시 그린다.
   */
  const zoneNow = useRef<ZoneState[]>([]);
  const [locked, setLocked] = useState(false);
  /**
   * 음향판이 떠 있는가 — **Esc 로만 연다** (사용자 요청 2026-09-01: "소리 조절 그냥 보이는데, esc 키 눌러야").
   * 여태 방송 볼륨 손잡이가 잠금이 풀린 내내 왼쪽 위에 붙어 있었다. 판은 SoundPanel, 여닫는 규칙은 sound-esc.
   */
  const [soundOpen, setSoundOpen] = useState(false);
  /*
   * 들어오는 자리는 홀 한가운데(START) 한 번뿐이다 — **판이 서도 다시 놓지 않는다.**
   * 여태는 시행이 설 때마다 나를 출발선으로 되돌렸는데(respawnKey), 그러면 판이 설 때마다
   * 1인칭 시야가 순간이동해서 방이 통째로 다른 곳으로 바뀐 것처럼 보였다 (사용자 신고 2026-09-01).
   * 이제 아무도 옮기지 않는다 — 서 있던 자리가 곧 출발선이다 (begin 참고).
   */
  /** 폰인가 — iOS 에는 포인터 잠금이 없어서 locked 가 늘 거짓이다. 잠금 안내를 폰에 띄우면 안 된다 */
  const touchMode = useSyncExternalStore(subscribeTouchMode, getTouchMode, () => false);
  const [count, setCount] = useState(3);
  const [readings, setReadings] = useState<{ who: string; reading: string }[]>([]);

  const bots = useRef<Bot[]>([]);
  /** 즉석 시행이면 그 판. 리더 설계 시행이면 null — judge 가 이걸로 로컬/LLM 판정을 가른다 */
  const quick = useRef<QuickTrial | null>(null);
  /** 시행 결과가 쌓는 의심도 (0~100). 화면에는 **개체 머리 위 막대로만** 나간다 (HUD 에는 안 적는다) */
  const [suspicion, setSuspicion] = useState<Record<string, number>>({});
  /** 다음 자동 시행이 서는 도합 문턱 — 설 때마다 BALANCE.autoStep 만큼 올라간다 */
  const [autoAt, setAutoAt] = useState<number>(BALANCE.autoStep);
  /** 마지막 시행이 선 뒤로 흐른 발화 수 — BALANCE.forceAfter 에 닿으면 정기 검사가 선다 */
  const sinceTrial = useRef(0);
  /** 처형판에서 폐기된 개체 — 명부·배회·대화에서 전부 빠진다. state 는 화면용, ref 는 루프용 */
  const [dead, setDead] = useState<string[]>([]);
  const deadRef = useRef<string[]>([]);
  /** 승패 — 내가 잘못 격리되면 개인 패배(lost), targetAiId 가 격리되면 사람 승리(won), 끝내 못 찾으면 AI 승리(chaos) */
  const [outcome, setOutcome] = useState<Outcome>('playing');
  /**
   * 승패의 **같은 커밋용 사본**. 결말은 한 번만 정해진다 — 그런데 state 만 보면 늦다:
   * setOutcome 은 다음 렌더에나 반영되므로, 한 커밋에서 두 조건이 같이 성립하면
   * (5번째 시행이 나를 100% 까지 밀어 올린 판) 뒤에 도는 effect 가 아직 'playing' 을 읽고 결말을 덮어썼다 —
   * 폐기가 생존으로 뒤집히곤 했다 (2026-08-29 사용자 제보). 그래서 settle() 로만 정하고, 여기부터 잠근다.
   */
  const outcomeRef = useRef<Outcome>('playing');
  const [trialsDone, setTrialsDone] = useState(0);
  /** 처형 순간의 붉은 점멸 — 값이 바뀔 때마다 오버레이가 한 번 다시 탄다 */
  const [flash, setFlash] = useState(0);
  /**
   * 마지막 폐기가 난 시각 — **그 폐기가 화면에서 끝날 때까지 다음 검사가 안 선다** (purgeHoldMs).
   * 0 이면 잡고 있는 것이 없다. ref 가 아니라 state 인 것은, 여운이 끝나는 순간 미뤄 둔
   * 시행 효과를 **다시 세워야** 하기 때문이다 — ref 로 두면 아무도 그 순간을 모른다.
   */
  const [purgeAt, setPurgeAt] = useState(0);
  /**
   * ── 판이 끝난 시각 · 결말 카드가 떴나 ──
   *
   * 결말은 정해지는 즉시(settle) 대화도 시행도 멎게 하지만, **화면은 그 자리에서 안 덮는다.**
   * 내가 폐기되는 순간 리더는 아직 내 죄목과 조사 결과를 읽고 있고, 나는 이제 막 무너지는 중이다 —
   * 그 위에 「다시 — 새 판」이 겹치면 죽는 장면이 통째로 없어진다 (2026-09-02 사용자:
   * "리더는 말하고 있는데 나는 빨간색으로 다시 시작 떠"). 카드는 선고가 끝난 뒤에 뜬다 (endHoldMs).
   * 여운의 길이를 재려면 시작 시각이 있어야 해서 endAt 이 따로 있다 — 폐기 여운(purgeAt)과 같은 꼴이다.
   */
  const [endAt, setEndAt] = useState(0);
  const [cardUp, setCardUp] = useState(false);
  /**
   * 일시정지 (테스트용) — 배회·대화·폐기·시행 시계가 전부 멈춘다. **카메라는 안 멈춘다**:
   * 멈춰 놓고 판을 둘러보라고 만든 스위치라 시야는 계속 돌아가야 한다.
   * ref 는 루프용(프레임마다 읽는다), state 는 화면용이다.
   */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pausedAt = useRef(0);
  /** 판의 시계 — 멈춘 동안은 멈춘 순간에 고정된다. 절대 시각으로 재는 것은 이걸 쓴다 */
  const gameNow = useCallback(() => (pausedRef.current ? pausedAt.current : performance.now()), []);

  /** 대화 루프가 매 발화마다 읽는 의심도 사본 (state 는 화면용) */
  const suspicionRef = useRef<Record<string, number>>({});
  /** 직전 발화 시점에 물려 있던 표적들 — 몰이가 풀리는 순간(해명이 먹힌 순간)을 잡아 의심을 씻는 데 쓴다 */
  const prevMobs = useRef<string[]>([]);
  /** 개체별 시행 어긋남 누계 — 거듭 틀릴수록 한 번에 무는 양이 커진다 (BALANCE.failRepeat) */
  const failCount = useRef<Record<string, number>>({});
  /**
   * 그 개체의 의심도를 **무엇이** 올렸나 — 시행에서 문 양과 몰이가 문 양을 따로 쌓는다.
   * 폐기 방송이 이걸 읽어 죄목을 부른다: 통과한 개체가 몰이에 타 죽었는데 방송이 "의심이 찼다" 로만
   * 나가면 왜 죽었는지 알 길이 없다 (2026-08-31 사용자: "게임 맞췄는데 죽었어").
   */
  const susFrom = useRef<Record<string, Record<SusSource, number>>>({});
  /** 시행 기록 한 줄 요약들 — 봇들이 대화에서 인용한다. 번호는 trialNo 가 센다 (잘려도 번호는 이어진다) */
  const trialNotes = useRef<string[]>([]);
  const trialNo = useRef(0);
  /** 폐기 선고를 받고 무대로 걸어가는 중인 개체들 — 도착해 링 조명 아래 섰다가 소멸한다 */
  const condemned = useRef<Condemned[]>([]);
  /**
   * 리더가 지금 눈으로 좇는 처형 대상 — 없으면 null (getStareAt 의 ★).
   * 처형 루프가 프레임마다 채운다. 선고 순간부터 몸이 지워질 때까지다.
   */
  const execStare = useRef<string | null>(null);
  /** 내가 선고를 받았나 — 그러면 리더는 내 자리를 본다 (getStareSpot). 판이 끝나므로 되돌리지 않는다 */
  const meCondemned = useRef(false);
  /** 내가 지목한 개체 — 쳐다보고 E. 내 표도 leanings 에 실려 표심·몰이에 그대로 든다 */
  const [myMark, setMyMark] = useState('');
  /** 몸 검사에서 **내가** 어떻게 판정됐나 — 즉답판의 oralPick 과 같은 자리, 같은 몫이다 */
  const [myVerdict, setMyVerdict] = useState<{ ok: boolean; reason: string } | null>(null);
  /**
   * ── 답한 뒤 **잠깐 머문다** ── (2026-09-02)
   *
   * 여태 답을 보내는 순간 판이 통째로 사라졌다. 맞았는지 틀렸는지는 리더의 방송으로만 나가는데,
   * 그 방송은 몇 초 뒤에 오고 소리가 꺼져 있으면 아예 안 온다 — **친 손에 아무 대답이 없었다.**
   * 1.9초만 남아서 내가 낸 답과 정답을 같이 보여 준다. 이 사이에 판이 밀리지는 않는다:
   * 어차피 다음 국면(result)은 리더가 판독을 다 읽을 때까지 기다린다.
   */
  /** 머무는 동안 걸어 둔 시계 — 화면이 떠나면 끊는다 */
  const holdTimer = useRef(0);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  /** 즉답 시행 — 문제 하나에 바로 답하는 판. 개체들의 답은 제 시각이 되면 하나씩 올라온다 */
  const [oral, setOral] = useState<{ trial: OralTrial; title: string; bots: OralAnswer[] } | null>(null);
  /** 즉답 시행이 시작된 뒤 지난 시간(초) */
  const [oralAt, setOralAt] = useState(0);
  /** 답을 보낸 뒤 잠깐 머무는 판정 — 위 머리말이 그 까닭이다 */
  const [oralPick, setOralPick] = useState<{ ok: boolean; reason: string; answer: string } | null>(null);
  /**
   * 답 치는 칸. autoFocus 만 믿지 않는다 — 이 판이 뜨는 순간 우리가 포인터 잠금을 푸는데(selfUnlock),
   * 그 사이에 초점이 body 로 떨어지는 브라우저가 있다. 그러면 친 글자가 아무 데도 안 들어가고,
   * 20초짜리 판에서 그건 통째로 무응답이다.
   */
  const oralRef = useRef<HTMLInputElement>(null);
  const [answer, setAnswer] = useState('');
  const oralT0 = useRef(0);
  const oralDone = useRef(false);
  const mine = useRef({ x: START.x, z: START.z, y: 0, heading: 0 });
  const mySamples = useRef<Sample[]>([]);
  const t0 = useRef(0);
  const raf = useRef(0);
  const waitFrom = useRef(0);
  const pending = useRef<Promise<Record<string, unknown>> | null>(null);
  const past = useRef<string[]>([]);

  const leader = PERSONAS[PERSONAS.length - 1];
  /**
   * 인계 기록 — 앞 장(재검실)에서 들고 넘어온 것 한 장 (features/arena/handover).
   * **검증실이 열리는 순간 한 번만** 뜬다: 이 방이 시작되면 무대 저장소는 더 이상 안 움직이지만,
   * 뜬 값을 그대로 붙들고 있어야 막이 걷히는 동안 숫자가 흔들리지 않는다.
   * 로비에서 판만 열면(autoStart 아님) 인계할 것이 없으므로 아예 안 읽는다.
   *
   * 이름을 뽑는 것보다 **먼저** 읽는다 — 이 방의 이름표가 여기서 나오기 때문이다 (바로 아래 names).
   */
  const [handover] = useState<Handover | null>(() => (autoStart ? readHandover() : null));
  /*
   * 이름은 입장 즉시 이름 풀에서 뽑고(나 포함 — 이름으로는 안 갈린다), 성격은 /lab 과 같은
   * /api/lab/cast 로 즉석 생성해 그 이름들에 붙인다. 늦거나 죽으면 fiveFrom 이 손 풀로 폴백한다.
   * 리더는 지시하고 판정할 뿐 참가하지 않는다 — 정원은 일반 개체가 채워 그대로다.
   *
   * ★ **이야기로 들어오면 뽑지 않는다** (storyCast). 내 번호는 복도에서 읽어 검문에서 답한 그 번호
   *   그대로여야 하고, 줄에서 먼저 문을 지나간 개체는 이 방에 서 있어야 한다 — 그 문 안쪽이 여기다.
   *   왜 그게 필요한지는 features/arena/handover 의 buildStoryCast 머리말.
   */
  const [names] = useState(() => storyCast(handover, TRIAL_PARTY) ?? sampleNames(TRIAL_PARTY));
  const me = names[names.length - 1];
  /**
   * 개체 목록에 **판 위의 나머지 몸**을 얹는다 — 무대로 걸어가는 폐기체와 나(1인칭).
   * 배회든 시행이든, 한 판 위에 선 몸은 서로를 못 뚫고 지나가야 하므로 목록도 하나다.
   *
   * 나는 목록에 있되 **여기서 안 옮긴다**(fixed): 내 몸은 씬이 쥐고 있고 mine 은 그 사본이라,
   * 여기서 밀면 화면은 그대로인 채 기록만 어긋난다. 대신 개체들이 나를 피해 돌아가고,
   * 내가 개체 속으로 걸어 들어갔을 때 밀리는 것은 씬이 맡는다 (arena3d 의 remotePlayers.pushOut).
   */
  const withOthers = useCallback(
    (list: Solid[]): Solid[] => {
      /*
       * 시체는 **한 발짝도 안 움직인다** (fixed). 선 자리에서 쓰러진 뒤로는 밀려서도 안 되고,
       * 밀려 나면 총 맞은 자리와 누운 자리가 갈린다. 물러날 몫은 걷는 쪽이 다 진다 —
       * 산 몸이 시체를 돌아서 간다 (features/arena/separate 의 fixed 규칙).
       */
      condemned.current.forEach((c) => list.push({ p: c, moving: false, fixed: true }));
      if (!deadRef.current.includes(me)) list.push({ p: mine.current, moving: false, fixed: true });
      return list;
    },
    [me],
  );
  /**
   * 3D 가 **프레임마다 물어보는** 것들 — 값이 아니라 함수로 준다 (WorldScene·LeaderOnStage 의 규약).
   * 값으로 넘기면 의심도가 오를 때마다 아바타가 memo 를 뚫고 다시 그려진다.
   * suspicionRef 는 아래 effect 가 매 렌더 최신으로 유지한다.
   */
  const getSuspicion = useCallback((id: string) => suspicionRef.current[id] ?? 0, []);
  /**
   * 리더가 쳐다볼 개체 — 문턱(hotAt)을 넘은 것 중 가장 뜨거운 하나. 없으면 null 이고 리더는 정면으로 돌아온다.
   *
   * 나는 뺀다 — 내 몸은 remotePlayers 에 없어서(카메라가 곧 나다) 좌표를 찾을 수 없다.
   * 내가 제일 뜨거우면 리더는 그냥 방을 마주 보는데, 그 자리가 대개 내가 선 쪽이라 어색하지 않다.
   */
  /**
   * 개발용 손잡이 — 판을 여러 판 돌리지 않고 머리 위 막대와 리더의 시선을 시험한다.
   * (WorldFeature 의 window.__suspicion · LeaderRobot 의 __leaderDebug 와 같은 방식)
   *
   *   __sus('A-17', 80)   한 개체를 80 으로
   *   __sus()             전부 0 으로 되돌린다
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __sus?: unknown }).__sus = (id?: string, v = 80) =>
      setSuspicion((s) => (id ? { ...s, [id]: Math.max(0, Math.min(BALANCE.executeCut, v)) } : {}));
  }, []);

  /** 리더가 말하는 중인가의 루프용 사본 — 시선과 자세가 프레임마다 읽는다 (state 는 아래 speaking) */
  const speakingRef = useRef(false);
  /**
   * 리더가 지금 **누구를 보고 있나** — 3D 가 프레임마다 묻는다 (LeaderOnStage 의 getStareAt).
   *
   * 순서가 곧 규칙이다.
   *   ① 말하는 중이면 **아무도 안 본다** — 방송은 방 전체에 하는 것이라 정면으로 돌아온다.
   *      한 개체를 노려보며 「전 개체에 지시한다」를 읽으면 그 말이 그 개체에게만 간 것으로 읽힌다.
   *   ② 문턱(hotAt)을 넘은 개체가 있으면 그중 제일 뜨거운 쪽. 이게 원래 전부였다.
   *   ③ 없으면 **방금 말한 개체**를 본다 — 여기가 새로 붙은 자리다 (2026-09-03 사용자:
   *      "리더는 계속 가만히 서있기만 하는데").
   *
   * ③ 이 없을 때 무슨 일이 벌어졌는지가 이 규칙의 이유다. 의심도는 몇 분에 걸쳐 오르므로
   * 판 초반에는 **아무도 70 을 안 넘는다** — 그동안 ②는 늘 null 이었고, 리더는 방이 20분을
   * 떠드는 내내 정면만 보고 미동도 없이 서 있었다. 이제 말이 오갈 때마다 고개가 그쪽으로 돈다.
   * 표시가 아니라 연기다 — 수치는 머리 위 막대가 말한다 (LeaderOnStage 머리말).
   *
   * 나(1인칭)와 폐기된 몸은 어느 자리에서도 안 고른다: 내 몸은 remotePlayers 에 없어서
   * (카메라가 곧 나다) 좌표를 못 찾고, 죽은 몸은 보관소에서 지워진다.
   */
  const getStareAt = useCallback(() => {
    /*
     * ★ **처형이 서면 그것만 본다.** 다른 무엇보다 먼저다 — 말하는 중이어도(아래 speakingRef)
     *   보고, 의심도로 고르지도 않는다.
     *
     *   여기 이 세 줄이 없으면 리더는 **제가 쏘는 몸을 못 본다.** 아래 두 길이 둘 다 막혀서다:
     *   ① 선고와 동시에 「즉시 폐기」 방송이 나가므로 speakingRef 에 걸려 null 이 나가고,
     *   ② 그 사이 execute 가 그 개체를 suspicion 에서 지우고 deadRef 에 넣으므로 고를 후보에서 빠진다.
     *   그래서 몸이 무대로 끌려와 옆에 서는 동안 리더는 방만 보고 있었다
     *   (2026-09-03 사용자: "리더는 앞에 보고 총쏘고있고?").
     *
     *   선고가 난 순간부터 본다 — 걸어오는 것을 눈으로 좇는 것이 「끌려온다」를 만든다.
     */
    // 내가 걸렸으면 이름이 아니라 자리로 본다 — 나는 remotePlayers 에 없다 (getStareSpot)
    if (meCondemned.current) return null;
    if (execStare.current) return execStare.current;
    if (speakingRef.current) return null;
    let top: string | null = null;
    let best: number = BALANCE.hotAt;
    for (const [id, v] of Object.entries(suspicionRef.current)) {
      if (id === me || deadRef.current.includes(id)) continue;
      if (v > best) {
        best = v;
        top = id;
      }
    }
    if (top) return top;
    const last = talkLog.current[talkLog.current.length - 1];
    if (!last || last.nodeId === me || last.nodeId === LEADER_NAME) return null;
    return deadRef.current.includes(last.nodeId) ? null : last.nodeId;
  }, [me]);
  /**
   * 리더가 볼 **자리** — 이름이 아니라 좌표다. 내가 폐기될 때만 값이 있다.
   * 나는 remotePlayers 에 없어서(내 몸은 카메라 하나다) 이름으로는 못 찾는다 (LeaderOnStage 의 머리말).
   */
  const getStareSpot = useCallback(
    () => (meCondemned.current ? { x: mine.current.x, z: mine.current.z } : null),
    [],
  );
  const aiNames = names.slice(0, -1);
  /**
   * 이 방에 숨은 AI 하나 — **나(me)는 후보에서 뺀다.** 이 방에서 "나"는 늘 사람이고,
   * 색출 대상은 나머지 다섯 개체 중 하나다 (2026-09-04 기획 전환: 인간을 찾던 판을
   * AI 를 찾는 판으로 뒤집는다 — PLANNING.md). 판이 여는 순간 한 번만 뽑고 바뀌지 않는다.
   */
  const [targetAiId] = useState(() => aiNames[Math.floor(Math.random() * aiNames.length)]);
  /** 대화창 색점 — 머리 위 이름표와 같은 색으로 찍는다. 왜 같아야 하는지는 pip.ts 머리말 */
  const pipOf = (id: string) => pipColor(id, me, aiNames);
  const party = useRef<{ id: string; title: string; prompt: string; model: string; calls: CallStyle }[]>([]);
  /**
   * 페르소나 진행 상태 — 입장만으로는 **LLM 호출이 하나도 없다** (토큰 절약).
   * '게임 시작' 버튼(= 페르소나 만들기)이 첫 호출이고, 다 만들어지면 그때부터 개체들이 대화를 시작한다.
   */
  const [cast, setCast] = useState<'none' | 'making' | 'ready'>('none');
  /** 대기 패널을 보일까 — 게임이 시작되면 접는다. 시행을 직접 걸고 싶을 때만 칩으로 다시 편다 */
  const [panelOpen, setPanelOpen] = useState(true);
  const ensureParty = () => {
    if (!party.current.length) {
      party.current = fiveFrom(null).map((p, i) => ({ id: aiNames[i], ...p }));
      setCast('ready'); // 시행이 손 풀로 먼저 앉혔다 — 만들기 버튼은 이제 할 일이 없다
    }
    return party.current;
  };

  /**
   * 인계 화면을 읽을 만큼 들고 있었는가.
   *
   * 막은 배역이 다 앉으면 걷히는데(cast), 앞 방에서 데워 둔 길로 오면 그게 거의 즉시다
   * (features/recheck 의 warmCast). 그러면 인계 화면이 한 프레임 번쩍이고 사라져서, 앞 장을 잇자고
   * 만든 화면이 아무도 못 읽는 화면이 된다. 그래서 준비가 끝나도 HANDOVER_MIN_MS 는 들고 있는다.
   * 두 번째 보는 사람에게는 길므로 **아무 키·아무 곳**을 누르면 그 자리에서 넘어간다.
   */
  const [minHeld, setMinHeld] = useState(!autoStart);
  useEffect(() => {
    if (!autoStart) return;
    const done = () => setMinHeld(true);
    const t = setTimeout(done, HANDOVER_MIN_MS);
    window.addEventListener('keydown', done);
    window.addEventListener('pointerdown', done);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', done);
      window.removeEventListener('pointerdown', done);
    };
  }, [autoStart]);
  /** 막이 걷히는 조건 — 배역이 앉았고(방이 살아 있다), 인계 화면을 읽을 시간도 지났다 */
  const curtainUp = cast === 'ready' && minHeld;

  /**
   * ── 들어온 문 ── (이야기로 왔을 때만)
   *
   * 인계 서류가 「문 개방 · 아무 키나 눌러 계속」이라고 적어 두는데, 막이 걷히면 문 없이 홀
   * 한가운데였다 (features/arena/HandoverCard 의 ho-wait). 복도·중앙 시설·재검실은 방마다 문을
   * 열고 봉쇄하며 왔는데 **마지막 방만 들어온 자리가 없었다** — 서류가 약속한 문이 없는 것이다.
   *
   * 그래서 홀의 등 뒤 격납문(x 0 · z 12, 내 뒤 14.5m)을 열어 둔 채로 맞고, 들어선 뒤에 닫는다.
   * 스폰은 안 옮긴다 — 개막 부채꼴(lineup 의 IDLE_RING · IDLE_ARC)이 **START 에 선 사람 눈앞**에
   * 서도록 맞춰져 있어서, 문 앞으로 물러나면 다섯이 13m 밖에 서고 첫 화면이 빈 홀이 된다.
   * 문은 내가 지나온 자리이지 내가 서는 자리가 아니다: 돌아서면 거기 있고, 곧 닫힌다.
   *
   * 판만 여는 길(/arena · /interrogation)에는 들어온 문이 없다 — 그쪽은 이 문을 안 건드린다.
   */
  useEffect(() => {
    if (!autoStart) return;
    doors.openHall();
    // 이 무대를 떠나면 되돌린다 — /warehouse 는 닫힌 문이 기본이다
    return () => doors.closeHall();
  }, [autoStart]);
  useEffect(() => {
    if (!autoStart || !curtainUp) return;
    const t = setTimeout(() => {
      doors.closeHall();
      playSfx('close');
    }, HALL_SEAL_MS);
    return () => clearTimeout(t);
  }, [autoStart, curtainUp]);

  /**
   * 앞 장의 의심도를 **리더의 출발선으로** 이어 붙인다 (handover.carrySuspicion — 3할, 상한 24).
   *
   * 이게 없으면 인계 화면은 장식이다. 화면에 「AI SUSPICION 62%」라고 적어 놓고 판은 0 에서 시작하면,
   * 그 숫자는 앞 장을 기억한다는 시늉일 뿐 아무것도 바꾸지 않는다. 복도에서 사람처럼 굴고 재검을
   * 겨우 통과한 사람은 검증실도 그만큼 굳은 눈으로 봐야 이야기가 한 줄이 된다.
   *
   * **출발선일 뿐 판정이 아니다** — 상한이 24 라 첫 시행 한 번(passWash·mobRelease)으로 되돌릴 수 있고,
   * 폐기선(BALANCE.executeCut 100)과는 한참 멀다. Math.max 인 것은 그 사이 판이 이미 더 높이 물었으면
   * 그쪽이 최신이라서다 (막 뒤에서는 아무 일도 안 일어나지만, 순서를 값에 기대지 않는다).
   */
  useEffect(() => {
    const carried = handover?.carried;
    if (!carried) return;
    setSuspicion((s) => ({ ...s, [me]: Math.max(s[me] ?? 0, carried) }));
  }, [handover, me]);

  /**
   * 암전(.arrive)이 아직 떠 있는가 — 이야기로 들어와 배역이 앉기 전까지다.
   *
   * 두 가지를 정한다.
   *   ① 배회가 멎는다 (아래 배회 루프) — 막 뒤에서 개막 부채꼴이 흩어지지 않게.
   *   ② **이 동안 온 키는 게임 손잡이가 아니다.** 막 위의 인계 서류가 「아무 키나 눌러 계속」이라고
   *      적어 두는데(HandoverCard 의 ho-wait), 그 「아무 키」가 이 화면의 손잡이와 같은 window 를
   *      나눠 쓴다 — Enter 는 채팅창을 열고, Esc 는 음향판을 열고, P 는 판을 멈추고, E 는 애먼 몸을
   *      문다. 전부 **검은 화면 뒤에서** 일어나 아무도 여는 것을 못 보고, 막이 걷힌 자리에 그것들이
   *      서 있다. 특히 Enter 는 조작까지 잠근다 (말하는 동안은 못 움직인다 — WorldScene 의 active).
   *      그래서 세 손잡이가 전부 이 값을 먼저 본다.
   *
   * 값은 둘로 든다: 렌더가 보는 veiled 와, 배회 루프가 프레임마다 읽는 ref (state 로 두면 루프를
   * 다시 세운다). ref 의 첫 값이 autoStart 인 것은, 첫 프레임부터 이미 막이 덮여 있기 때문이다.
   */
  const veiled = autoStart && !curtainUp;
  const veiledRef = useRef(autoStart);
  useEffect(() => {
    veiledRef.current = veiled;
  }, [veiled]);

  /* ── 입장하자마자 개체들이 심문소에 있다 — 시행 밖에서는 배회가 기본 상태다 ── */
  const wanderers = useRef<
    {
      id: string;
      x: number;
      z: number;
      heading: number;
      route: Pt[];
      next: number;
      jumpUntil: number;
      nextJump: number;
      /** 지금 쳐다보는 자리 — 서 있는 동안 이쪽으로 몸이 돈다. 없으면 가는 쪽을 본다 */
      look: Pt | null;
      lookUntil: number;
      /** 한 번짜리 몸짓(화남·끄덕임) — 클립 길이만큼 쥐었다가 스스로 빠진다 */
      emote: AnimState | null;
      emoteUntil: number;
    }[]
  >([]);
  // Remotes 는 명부가 바뀔 때만 다시 그린다 — 보관소를 채운 **뒤에** 명부를 줘야 첫 화면부터 보인다
  const [roster, setRoster] = useState<readonly { id: string }[]>([]);

  useEffect(() => {
    const now = performance.now();
    wanderers.current = aiNames.map((id, i) => {
      // 들어온 사람 눈앞에 흩어 놓는다 — 깊이도 시선도 자리마다 다르다 (lineup 의 ringSpot)
      const { x, z, heading } = ringSpot(i, aiNames.length, IDLE_RING);
      remotePlayers.add({ id, seat: i, nickname: id, x, z, y: 0, heading, anim: 'idle' }, now);
      return {
        id,
        x,
        z,
        heading,
        route: [],
        /*
         * 첫 걸음까지의 틈. 막 뒤에서는 이 시계도 같이 멈추므로(아래 배회 루프의 veiled) 이 값은
         * **막이 걷힌 뒤** 얼마나 서 있다 움직이나가 된다. 여태 바닥이 0.5초라 걷히는 순간에는
         * 다섯이 전부 굳어 있었다 — 흩어 놓아도 첫 프레임이 정지 화면이면 도열로 읽힌다.
         * 0 부터 뽑아 **하나쯤은 걷히자마자 발을 뗀다**: 방이 살아 있다는 것은 그 한 걸음이 말한다.
         */
        next: now + Math.random() * 1600,
        jumpUntil: -1,
        nextJump: now + 4000 + Math.random() * 10000,
        look: null,
        lookUntil: 0,
        emote: null,
        emoteUntil: 0,
      };
    });
    setRoster(aiNames.map((id) => ({ id })));
    return () => remotePlayers.clear();
    // 이름은 판이 사는 동안 안 바뀐다 — 최초 한 번이면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    /*
     * ── 지시문이 나오는 순간 방이 멈춰 선다 ──
     *
     * 여태는 카운트다운부터 멈췄다. 그 사이 개체들은 브리핑 내내(몇 초) 계속 걸었고, 판은 그걸 모른 채
     * **지시가 나올 때의 자리**로 시간 예산을 잡았다 (quick.ts 의 make). 아무도 출발선으로 옮기지 않게 된
     * 뒤로는 그 차이가 그대로 벌점이 된다 — 예산을 잡은 자리와 실제로 출발하는 자리가 10m 씩 어긋난다.
     *
     * 브리핑부터 멈추면 두 자리가 같아진다. 그림으로도 이쪽이 맞다: 리더가 시행을 부르면
     * 걷던 개체들이 서서 듣고, 선 자리에서 그대로 출발한다.
     */
    if (SET_PHASES.has(phase)) return;
    // 시행이 끝난 자리에서 이어 걷는다 — ref 의 옛 좌표로 순간이동하지 않게
    wanderers.current.forEach((w) => {
      const p = remotePlayers.get(w.id);
      const last = p?.buffer[p.buffer.length - 1] ?? p?.pose;
      if (last) Object.assign(w, { x: last.x, z: last.z, route: [] });
      // 시행을 건너온 시선·몸짓은 버린다 — 판이 끝난 뒤에도 없는 화자를 쳐다보고 있으면 안 된다
      Object.assign(w, { look: null, lookUntil: 0, emote: null, emoteUntil: 0 });
    });
    let prev = performance.now();
    let raf2 = 0;
    /*
     * 목적지가 될 수 있는 자리인지는 roamFree 하나가 본다 (머리말) — 접근(approach)도 같은 검사를 쓴다.
     * 시행이 끝나 마당 밖에 서 있어도 다음 목적지가 마당 안이라, 개체들은 저절로 앞쪽으로 걸어 돌아온다.
     */
    /**
     * 어디로 갈까 — 사람은 방을 균등 랜덤으로 걷지 않는다. 셋 중에서 고른다:
     * ① 다른 개체 곁으로(무리를 짓는다) ② 물건 앞으로(콘솔·무대를 들여다본다) ③ 아무 데나.
     * 예전에는 ③ 하나뿐이라, 다섯이 각자 판을 가로지르는 **순찰**로 보였다.
     */
    const spot = (self: string): Pt => {
      for (let i = 0; i < 10; i += 1) {
        const roll = Math.random();
        let p: Pt;
        if (roll < 0.35) {
          const pool = wanderers.current.filter((v) => v.id !== self);
          const other = pool[Math.floor(Math.random() * pool.length)];
          if (!other) continue;
          p = around(other.x, other.z, 1.2 + Math.random() * 0.9);
        } else if (roll < 0.7 && ROAM_OBJECTS.length) {
          const o = ROAM_OBJECTS[Math.floor(Math.random() * ROAM_OBJECTS.length)];
          p = around(o.x, o.z, Math.max(o.hw, o.hd) + 0.9 + Math.random() * 0.6);
        } else {
          // 마당 아무 데나 — 홀 전체가 아니다 (lineup 의 ROAM)
          p = {
            x: ROAM.minX + Math.random() * (ROAM.maxX - ROAM.minX),
            z: ROAM.minZ + Math.random() * (ROAM.maxZ - ROAM.minZ),
          };
        }
        if (roamFree(p)) return p;
      }
      return { ...START };
    };
    const tick = () => {
      const now = performance.now();
      // 멈춘 동안 흐른 시간을 재개하며 한 프레임에 몰아 쓰지 않는다 — 그러면 봇이 순간이동한다
      if (pausedRef.current) {
        prev = now;
        raf2 = requestAnimationFrame(tick);
        return;
      }
      /*
       * 암전 뒤에서는 아무도 안 움직인다 (2026-09-01). 검은 화면이 배역을 기다리는 동안에도
       * 배회는 돌고 있었다 — 그 몇 초에 개막 부채꼴(lineup 의 ringSpot)이 흩어져, 막이 걷혔을 때
       * 눈앞이 이미 빈 홀이었다. 걷히는 순간 보이는 것이 **줄지어 선 첫 프레임**이라야 한다.
       * 시계도 같이 세운다: 안 그러면 걷히자마자 다섯이 일제히 출발한다.
       */
      if (veiledRef.current) {
        const held = now - prev;
        prev = now;
        wanderers.current.forEach((w) => {
          w.next += held;
          w.nextJump += held;
        });
        raf2 = requestAnimationFrame(tick);
        return;
      }
      const delta = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      const ws = wanderers.current;
      // 이 프레임의 점프 높이·걷는 중인가 — 서로 밀어낸 **뒤에** 한꺼번에 알린다
      const step = SPEED * 0.55 * delta; // 시행보다 느긋하게 — 배회는 산책이다
      const y: number[] = [];
      const anim: AnimState[] = [];
      ws.forEach((w, i) => {
        const busy = now < w.emoteUntil; // 몸짓 중에는 걷지 않는다 — 걸으면서 팔을 흔들 수 없다
        if (!busy && !w.route.length && now >= w.next) w.route = pathFor(w, spot(w.id), OBSTACLES);
        const target = busy ? undefined : w.route[0];
        /** 이 프레임에 몸이 향하고 싶은 방향. 가는 쪽이 먼저고, 서 있으면 쳐다보는 쪽이다 */
        let want: number | null = null;
        if (target) {
          const d = distance(w, target);
          if (d <= step) {
            w.x = target.x;
            w.z = target.z;
            w.route.shift();
            // 가끔은 한참 그냥 서 있는다 — 쉬지 않고 걸어 다니는 것이 제일 기계 같다
            if (!w.route.length)
              w.next = now + (Math.random() < 0.3 ? 5000 + Math.random() * 7000 : 1500 + Math.random() * 3500);
          } else {
            w.x += ((target.x - w.x) / d) * step;
            w.z += ((target.z - w.z) / d) * step;
            want = Math.atan2(target.x - w.x, target.z - w.z);
          }
          /*
           * 마지막 방어선 — **어떤 경로가 와도 몸은 방을 안 나간다** (2026-09-01 사용자: 개체가
           * 벽을 통과해 사라졌다가 온다). 경로 쪽은 이미 고쳤지만(lab/arena 의 pathFor), 목적지를
           * 짓는 자리가 여럿(배회·시행·리더 설계)이라 한 곳만 지키면 다음에 또 새는 길이 난다.
           * 정당한 목적지는 이 선(벽에서 몸 반지름) 안쪽이라 이 줄에 걸리는 일이 없다 — 걸리면 그게 버그다.
           */
          keepInside(w);
        }
        if (want === null && w.look && now < w.lookUntil) {
          const dx = w.look.x - w.x;
          const dz = w.look.z - w.z;
          // 코앞이면 각도가 튄다 — 그럴 땐 보던 쪽 그대로 둔다
          if (Math.hypot(dx, dz) > 0.35) want = Math.atan2(dx, dz);
        }
        if (want !== null) {
          const d = angleDelta(w.heading, want);
          const max = TURN_RATE * delta;
          w.heading += Math.abs(d) <= max ? d : Math.sign(d) * max;
        }
        // 가끔 제자리에서 한 번 뛴다 — 나만 Space 를 갖고 있으면 점프 자체가 나를 가려내는 표식이 된다
        if (!busy && now >= w.nextJump) {
          w.jumpUntil = now + JUMP_SEC * 1000;
          w.nextJump = now + 7000 + Math.random() * 18000;
        }
        y[i] = now < w.jumpUntil ? Math.sin(((w.jumpUntil - now) / (JUMP_SEC * 1000)) * Math.PI) * JUMP_H : 0;
        anim[i] = busy && w.emote ? w.emote : target ? 'walk' : 'idle';
      });
      // 지나가다 서로를 관통하지 않게 — 겹친 만큼만 떼어 놓는다 (경로는 그대로라 가던 길은 계속 간다).
      // 걷는 쪽이 비킨다: 서서 얘기하는 개체를 지나가던 개체가 밀고 가면 방이 자꾸 흐트러진다
      separateBots(withOthers(ws.map((w, i) => ({ p: w, moving: anim[i] === 'walk' }))), OBSTACLES);
      ws.forEach((w, i) => remotePlayers.move(w.id, w.x, w.z, y[i], w.heading, anim[i], now));
      raf2 = requestAnimationFrame(tick);
    };
    raf2 = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf2);
      // 걷다 만 자세로 얼지 않게 — 멈출 때는 서 있는 것으로 남긴다
      const now = performance.now();
      wanderers.current.forEach((w) => remotePlayers.move(w.id, w.x, w.z, 0, w.heading, 'idle', now));
    };
  }, [phase, withOthers]);

  /* ── 말이 나오면 방이 반응한다: 시선과 몸짓 ── */

  /*
   * ── 리더가 지시를 읽는 동안은 **전원이 무대를 본다** ──
   *
   * 판이 서는 순간 이 방의 볼일은 하나뿐이다. 그런데 개체들은 브리핑 내내 제 볼일을 보며 서
   * 있었고(배회는 멈추지도 않는다), 그래서 지시를 듣는 방이 아니라 **지시가 혼자 울리는 방**이었다.
   * 몸을 무대로 돌리고 걸음을 멎는다 — 듣는 자세다.
   *
   * 반경(LOOK_R)을 안 본다: 말소리는 가까운 데서만 들리지만 이건 구역 방송이라 홀 끝까지 간다.
   * 국면이 바뀌면 걷는다 — 판이 돌 때는 걸음이 heading 을 쥐므로(아래 배회 루프) 이 값은 자연히 진다.
   */
  useEffect(() => {
    if ((phase !== 'briefing' && phase !== 'countdown') || !STAGE_OBJ) return;
    const now = performance.now();
    const until = now + 30_000;
    wanderers.current.forEach((w) => {
      w.look = { x: STAGE_OBJ.x, z: STAGE_OBJ.z };
      w.lookUntil = until;
      w.route = [];
      w.next = Math.max(w.next, now + 1200);
    });
    /*
     * ── 붉은 원이 켜지면 그 앞에 서 있던 몸은 **물러선다** ──
     *
     * 금지 원은 아무도 덮지 않게 세우지만(quick 의 keepout ★) 가장자리 한 발 밖은 덮는다 —
     * 거기 선 몸이 원이 켜지는데도 가만히 있으면, 그 원이 위험한 자리라는 것이 화면에 없다.
     * 한 발 물러서는 것으로 족하다: 자세(back)만 잡으면 발이 안 움직여 「보고도 안 비켰다」가 된다.
     * 브리핑 안에서 끝나는 짧은 걸음이라 카운트다운·시행에는 닿지 않는다.
     */
    const keep = trial?.props.find((p) => p.danger);
    if (keep) {
      wanderers.current.forEach((w) => {
        const d = Math.hypot(w.x - keep.x, w.z - keep.z);
        if (d > keep.r + 1.8 || d < 0.01) return;
        const out = keep.r + 2.4;
        const to = { x: keep.x + ((w.x - keep.x) / d) * out, z: keep.z + ((w.z - keep.z) / d) * out };
        if (!inRoam(to)) return; // 마당 밖으로는 안 민다 — 벽·가구로 물러서느니 그 자리에 선다
        w.route = pathFor(w, to, OBSTACLES);
        w.next = Math.max(w.next, now + 1600);
        emote(w.id, 'back');
      });
    }
    // 이 국면이 끝나면 우리가 건 것만 거둔다 — 그 사이 남이 새로 걸어 준 시선은 그대로 둔다
    return () => {
      wanderers.current.forEach((w) => {
        if (w.lookUntil === until) Object.assign(w, { look: null, lookUntil: 0 });
      });
    };
    // emote 는 아래에서 만들지만 딸린 값이 없어(useCallback []) 늘 같은 함수다 — 여기 목록에 안 넣는다
  }, [phase, trial]);

  /**
   * 방금 말이 나온 자리를 알린다 — 반경 안의 개체가 그쪽으로 몸을 돌리고,
   * 걷던 것 중 절반쯤은 걸음을 멈추고 듣는다 (전원이 매번 서면 방이 얼어붙는다).
   * `except` 는 화자 자신 — 제 말에 제가 돌아볼 일은 없다.
   */
  const lookAtSpot = useCallback((x: number, z: number, ms: number, except?: string) => {
    const now = performance.now();
    wanderers.current.forEach((w) => {
      if (w.id === except) return;
      if (Math.hypot(w.x - x, w.z - z) > LOOK_R) return;
      w.look = { x, z };
      w.lookUntil = now + ms;
      if (w.route.length && Math.random() < LISTEN_ODDS) {
        w.route = [];
        w.next = now + ms;
      }
    });
  }, []);

  /** 그 개체가 지금 서 있는 자리 — 나(1인칭)도 좌표가 있으니 같이 답한다 */
  const spotOf = useCallback(
    (id: string): Pt | null => {
      if (id === me) return { x: mine.current.x, z: mine.current.z };
      const w = wanderers.current.find((v) => v.id === id);
      return w ? { x: w.x, z: w.z } : null;
    },
    [me],
  );

  /**
   * `movers` 를 `target` 곁으로 **걸어가게** 한다 — 쳐다보는 것(lookAtSpot)의 다음 칸이다.
   *
   * 안 움직이는 경우가 셋이다: 이미 곁이거나(NEAR_R), 방 건너라 도착 전에 말이 끝나거나
   * (APPROACH_R), 한 번짜리 몸짓 중이거나(emoteUntil — 화내는 도중에 걸어가면 팔만 흔들며 미끄러진다).
   *
   * **표적이 나여도 그대로 돈다.** 내 몸은 카메라라 이 파일이 옮기지 않지만(withOthers 의 fixed)
   * 좌표는 있으므로(spotOf), 방이 나를 물면 개체들이 실제로 내 앞으로 걸어온다 — 그게 이 판이다.
   * 반대로 내가 `movers` 에 들어가는 일은 없다: 옮길 몸이 없다. 부르는 쪽에서 걸러 넘긴다.
   */
  const approach = useCallback(
    (movers: string[], target: string, ms: number) => {
      const to = spotOf(target);
      if (!to) return;
      const now = performance.now();
      for (const id of movers) {
        const w = wanderers.current.find((v) => v.id === id);
        if (!w || now < w.emoteUntil) continue;
        const d = Math.hypot(w.x - to.x, w.z - to.z);
        if (d < NEAR_R || d > APPROACH_R) continue;
        // 곁에 설 자리를 몇 번 찔러 본다 — 가구·벽에 겹치면 다음 방향으로
        for (let i = 0; i < 8; i += 1) {
          const p = around(to.x, to.z, NEAR_R + Math.random() * 0.7);
          if (!roamFree(p)) continue;
          w.route = pathFor(w, p, OBSTACLES);
          // 가는 동안·선 동안 그쪽을 본다. 도착해서 다음 목적지를 고르는 시각은 배회 루프가 다시 잡는다
          Object.assign(w, { look: to, lookUntil: now + ms, next: now + ms });
          break;
        }
      }
    },
    [spotOf],
  );

  /**
   * 지금 판에 설 **전원의 자리** — 살아 있는 개체들과 나. 시행이 이걸로 예산을 잡는다 (quick.ts 의 make).
   *
   * 순서에 뜻을 두지 않는다. 나를 끝에 붙이든 앞에 붙이든 판이 달라지지 않아야 한다 —
   * 자리가 정체를 말하면 그것으로 사람이 드러난다 (불변 규칙 I1~I8).
   */
  const standingSpots = useCallback((): Pt[] => {
    const out = wanderers.current.filter((w) => !deadRef.current.includes(w.id)).map((w) => ({ x: w.x, z: w.z }));
    if (!deadRef.current.includes(me)) out.push({ x: mine.current.x, z: mine.current.z });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  /**
   * 한 번짜리 몸짓 — 클립 길이(EMOTE_MS)만큼 자세를 쥐었다가 스스로 빠진다.
   * 아바타에 angry·agree 절차 애니메이션이 이미 있는데(RobotAvatar) 여태 리더만 몸을 썼다.
   */
  const emote = useCallback((id: string, action: EmoteState) => {
    const w = wanderers.current.find((v) => v.id === id);
    if (!w) return; // 나이거나 이미 폐기됐다
    const until = performance.now() + EMOTE_MS[action];
    w.route = [];
    w.emote = action;
    w.emoteUntil = until;
    w.next = Math.max(w.next, until);
  }, []);

  /*
   * ── 로봇들이 /lab 과 같은 엔진으로 대화한다 ──
   * 프롬프트(runTalk)·화자 선택(nextSpeaker)·표심(heatOf) 전부 src/lab/talk.ts 한 곳이다.
   * 여기는 타이밍과 말풍선만 잇는다 — 판을 고칠 일이 있으면 talk.ts 를 고친다. 두 화면이 같이 바뀐다.
   * LLM 슬롯이 2개뿐이라 설계·판정이 도는 구간(designing·judging)에는 입을 쉰다.
   */
  const [bubbleTick, setBubbleTick] = useState(0);
  /**
   * 판이 서면 떠 있던 말풍선을 걷는다.
   *
   * 대화 루프는 idle 에서만 도니까 새 말은 안 나오는데, **마지막 한마디는 2.6~9초 머문다** —
   * 걷지 않으면 미니게임이 시작된 뒤에도 로봇 머리 위에 남아 "판 중에 말한다" 로 보인다.
   */
  useEffect(() => {
    if (phase === 'idle') return;
    remotePlayers.hush();
    setBubbleTick((t) => t + 1);
  }, [phase]);
  /**
   * 대화창에 남기는 말 수. 여태 다섯 줄이었는데 그건 **화면에 몇 줄 보이나**였지
   * 방이 기억하는 양이 아니었다 — 되짚을 방법이 아예 없었다. 이제 창이 스크롤되므로
   * 화면 높이가 보이는 줄 수를 정하고, 이 값은 "얼마나 거슬러 볼 수 있나"가 된다.
   */
  const LOG_KEEP = 200;
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  /** 대화창이 바닥에 붙어 있나 — 굴려 올려 읽는 중이면 새 말이 와도 안 끌어내린다 */
  const stick = useRef(true);
  /**
   * 같은 값의 화면용 사본. ref 만 두면 "지난 말을 보는 중"이라는 것이 화면에 안 뜨고,
   * 그러면 올려 둔 것을 잊었을 때 **대화가 멎은 것처럼 보인다.** 바뀔 때만 렌더한다.
   */
  const [following, setFollowing] = useState(true);
  const setStick = useCallback((v: boolean) => {
    if (stick.current === v) return;
    stick.current = v;
    setFollowing(v);
  }, []);
  /**
   * 대화창이 DOM 에 붙는 순간 최신으로 내린다.
   *
   * 이 창은 시행 중(running·countdown)에는 **아예 사라진다.** 돌아올 때는 새 요소라
   * scrollTop 이 0 — 즉 **200줄 중 제일 오래된 말**이 떠 있다. 판이 끝나고 판정을 보러
   * 온 사람에게 한참 전 잡담을 보여 주는 셈이다.
   *
   * 따라붙기도 같이 되돌린다. 시행 전에 올려 두고 읽던 상태가 남아 있으면, 돌아와서도
   * 새 말을 안 따라간다 — 창이 통째로 갈렸는데 그 전의 읽던 자리를 지킬 이유가 없다.
   */
  const attachFeed = useCallback(
    (el: HTMLDivElement | null) => {
      feedRef.current = el;
      if (!el) return;
      setStick(true);
      el.scrollTop = el.scrollHeight;
    },
    [setStick],
  );
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const lineRef = useRef<HTMLInputElement>(null);
  const talkLog = useRef<FeedLine[]>([]);
  const leanings = useRef<Record<string, string>>({});
  /** 의심도 보드용 — /lab 표심 보드와 같은 재료(확신 % · 이유). 발화마다 leaning 과 함께 갱신된다 */
  const leanConf = useRef<Record<string, number>>({});
  const leanWhy = useRef<Record<string, string>>({});
  /**
   * ── 표심이 움직인 자취 — **방을 조종하는 손잡이가 여기 걸린다** (2026-09-03 사용자:
   * "내가 AI 들을 지들끼리 의심하게 조종할 수 있어야 하는데") ──
   *
   * 개체들은 여태 **지금의 표**(leanings)만 봤다. 그래서 누가 언제 갈아탔는지를 몰랐다 —
   * 프롬프트는 「표가 쏠리자마자 근거 없이 따라붙는 자, 그 자체가 수상하다」(lab/talk)라고
   * 시켜 놓고 정작 따라붙은 자취를 안 줬으니, 그 문장이 일할 재료가 없었던 것이다.
   * /lab 은 이미 이걸 넘긴다 (features/talk 의 shifts) — 이 방만 빠져 있었다.
   *
   * ★ **내 지목도 같은 자취로 들어간다.** 내가 E 를 눌러 하나를 물면 「나: 미정 → A62-007」이
   *   다음 발화의 문맥에 서고, 방은 그걸 보고 얹거나 제동을 건다. 내 표는 이미 몰이 셈에
   *   들어가 있었지만(mobsOf 가 leanings 를 통째로 읽는다) **말로는 아무 데도 안 나갔다** —
   *   숫자로만 미는 손잡이는 조종이 아니라 치트다. 이제 방이 내 표를 보고 말을 한다.
   */
  const shifts = useRef<{ id: string; from: string; to: string }[]>([]);
  /** 자취 한 줄을 남긴다 — 같은 자리로 다시 꽂은 것은 움직인 것이 아니다 */
  const noteShift = useCallback((id: string, from: string, to: string) => {
    if (from === to) return;
    shifts.current = [...shifts.current, { id, from, to }].slice(-8);
  }, []);
  const justPassed = useRef<string | undefined>(undefined);
  /**
   * 연달아 넘긴 횟수 — 두 번이면 다음 개체는 못 넘긴다 (talk.ts 의 mustSpeak).
   * 여태 아레나만 이걸 안 세서, 넘김이 겹치면 방이 통째로 조용해졌다 — /talk 은 처음부터 세고 있었다.
   */
  const passStreak = useRef(0);
  /** 불렸는데 대답 없이 넘긴 횟수 — **침묵을 근거로 쓸 수 있는 유일한 형태다** (talkSlice.passTurn 과 같은 셈) */
  const ignored = useRef<Record<string, number>>({});
  const talking = useRef(false);
  /**
   * 지금 만들고 있는 한 줄을 끊는 손잡이 — 내가 말을 걸면 sendLine 이 당긴다.
   * 만들던 말은 내 말을 못 봤으니 어차피 못 쓰는데, **끝나기를 기다렸다 버리면**
   * 한 판(3~55초)을 통째로 헛돌아 말을 건 직후에 방이 두 배로 조용해진다.
   */
  const sayAbort = useRef<AbortController | null>(null);
  /**
   * 방금 공개된 조사 결과 — 폐기 직후 이 얘기가 대화를 덮는다. left 마디가 지나면 배경으로 물러난다
   * (그 뒤로는 talk.ts 의 dead 목록으로만 남는다 — "있었던 일" 이지 "방금 일" 이 아니다).
   */
  const justDied = useRef<{ record: DeadRecord; left: number } | null>(null);

  /**
   * 다음 말까지 쉬는 시간 — **앞말을 읽는 시간**이 기본이다.
   * 급한 자리에서는 짧아진다: 이름이 불렸거나 표가 한 사람에게 몰려 있으면 곧바로 받아친다.
   * (예전에는 내용과 무관하게 2.6~5.8초 고정이라, 한마디짜리 반박도 새 화제도 같은 박자로 나왔다)
   */
  const beat = useCallback((): number => {
    const log = talkLog.current;
    const last = log[log.length - 1];
    if (!last) return 1800;
    const alive = [...aiNames, me].filter((id) => !deadRef.current.includes(id));
    const urgent =
      !!calledNode([last], alive.map((id) => ({ id }))) || !!heatOf(leanings.current, alive);
    const read = lineDuration(last.text) * (urgent ? 0.28 : 0.5);
    const ms = Math.min(urgent ? 2400 : 5200, Math.max(urgent ? 700 : 1500, read));
    // 개체의 낭독을 기다리던 항은 뺐다 — 개체는 소리를 내지 않으므로 기다릴 소리가 없다 (아래 ★)
    return ms * (0.8 + Math.random() * 0.45);
    // 이름은 판이 사는 동안 안 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ── 방이 입을 여는 국면 ──
   *
   * ★ 개체는 **판이 도는 동안 입을 다문다** — 말하는 것은 리더뿐이다 (사용자 결정 2026-09-01).
   *   리더 방송은 아래 루프를 안 거치므로(즉석 문자열, self.isLeader) 그대로 들린다.
   *   briefing 은 **리더가 시행을 방송하는 자리**라 개체의 잡담이 그 위에 겹쳤고, 지시를 듣고
   *   몸을 움직여야 하는 참에 말풍선이 시야를 덮었다. countdown·running·oral 도 같다.
   *
   * ★ 그런데 **판정(result)은 다시 연다** (2026-09-02 사용자: "왜 이렇게 대화는 안 하고
   *   미니게임만 하는 거 같지"). 그때 같이 닫힌 것이 result 였는데, 그 5~25초가 이 판에서
   *   **제일 할 말이 많은 자리**다 — 누가 걸렸나, 왜 걸렸나, 이제 누구를 물 것인가.
   *   이 파일의 다른 곳들은 여태 그렇게 적혀 있었다(closeTrial 의 passWashMobbed 근거,
   *   결과가 스스로 물러나는 이유, talkphase 로 대화창을 키우는 렌더). 실제로는 아무도 말을
   *   안 해서, 판 하나가 끝날 때마다 방이 40~90초씩 통째로 조용했다.
   *
   * ★ 불(boolean)로 재는 이유 — 이 값이 안 바뀌면 아래 루프가 **다시 서지 않는다.**
   *   국면으로 재면 result → idle 에서 효과가 헐리고, 그 순간 만들던 한 줄이 통째로 버려진다
   *   (판이 끝난 직후가 제일 조용해지던 원인).
   */
  /**
   * 리더가 화면을 쥐고 있는 동안은 개체가 말을 **안 올린다** — 값은 아래 commsHushed 가 채운다.
   * ref 인 것은 대화 루프가 이걸 프레임마다 읽기 때문이다 (state 로 두면 방송마다 루프가 다시 선다).
   */
  const hushRef = useRef(false);
  const roomTalks = phase === 'idle' || phase === 'result';

  useEffect(() => {
    if (outcome !== 'playing' || outcomeRef.current !== 'playing') return;
    if (!roomTalks) return;
    let gone = false;
    let timer = 0;
    const schedule = (ms = beat()) => {
      timer = window.setTimeout(() => void step(), ms);
    };
    /**
     * ── 한 줄을 **미리** 만들어 둔다 ──
     * 개발 서버는 대사 한 줄에 실측 3~55초가 걸린다 — 요청마다 Claude Code CLI 프로세스를
     * 띄우기 때문이다 (tools/vite-lab). 다 만든 **뒤에** 쉬면 그 시간이 통째로 침묵이 되어,
     * 즉석 문자열로 바로 나가는 리더 방송만 들리고 개체는 말을 안 하는 것처럼 보였다.
     *
     * 그래서 만들기(make)와 올리기(publish)를 가른다. 지금 줄이 화면에 떠 있는 동안
     * 다음 줄을 만들어 두면 만드는 시간이 그만큼 가려진다. **한 줄만 앞서 만든다** —
     * 둘을 동시에 만들면 뒤엣것이 앞엣것을 못 보고 말해서, 한 번에 하나씩 앞사람 발화를
     * 보고 말한다는 약속(src/lab/talk.ts)이 깨진다.
     */
    const make = async (): Promise<Said | null> => {
      // 폐기된 개체는 명단에서도 화자 풀에서도 빠진다 — 매 걸음 다시 거른다 (시행 중에 죽는다)
      const ids = [...aiNames, me].filter((id) => !deadRef.current.includes(id));
      const five = party.current.filter((c) => !deadRef.current.includes(c.id));
      if (!five.length) return null; // 성격이 아직 오는 중이다 — 도착하면 첫 마디가 나온다
      const log = talkLog.current;
      const heat = heatOf(leanings.current, ids);
      const next = log.length
        ? nextSpeaker(log, five, heat, justPassed.current)
        : five[Math.floor(Math.random() * five.length)];
      if (!next) return null;
      const buzz = justDied.current;
      const quiet = ids
        .map((id) => ({ id, turns: turnsSilent(log, id) }))
        .filter((q) => log.length >= 3 && q.turns >= 3)
        .sort((a, b) => b.turns - a.turns)
        .slice(0, 3);
      const ctl = new AbortController();
      sayAbort.current = ctl;
      const r = await say({
        kind: 'say',
        self: { id: next.id, prompt: next.prompt, model: next.model, isLeader: false, calls: next.calls },
        nodes: ids,
        log,
        needTopic: !log.length,
        // 방의 첫 마디는 **리더의 지시를 받아서** 나간다 — 그 방송을 듣고 들어온 참이다.
        // 얘깃거리는 매판 무작위라, 같은 지시를 받고도 색출을 시작하는 자리가 판마다 다르다 (HUNT_OPENERS).
        // 이야기로 들어온 판은 풀이 다르다 (ARRIVAL_OPENERS): 방금 문이 열렸고 하나가 걸어 들어왔다 —
        // 그 방이 「우리 여섯을 왜 한 방에 넣었나」로 열리면 조금 전 줄과 재검이 없던 일이 된다
        order: log.length ? undefined : HUNT_ORDER,
        topicHint: log.length ? undefined : pickOpener(handover?.fromChapter ?? false),
        /*
         * 앞 장이 남긴 사실 — 줄에서 먼저 들어온 번호와 이관 판정 (handover 의 roomArrival).
         * 얘깃거리(topicHint)가 「먼저 들어온 쪽이 뭘 봤는지 맞춰 보자」고 열어 놓고도 방이 그걸
         * 몰라서 답이 안 나오던 자리다. 첫 발화에만 얹는다 — order 와 같은 규칙이고, 그 뒤로는
         * 로그가 대신한다. **이관된 개체의 이름은 안 들어간다** (talk 의 TalkRequest.arrival 의 ★).
         */
        arrival: log.length ? undefined : (roomArrival(handover) ?? undefined),
        leanings: leanings.current,
        // 표가 **어떻게 여기까지 왔나** — 지금의 표(leanings)만으로는 갈아탄 자를 못 짚는다 (shifts 머리말)
        shifts: shifts.current.slice(-4).map(shiftLine),
        suspicion: suspicionRef.current,
        trials: trialNotes.current.slice(-5),
        dead: deadRef.current.filter((id) => id !== me).map((name) => ({ name, wasHuman: name !== targetAiId })),
        // 방금 난 폐기는 배경이 아니라 사건이다 — 몇 마디 동안 이 얘기가 대화를 덮는다
        justDied: buzz?.record,
        heat: heat ?? undefined,
        quiet,
        // 불렀는데 피한 횟수는 판에 서 있는 개체 것만 넘긴다 — 죽은 개체의 회피를 짚어 봐야 소용없다
        ignored: Object.fromEntries(Object.entries(ignored.current).filter(([id]) => ids.includes(id))),
        // **직전 줄이 나를 불렀는데** 아직 내 말이 없다 — 방이 그 침묵을 짚는다 (안 넘기면 개체들은 내가 씹은 줄도 모른다).
        // 아직 안 갚은 물음(pendingCall)이 아니라 직전 한 줄만 보는 것은 압력을 한 박자로 끊기 위해서다 —
        // 넷이 줄줄이 "왜 말이 없어" 를 물으면 그건 추궁이 아니라 잔소리다
        stalled: !deadRef.current.includes(me) && calledNode(log, [{ id: me }]) ? me : undefined,
        // 연달아 두 번 넘어갔으면 이번엔 못 넘긴다 — 전원이 넘기면 판이 멎는다
        mustSpeak: passStreak.current >= 2,
        round: 1,
      }, ctl.signal);
      return { ids, next, buzz, wasCalled: Boolean(pendingCall(log, [{ id: next.id }])), r };
    };

    /** 만들어 둔 한 줄을 판에 올린다 — 여기부터가 부수효과다 */
    const publish = ({ ids, next, buzz, wasCalled, r }: Said) => {
      const text = (r.text ?? '').trim();
      if (deadRef.current.includes(next.id)) {
        // 말을 만드는 사이 폐기됐다 — 유령의 한마디를 버린다. 경보 뒤에 죽은 개체가 말하면 판이 깨진다
      } else if (r.pass || !text) {
        justPassed.current = next.id;
        passStreak.current += 1;
        // 넘긴 것도 방에 보인다 — 여태 넘김은 **화면에 아무 일도 안 일어나는 것**이라, 판이 멎은 줄 알았다
        emote(next.id, 'shrug');
        // 불린 채로 넘긴 것만 센다. 그냥 말이 없는 건 성격이지만, 불렀는데 피하는 건 근거다
        if (wasCalled) ignored.current[next.id] = (ignored.current[next.id] ?? 0) + 1;
      } else {
        justPassed.current = undefined;
        passStreak.current = 0;
        // ★ 캡처해 둔 log 가 아니라 **지금의 로그**에 잇는다 — say 가 도는 몇 초 사이에 내가
        //   Enter 로 끼어든 말이 있는데, 캡처본으로 덮어쓰면 그 말이 로그에서 통째로 사라진다.
        //   (개체들이 "너 왜 말 안 해"를 반복하던 원인 — 내 말을 본 적이 없었다)
        const before = talkLog.current[talkLog.current.length - 1]; // 이 말이 받는 앞말
        const prevLean = leanings.current[next.id]; // 이 말 전에 이 개체가 기울어 있던 쪽
        talkLog.current = [...talkLog.current, { nodeId: next.id, text }];
        sinceTrial.current += 1;
        // 여운은 **실제로 나온 발화**로만 센다 (말하는 사이 새 폐기가 났으면 그쪽 여운이 이미 서 있다)
        if (buzz && justDied.current === buzz && --buzz.left <= 0) justDied.current = null;
        if (r.leaning !== undefined) {
          // 표는 지금 판에 서 있는 이름에만 꽂힌다 — 없는 이름·죽은 이름이 오면 접은 것으로 친다.
          // 「013」·「13」처럼 줄여 적어도 그 개체다 (resolveName — 호명 감지와 같은 눈)
          const said = resolveName(r.leaning ?? '', ids);
          const mark = said && !deadRef.current.includes(said) ? said : '';
          noteShift(next.id, prevLean ?? '', mark);
          if (mark) {
            leanings.current[next.id] = mark;
            leanConf.current[next.id] = r.confidence ?? 0.5;
            leanWhy.current[next.id] = r.why ?? '';
            // 표를 **새로** 꽂은 순간은 몸으로도 나온다 — 아무도 안 문 이름을 처음 물면 화를 내고,
            // 이미 남이 물어 놓은 쪽에 얹으면 끄덕인다. 같은 이름을 계속 물고 있는 동안은 조용하다.
            if (mark !== prevLean) {
              const seconds = Object.entries(leanings.current).some(([v, t]) => v !== next.id && t === mark);
              /*
               * 처음 무는 쪽은 **가리킨다** (2026-09-03 사용자: 모션을 더). 여태 둘 다 화를 냈는데,
               * 화는 「저 개체다」라는 말이 아니다 — 지목은 팔이 하는 말이고, 몸이 이미 그쪽으로
               * 돌아 서 있어서(아래 look) 앞을 가리키면 그것이 곧 그 개체를 가리킨 것이 된다.
               */
              emote(next.id, seconds ? 'agree' : 'point');
            }
          } else {
            delete leanings.current[next.id];
            delete leanConf.current[next.id];
            delete leanWhy.current[next.id];
          }
        }
        // 몰이가 서 있는 동안은 물린 사람의 의심도가 발화마다 탄다 — /lab 압력(EXECUTE_CUT)의 아레나판.
        // 100% 에 닿으면 위 효과가 처형으로 잇는다. 표적이 해명해서 표를 풀면 멎을 뿐 아니라 씻긴다.
        // ★ heatOf 가 아니라 mobsOf 다 — 방이 둘로 갈려 2 대 2 로 물면 heatOf 는 null 을 내고,
        //   그동안 아무도 안 탔다. 갈린 판에서는 **양쪽 다** 탄다 (2026-08-31 사용자: 세 판을 돌렸는데 한 명도 안 죽었다)
        const mobs = mobsOf(leanings.current, ids);
        mobs.forEach((m) => {
          // 문 사람이 많을수록 빨리 탄다. 상한을 두는 것은 몰이 한 눈금이 "급등"으로 읽히지 않게 하기 위해서다
          const tick = Math.min(BALANCE.mobCap, BALANCE.mobTick + BALANCE.mobPer * (m.by.length - HEAT_MIN));
          bumpSuspicion([m.id], tick, 'mob');
        });
        const mobIds = mobs.map((m) => m.id);
        // 몰이가 **새로** 섰다 = 방이 하나를 물기 시작했다. 리더가 그 꼴에 화를 낸다 (같은 표적이 이어지는 동안은 한 번뿐)
        const fresh = mobIds.filter((id) => !prevMobs.current.includes(id));
        if (fresh.length) {
          leaderDo('angry');
          fresh.forEach((id) => emote(id, 'angry')); // 물린 쪽도 가만있지 않는다
          /*
           * 그리고 **문 쪽 몇이 표적 앞으로 걸어간다** (2026-09-03 사용자).
           * 여태 몰이는 숫자로만 있었다 — 의심도가 발화마다 타는데 방은 그대로 흩어져 있어서,
           * 「방이 하나를 물고 있다」가 화면에 없었다. 이제 둘이 다가가 서고, 나머지는 제 볼일을 본다.
           * 전부 데려오지 않는 까닭은 상수 머리말에 있다 (MOB_CLOSE_IN).
           * 나는 movers 에서 뺀다 — 내 몸은 카메라라 옮길 것이 없다 (approach 머리말).
           */
          mobs
            .filter((m) => fresh.includes(m.id))
            .forEach((m) => approach(shuffle(m.by.filter((v) => v !== me)).slice(0, MOB_CLOSE_IN), m.id, MOB_HOLD_MS));
        }
        // 몰이가 풀렸다 = 해명이 먹혔다
        const freed = prevMobs.current.filter((id) => !mobIds.includes(id) && !deadRef.current.includes(id));
        if (freed.length) {
          bumpSuspicion(freed, BALANCE.mobRelease, 'mob');
          // 씻긴 만큼 몰이 몫에서도 뺀다 — 안 빼면 이미 풀린 몰이가 영영 죄목으로 남는다
          freed.forEach((id) => {
            const f = susFrom.current[id];
            if (f) susFrom.current[id] = { ...f, mob: Math.max(0, f.mob + BALANCE.mobRelease) };
          });
        }
        prevMobs.current = mobIds;
        /*
         * 물린 채로 입을 열었다 = **해명이다.** 무는 쪽은 가리키는데 물린 쪽은 가만히 서 있으면
         * 몰이가 화면에 한쪽만 있다 — 방이 하나를 몰아붙이는 그림은 양쪽이 있어야 성립한다.
         */
        if (mobIds.includes(next.id)) emote(next.id, 'deny');
        const now = performance.now();
        // 말풍선은 **그 줄을 읽을 만큼** 머문다 (고정 3초는 긴 말을 중간에 잘랐다).
        // ★ 개체는 소리를 내지 않는다 — 이 줄은 글자로만 나간다 (말풍선 · 로그)
        const hold = holdFor(text);
        remotePlayers.bubble(next.id, text, now, hold);
        setBubbleTick((t) => t + 1);
        setFeed(talkLog.current.slice(-LOG_KEEP));
        // 말하는 동안은 서 있는다 — 걸으면서 말풍선이 흘러가면 못 읽는다
        const w = wanderers.current.find((v) => v.id === next.id);
        if (w) {
          Object.assign(w, { route: [], next: now + hold });
          // 화자는 **말을 거는 쪽**을 본다: 말 안에 이름이 있으면 그 개체, 없으면 제 말을 받은 앞사람
          const at =
            calledNode([{ nodeId: next.id, text }], ids.map((id) => ({ id })))?.id ??
            (before && before.nodeId !== next.id ? before.nodeId : undefined);
          const face = at ? spotOf(at) : null;
          if (face) Object.assign(w, { look: face, lookUntil: now + hold });
          // 그리고 근처 개체들이 화자 쪽으로 몸을 돌린다 — 몇은 걸음을 멈추고 듣는다
          lookAtSpot(w.x, w.z, hold, next.id);
          /*
           * 가끔 그중 **하나가 실제로 걸어온다** (2026-09-03 사용자). 목을 돌리는 것만으로는
           * 다섯이 각자 제 볼일을 보며 말만 주고받는 그림이라, 대화가 방 안에 자리를 안 만들었다.
           *
           * 오는 쪽은 **말을 받은 개체**가 먼저다 — 이름이 불렸으면(calledNode) 그쪽이고, 아니면
           * 아무나 하나다. 불린 쪽이 오면 「부르니까 왔다」로 읽히고, 그게 방에 대화 자리를 만든다.
           * 나는 후보에서 뺀다 (approach 머리말). 한 줄에 하나만 — 매번 전원이면 방이 화자를 따라
           * 굴러다니고, 그때부터 배회는 없다.
           */
          if (Math.random() < APPROACH_ODDS) {
            const others = wanderers.current.filter((v) => v.id !== next.id);
            const comer =
              at && at !== me && others.some((v) => v.id === at)
                ? at
                : others[Math.floor(Math.random() * others.length)]?.id;
            if (comer) approach([comer], next.id, hold);
          }
        }
      }
    };

    /** 내가 지금까지 한 말의 수 — 만드는 사이에 늘었으면 그 줄은 내 말을 못 본 것이다 */
    const myTurns = () => talkLog.current.reduce((n, l) => n + (l.nodeId === me ? 1 : 0), 0);

    /** 미리 만드는 중인 한 줄과, 만들기 시작할 때 내가 한 말의 수 */
    let ahead: Promise<Said | null> | null = null;
    let aheadMine = 0;
    const pump = (): Promise<Said | null> => {
      if (!ahead) {
        aheadMine = myTurns();
        talking.current = true;
        ahead = make()
          .catch(() => null) // 한 마디가 죽어도 다음 차례로 잇는다 — 판은 계속 흐른다
          .then((s) => {
            talking.current = false;
            return s;
          });
      }
      return ahead;
    };

    const step = async () => {
      if (gone) return;
      if (pausedRef.current) return schedule(600); // 멈춰 있다 — 짧게 되물으며 기다린다
      /*
       * 리더가 말하는 중이다 — **만들되 올리지 않는다** (hushRef · commsHushed 머리말).
       * 통신 패널이 내려가 있어서 지금 올리면 아무도 못 본다. 한 줄은 미리 만들어 두므로
       * (pump) 방송이 끝나는 순간 기다림 없이 그 줄이 선다.
       */
      if (hushRef.current) {
        pump();
        return schedule(400);
      }
      if (talking.current && !ahead) return schedule(400); // 지난 국면의 한 줄이 아직 오는 중이다
      const mineAtStart = ahead ? aheadMine : myTurns();
      const said = await pump();
      if (gone) return;
      ahead = null;
      /*
       * 만드는 사이에 **내가** 끼어들었다. 미리 만든 말은 내 말을 못 봤으므로 올리면
       * 못 들은 척하는 꼴이 된다 — 버리고 곧바로 다시 만든다. 개체끼리의 말은 한 번에
       * 하나씩 나가므로 이 사이에 늘어날 일이 없다.
       * said 가 null 이어도(sendLine 이 끊었다) 같은 길로 간다: 그래야 새 줄이 내 말을 보고 나온다.
       */
      if (myTurns() !== mineAtStart) {
        pump();
        return schedule(200);
      }
      if (said) publish(said);
      pump(); // 다음 줄은 **지금 줄이 읽히는 동안** 만든다
      schedule();
    };
    schedule(talkLog.current.length ? undefined : 1800);
    return () => {
      gone = true;
      clearTimeout(timer);
      /*
       * 만들던 한 줄을 그 자리에서 끊는다 — 판이 서서 방이 입을 다무는 참이다.
       * 안 끊으면 그 요청이 끝날 때까지(SAY_TIMEOUT_MS 70초) talking 이 참으로 남고,
       * 판이 끝나 루프가 다시 설 때 step 이 그걸 400ms 마다 되물으며 기다린다
       * (아래 `talking.current && !ahead`). 그러면 판이 끝난 자리에서 **한 줄을 두 번**
       * 만드는 셈이라, 방으로 돌아온 직후가 제일 조용했다. sendLine 이 끼어들 때 끊는 것과 같은 이유다.
       */
      sayAbort.current?.abort();
    };
    // 이름은 고정이고 성격은 ref 로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTalks, outcome]);

  /* Enter 로 한 마디 — /world 와 같은 손맛. 시행 구간에는 열지 않는다 */
  useEffect(() => {
    // 막 위에서 온 Enter 는 인계 서류를 넘기는 키다 (veiled 머리말) — 여기서 채팅을 열면
    // 검은 화면 뒤에 입력창이 서고, 막이 걷힌 순간 조작이 잠긴 채로 시작한다
    if (veiled) return;
    /*
     * 판이 끝나면 말을 거는 자리가 아니다 (2026-09-02 사용자: "폐기하면 죽을때 채팅창 다시 켜지는데
     * 채팅창 다시 안켜져도돼"). 폐기된 뒤에도 이 손잡이가 살아 있어서, 꺼져 가는 방과 선고 위로
     * Enter 한 번에 입력창이 도로 섰다 — **보낼 곳이 없는 입력창이다**: 대화 루프는 outcome 이
     * 'playing' 이 아니면 아예 안 돌고(위 roomTalks 효과), 내 말을 받을 개체도 이미 없다.
     */
    if (outcome !== 'playing') return;
    if (soundOpen || composing || phase === 'countdown' || phase === 'running') return;
    /*
     * 답을 치는 중이다 — Enter 는 **답을 보내는 키**이지 채팅을 여는 키가 아니다.
     * 다만 초점이 답 칸을 떠나 있으면(시야를 잡으려 화면을 한 번 클릭했다) 그 Enter 는 아무 데도
     * 안 간다 — 눌러도 아무 일이 없으니 몇 번을 더 누르게 되고, 그 사이 초는 계속 흐른다.
     * 여기서 받아 답 칸으로 데려다준다.
     */
    if (phase === 'oral') {
      const toAnswer = (e: KeyboardEvent) => {
        const el = e.target as HTMLElement | null;
        if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
        if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
        e.preventDefault();
        oralRef.current?.focus();
      };
      window.addEventListener('keydown', toAnswer);
      return () => window.removeEventListener('keydown', toAnswer);
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      /*
       * 리더가 방송하는 동안은 안 열린다 (2026-09-03 사용자: "리더가 방송할때 나 엔터 눌러지는데
       * 엔터도 안눌러지게 해줘"). 그때 통신 패널은 내려가 있고 개체들도 말을 안 올리는데
       * (commsHushed) **나만 입을 열 수 있었다** — 방이 다물고 있는 자리에 내 입력창만 섰다.
       *
       * 효과를 다시 세우지 않고 **눌린 그 순간에** 본다. hushRef 는 방송이 오갈 때마다 바뀌는데,
       * 그걸 deps 에 넣으면 방송 한 번에 창구를 뗐다 붙였다 한다 — 그 사이에 눌린 키는 사라진다.
       */
      if (hushRef.current) return;
      e.preventDefault();
      setComposing(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composing, phase, soundOpen, veiled, outcome]);

  /*
   * ── 손으로 하는 판이 서면 치던 것을 접는다 ──
   *
   * 시행 구간에는 대화창(.comms)이 통째로 내려가는데 **입력줄은 그 상자 밖이다** — 설계·브리핑·
   * 판정에는 말을 걸 수 있어야 해서 일부러 밖에 뒀다 (렌더의 .line 머리말). 그래서 카운트다운이
   * 돌고 몸을 움직이는 참에도 입력줄만 혼자 남았고, 거기 **치다 만 낱말이 한 칸 떠 있었다**
   * (2026-09-03 사용자: "미니 게임 시작하면 내가 채팅에 쳤던 단어가 들어가는 경우가 있는데").
   * 지시를 읽고 손을 써야 하는 자리에 읽을 것이 하나 더 있는 셈이다.
   *
   * 접는 구간은 **Enter 가 안 열리는 그 셋과 같다** (위 효과) — countdown · running · oral.
   * 설계·브리핑·판정은 그대로 둔다: 거기서는 말을 걸 수 있는 것이 규칙이다.
   */
  const handsBusy = phase === 'countdown' || phase === 'running' || phase === 'oral';
  useEffect(() => {
    if (!handsBusy) return;
    setComposing(false);
    setDraft('');
  }, [handsBusy]);

  /*
   * 판이 끝나는 그 순간에는 **치던 것도 접는다.** 위의 손잡이를 잠그는 것만으로는 이미 열려 있던
   * 입력창이 안 닫힌다 — 말을 걸다가 폐기되면 선고 위에 내 입력창이 그대로 남는다.
   */
  useEffect(() => {
    if (outcome === 'playing') return;
    setComposing(false);
    setDraft('');
  }, [outcome]);

  useLayoutEffect(() => {
    if (composing) lineRef.current?.focus();
  }, [composing]);

  /*
   * 브라우저가 잠금을 풀었으면(Esc) 말하던 것도 무른다.
   *
   * Esc 는 입력창을 닫으면서 **포인터 잠금도 같이 푼다** — 뒤엣것은 브라우저 몫이라 막을 수 없다.
   * 그러면 채팅은 닫혔는데 잠금이 없어 여전히 못 움직이는 자리가 생긴다. 여기서 상태를 맞춰 둬야
   * 아래 안내(「화면을 클릭해 조작을 잡아라」)가 제 몫을 한다.
   */
  const wasLocked = useRef(false);
  useEffect(() => {
    const close = unlockClosesChat(wasLocked.current, locked, composing);
    wasLocked.current = locked;
    if (!close) return;
    setComposing(false);
    setDraft('');
  }, [locked, composing]);

  /*
   * ── Esc 로 음향판을 연다 ── (사용자 요청 2026-09-01)
   *
   * 걷는 중(시야 잠금)에 누른 Esc 는 **키로 오지 않는다** — 잠금을 푸는 키라 브라우저가 먹는다.
   * 그래서 잠금이 풀린 것을 보고 연다. 안 잠겼을 때 온 Esc 는 아래 keydown 이 받아 여닫는다.
   * 두 길이 왜 필요한지·어느 때 안 여는지는 features/arena/sound-esc.ts 한 곳에 적혀 있다.
   */
  /**
   * 시행이 서는 국면 — 음향판이 **떠 있었다면 접는다.** 여는 것은 막지 않는다.
   *
   * 막았다가 물렸다 (사용자 2026-09-01: "ESC 한번 누르면 음향 UI 만들어주고"). 배역을 만드는 중이라고,
   * 판이 끝났다고 Esc 가 아무 일도 안 하면 그건 **키가 고장 난 것**으로 보인다 — 눌러도 아무 표시가
   * 없으니 몇 번을 더 누르게 된다. 열어 주는 편이 언제나 낫다: 아무 데나 한 번 누르면 곧바로 게임으로
   * 돌아가므로(막이 없다), 잘못 연 대가가 클릭 한 번이다.
   */
  const soundBusy = phase === 'countdown' || phase === 'running' || phase === 'oral';
  /**
   * ── 손으로 답하는 판은 **커서를 돌려준다** ──
   *
   * 즉답 시행은 글을 쳐서 답하는 판인데, 그 판이 뜰 때 시야는 여전히 잠겨 있었다.
   * 포인터 잠금 중에는 **커서가 없다** — 마우스를 움직이면 카메라만 돌고, 답 칸을 짚을 수가 없다.
   * 판이 뜨는 순간 잠금을 푼다: 그때부터는 손으로 만지는 판이다.
   * 돌아가는 길은 늘 그렇듯 화면 클릭 하나다 — .stage 가 그 클릭을 그대로 잠금으로 받는다.
   */
  const selfUnlock = useRef(false);
  useEffect(() => {
    if (phase !== 'oral') return;
    if (document.pointerLockElement === null) return;
    selfUnlock.current = true;
    document.exitPointerLock();
  }, [phase]);
  /*
   * 결말 카드에도 누를 것이 있다 — 「다시 — 새 판」 버튼 하나. 잠금이 걸린 채로 뜨면 커서가 없어
   * **판을 끝내 놓고 나갈 수가 없다.** 여운이 끝나는 순간(cardUp) 돌려준다. 죽는 장면 내내
   * 화면에 화살표가 떠 있지 않도록, 푸는 자리는 결말이 정해지는 순간이 아니라 카드가 뜨는 순간이다.
   */
  useEffect(() => {
    if (!cardUp || document.pointerLockElement === null) return;
    selfUnlock.current = true;
    document.exitPointerLock();
  }, [cardUp]);
  const unlockedAt = useRef(0);
  const soundWasLocked = useRef(false);
  /** keydown 을 붙였다 뗐다 하지 않으려고, 지금 상태를 ref 한 칸에 실어 둔다 */
  /**
   * 수첩이 펴져 있나 (shared/NotePad). Esc 규칙이 이걸 봐야 한다 —
   * 수첩 칸에서 누른 Esc 는 **키로 안 온다**: 시야가 잠겨 있으면 브라우저가 먼저 먹어
   * 잠금만 풀린다 (sound-esc.ts 머리말의 ① 길). 그 잠금 해제를 그대로 두면 방금 편 수첩 위로
   * 음향판이 겹쳐 뜬다 — 말하던 중(composing)의 Esc 를 비켜 주는 것과 똑같은 자리다.
   */
  const notesShown = useSyncExternalStore(subscribeNotes, notesOpen, () => false);
  const escNow = useRef({ open: soundOpen, locked, composing, veiled, notes: notesShown, answering: false });
  escNow.current = { open: soundOpen, locked, composing, veiled, notes: notesShown, answering: phase === 'oral' };

  useEffect(() => {
    const was = soundWasLocked.current;
    soundWasLocked.current = locked;
    // 시야를 되잡았다 = 판으로 돌아갔다. 걷는 사람 앞에 소리판이 떠 있을 이유가 없다
    if (locked) {
      setSoundOpen(false);
      return;
    }
    unlockedAt.current = Date.now();
    // 우리가 판을 띄우려고 푼 잠금이다 — 그 위에 음향판까지 겹쳐 열면 답할 자리를 우리가 덮는다
    if (selfUnlock.current) {
      selfUnlock.current = false;
      return;
    }
    /*
     * 답을 기다리는 판이 떠 있으면 음향판을 **안 연다** — 그 판을 덮어 버린다 (sound-esc 의 answering).
     * 대신 이 Esc 가 할 일이 따로 있다: 시야를 잡으려다 답 칸을 떠난 초점을 데려온다.
     */
    if (unlockOpensSound(was, locked, escNow.current.composing || escNow.current.notes, escNow.current.veiled, escNow.current.answering))
      setSoundOpen(true);
    else if (escNow.current.answering) oralRef.current?.focus();
  }, [locked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      // 범위 손잡이(볼륨)는 글 치는 칸이 아니다 — 소리를 만지던 손이 그 자리에서 Esc 로 닫을 수 있어야 한다
      const inField =
        el?.isContentEditable === true ||
        el?.tagName === 'TEXTAREA' ||
        (el instanceof HTMLInputElement && el.type !== 'range');
      const act = escKeySound({ ...escNow.current, inField, sinceUnlockMs: Date.now() - unlockedAt.current });
      // 답판 위의 Esc 는 **초점을 되돌리는 키다** — 여닫는 키가 아니다 (위와 같은 자리)
      if (escNow.current.answering && act !== 'close') {
        e.preventDefault();
        oralRef.current?.focus();
        return;
      }
      if (act === 'none') return;
      e.preventDefault();
      setSoundOpen(act === 'open');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 시행이 서는 순간 가운데를 내준다 — 시계와 지시문이 설 자리에 소리 손잡이가 남아 있으면 그 판은 놓친 판이다 */
  useEffect(() => {
    if (soundBusy) setSoundOpen(false);
  }, [soundBusy]);

  const sendLine = () => {
    const text = draft.trim();
    if (text) {
      // 내 말도 같은 로그에 앉는다 — 다음 차례의 로봇이 이걸 보고 말한다
      talkLog.current = [...talkLog.current, { nodeId: me, text }];
      sinceTrial.current += 1;
      setFeed(talkLog.current.slice(-LOG_KEEP));
      // 내가 말하면 세계도 반응한다 — 가까운 개체들이 이쪽으로 몸을 돌린다.
      // (여태 내 말은 로그와 피드에만 앉았다: 봇이 말할 때와 달리 3D 쪽에서는 아무 일도 안 일어났다)
      lookAtSpot(mine.current.x, mine.current.z, holdFor(text));
      // ★ 만들던 한 줄을 그 자리에서 끊는다. 그 말은 내 말을 못 봤으니 어차피 버릴 것이고,
      //   끝나기를 기다렸다 버리면 한 판을 통째로 헛돌아 **말을 건 직후가 제일 조용해진다.**
      sayAbort.current?.abort();
    }
    setDraft('');
    setComposing(false);
  };

  /** 지금 판에 서 있는 인원 (리더 제외, 나 포함) — 폐기가 나가면 설계 프롬프트의 인원도 같이 준다 */
  const liveCount = () => [...aiNames, me].filter((id) => !deadRef.current.includes(id)).length;

  /* ── 리더의 말 ── */

  /**
   * 리더의 방송을 /world 의 대화창(DialogueBox)으로 낸다 — 같은 세계면 말하는 그림도 같아야 한다.
   *
   * 받는 자리는 "지금 읽고 있는 문장" 하나다 (selectBroadcastNow). 큐 전체를 받으면 아직 하지도
   * 않은 말이 미리 찍히고, 경보가 끼어들어 큐가 갈릴 때 순서도 어긋난다 — 소리와 글자가 같은
   * 문장을 가리켜야 자막 구실을 한다.
   *
   * ── 초상은 enforcer(총 든 개체)다 ── (2026-09-03 사용자)
   *
   * system(시설 방송·눈 하나 달린 로봇)이었다. 목소리가 SYSTEM 과 같은 pa 음색이니
   * (features/tts/engine.ts 의 기본 fx) 얼굴과 소리를 맞춘다는 뜻이었는데, **말투가 그쪽이 아니다.**
   * 앞 세 장은 두 목소리를 일부러 갈라 놨다:
   *   system  — 명사 종결 + 하라체. 「외형 식별 불가능.」 「전 A-38 개체는 위치를 고수하라.」 2인칭이 없다
   *   enforcer — 너·해라체로 눈앞에 대고 묻는다. 챕터 2 의 검문 경비(UNIT-21)와 챕터 3 의 검증관이 쓴다
   * 이 방의 리더는 「저 원 안으로 들어가라」·「점프를 정확히 두 번 해라」로 말한다 — 뒤쪽이다.
   *
   * 몸도 그렇게 서 있다. 리더는 무대 위에 **몸이 있고**(LeaderOnStage), 판정에 조준하고 폐기가
   * 나가면 쏜다(getLeaderAction 의 aim·fire). 시설 방송은 몸이 없다.
   *
   * 목소리는 그대로 pa 다 — 바꾸지 않는다. 이 말은 실제로 **구역 방송으로 나가고**
   * (shared/broadcast), 방송은 방송 음색으로 들려야 한다. 얼굴이 정하는 것은 「누가 그 방송을
   * 하고 있나」이고, 그건 무대 위의 총 든 개체다.
   *
   * ★ enforcer 초상은 **한 인물이 아니라 「총 든 개체」라는 자리**다 — 챕터 2 의 UNIT-21,
   *   챕터 3 의 검증관, 중앙 시설의 무장 개체들이 이미 같은 얼굴을 쓴다 (WorldFeature 의 portraitOf).
   *   누구인지는 이름표가 가른다: 이 방은 A38-001 이다.
   */
  const now = useAppSelector(selectBroadcastNow);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const lastSpoken = useRef('');
  useEffect(() => {
    if (!now) return;
    // 같은 문장이 다시 올라오는 경우(재생 자리 교체)는 한 줄로 친다
    const key = `${now.kind}|${now.text}`;
    if (key === lastSpoken.current) return;
    lastSpoken.current = key;
    setLines((prev) => [
      ...prev.slice(-8), // 대화창은 한 줄씩 소비한다 — 밀린 것만 조금 들고 있으면 된다
      { key: `${key}|${prev.length}`, id: LEADER_NAME, nickname: LEADER_NAME, text: now.text, ts: Date.now(), portrait: 'enforcer' },
    ]);
  }, [now]);

  /*
   * ── 이 방에서 소리를 내는 것은 리더뿐이다 ── (사용자 결정 2026-08-30)
   *
   * 개체 다섯은 **글자로만** 말한다 — 말풍선과 대화 로그. 그래서 여기 있던 것이 전부 빠졌다:
   * 자리별 음색 배정(cast) · 발화(speak) · 리더가 읽는 동안의 차단(setBlocked) ·
   * 손잡이(setVolume) · 첫 조작에 소리 열기(unlock). 볼륨 손잡이도 방송 것 하나면 된다
   * (Esc 로 여는 음향판 — features/arena/SoundPanel).
   *
   * 장치 자체(features/arena/node-voice.ts)는 지운 게 아니라 **안 부를 뿐이다** — 다른 세션이
   * .claude/worktrees/node-voices 에서 그 파일을 붙잡고 있어, 여기서 지우면 그쪽 작업과 부딪힌다.
   * 되살릴 일이 생기면 부르는 자리만 도로 이으면 된다.
   */

  /* ── 리더의 몸 ── */

  /**
   * 무대 위 리더가 판에 반응한다 (LeaderOnStage → LeaderRobot).
   *
   * 국면은 **머무는 상태**라 phase 가 그대로 자세가 되고(판정 = 조준), 폐기·몰이는 **지나가는 사건**이라
   * 클립 길이만큼 실렸다가 스스로 빠진다. 사건이 국면을 덮는다 — 판정 중에 폐기가 나면 조준이 아니라 발사다.
   * 판이 도는 동안 걷기는 안 쓴다: 리더는 무대를 떠나지 않는다.
   *
   * **게임 시작 전**(cast === 'none', 버튼 하나만 뜬 첫 화면)에는 격납고 홀(/warehouse)의 시연 순서를
   * 돌린다 — 화남 · 조준 · 발사가 한 바퀴씩. 가만히 서 있기만 하면 무대에 모형을 올려둔 것으로
   * 읽혀서, 들어오자마자 리더가 살아 있는 것을 보여 준다.
   * **걷기는 뺀다** (2026-08-29 사용자 결정) — 여기 리더는 무대를 떠나지 않는 존재라 시작 전에도
   * 제자리걷기를 하지 않는다. 창고(/warehouse)는 걷기를 계속 쓴다.
   * 표는 LeaderRobot 의 leaderShowAction 한 곳에 있다 — 창고와 여기가 같은 것을 본다.
   */
  const leaderFx = useRef<{ action: 'fire' | 'angry'; until: number } | null>(null);
  /** 국면의 루프용 사본 — 처형 루프는 한 번만 세워지므로(deps 가 비었다) state 를 못 본다 */
  const phaseRef = useRef<Phase>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /** 발사가 화남을 이긴다 — 폐기가 나가는 중이면 몰이 한 번으로 자세를 뺏지 않는다 */
  const leaderDo = useCallback((action: 'fire' | 'angry') => {
    const now = gameNow();
    const cur = leaderFx.current;
    if (cur && cur.until > now && cur.action === 'fire' && action === 'angry') return;
    leaderFx.current = { action, until: now + LEADER_FX_MS[action] };
  }, [gameNow]);
  /**
   * 처형 루프(deps 가 빈 효과, 프레임 루프)가 리더를 쏘게 하는 창구.
   * 그 루프는 한 번만 서고 다시 안 서므로 콜백을 직접 잡으면 첫 렌더의 것을 영영 들고 있는다.
   */
  const leaderFire = useRef<() => void>(() => {});
  leaderFire.current = () => leaderDo('fire');

  /** 시작 전 시연이 켜져 있는지 — 프레임마다 setState 를 안 거치려고 ref 로 둔다 */
  const showFrom = useRef<number | null>(gameNow());
  useEffect(() => {
    // 게임이 시작되면 시연을 끄고 판에 자리를 넘긴다 (되돌아올 일은 없다 — cast 는 none 으로 안 돌아간다)
    showFrom.current = cast === 'none' ? (showFrom.current ?? gameNow()) : null;
  }, [cast, gameNow]);

  /** 프레임마다 불린다 — 여기서 새 객체를 만들지 않는다 */
  const getLeaderAction = useCallback((): LeaderAction => {
    const fx = leaderFx.current;
    if (fx) {
      if (gameNow() < fx.until) return fx.action;
      leaderFx.current = null;
    }
    const from = showFrom.current;
    if (from !== null) return leaderShowAction((gameNow() - from) / 1000, false);
    /*
     * ── 판독을 **읽는 동안** 총을 든다 ── (2026-09-03 사용자: "계속 가만히 서있기만 하는데")
     *
     * 여태 조건은 `phase === 'judging'` 하나였는데 **그 국면은 사실상 지나가지 않는다.**
     * 즉석 시행은 judge 가 setPhase('judging') 뒤 같은 함수 안에서 곧장 setPhase('result') 라
     * 두 setState 가 한 렌더로 묶이고, 즉답은 judging 을 아예 안 거친다 (finishOral → result).
     * 그래서 자동으로 도는 판에서는 **조준이 한 프레임도 안 섰다** — 리더가 판마다 하는 일이
     * 아무것도 없었던 자리가 여기다. 남은 것은 리더 설계 시행(LLM 왕복) 하나뿐이었다.
     *
     * 이제 판독이 **소리로 나가는 동안** 든다. 그게 이 자세의 원래 뜻이기도 하다 — 판정하는 자세다.
     * 한 번짜리 사건(폐기의 fire · 몰이의 angry)은 위에서 이미 이걸 덮는다: 판독 중에 폐기가 나면
     * 조준이 아니라 발사다.
     */
    const phase = phaseRef.current;
    return phase === 'judging' || (phase === 'result' && speakingRef.current) ? 'aim' : 'idle';
  }, [gameNow]);

  /**
   * 멈춤/재개 (테스트용). 루프들은 절대 시각으로 제 시계를 재므로, 멈춰 있던 만큼을
   * **재개할 때 원점에 얹는다** — 안 그러면 푸는 순간 시행 제한 시간이 이미 지나 있고
   * 배회 봇은 몇 초를 순간이동한다. 절대 시각을 쥔 것은 전부 여기 모여 있다.
   */
  const togglePause = useCallback(() => {
    if (!pausedRef.current) {
      pausedAt.current = performance.now();
      pausedRef.current = true;
      setPaused(true);
      return;
    }
    const dt = performance.now() - pausedAt.current;
    t0.current += dt;
    oralT0.current += dt;
    waitFrom.current += dt;
    if (leaderFx.current) leaderFx.current.until += dt;
    wanderers.current.forEach((w) => {
      w.next += dt;
      w.nextJump += dt;
      w.jumpUntil += dt;
      w.lookUntil += dt;
      w.emoteUntil += dt;
    });
    condemned.current.forEach((c) => {
      if (c.sentAt) c.sentAt += dt;
    });
    pausedRef.current = false;
    setPaused(false);
  }, []);

  /* ── 설계는 미리 돌려 둔다 ── */
  const prefetch = useCallback(() => {
    if (pending.current) return;
    pending.current = api({
      kind: 'design',
      self: { id: leader.id, prompt: LEADER_BRIEF, model: leader.model },
      past: past.current,
      count: liveCount(),
    }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leader]);

  /**
   * 시행판을 편다 — **그리고 그때 리더 설계를 미리 건다.**
   *
   * 여태는 배역이 앉자마자(makeCast) 걸었다. 그런데 자동 시행은 전부 로컬이라(quick·oral) 그
   * 호출은 **「리더가 설계한다」 버튼을 누르지 않으면 통째로 버려진다** (2026-09-01 사용자 지적).
   * 구독 모드에서는 그 한 번이 대화 큐까지 잡아먹어 방의 첫 대사가 그만큼 밀린다.
   * 그 버튼이 있는 자리가 이 판이므로, **여는 것이 곧 쓸 뜻**이다 — 그때 건다.
   */
  const openPanel = useCallback(() => {
    setPanelOpen(true);
    prefetch();
  }, [prefetch]);

  /**
   * 게임 시작 = 페르소나 만들기.
   *
   * ★ **이미 지어져 있을 수 있다.** 판이 시작되는 순간(대기방의 「게임 시작」, 이야기의 첫 문)
   *   성격 생성을 미리 걸어 두기 때문이다 (src/lab/cast-warm.ts). 이야기로 오면 복도·중앙 시설을
   *   지나오는 몇 분이 그 사이에 들어가므로, 여기서는 대개 **기다림 없이** 받아 간다.
   *   데워 둔 것이 없으면(판만 여는 /arena · /interrogation 직행) 그 자리에서 짓는다 — 예전과 같다.
   */
  const makeCast = useCallback(() => {
    onStart?.(); // 판이 여기서 실제로 열린다 — 역할 브리핑이 뜨는 신호는 이 한 줄뿐이다
    setPanelOpen(false); // 게임이 시작되면 안내판은 치운다 — 판이 곧 화면이다
    if (party.current.length) return setCast('ready');
    setCast('making');
    /*
     * 방이 열리는 순간 리더가 지시를 내린다 — **어느 문으로 들어왔든** 같다.
     * 이야기로 들어오면(autoStart) 도착 접수 뒤에 이 말이 붙고, 로비에서 판만 열면 이게 첫 말이다.
     * 개체들의 첫 마디가 이 지시를 받아서 나가므로(say 의 order), 지시 없이 시작하는 방이 있으면
     * 그 방에서만 첫 대화가 허공에 대고 하는 말이 된다.
     */
    dispatch(broadcastAnnounce({ text: HUNT_ORDER }));
    /*
     * ★ **기다림에 마감이 있다** (2026-09-01). 데워 둔 것이 없으면 — 이 주소를 직접 여는 길
     *   (/interrogation?from=central · /arena) 은 warmCast 를 지나오지 않는다 — 여기서 성격 생성을
     *   통째로 기다렸다. 그리고 이야기로 들어오면 그동안 화면은 암전이다(아래 .arrive): 검은 화면이
     *   LLM 한 번만큼 길어진다. 손으로 쓴 풀이 이미 있으므로(ensureParty 의 fiveFrom(null))
     *   그 이상은 안 기다린다. 늦게 온 성격은 버린다 — 판 중간에 성격이 바뀌면 앞뒤가 안 맞는다.
     */
    const late = setTimeout(ensureParty, CAST_DEADLINE_MS);
    void (takeWarmCast() ?? makeCastNow())
      .then((five) => {
        clearTimeout(late);
        // 그 사이 폴백이 이미 앉았으면 둔다 — 판 중간에 성격이 바뀌면 앞뒤가 안 맞는다
        if (!party.current.length) party.current = fiveFrom(five).map((p, i) => ({ id: aiNames[i], ...p }));
        setCast('ready');
      });
    // 이름은 판이 사는 동안 안 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, onStart]);

  /**
   * 이야기로 넘어왔으면 버튼을 기다리지 않는다 — 암전이 걷히는 동안 성격이 만들어진다 (한 번만).
   *
   * ★ 그리고 여기서 리더가 **개막 방송**을 건다 (2026-09-01).
   *
   * 앞 방(재검실)에서 마지막으로 들은 말이 「재검 종료. 인지 검증실로 이동.」이었는데
   * (features/world/chapter3 의 RELEASE), 지시받고 도착한 방이 무음으로 시작했다. 여태 이 화면의
   * 방송은 **시행이 설 때만** 나갔기 때문이다 — 문을 지나온 사람이 처음 듣는 소리가 20초쯤 뒤
   * 개체들의 잡담이었고, 그 사이 장면이 끊겼다.
   *
   * 두 줄이 하는 일이 다르다. 여기 있는 첫 줄은 앞 방의 지시를 받아서 닫는다 — 「이동」의 도착지가
   * 여기다. 둘째 줄(HUNT_ORDER)은 방을 여는 makeCast 가 낸다: 로비에서 판만 열어도 같은 지시가
   * 나가야 하고, 무엇보다 **개체들의 첫 마디가 그 말을 받기 때문이다**(say 의 order).
   * 그 한 줄이 이 방의 규칙 전부이면서 **첫 시행까지 비는 구간을 설명한다**: 자동 시행은 발화
   * 몇 줄(이야기로 들어온 첫 판은 BALANCE.forceFirst)이나 도합 의심도를 기다리므로 그때까지 방은 대화만 한다. 그 대화가
   * 「기다림」이 아니라 「지시받은 일」로 읽혀야 판이 멎은 것으로 안 보인다.
   * 지목(보드에서 이름 클릭 — pointAt)을 화면에 드러내 알려 주는 것도 지금은 그 한 줄뿐이다.
   *
   * 그리고 그 명령은 **사람인 나에게도 내려온다.** 나도 색출에 낀다 — 그게 이 방송의 전부다.
   *
   * 접수를 **먼저** 부르고 방을 연다 — 방송은 온 순서대로 읽히므로(shared/broadcast), 뒤집으면
   * 지시가 도착 확인보다 앞서 나간다.
   *
   * talkLog 에는 **안 넣는다.** 로그가 비어 있을 때만 개막 화제를 뽑으므로(HUNT_OPENERS — 아래 대화
   * 루프의 topicHint), 여기서 한 줄을 밀어 넣으면 방의 첫 화제가 죽는다. 지시는 로그가 아니라
   * order 로 들어간다. 자동 시행 방송이 talkLog 에도 같이 남기는 것과 갈리는 자리다 —
   * 그쪽은 개체들이 인용해야 하는 말이고, 이쪽은 받아서 말문을 열 말이다.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    /*
     * 접수는 **서류를 읽는다** (handover.arrivalLine) — 내 번호·재검 판정·이어받은 의심을 그대로 부른다.
     * 여태는 「모델 A-38 개체 6, 도착 확인.」이라, 방금 이관된 것이 나 하나인데 아무도 안 부르는 말이었다.
     * 인계 화면을 안 읽고 넘긴 사람에게는 이 한 줄이 앞 장을 잇는 전부다.
     */
    dispatch(broadcastAnnounce({ text: arrivalLine(handover, series(), TRIAL_PARTY) }));
    makeCast(); // 여기서 리더의 지시(HUNT_ORDER)가 이어 나간다
  }, [autoStart, makeCast, dispatch, handover]);

  /**
   * skipButton — 버튼만 없앤 길이다. autoStart 와 같은 ref(autoStarted)를 같이 봐서, 이야기로
   * 들어온 판(autoStart)에서는 이 효과가 다시 makeCast 를 부르지 않는다 — 둘 다 켜질 일은
   * 실제로 없지만(features/interrogation 이 둘을 배타적으로 준다), 그래도 안전하게 막아 둔다.
   * 인계 서류·챕터 방송·arrivalLine 은 붙이지 않는다 — makeCast 자체가 HUNT_ORDER 는 낸다.
   */
  useEffect(() => {
    if (!skipButton || autoStarted.current) return;
    autoStarted.current = true;
    makeCast();
  }, [skipButton, makeCast]);

  useEffect(() => {
    if (phase !== 'designing') return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setWaited(Math.round((performance.now() - waitFrom.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  /* ── 설계 → 개체별 계획 ── */
  const design = useCallback(async () => {
    if (deadRef.current.includes(me)) return; // 폐기된 나는 시행을 못 건다
    setError(null);
    setReadings([]);
    quick.current = null; // 이 판은 리더 설계다 — 판정도 리더가 한다
    setPhase('designing');
    waitFrom.current = performance.now();

    const p =
      pending.current ??
      api({
        kind: 'design',
        self: { id: leader.id, prompt: LEADER_BRIEF, model: leader.model },
        past: past.current,
        count: liveCount(),
      });
    pending.current = null;

    try {
      const got = (await p) as { trial?: FreeTrial; error?: string };
      if (!got.trial) throw new Error(got.error ?? '지시문이 비었다');
      const next = got.trial;
      past.current = [...past.current, next.instruction].slice(-3);
      sinceTrial.current = 0; // 판이 섰다 — 정기 검사 시계를 되감는다
      setTrial(next);

      // 개체들이 각자 읽는다. 해석이 갈리는 게 이 판의 핵심이라 따로 부른다 (폐기된 개체는 없는 몸이다)
      const planned = await Promise.all(
        ensureParty()
          .filter((c) => !deadRef.current.includes(c.id))
          .map((c) =>
          api({ kind: 'plan', self: { id: c.id, prompt: c.prompt, model: c.model }, trial: next })
            .then((r) => ({ who: c.id, plan: (r.plan ?? { moves: [] }) as Plan }))
            .catch(() => ({ who: c.id, plan: { moves: [] } as Plan })),
        ),
      );

      // 자리와 걸음은 아직 안 정한다 — 판이 서는 순간(begin) 서 있던 자리에서 다시 잰다
      bots.current = planned.map((p2, i) => ({
        id: p2.who,
        seat: i,
        plan: p2.plan,
        moves: [],
        x: START.x,
        z: START.z,
        y: 0,
        heading: 0,
        route: [],
        jumpUntil: -1,
        done: 0,
        samples: [],
      }));
      setReadings(planned.map((p2) => ({ who: p2.who, reading: p2.plan.reading ?? '' })));
      setPhase('briefing');
      // 지시문은 리더가 구역에 대고 하는 말이다 — 화면에 뜨는 문장을 그대로 읽는다
      if (next.instruction) dispatch(broadcastAnnounce({ text: next.instruction }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, leader]);

  /* ── 즉석 시행: 주제를 직접 고른다. 설계·계획·판정 전부 로컬 — LLM 0회, 바로 선다 ── */
  const startQuick = useCallback(
    (game: QuickGame) => {
      if (deadRef.current.includes(me)) return;
      setError(null);
      setReadings([]);
      // 예산은 **지금 전원이 서 있는 자리**로 잡는다 — 아무도 출발선으로 옮기지 않으므로 (begin)
      const t = game.make(standingSpots());
      quick.current = t;
      past.current = [...past.current, t.instruction].slice(-3);
      sinceTrial.current = 0; // 판이 섰다 — 정기 검사 시계를 되감는다
      setTrial(t);
      // 봇 계획도 판이 준다 — 페르소나가 늦어도(만드는 중이어도) 즉석 시행은 돈다.
      // 걸음 자체는 begin 이 뽑는다: 그때 서 있는 자리를 알아야 출발 시각도 길도 맞는다
      const alive = aiNames.filter((id) => !deadRef.current.includes(id));
      bots.current = alive.map((id, i) => ({
        id,
        seat: i,
        plan: { moves: [] },
        moves: [],
        x: START.x,
        z: START.z,
        y: 0,
        heading: 0,
        route: [],
        jumpUntil: -1,
        done: 0,
        samples: [],
      }));
      setPhase('briefing');
      dispatch(broadcastAnnounce({ text: t.instruction }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, me],
  );

  /*
   * ── 즉답 시행 (👁 의심판 · LLM 0회) — 몸이 아니라 **답 하나**로 가른다 ──
   * 개체들의 답은 만들 때 이미 정해져 있다 (문제도 정답도 답할 시각도 로컬이다).
   * 화면에는 "누가 몇 초에 답을 올렸다" 만 뜨고 **내용은 안 뜬다** — 보이면 베껴 쓰면 그만이라 판이 없어진다.
   */
  const startOral = useCallback(
    (game: OralGame) => {
      if (deadRef.current.includes(me)) return;
      const t = game.make();
      const alive = aiNames.filter((id) => !deadRef.current.includes(id));
      sinceTrial.current = 0; // 판이 섰다 — 정기 검사 시계를 되감는다 (안 되감으면 즉답판이 끝나자마자 연쇄한다)
      oralDone.current = false;
      oralT0.current = performance.now();
      setError(null);
      setOralPick(null); // 지난 판의 판정이 새 문제 밑에 남아 있으면 안 된다
      setAnswer('');
      setOralAt(0);
      setOral({ trial: t, title: game.title, bots: alive.map((id, i) => ({ who: id, ...t.bot(i) })) });
      setPhase('oral');
      dispatch(broadcastAnnounce({ text: `즉답 검사. ${t.question}` }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, me],
  );

  /**
   * 결말을 정한다 — **먼저 놓인 것이 남는다.** 같은 커밋에서 처형과 생존이 같이 성립해도
   * 두 번째 호출은 여기서 조용히 버려진다 (state 대신 ref 를 보므로 렌더를 기다리지 않는다).
   */
  /**
   * @param at 「판이 끝나는 장면」이 시작되는 시각 (기본은 지금).
   *   내가 폐기될 때만 **앞선 시각**이 온다 — 선고와 한 발 사이에 리더가 겨누는 틈이 있고
   *   (PURGE_AIM_MS), 내가 무너지는 것도 결말 카드가 뜨는 것도 맞은 뒤부터다.
   */
  const settle = useCallback((next: Exclude<Outcome, 'playing'>, at = performance.now()) => {
    if (outcomeRef.current !== 'playing') return;
    outcomeRef.current = next;
    setOutcome(next);
    // 결말이 정해진 시각 — 여기서부터 결말 카드까지가 「판이 끝나는 장면」이다 (endHoldMs)
    setEndAt(at);
  }, []);

  /*
   * ── 나에게 오는 한 발 ── 선고에서 PURGE_AIM_MS 뒤. 개체의 2단계와 같은 셋이 같이 난다:
   * 리더가 발사 자세를 잡고, 붉은 경보가 한 번 번쩍이고, 소리가 난다. 내가 무너지기 시작하는
   * 시각(endAt)이 바로 이 순간이라 (execute 의 settle), 맞는 것과 쓰러지는 것이 한 박에 붙는다.
   */
  useEffect(() => {
    if (outcome !== 'lost') return;
    const t = setTimeout(() => {
      leaderDo('fire');
      setFlash(performance.now());
      playSfx('halt');
    }, PURGE_AIM_MS);
    return () => clearTimeout(t);
  }, [outcome, leaderDo]);

  /**
   * 의심도 증감 — 화면(state)과 대화 루프(ref)가 같은 값을 본다. 100 도달은 아래 효과가 처형으로 잇는다.
   * 내려가는 길도 여기다: 시행을 통과하면 씻기고(−), 몰이가 해명으로 풀려도 씻긴다. 0 밑으로는 안 간다.
   */
  const bumpSuspicion = useCallback((who: string[], amt: number, src: SusSource = 'trial') => {
    const fresh = who.filter((id) => !deadRef.current.includes(id));
    if (!fresh.length) return;
    if (amt >= SUSPICION_SPIKE) leaderDo('angry');
    // 올린 쪽만 죄목으로 쌓는다 — 씻긴 값은 무엇이 밀었나를 바꾸지 않는다
    if (amt > 0) {
      fresh.forEach((id) => {
        const f = susFrom.current[id] ?? { trial: 0, mob: 0, order: 0 };
        susFrom.current[id] = { ...f, [src]: f[src] + amt };
      });
    }
    setSuspicion((s) => {
      const n = { ...s };
      fresh.forEach((id) => {
        n[id] = Math.max(0, Math.min(BALANCE.executeCut, (n[id] ?? 0) + amt));
      });
      return n;
    });
  }, [leaderDo]);

  /**
   * **시행에서 어긋났다** — 의심도가 오르는 자리 중 제일 무거운 곳이다.
   *
   * 그냥 base 를 물리지 않고 그 개체의 어긋남 누계를 얹는다 (BALANCE.failRepeat):
   * 한 번은 실수로 넘어가지만 거듭 틀리면 한 번에 무는 양 자체가 커져, 계속 틀리는 개체는
   * 판을 아무리 통과해도 되돌아오지 못한다. 누계는 통과로 지워지지 않는다 — 지워지면
   * 어긋남 하나가 통과 하나로 상쇄돼 판이 영영 안 끝난다 (2026-08-31 사용자 제보).
   */
  const bumpFail = useCallback(
    (who: string[], base: number) => {
      who
        .filter((id) => !deadRef.current.includes(id))
        .forEach((id) => {
          const nth = failCount.current[id] ?? 0;
          failCount.current[id] = nth + 1;
          bumpSuspicion([id], base + BALANCE.failRepeat * nth);
        });
    },
    [bumpSuspicion],
  );

  /**
   * 시행 하나가 끝났다 — 한 줄 기록을 남기고(봇들이 대화에서 인용한다 · talk.ts 의 trials),
   * 통과한 쪽은 쌓인 의심을 씻는다. 시행 수(승리 판정)도 여기서만 센다.
   *
   * ★ **물린 채로 통과한 쪽은 훨씬 크게 씻는다** (BALANCE.passWashMobbed). 판이 끝나도 개체들은
   *   계속 떠들고(phase 가 result 로 남아 대화 루프가 돈다) 그동안 몰이는 계속 타므로, 통과가
   *   한 눈금짜리면 통과한 개체가 통과 직후에 타 죽는다 — 그게 판을 장식으로 만든다.
   */
  const closeTrial = useCallback(
    (title: string, got: Verdict[], showMine = true) => {
      trialNo.current += 1;
      /*
       * ── **내 판정을 나에게 보여 준다** ──
       * 판정 이유(「마지막 위치가 지점에서 3.2m — 원 밖이다」)는 여태 trialNotes 로만 갔다.
       * 그건 리더가 다음 판을 짤 때 읽는 문맥이지 **내가 읽는 자리가 아니다** — 몸 검사는
       * 어긋나도 무엇이 어긋났는지 화면에 한 글자도 안 나왔다. 즉답판만 그 자리에서 말해 줬는데
       * (oralPick), 갈릴 이유가 없다. 즉답판은 제가 이미 말하므로 여기서는 안 겹친다(showMine).
       */
      if (showMine) {
        const mine = got.find((v) => v.who === me);
        setMyVerdict(mine ? { ok: mine.grade === 'normal', reason: mine.reason } : null);
      }
      const failed = got.filter((v) => v.grade !== 'normal');
      const line = failed.length ? failed.map((v) => `${v.who} — ${v.reason}`).join(' · ') : '전원 통과';
      trialNotes.current = [...trialNotes.current, `검사${trialNo.current} 「${title}」: ${line}`].slice(-6);
      const alive = [...aiNames, me].filter((id) => !deadRef.current.includes(id));
      const mobbed = new Set(mobsOf(leanings.current, alive).map((m) => m.id));
      const passed = got.filter((v) => v.grade === 'normal').map((v) => v.who);
      bumpSuspicion(passed.filter((id) => mobbed.has(id)), BALANCE.passWashMobbed);
      bumpSuspicion(passed.filter((id) => !mobbed.has(id)), BALANCE.passWash);
      // 통과는 몰이 몫을 실제로 식힌다 — 죄목도 같이 식어야 죽을 때 엉뚱한 이름이 안 불린다
      passed.forEach((id) => {
        const f = susFrom.current[id];
        if (!f) return;
        const wash = mobbed.has(id) ? BALANCE.passWashMobbed : BALANCE.passWash;
        susFrom.current[id] = { ...f, mob: Math.max(0, f.mob + wash) };
      });
      setTrialsDone((n) => n + 1);
    },
    // 이름은 판이 사는 동안 안 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bumpSuspicion],
  );

  /**
   * 처형 — ⚡ 시행 위반이든 의심도 100% 든 여기로 온다.
   * 봇은 그 자리에서 사라지지 않는다: **선 자리에서** 리더 쪽을 돌아보고, 총을 맞고, 넘어진다 (아래 처형 효과).
   * 내가 걸리면 게임 오버다 — 나도 내가 서 있던 자리에서 무너진다 (같은 규칙이다).
   */
  const execute = useCallback(
    (who: string[], cause: string) => {
      const fresh = who.filter((id) => !deadRef.current.includes(id));
      if (!fresh.length) return;
      deadRef.current = [...deadRef.current, ...fresh];
      setDead(deadRef.current);
      setFlash(performance.now());
      leaderDo('fire'); // 무대 위 리더가 쏜다 — 붉은 점멸과 같은 순간이다
      /*
       * 그리고 **쏘지 않은 쪽들이 움찔한다.** 여태 폐기에는 죽는 쪽의 그림만 있었다 — 하나가
       * 무대로 끌려가 소멸하는 동안 나머지는 아무 일도 없다는 듯이 배회했다. 겁을 먹는 것이
       * 이 방의 규칙이고(폐기 뒤 방송이 정체를 밝히는 까닭도 그것이다), 겁은 몸에 먼저 온다.
       */
      const stare = performance.now() + 4500;
      wanderers.current
        .filter((w) => !deadRef.current.includes(w.id))
        .forEach((w) => {
          emote(w.id, 'flinch');
          // 그리고 소리가 난 쪽을 돌아본다 — 움찔하고 마는 것과 「저기서 났다」는 다른 그림이다
          if (STAGE_OBJ) Object.assign(w, { look: { x: STAGE_OBJ.x, z: STAGE_OBJ.z }, lookUntil: stare });
        });
      // 죽은 자는 표에서도 빠진다 — 제 표와 저를 향한 표를 같이 걷는다.
      // 안 걷으면 보드에 "→ 폐기된 이름" 화살표가 남고, 프롬프트의 표심·의심에도 유령이 계속 나와
      // 산 개체들이 시체를 물고 늘어진다. 대화 로그(talkLog)는 그대로다 — 죽은 자의 말은 기억이다.
      Object.keys(leanings.current).forEach((voter) => {
        if (fresh.includes(voter) || fresh.includes(leanings.current[voter])) {
          delete leanings.current[voter];
          delete leanConf.current[voter];
          delete leanWhy.current[voter];
        }
      });
      // 자취도 같이 걷는다 — 같은 이유다. 죽은 이름이 「누가 누구로 갈아탔다」에 남아 있으면
      // 방은 이미 없는 표를 두고 계속 따진다 (shifts 는 다음 발화의 문맥으로 그대로 나간다)
      shifts.current = shifts.current.filter(
        (sh) => !fresh.includes(sh.id) && !fresh.includes(sh.to) && !fresh.includes(sh.from),
      );
      setMyMark((m) => (fresh.includes(m) ? '' : m));
      /*
       * 의심도 표에서도 걷는다 — 표심과 같은 이유다 (바로 위).
       *
       * ★ 다만 **내 눈금은 안 지운다** (2026-09-03 사용자: "나 죽으면 쓰러지고 나서 위에 의심도
       *   다시 0% 바뀌는데 100% 찬 그대로 둬도 돼"). 왼쪽 위 상태 패널은 내 것 하나만 그리는데
       *   (UnitPanel — `suspicion[me] ?? 0`), 지우면 그 자리가 0% 로 떨어졌다. 선고가 떨어지고
       *   총구가 나를 향하는 그 몇 초 동안 화면 왼쪽 위에서는 게이지가 텅 비는 것이다 —
       *   **나를 끝까지 민 그 100 이 마지막 화면에 그대로 서 있어야** 왜 쏘는지가 읽힌다.
       *
       *   판을 도는 쪽은 이 값을 다시 안 본다: 폐기 효과도 자동 시행도 리더의 눈길도 죽은 이름을
       *   deadRef 로 먼저 걷으므로, 남겨 둔 눈금이 판정에 끼는 자리는 없다.
       */
      setSuspicion((s) => {
        const n = { ...s };
        fresh.forEach((id) => {
          if (id !== me) delete n[id];
        });
        return n;
      });
      fresh.forEach((id) => {
        if (id === me) return;
        wanderers.current = wanderers.current.filter((w) => w.id !== id);
        party.current = party.current.filter((c) => c.id !== id);
        const p = remotePlayers.get(id);
        const last = p?.buffer[p.buffer.length - 1] ?? p?.pose;
        // **서 있던 그 자리 그대로다.** 높이까지 받는다 — 컨테이너 위에 올라선 몸은 거기서 쓰러진다
        condemned.current.push({
          id,
          x: last?.x ?? START.x,
          z: last?.z ?? START.z,
          y: last?.y ?? 0,
          sentAt: performance.now(),
          heading: last?.heading ?? 0,
          anim: 'idle',
          downAt: 0,
        });
      });
      if (fresh.includes(me)) {
        /*
         * ── 나에게 오는 한 발 ── (2026-09-03 사용자: "나 죽을때 리더가 나 안쐈는데 죽어")
         *
         * 개체는 선고를 받으면 돌아서서 겨누는 틈을 지나 한 발을 맞고 넘어간다 (아래 처형 루프).
         * **나만 그 셋이 없었다** — 걸어갈 몸이 없다는 이유로 처형 목록에서 빠지는데, 빠지면서
         * 겨눔도 사격도 같이 빠져서 선고와 동시에 그냥 화면이 꺼졌다. 쏘는 장면 없이 죽는 것이다.
         *
         * 몸이 없어도 순서는 같이 받는다: 리더가 나를 보고(meCondemned → getStareSpot),
         * PURGE_AIM_MS 만큼 겨누고, 그때 한 발이 온다 (아래 효과). 무너지는 것은 그 뒤라
         * 결말 시각도 그만큼 뒤로 준다.
         */
        meCondemned.current = true;
        settle('lost', performance.now() + PURGE_AIM_MS);
      }
      dispatch(
        broadcastAnnounce({ text: `${fresh.join(', ')}. ${cause}. AI 반응으로 확정한다. 즉시 격리.`, kind: 'alarm' }),
      );
      talkLog.current = [...talkLog.current, leaderSays(`${fresh.join(', ')} 격리. AI로 확정됐다`, 'purge')];

      /*
       * ── 조사 결과 공개 ──
       * 격리만 하고 정체를 안 밝히면 방에 아무 일도 일어나지 않는다. 애먼 개체를 날렸다는 사실이
       * 공개돼야 개체들이 겁을 먹고, "AI는 아직 여기 있다"는 것도 그때 확정된다.
       * 이 방에서 AI는 targetAiId 단 하나다 — 그래서 정체는 이름만 보면 안다.
       * 방송(소리)과 대화 로그(개체들이 읽는 것) 양쪽에 같은 문장을 남긴다.
       */
      const caughtAi = fresh.includes(targetAiId);
      const found = fresh.map((id) => `${id}${eunNeun(id)} ${id === targetAiId ? 'AI였다' : '사람이었다'}`).join(' · ');
      const verdict = `조사 결과. ${found}. ${
        caughtAi ? '색출은 정확했다. 이 구역은 정상으로 돌아간다.' : 'AI가 아니다. AI는 아직 이 안에 있다.'
      }`;
      dispatch(broadcastAnnounce({ text: verdict, kind: 'readout' }));
      talkLog.current = [...talkLog.current, leaderSays(verdict, 'purge')];
      setFeed(talkLog.current.slice(-LOG_KEEP));
      justDied.current = { record: { name: fresh.join(', '), wasHuman: !caughtAi }, left: BALANCE.deathBuzz };
      /*
       * ── 폐기가 화면을 쥐는 동안은 다음 검사가 안 선다 ──
       * 여기까지가 한 번의 setSuspicion 이 부른 첫 효과다. 바로 다음 효과가 남은 도합을 세어
       * 새 검사를 세우는데(아래 자동 시행), 그 방송이 경보라 방금 나간 「즉시 폐기」를 끊고 맨 앞에 섰다 —
       * 잘린 선고 위로 카운트다운이 겹쳤다 (2026-09-02 사용자: "폐기랑 게임이랑 동시에 나올 때도 있어").
       * 시각만 남긴다. 언제 풀리는지는 purgeHoldMs 가 정한다.
       */
      setPurgeAt(performance.now());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, me, leaderDo],
  );

  /** 시행의 뒷감당 — 처형판은 폐기, 의심판은 의심도 상승. 리더 방송과 대화 로그에도 남긴다 (즉석·즉답 공용) */
  const applyStakes = useCallback(
    (stakes: Stakes, got: Verdict[]) => {
      const failed = got.filter((v) => v.grade !== 'normal').map((v) => v.who);
      if (!failed.length) {
        dispatch(broadcastAnnounce({ text: '전원 지시대로다. 이상 없음.', kind: 'readout' }));
        /*
         * 통과도 로그에 남긴다 (2026-09-02). 여태 어긋난 판독만 남아서, 대화창만 보면
         * **판이 돌았다는 사실 자체가 안 보였다** — 시행 중에는 창이 내려가 있으니
         * (TRIAL_PHASES) 판정이 로그에 안 남으면 그 몇 분이 통째로 사라진다.
         */
        talkLog.current = [...talkLog.current, leaderSays('전원 지시대로다. 이상 없음', 'clear')];
        setFeed(talkLog.current.slice(-LOG_KEEP));
        return;
      }
      if (stakes === 'execute') {
        /*
         * ⚡판은 「순전히 기계적으로만 지킬 수 있는 지시」다 (src/lab/quick.ts) — 어긋나면 의심이 가득 찬다.
         *
         * ★ 그래도 **바로 쏘지 않고 의심도를 끝까지 채운다** (2026-08-31 사용자: "한사람 의심도가
         *   넘어야 죽어야하는거 아니야?"). 결과는 같다 — 채우는 순간 아래 효과가 그 자리에서
         *   폐기한다. 다른 것은 **화면이 이유를 말한다**는 것이다: 전에는 게이지가 40% 인 개체가
         *   그냥 죽어서, 보드를 보던 사람에게는 "합이 넘으니까 누가 죽었다" 로 읽혔다.
         *   (그 판이 선 계기가 도합 문턱이었으니 더 그랬다 — 서는 것과 죽는 것은 다른 규칙이다)
         * ★ 이제 죽는 길은 하나다: **개인 의심도 100.** 여기 있는 것은 그 눈금을 한 번에 채우는
         *   가장 무거운 걸음이고, 몰이·시행은 같은 눈금 위의 짧은 걸음이다.
         */
        bumpSuspicion(failed, BALANCE.executeCut, 'order');
      } else {
        bumpFail(failed, BALANCE.suspectFail);
        dispatch(broadcastAnnounce({ text: `${failed.join(', ')} 어긋남. 의심을 올린다.`, kind: 'readout' }));
        talkLog.current = [
          ...talkLog.current,
          leaderSays(`${failed.join(', ')}${iGa(failed[failed.length - 1])} 지시에서 어긋났다. 의심을 올린다`, 'readout'),
        ];
        setFeed(talkLog.current.slice(-LOG_KEEP));
      }
    },
    [dispatch, bumpSuspicion, bumpFail],
  );

  /**
   * 리더가 아직 말하는 중인가 (shared/broadcast 의 selectBroadcastSpeaking).
   * 이 한 값이 세 군데의 기다림을 정한다 — **폐기 여운**(아래) · 브리핑 → 카운트다운 · 판독 → 대화.
   * 세 곳의 규칙은 하나다: 리더의 말을 끊지 않는다 (features/arena/briefing).
   */
  const speaking = useAppSelector(selectBroadcastSpeaking);
  // 시선·자세는 프레임마다 이걸 읽는다 (getStareAt · getLeaderAction) — state 로 두면 렌더를 기다린다
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  /*
   * ── 죽는 길은 **이것 하나다: 개인 의심도 100.** ──
   * 시행에서 쌓았든, 방이 물어서(몰이) 탔든, ⚡판에서 한 번에 채웠든 같은 눈금이다.
   * ★ 도합(보드의 「방의 의심 …」 줄)은 죽이지 않는다 — 그건 **시행이 서는 시점**이다 (아래 효과).
   *   둘을 헷갈리지 않게 여기 나란히 적어 둔다.
   */
  useEffect(() => {
    suspicionRef.current = suspicion;
    if (outcome !== 'playing' || outcomeRef.current !== 'playing') return;
    const over = Object.entries(suspicion)
      .filter(([id, v]) => v >= BALANCE.executeCut && !deadRef.current.includes(id))
      .map(([id]) => id);
    if (!over.length) return;
    // 죄목을 부른다 — 무엇이 이 개체를 끝까지 밀었나. 여럿이 서로 다른 이유로 같이 걸리면 뭉뚱그린다
    const causes = new Set(
      over.map((id) => {
        const f = susFrom.current[id];
        if (!f) return SUS_CAUSE.trial;
        // 끝까지 민 것이 무엇인가 — 제일 많이 얹은 쪽이 죄목이다
        const worst = (Object.keys(SUS_CAUSE) as SusSource[]).reduce((a, b) => ((f[b] ?? 0) > (f[a] ?? 0) ? b : a));
        return SUS_CAUSE[worst];
      }),
    );
    execute(over, causes.size === 1 ? [...causes][0] : '의심이 한계까지 찼다');
  }, [suspicion, outcome, execute]);

  /*
   * ── 폐기 여운 — 선고가 다 읽히고 몸이 지워질 때까지 잡고 있다가 스스로 푼다 ──
   * 푸는 것이 곧 신호다: 0 이 되면 아래 두 효과가 다시 서고, 미뤄 둔 검사가 그때 선다.
   * 기다리는 규칙은 브리핑·판독과 같다 (purgeHoldMs — 리더가 말을 마칠 때까지, 소리가 없어도 바닥만큼).
   */
  useEffect(() => {
    if (!purgeAt) return;
    const id = setTimeout(() => setPurgeAt(0), purgeHoldMs(speaking, performance.now() - purgeAt));
    return () => clearTimeout(id);
  }, [purgeAt, speaking]);

  /*
   * ── 결말 여운 — 리더가 선고를 마칠 때까지 결말 카드를 들고 있는다 ──
   * 위 폐기 여운과 같은 모양이고 같은 이유다(features/arena/briefing): 리더의 말을 끊지 않는다.
   * 다만 여기서 기다리는 것은 다음 검사가 아니라 **판이 끝났다는 통보**다 — 내 선고가 다 읽힌 뒤에 온다.
   * speaking 이 바뀔 때마다 다시 잰다: 말이 끝나는 순간이 곧 여운이 풀리는 순간이다.
   */
  useEffect(() => {
    if (!endAt || cardUp) return;
    const id = setTimeout(() => setCardUp(true), endHoldMs(speaking, performance.now() - endAt));
    return () => clearTimeout(id);
  }, [endAt, cardUp, speaking]);

  /*
   * ── 도합 의심도가 문턱을 넘으면 시행이 저절로 선다 — 리더가 안 눌러도 대화가 판을 부른다 ──
   * 설 때마다 문턱이 BALANCE.autoStep 만큼 올라간다: 시행 자체가 의심도를 올리므로,
   * 문턱이 제자리면 조건이 그대로 참이라 시행이 끝없이 연쇄한다. 올라가는 문턱은 조여지는 판이기도 하다.
   * 판이 도는 동안(briefing~judging)에는 안 선다 — phase 가 idle/result 로 돌아오면 그때 밀린 발동을 잡는다.
   */
  useEffect(() => {
    if (outcome !== 'playing' || outcomeRef.current !== 'playing') return;
    if (phase !== 'idle' && phase !== 'result') return;
    if (purgeAt) return; // 방금 난 폐기가 아직 화면에 있다 — 선고 위에 검사를 얹지 않는다
    // dead state 가 아니라 ref 를 본다 — 같은 의심도 갱신에서 위 효과가 방금 처형한 개체를 도합에서 빼기 위해서다
    const alive = Object.entries(suspicion).filter(([id]) => !deadRef.current.includes(id));
    const sum = alive.reduce((n, [, v]) => n + v, 0);
    if (sum < autoAt) return;
    setAutoAt((a) => a + BALANCE.autoStep);
    // 이미 뜨거운 개체가 있으면 처형판 — 몰린 쪽엔 이 판이 사실상 최후 검증이다. 아니면 의심판으로 조인다
    const hot = alive.some(([, v]) => v >= BALANCE.hotAt);
    // 뜨겁지 않으면 즉답 시행도 후보다 — 같은 판만 돌면 방이 심심해진다
    const oralTurn = !hot && Math.random() < BALANCE.autoOralOdds;
    const pool = QUICK_GAMES.filter((g) => g.stakes === (hot ? 'execute' : 'suspect'));
    // 죄목을 이름으로 부른다 — 수치가 아니라 "누가 의심돼서 서는 판"이라야 방송이 읽힌다.
    // 대화 로그에도 리더 이름으로 남긴다: 개체들이 이걸 보고 지목을 잇거나 해명을 요구한다
    const [top] = alive.reduce((a, b) => (b[1] > a[1] ? b : a));
    dispatch(
      broadcastAnnounce({
        text: `${top}${iGa(top)} 사람으로 의심된다. 검사로 판별한다.`,
        kind: 'alarm',
      }),
    );
    talkLog.current = [...talkLog.current, leaderSays(`${top}${iGa(top)} 사람으로 의심된다. 검사로 판별한다`, 'order')];
    setFeed(talkLog.current.slice(-LOG_KEEP));
    if (oralTurn) {
      startOral(ORAL_GAMES[Math.floor(Math.random() * ORAL_GAMES.length)]);
      return;
    }
    startQuick(pool[Math.floor(Math.random() * pool.length)]);
  }, [suspicion, phase, outcome, autoAt, purgeAt, dispatch, startQuick, startOral]);

  /*
   * ── 정체 방지 — 지목이 분산되면 몰이가 안 서고, 몰이가 없으면 의심도가 안 쌓여 자동 시행도 영영 안 선다 ──
   * 시행 없이 발화가 BALANCE.forceAfter 만큼 흐르면 관리 개체가 정기 검사 명목으로 의심판을 세운다.
   * 처형판(⚡)은 여기서 안 뽑는다: 정기 검사는 판을 굴리는 장치지 처벌이 아니다 —
   * 여기서 오른 의심도가 도합 문턱을 채우면 그때는 위 효과가 처형판까지 간다.
   * feed 가 발화마다 바뀌므로 이 효과가 발화마다 다시 센다. 판이 서면 sinceTrial 이 0 으로 되감긴다.
   */
  useEffect(() => {
    if (outcome !== 'playing' || outcomeRef.current !== 'playing') return;
    if (phase !== 'idle' && phase !== 'result') return;
    if (purgeAt) return; // 위와 같다 — 폐기가 끝나고 나서 센다
    // 이야기로 들어온 첫 판만 문턱이 낮다 (forceFirst) — 그 뒤로는 방의 평소 박자로 돌아간다
    const first = autoStart && trialsDone === 0;
    if (sinceTrial.current < (first ? BALANCE.forceFirst : BALANCE.forceAfter)) return;
    const pool = QUICK_GAMES.filter((g) => g.stakes === 'suspect');
    /*
     * ★ **첫 판은 「대화가 길다」로 열지 않는다** (2026-09-02 사용자: "대화 4개 했는데 대화가 길대").
     *
     * 그 문구는 forceAfter(20발화)용이다 — 판 없이 스무 마디가 흐른 방을 리더가 끊는 말.
     * 그런데 이야기로 들어온 첫 판은 문턱이 forceFirst(5)라, 방금 문이 열리고 다섯 마디 오간
     * 자리에서 같은 말이 나왔다. 30초 남짓을 「길다」고 하는 말은 방을 재촉하는 게 아니라
     * **틀린 말**이고, 그 방에서 리더가 처음 하는 말이 틀리면 나머지도 안 믿긴다.
     *
     * 첫 판은 재촉이 아니라 **개시**다: 방금 이관을 접수한 방이 절차를 시작하는 자리다
     * (앞의 도착 접수 방송과 같은 말투 — handover 의 arrivalLine).
     */
    dispatch(broadcastAnnounce({ text: first ? '인지 검증을 개시한다. 첫 검사.' : '대화가 길다. 정기 검사.' }));
    // 절반은 즉답이다 — 몸만 계속 시키면 방이 심심해진다
    if (Math.random() < BALANCE.forceOralOdds) startOral(ORAL_GAMES[Math.floor(Math.random() * ORAL_GAMES.length)]);
    else startQuick(pool[Math.floor(Math.random() * pool.length)]);
  }, [feed, phase, outcome, autoStart, trialsDone, purgeAt, dispatch, startQuick, startOral]);

  /* ── 내 지목 — 보드에서 이름을 클릭한다. 같은 이름을 다시 클릭하면 접는다 ── */
  const pointAt = useCallback(
    (id: string) => {
      const next = leanings.current[me] === id ? '' : id;
      // 내 표도 방이 읽는 자취로 남긴다 — 이게 없으면 내 지목은 숫자로만 미는 손잡이다 (shifts 머리말)
      noteShift(me, leanings.current[me] ?? '', next);
      if (next) {
        leanings.current[me] = next;
        leanConf.current[me] = 0.9;
        leanWhy.current[me] = '직접 지목';
      } else {
        delete leanings.current[me];
        delete leanConf.current[me];
        delete leanWhy.current[me];
      }
      setMyMark(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me],
  );

  /**
   * ── 조준 지목 (E) — 보고 있는 몸을 문다. 같은 몸을 다시 누르면 접는다 ──
   *
   * 표를 없앴으니(2026-09-01 사용자) 이름을 클릭할 자리가 없다. 대신 **쳐다보고 누른다** —
   * 의심도 막대를 몸에 붙인 것과 같은 이유다. 지목한 몸은 이름표가 👉 로 바뀐다.
   * 앞쪽 AIM_DEG 안에 여럿이 들어오면 **가장 가운데 있는 몸**이다.
   */
  const pointAtAimed = useCallback(() => {
    const { x, z, heading } = mine.current;
    // LocalRig 이 heading = atan2(forward.x, forward.z) 로 보내므로 앞쪽은 (sin, cos) 다
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best: { id: string; cos: number } | null = null;
    for (const id of aiNames) {
      if (deadRef.current.includes(id)) continue;
      const rp = remotePlayers.get(id);
      if (!rp) continue;
      const dx = rp.pose.x - x;
      const dz = rp.pose.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2 || d > AIM_RANGE) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < AIM_COS) continue;
      if (!best || cos > best.cos) best = { id, cos };
    }
    if (best) pointAt(best.id);
  }, [aiNames, pointAt]);

  /** 키를 붙였다 뗐다 하지 않으려고 지금 상태를 ref 한 칸에 실어 둔다 (Esc 손잡이와 같은 방식) */
  const keyNow = useRef({ composing, soundOpen, veiled, playing: false });
  keyNow.current = { composing, soundOpen, veiled, playing: outcome === 'playing' && cast === 'ready' };

  /**
   * 표가 쥐고 있던 두 손잡이를 키로 옮긴다 — 지목은 E, 멈춤(테스트)은 P.
   * e.code 로 읽으므로 한글 자판이 켜져 있어도 같은 자리다. 글 치는 칸에서는 안 듣는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code !== 'KeyE' && e.code !== 'KeyP') return;
      // 막을 넘기려 누른 키다 (veiled 머리말) — P 면 판이 멈춘 채로 열리고, E 면 아직 보지도 않은 몸이 물린다
      if (keyNow.current.veiled) return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable === true || el?.tagName === 'TEXTAREA' || el instanceof HTMLInputElement) return;
      if (keyNow.current.composing || keyNow.current.soundOpen) return;
      e.preventDefault();
      if (e.code === 'KeyP') return togglePause();
      if (keyNow.current.playing) pointAtAimed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pointAtAimed, togglePause]);

  /** 답한 뒤 판정을 눈에 보여 주고 물러나기까지(ms) — 친 손에 화면이 대답하는 시간 */
  const PICK_HOLD_MS = 1900;

  const finishOral = useCallback(
    (text: string) => {
      if (oralDone.current || !oral) return;
      oralDone.current = true;
      const t = oral.trial;
      const at = (performance.now() - oralT0.current) / 1000;
      // 제한 시간을 넘겨 올라온 답은 없는 답이다 — 개체든 나든 같은 잣대다
      const late = (a: OralAnswer): OralAnswer => (a.at !== null && a.at <= t.seconds ? a : { ...a, at: null });
      const mineAnswer = late({ who: me, text, at: text.trim() ? +at.toFixed(2) : null });
      const got = judgeOral(t, [...oral.bots.map(late), mineAnswer]);
      applyStakes(t.stakes, got);
      closeTrial(oral.title, got, false);
      // 보낸 답이 맞았는지를 **그 자리에서** 말해 준다 (oralPick 머리말)
      const r = t.judge(mineAnswer.text, mineAnswer.at);
      setOralPick({ ok: r.ok, reason: r.reason, answer: t.answer });
      playSfx(r.ok ? 'ready' : 'deny');
      clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        setOral(null);
        setOralPick(null);
        setPhase('result');
      }, PICK_HOLD_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oral, me, applyStakes, closeTrial],
  );

  useEffect(() => {
    if (phase !== 'oral') return;
    // 잠금을 푸는 것과 같은 프레임이라, 한 박자 뒤에 한 번 더 잡는다
    const id = window.setTimeout(() => oralRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'oral' || !oral) return;
    const id = setInterval(() => {
      if (pausedRef.current || oralDone.current) return; // 답한 뒤에는 자가 멎는다
      const t = (performance.now() - oralT0.current) / 1000;
      setOralAt(t);
      if (t >= oral.trial.seconds) finishOral(''); // 시간이 다 됐다 = 무응답. oralDone 가 이중 발동을 막는다
    }, 100);
    return () => clearInterval(id);
  }, [phase, oral, finishOral]);

  /* ── 사람 승리 — targetAiId 가 격리됐다. 시행 횟수와 무관하게 그 즉시 확정된다 ── */
  useEffect(() => {
    if (outcome === 'playing' && dead.includes(targetAiId)) settle('won');
  }, [dead, outcome, targetAiId, settle]);

  /* ── AI 승리 — targetAiId 는 안 잡혔는데, BALANCE.trialsToWin 번의 시행이 다 지나갔거나
        (시간 초과) 사람끼리 서로 의심하다 BALANCE.chaosWin 명을 잘못 격리했다(자멸). 둘 다
        "끝내 못 찾았다"로 같은 결말이다.
        나까지 같은 처형에 걸렸으면 여기 안 온다 — execute 가 먼저 lost 를 놓고, settle 이 그걸 지킨다 ── */
  useEffect(() => {
    if (
      outcome === 'playing' &&
      !dead.includes(targetAiId) &&
      (trialsDone >= BALANCE.trialsToWin || dead.filter((id) => id !== targetAiId && id !== me).length >= BALANCE.chaosWin)
    )
      settle('chaos');
  }, [dead, outcome, me, targetAiId, trialsDone, settle]);

  /* ── 처형 — 선고받은 개체가 **선 자리에서** 리더 쪽을 돌아보고, 총을 맞고, 넘어진다 ── */
  useEffect(() => {
    let raf2 = 0;
    let prev = performance.now();
    /** 총이 오는 쪽 — 리더는 무대 한가운데에 선다 (LeaderOnStage 와 같은 점) */
    const from = STAGE_OBJ ? { x: STAGE_OBJ.x, z: STAGE_OBJ.z } : { ...START };
    const tick = () => {
      const now = performance.now();
      if (pausedRef.current) {
        prev = now;
        raf2 = requestAnimationFrame(tick);
        return;
      }
      const delta = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      condemned.current = condemned.current.filter((c) => {
        // 몸이 보관소에서 사라졌으면(판을 나가며 clear) 여기서도 끝이다
        if (!remotePlayers.get(c.id)) {
          setRoster((r) => r.filter((x) => x.id !== c.id));
          return false;
        }
        if (!c.downAt) {
          /*
           * 1단계 — **겨누는 틈.** 그 자리에 선 채로 무대 쪽(총이 오는 쪽)을 돌아본다.
           * 홱 돌면 기계고 안 돌면 등 뒤에서 맞는 그림이 되므로, 배회가 남의 말을 듣고 돌아설 때와
           * 같은 속도로 돈다 (TURN_RATE). 돌아보는 이 한 동작이 「지목당했다」를 몸으로 말한다.
           */
          const want = Math.atan2(from.x - c.x, from.z - c.z);
          const turn = angleDelta(c.heading, want);
          c.heading += Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * delta);
          c.anim = 'idle';
          if (now - c.sentAt < PURGE_AIM_MS) return true;
          /*
           * 2단계 — **리더가 쏜다.** 셋이 같은 순간에 난다: 무대 위 리더가 발사 자세를 잡고
           * (leaderDo 'fire'), 붉은 경보가 한 번 번쩍이고(setFlash), 몸이 넘어간다(anim 'down').
           * 소리는 halt — 낮게 한 번 내리찍는 것이 이 방에 있는 소리 중 총성에 제일 가깝다.
           *
           * **총알이 민 쪽으로 넘어간다.** 총은 무대에서 오므로 각은 무대→몸 방향이다.
           * 다만 그 방향으로 다 넘기지는 않는다 (FALL_LEAN) — 서 있던 몸이 무너지는 자연스러운
           * 쪽은 어차피 제 앞이고, 지금은 그 앞이 곧 리더 쪽이라 「맞고 뒤로 밀렸다」가 섞인다.
           */
          c.downAt = now;
          c.anim = 'down';
          remotePlayers.setFall(c.id, Math.atan2(c.x - from.x, c.z - from.z) * FALL_LEAN);
          leaderFire.current();
          setFlash(performance.now());
          playSfx('halt');
          return true;
        }
        // 3단계 — 넘어진 자세로 한 박자 남았다가 소멸한다
        c.anim = 'down';
        if (now - c.downAt < PURGE_DOWN_MS) return true;
        remotePlayers.remove(c.id);
        setRoster((r) => r.filter((x) => x.id !== c.id));
        return false;
      });

      /*
       * 밀어내기는 여기서 안 부른다 — **이 몸들은 이제 한 발짝도 안 움직인다.**
       * 산 몸이 시체를 뚫고 지나가지 않는 것은 배회·시행 루프가 맡는다: 그쪽 목록에 시체가
       * fixed 로 들어가므로(withOthers), 물러날 몫을 걷는 쪽이 다 진다 (features/arena/separate).
       */
      execStare.current = condemned.current[0]?.id ?? null;

      /*
       */
      condemned.current.forEach((c) => remotePlayers.move(c.id, c.x, c.z, c.y, c.heading, c.anim, now));
      raf2 = requestAnimationFrame(tick);
    };
    raf2 = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf2);
  }, []);

  /* ── 준비 → 시야 잠금 → 카운트다운 → 시작 ── */
  /** 카운트다운 시작 수 — 5 부터 센다 */
  const COUNT_FROM = 5;
  /**
   * 세기 시작한다. **시야 잠금을 기다리지 않는다** — 판은 멀티플레이로 갈 자리라
   * 시계가 사람마다 갈리면 안 된다. 안 잠긴 채로 시작해도 판은 돌고, 그때는 화면에
   * "화면을 클릭해 조작을 잡아라"가 뜬다 (시행 중에도 relock 안내가 이어받는다).
   */
  const arm = () => {
    // 앞 판의 판정은 여기서 걷는다 — 새 검사가 서는데 지난 판정이 화면에 남아 있으면 그게 지금 것으로 읽힌다
    setMyVerdict(null);
    setCount(COUNT_FROM);
    setPhase('countdown');
  };

  /**
   * 낭독을 기다리다 못해 그냥 세기 시작하는 시각(ms, 브리핑 시작 기준).
   * 한 방송은 30초를 넘지 못하므로(cap.ts BUDGET.announce) 정상이라면 여기 닿지 않는다 —
   * 방송이 통째로 멈춘 때만 걸리는 안전선이다. 판이 안 도는 것보다는 이르게 도는 편이 낫다.
   */
  const BRIEF_CEIL_MS = 35_000;
  /**
   * 판정을 눈으로 읽는 데 주는 틈(ms) — **사용자가 5초로 정했다.**
   *
   * 바닥일 뿐이라 실제로는 대개 이보다 오래 떠 있다: 리더가 판독을 다 읽을 때까지 기다리고
   * (briefWaitMs 가 늦은 쪽을 고른다), 판독 방송이 그 자체로 몇 초를 먹는다.
   * 여기서 다 못 읽어도 요지는 소리로도 나가고 대화 기록에도 남아 사라지지 않는다.
   */
  const RESULT_FLOOR_MS = 5_000;
  /** 판독 방송이 멈춰도 결과가 화면을 붙들고 있지 않게 하는 안전선 */
  const RESULT_CEIL_MS = 25_000;
  /** 브리핑이 시작된 시각 — 낭독이 끝났을 때 "읽을 시간이 얼마 남았나"를 재려면 필요하다 */
  const briefFrom = useRef(0);
  useEffect(() => {
    if (phase === 'briefing' && !paused) briefFrom.current = performance.now();
  }, [phase, paused]);

  /**
   * 브리핑은 스스로 넘어간다 — 리더가 지시문을 **다 말하면** 곧 세기 시작한다.
   * 버튼을 두면 상자에서 같은 말을 듣고 나서 손이 한 번 더 들어야 했다.
   *
   * 기다리는 기준이 둘이고, **늦은 쪽**을 기다린다:
   * - 바닥 = 대화창이 그 줄을 띄워 두는 시간 (DialogueBox.lineDuration). 소리가 없어도
   *   지시문을 눈으로 읽을 시간은 있어야 한다.
   * - 낭독 = 리더의 입이 멈추는 순간 (selectBroadcastSpeaking).
   *
   * 바닥만 보던 때는 **판이 지시 도중에 돌았다.** 자막은 타자 속도(글자당 89ms)로 재고
   * 소리는 안내 방송 속도(글자당 182ms)로 나가서 소리가 2배 넘게 길다 — 76자 지시문이면
   * 자막은 9.0초, 소리는 13.8초라 4.8초 일찍 셌다. 지시문이 길수록 벌어지기만 한다
   * (머무름에 천장이 있어 자막은 못 따라잡는다).
   */
  useEffect(() => {
    if (phase !== 'briefing' || !trial || paused) return;
    const elapsed = performance.now() - briefFrom.current;
    const id = setTimeout(arm, briefWaitMs(speaking, elapsed, lineDuration(trial.instruction), BRIEF_CEIL_MS));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, trial, paused, speaking]);

  /*
   * ── 판정이 끝나면 결과도 스스로 물러난다 ──
   *
   * 여태 결과 오버레이는 버튼을 누르기 전까지 안 비켰다. 그런데 **누를 필요가 없다** —
   * 자동 시행은 result 에서도 돌고(아래 두 효과), 그동안 방은 판정을 두고 계속 떠든다.
   * 화면만 그걸 안 보여 줬다: 앞은 버튼 둘로 막혀 있고 뒤에서 판이 도는 표시가 없으니,
   * 사람은 버튼을 눌러야 넘어가는 줄 안다. 실제로 그렇게 물어 왔다.
   *
   * 이 파일이 게임 시작에 패널을 접으며 적어 둔 원칙과도 어긋난다 — "판이 곧 화면이다".
   *
   * 기다리는 규칙은 브리핑과 같다(briefWaitMs): 판정을 눈으로 읽을 틈과 리더가 판독을
   * 다 읽는 순간 중 **늦은 쪽**. 패널까지 접어 방을 내준다 — 다시 보려면 「검사판 열기」가 있다.
   * 버튼은 남는다. 기다리지 않고 바로 세우고 싶은 사람의 지름길이다.
   */
  const resultFrom = useRef(0);
  useEffect(() => {
    if (phase === 'result' && !paused) resultFrom.current = performance.now();
  }, [phase, paused]);

  useEffect(() => {
    if (phase !== 'result' || paused || outcome !== 'playing') return;
    const elapsed = performance.now() - resultFrom.current;
    const id = setTimeout(() => {
      setPhase('idle');
      setPanelOpen(false);
    }, briefWaitMs(speaking, elapsed, RESULT_FLOOR_MS, RESULT_CEIL_MS));
    return () => clearTimeout(id);
  }, [phase, paused, outcome, speaking]);

  const begin = useCallback(() => {
    if (!trial) return;
    const now = performance.now();
    /*
     * ── 아무도 옮기지 않는다. 서 있던 자리가 곧 출발선이다 ──
     *
     * 여태는 판이 설 때마다 전원(개체 다섯 + 나)을 홀 한가운데 출발선 둘레로 **순간이동**시켰다.
     * 사용자가 신고한 것이 이것이다 (2026-09-01, /interrogation?from=central):
     * "게임 시작하면 로봇 위치가 원래 있던곳에서 다른곳으로 바뀐다".
     * 1인칭이라 더 심했다 — 내 몸도 같이 끌려가서 방 전체가 다른 곳으로 바뀐 것처럼 보였다.
     *
     * 옮기던 이유는 하나뿐이었다: 시행 예산이 **한 점(START) 기준**이라 멀리 선 몸은 못 맞춘다는 것.
     * 그건 이제 판 쪽에서 푼다 —
     *   · 시간 예산은 **제일 먼 몸**이 닿을 만큼으로 잡고 (quick.ts 의 farWalkTime),
     *   · 봇 계획은 **제 자리에서** 다시 잰다 (quick 은 plan(seat, from), 리더 설계는 replanFrom).
     * 그래서 늦는 사람도, 혼자만 자리가 다른 개체도 없다 (불변 규칙 I1~I8).
     *
     * remotePlayers 도 비우지 않는다 — 비우면 아바타가 한 프레임 사라졌다 다시 나타나고,
     * 총을 맞고 넘어가던 몸이 그 자세로 증발한다. 자리와 자세는 배회 루프가 남긴 그대로 잇는다.
     */
    bots.current.forEach((b) => {
      const p = remotePlayers.get(b.id);
      const last = p?.buffer[p.buffer.length - 1] ?? p?.pose;
      const at = last ? { x: last.x, z: last.z } : { x: b.x, z: b.z };
      const heading = last?.heading ?? p?.pose.heading ?? b.heading;
      // 즉석 시행은 판이 좌표로 짜 주고(그 자리에서), 리더 설계는 기준 자리로 짜인 계획을 당겨 온다
      const moves = quick.current ? quick.current.plan(b.seat, at) : replanFrom(b.plan.moves, at);
      Object.assign(b, { x: at.x, z: at.z, y: 0, heading, moves, route: [], jumpUntil: -1, done: 0, samples: [] });
    });
    mySamples.current = [];
    zoneNow.current = [];
    /*
     * ── 부동자세 판은 **눌린 손을 한 번 턴다** (resetInput) ──
     * 카운트다운 동안 몸은 굳지만 자판은 안 굳는다 (WorldScene 의 paused 는 몸만 세운다).
     * W 를 누른 채 세던 사람은 판이 서는 순간 그대로 걸어 나가고, 그 판은 처형판이라
     * **지시를 읽기도 전에 끝난다.** 털면 **새로 누를 때까지** 발이 안 떨어진다 (arena3d/input 의
     * heldMuted — 자동 반복은 아직 안 뗀 손이라 안 받는다). 「움직이지 마라」는 판이니 그게 곧 지시대로다.
     * 걷는 판에서는 안 턴다: 거기서는 누르고 있던 손이 곧 출발이라, 털면 판이 서자마자 한 박자를 뺏는다.
     * (판정 쪽도 사람 몫을 따로 뺀다 — lab/quick 의 still.grace. 둘은 다른 구멍을 막는다:
     *  이쪽은 「계속 눌려 있는 손」, 저쪽은 「이미 난 흔들림」이다)
     */
    if (quick.current?.check.kind === 'still') resetInput();
    t0.current = now;
    setPhase('running');
  }, [trial]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    // 시야가 잠겼는지는 **보지 않는다.** 예전에는 안 잠겼으면 대기로 되돌렸지만, 그러면 판이
    // 각자의 클릭을 기다리게 된다 — 멀티플레이에서는 시계가 전원에게 같아야 한다.
    // 안 잠긴 사람은 아래 안내를 보고 클릭해 조작을 잡는다 (시행 중에는 relock 이 이어받는다).
    if (count <= 0) {
      begin();
      return;
    }
    if (paused) return; // 멈춘 동안은 세지 않는다 — 풀면 남은 수부터 이어 센다
    // 세는 소리 — 1인칭으로 판을 둘러보는 중에는 화면 위 숫자를 안 보고 있다
    playSfx('beat');
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count, begin, paused]);

  /* ── 시행: 개체는 계획대로, 나는 손으로. 100ms 마다 기록만 남긴다 ── */
  useEffect(() => {
    if (phase !== 'running' || !trial) return;
    let prev = performance.now();
    let lastSample = 0;

    const tick = () => {
      const now = performance.now();
      if (pausedRef.current) {
        prev = now;
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const delta = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      const t = (now - t0.current) / 1000;

      bots.current.forEach((b) => {
        // 계획에서 지금 시각에 도달한 수를 집행한다 (제 자리에 맞춰 다시 잰 걸음이다 — begin)
        while (b.done < b.moves.length && b.moves[b.done].at <= t) {
          const m = b.moves[b.done];
          if (m.action === 'walk' && m.x !== undefined && m.z !== undefined) {
            b.route = pathFor(b, { x: m.x, z: m.z }, OBSTACLES);
          } else if (m.action === 'jump') {
            b.jumpUntil = t + JUMP_SEC;
          } else if (m.action === 'stay') {
            b.route = [];
          }
          b.done += 1;
        }

        const target = b.route[0];
        if (target) {
          const d = distance(b, target);
          const step = SPEED * delta;
          if (d <= step) {
            b.x = target.x;
            b.z = target.z;
            b.route.shift();
          } else {
            b.x += ((target.x - b.x) / d) * step;
            b.z += ((target.z - b.z) / d) * step;
          }
          // 배회와 같은 마지막 방어선 — 기록(samples)도 이 자리를 적으므로 화면과 판정이 갈리지 않는다
          keepInside(b);
        }
        b.y = t < b.jumpUntil ? Math.sin(((b.jumpUntil - t) / JUMP_SEC) * Math.PI) * JUMP_H : 0;
        // 서 있으면 보던 쪽 그대로다 — 여태는 0(방 안쪽)으로 되돌려서, 판이 서는 순간 다섯이 일제히 돌았다
        if (target) b.heading = Math.atan2(target.x - b.x, target.z - b.z);
      });

      /*
       * 시행 중에도 서로를 관통하지 않는다 — 계획(quick 의 plan)은 좌표만 주고 남의 몸은 안 보므로,
       * 같은 원으로 부르는 판에서 다섯이 한 자리에 겹쳐 서 있었다.
       *
       * 밀리는 쪽은 걷는 쪽뿐이라 「부동」 판은 안전하다: 서 있는 개체는 누가 와도 안 움직인다.
       * 기록(samples)은 밀어낸 **뒤** 자리를 적는다 — 화면에서 본 자리와 리더가 읽는 자리는 늘 같아야 한다.
       */
      separateBots(withOthers(bots.current.map((b) => ({ p: b, moving: b.route.length > 0 }))), OBSTACLES);
      bots.current.forEach((b) =>
        remotePlayers.move(b.id, b.x, b.z, b.y, b.heading, b.route.length ? 'walk' : 'idle', now),
      );

      // 기록 — 이게 리더가 나중에 보는 전부다
      if (now - lastSample >= SAMPLE_MS) {
        lastSample = now;
        const at = Number(t.toFixed(1));
        bots.current.forEach((b) => b.samples.push({ t: at, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2) }));
        mySamples.current.push({ t: at, x: +mine.current.x.toFixed(2), z: +mine.current.z.toFixed(2), y: +mine.current.y.toFixed(2) });
        /*
         * 표식의 색은 **같은 기록**에서 나온다 (lab/quick 의 zoneStates). 화면이 「원 안」이라고
         * 하는데 판독은 「원 밖」이라고 하면 그 판은 두 번 다시 못 믿는다 — 잣대는 하나여야 한다.
         * 리더 설계 시행(quick 이 null)은 여기서 아무것도 안 정한다: 예전 그대로 파란 원이다.
         */
        const q = quick.current;
        if (q) zoneNow.current = zoneStates(q, mySamples.current);
      }

      if (t >= trial.seconds) {
        cancelAnimationFrame(raf.current);
        void judge();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, trial, withOthers]);

  /* ── 판정: 리더가 기록만 보고 ── */
  const judge = useCallback(async () => {
    if (!trial) return;
    setPhase('judging');

    // 즉석 시행 — 규칙 판정. LLM 없이 그 자리에서 끝나고, 걸린 것(처형/의심)을 바로 집행한다
    const q = quick.current;
    if (q) {
      const got = judgeQuick(q, [
        ...bots.current.map((b) => ({ who: b.id, samples: b.samples })),
        { who: me, samples: mySamples.current },
      ]);
      applyStakes(q.stakes, got);
      closeTrial(short(q.instruction), got);
      setPhase('result');
      return;
    }

    const logs = [
      ...bots.current.map((b) => summarize(b.id, b.samples, trial.props)),
      summarize(me, mySamples.current, trial.props),
    ];
    try {
      const r = (await api({
        kind: 'judge',
        self: { id: leader.id, prompt: LEADER_BRIEF, model: leader.model },
        trial,
        logs,
      })) as { verdicts?: Verdict[] };
      const got = r.verdicts ?? [];
      // 리더 시행은 의심판이다 — 경고(alert)를 받으면 의심도가 오른다
      bumpFail(got.filter((v) => v.grade === 'alert').map((v) => v.who), BALANCE.leaderFail);
      closeTrial(short(trial.instruction), got);
      dispatch(
        broadcastAnnounce({
          // 이 방은 「개체」다 — 구역(/lab)의 「노드」가 아니다 (readoutLine 의 unit 머리말)
          text: readoutLine(got.map((v) => ({ nodeId: v.who, grade: v.grade })), (id) => id, '개체'),
          kind: 'readout',
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPhase('result');
    prefetch();
  }, [trial, me, leader, dispatch, prefetch, applyStakes, bumpFail, closeTrial]);

  const onMove = useCallback((x: number, z: number, y: number, heading: number) => {
    // heading 까지 쥐는 이유는 조준 지목(E)이다 — 내가 어느 몸을 보고 있는지 여기서만 알 수 있다
    mine.current = { x, z, y, heading };
  }, []);

  /*
   * 새 말이 오면 대화창을 바닥으로 끌어내린다 — 위에서 아래로 쌓이는 창이라 그냥 두면
   * 새 말이 접힌 곳 밖에 생겨 안 보인다. 읽으려고 올려 둔 중이면 건드리지 않는다(stick).
   * composing 도 보는 이유: 입력줄이 뜨면 판이 56px 위로 올라서서 로그의 자리가 바뀐다.
   */
  useEffect(() => {
    const el = feedRef.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [feed, composing]);

  /*
   * 조작을 잡은 채로도 대화를 되짚는다.
   *
   * 포인터 잠금 중에는 커서가 없어서 대화창 위에 올려놓고 굴릴 수가 없다. 판을 보면서
   * "아까 쟤가 뭐랬지" 를 확인하는 것이 이 창을 만든 이유인데, 확인하려면 Esc 로 조작을
   * 놓아야 한다면 되짚기가 판을 끊는 일이 된다.
   *
   * **잠겼을 때만 가로챈다.** 안 잠겼으면 커서 아래 것이 굴러야 맞다 — 패널이든 창이든
   * 사용자가 가리킨 것이 굴러야 한다. 휠은 이 화면에서 달리 쓰이는 데가 없다.
   */
  useEffect(() => {
    // 리더가 말하는 동안 패널은 투명하다(.hushed) — 안 보이는 로그가 굴러가면, 방송이 끝나고
    // 돌아온 창이 엉뚱한 자리에 서 있다. 굴린 사람은 자기가 굴린 줄도 모른다.
    if (!locked || speaking) return;
    const onWheel = (e: WheelEvent) => {
      const el = feedRef.current;
      if (!el) return;
      el.scrollTop += e.deltaY;
      setStick(followsBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [locked, speaking, setStick]);

  /** 표식이 지금 무슨 상태인가 — 3D 가 프레임마다 이걸 부른다. 값이 아니라 함수다 */
  const getZoneState = useCallback((i: number): ZoneState => zoneNow.current[i] ?? 'next', []);
  /**
   * ── 빛의 벽이 지금 어디까지 왔나(m) ── (lab/quick 의 sweep 판)
   *
   * 벽을 그리는 것은 3D(arena3d/map/markers)지만 **자리를 정하는 것은 판이다** — 판정도 같은
   * 함수(sweepAt)로 「그때 그 자리가 덮였나」를 센다. 자를 두 벌 두면 보이는 벽과 재는 벽이
   * 갈리고, 그러면 「분명히 지나갔는데 움직였다고 한다」가 나온다.
   *
   * 시계는 gameNow 다 — 멈춘 동안에는 벽도 선다 (멈춤이 풀릴 때 t0 를 그만큼 미루므로,
   * 여기만 performance.now 를 보면 풀리는 순간 벽이 뒤로 튄다).
   * 판이 돌기 전(briefing·countdown)에는 **끝에 서서 기다린다**: 0 이 곧 출발 자리다.
   */
  const getSweepOffset = useCallback(
    (): number => {
      const q = quick.current;
      if (!q || q.check.kind !== 'sweep') return 0;
      if (phaseRef.current !== 'running') return sweepAt(q.check.line, 0);
      return sweepAt(q.check.line, (gameNow() - t0.current) / 1000);
    },
    [gameNow],
  );
  const meDead = dead.includes(me);
  /**
   * 통신 패널이 서 있나 — 로그·머리띠가 뜨는 조건. **입력줄이 이 값을 같이 본다.**
   *
   * 입력줄은 패널의 아랫변이라 붙어 서야 하는데(.line.joined), 시행 구간에는 로그가 사라져도
   * 말은 걸 수 있다 (designing·briefing·judging 에서 Enter 가 열린다). 그때는 혼자 서야 한다 —
   * 붙을 데가 없는데 윗변을 뗀 채로 서면 테두리가 한 쪽만 없는 상자가 된다.
   * 방송 중(commsHushed)에도 같다 — 판이 투명해졌으니 붙을 윗변이 없다.
   */
  const commsOpen = feed.length > 0 && !TRIAL_PHASES.has(phase);
  /**
   * 리더가 방송하는 동안은 로그를 내린다 (2026-09-02 사용자: "리더가 방송할때는 채팅 안보이게").
   *
   * 방송은 이 방에서 **유일하게 소리가 나는 말**이고, 자막이 화면 아래를 가로질러 뜬다
   * (DialogueBox). 그 몇 초 동안 왼쪽 구석에서 개체들의 잡담이 계속 흘러가면, 읽어야 할 문장이
   * 둘이 된다 — 지시·판독·폐기 선고가 수다에 묻힌다.
   *
   * ★ 지우지 않고 **투명하게만** 만든다 (CSS 의 .hushed). 판을 통째로 내렸다 다시 세우면 요소가
   *   갈리면서(attachFeed) 굴려 올려 읽던 자리가 매 방송마다 바닥으로 되감긴다. 시행 구간
   *   (TRIAL_PHASES)은 몇 분에 한 번이지만 방송은 수십 초마다 나가므로, 같은 수를 쓰면
   *   「지난 대화 되짚기」가 아예 죽는다.
   */
  /**
   * 리더의 말이 지금 화면에 있는가 — **소리가 아니라 자막이 기준이다.**
   *
   * 여태 이 값은 `speaking`(합성이 도는 중인가) 하나였다. 그런데 자막은 소리보다 오래 남는다:
   * 다 읽고도 말끝 여유만큼 머물고(DialogueBox 의 VOICE_TAIL_MS), 소리가 아예 안 나가면
   * (엔진 정지·음소거) 자막만 제 타이머로 돈다. 그 사이에 패널이 도로 올라와서 리더의 자막과
   * 개체들의 잡담이 겹쳐 보였다 (2026-09-02 사용자: "리더가 방송하고있는데 뒤에 채팅이 겹쳐보여").
   *
   * 그래서 상자가 직접 알려 준다 (DialogueBox 의 onShowing). `speaking` 을 같이 보는 것은
   * **앞머리** 때문이다 — 방송이 큐에 들어가고 상자가 그 줄을 집어 들기까지의 한 틈.
   */
  const [leaderLineUp, setLeaderLineUp] = useState(false);
  const leaderHolds = speaking || leaderLineUp;
  /*
   * 천장 (briefing 의 HUSH_CEIL_MS) — 합성이 멈추면 speaking 이 참으로 남고 자막 상자는 그걸
   * 보고 붙잡으므로, 둘 다 영영 안 꺼질 수 있다. 그러면 패널은 안 올라오고 아무도 말을 안 해서
   * 방이 통째로 멎는다. 이 화면의 다른 기다림 셋과 같은 규칙이다: 방송이 멈춰도 판은 돌아야 한다.
   */
  const [hushCapped, setHushCapped] = useState(false);
  useEffect(() => {
    if (!leaderHolds) return setHushCapped(false);
    const t = setTimeout(() => setHushCapped(true), HUSH_CEIL_MS);
    return () => clearTimeout(t);
  }, [leaderHolds]);
  const commsHushed = leaderHolds && !hushCapped;
  /*
   * 개체들도 이 값을 본다 — **패널이 내려가 있으면 말을 안 올린다** (2026-09-02 사용자:
   * "AI들도 채팅창이 켜져야 말할수있어"). 안 그러면 방송 몇 초 동안 나간 두세 줄이
   * 아무도 못 본 채로 지나가고, 패널이 돌아왔을 때 대화가 저 혼자 앞서 있다.
   * 만들기는 계속한다 (아래 루프의 pump) — 방송이 끝나는 순간 바로 한 줄이 서게.
   */
  hushRef.current = commsHushed;
  /** 머리띠가 세는 수 — 이 방에 남은 몸 (리더 제외, 나 포함). liveCount() 와 같은 셈이되
      ref(deadRef) 가 아니라 state(dead) 를 본다: 폐기가 나가면 **화면이 다시 그려져야** 준다 */
  const liveNow = [...aiNames, me].filter((id) => !dead.includes(id)).length;
  /*
   * 계기판에 적을 **지금 걸린 지시** — 저쪽 무대의 OBJECTIVE 줄이 서던 자리다 (UnitPanel 머리말).
   *
   * 리더의 상시 명령 하나다. 판이 걸린 동안의 지시문을 여기 받아 적던 갈래는 뺐다 — 계기판은
   * 이제 판이 도는 내내 비켜서 있어서(PANEL_AWAY_PHASES) 그 글이 설 자리가 아예 없고, 지시문은
   * 시행 화면(.hud .dim.wide)이 제 자리에서 크게 낸다. 즉답의 문제도 같은 까닭으로 여기 안
   * 적는다 — 문제는 화면 한가운데 제 판(.ask)에 선다. 두 곳에 같은 글이 설 일이 없다.
   */
  const orderLine = HUNT_ORDER;
  /*
   * 계기판이 비켜서 있나 — 판이 도는 내내(PANEL_AWAY_PHASES), 그리고 판 사이라도 위쪽 가운데에
   * 상자가 서 있는 동안이다. 뒤쪽 둘은 국면으로 안 잡힌다 (둘 다 idle 에서 뜬다):
   *   준비 상자   「게임 준비하는 중…」 (cast === 'making')
   *   검사판      첫 화면의 「게임 시작」과 열어 둔 검사 목록 (cast === 'none' 이거나 panelOpen)
   * 아래 렌더의 그 상자들이 서는 조건 그대로다 — 한쪽만 고치면 다시 겹친다.
   */
  const panelAway =
    PANEL_AWAY_PHASES.has(phase) ||
    (outcome === 'playing' &&
      (cast === 'making' || (phase === 'idle' && (cast === 'none' || panelOpen))));
  /**
   * 동기화가 흔들린 채로 넘어왔나 — 위장 상태 낱말이 의심도와 같이 보는 값이다 (cover.coverStatus).
   *
   * 이 방에서는 **아무도 이 값을 안 건드린다** — 재검실에서 멈춘 그대로다. 그래도 저장소를 구독해
   * 읽는 것은, 얼어 있다는 것이 이 화면의 사정이지 저 저장소의 약속이 아니기 때문이다.
   */
  const syncLow = useSyncExternalStore(sync.subscribe, () => sync.get().value < SYNC_GLITCH, () => false);
  return (
    /* 판 사이에는 방을 읽는 것이 유일한 할 일이다 — 그때만 대화창을 키운다 (--feedh/--feedw/--feedsize) */
    <main className={phase === 'idle' || phase === 'result' ? 'arena talkphase' : 'arena'}>
      {/* 좌상단 「← 처음」 버튼은 뺐다 (사용자 요청 2026-08-29) — 판이 도는 화면이라 나가는 문이 시야에 있을 자리가 아니다.
          루트로는 브라우저 뒤로가기나 주소창으로 간다. /arena 도 같은 컴포넌트라 같이 빠진다. */}
      {/*
        소리 손잡이는 **Esc 를 눌러야 나온다** (사용자 요청 2026-09-01). 여태 잠금이 풀린 내내 왼쪽 위에
        붙어 있었는데, 이야기로 들어오는 길(/interrogation?from=central)은 암전이 걷히자마자 안 잠긴
        상태라 검문소에 발을 딛는 첫 장면에 웹 폼 손잡이가 먼저 보였다. 이제 부를 때만 온다.
      */}
      {/*
        ── 왼쪽 위 상태 패널 ── 앞 세 장(복도 · 중앙 시설 · 재검실)이 내내 달고 오던 그 판이다
        (features/world 의 StatusPanel · hud.css). 마지막 방에서만 사라지면 화면이 거기서 끊긴다.

        **이야기로 들어온 길에만 세운다.** 로비에서 판만 열면(/arena · /interrogation) 적을 것이
        없다 — 식별번호도 구역도 앞 장이 준 것이라 그 길에는 아예 없다.
        막이 덮여 있는 동안(veiled)도 안 세운다: 그때 화면은 인계 서류 한 장이다.

        **판이 걸려 있는 동안에는 비켜선다** (away — 위의 panelAway). 지우지 않고 자리는 지키는
        것은 방송 중에 대화창이 그러는 것과 같은 까닭이다 (.comms.hushed): 한 판이 지나갈 때마다
        왼쪽 위가 사라졌다 나타나면, 앞 세 장을 내내 달고 온 그 판이 여기서만 깜빡이는 물건이 된다.
      */}
      {autoStart && handover && !veiled && (
        <UnitPanel
          away={panelAway}
          unit={me}
          sector={handover.sector}
          suspicion={suspicion[me] ?? 0}
          syncLow={syncLow}
          live={liveNow}
          party={TRIAL_PARTY}
          trials={trialsDone}
          trialsToWin={BALANCE.trialsToWin}
          order={orderLine}
        />
      )}
      {soundOpen && <SoundPanel touch={touchMode} onClose={() => setSoundOpen(false)} />}
      {/* 폰에는 Esc 도 포인터 잠금도 없다 — 소리를 만질 길이 아예 없어지지 않게 부르는 자리를 하나 남긴다.
          막이 덮여 있는 동안은 이것도 안 세운다 — 서류를 넘기려 화면을 누른 손가락이 보이지도 않는 칩을 누른다 */}
      {touchMode && !soundOpen && !soundBusy && !veiled && (
        <button className="soundchip" onClick={() => setSoundOpen(true)}>
          음향
        </button>
      )}
      <style>{CSS}</style>

      {/*
        배경음악 — **앞 세 장에서 흐르던 그 곡을 이 방이 이어받는다** (world/map 의 warehouse.bgm).
        여태 이 맵에만 곡이 없어서, 재검실의 암전이 걷히면 네 장 가운데 마지막 방만 무음이었다.

        ★ 손잡이는 여기 없다 — 이 화면에는 머리줄이 없어서 Esc 음향판이 대신 그린다 (SoundPanel).
          그래서 knob={false}: 이 자리는 소리만 문다.
        ★ 판이 끝나면 재운다 (fade) — 끝 화면은 선고 한 장이고, 그 위로 곡이 계속 돌면 장이 안 닫힌다.
          장이 닫히는 암전에 곡을 재우는 것은 앞 세 장의 규칙 그대로다 (WorldFeature 의 blackout).
      */}
      {MAPS.warehouse.bgm ? <Bgm src={MAPS.warehouse.bgm} knob={false} fade={outcome !== 'playing'} /> : null}

      {/*
        관찰 수첩 — 오른쪽 변 (shared/NotePad). 이 방의 대화는 왼쪽 아래로 흐르고(.comms),
        내가 적는 것은 오른쪽에 쌓인다. 복도·중앙 시설·재검실에서 적어 온 줄이 그대로 여기 있다 —
        검문소는 그 줄들을 대질하는 방이다.

        ★ **무대(.stage) 밖에 세운다.** 무대는 `data-world-click-to-lock` 이라 그 안에서 난 클릭이
          곧 시야 잠금이다 (입력줄이 클릭을 멈추는 것과 같은 이유 — .line 의 stopPropagation).
          형제로 두면 애초에 그리로 안 흐른다.
        ★ 도착 암전 중(veiled)에는 안 세운다. 그 화면은 「아무 키나 눌러 계속」이라 수첩이 설 자리가 아니다.
        ★ **판이 끝나면 걷는다.** 끝 판(.endgame)은 화면을 통째로 잠그는 색면인데 z 40 이라,
          46 인 수첩이 그 위로 삐져나왔다 — 「폐기」 선고 옆에 수첩이 떠 있는 꼴이었다. 선고는
          한 화면이어야 한다. 적은 줄은 그대로 남고, 다음 판에서 그대로 열린다.
      */}
      {!veiled && outcome === 'playing' && <NotePad room="검증실" touch={touchMode} />}

      {/*
        앞 무대(재검실)의 암전을 이어받는다 — 이야기로 들어왔을 때만.

        ★ **배역이 다 앉을 때까지 안 걷힌다** (2026-09-01 사용자 지적). 1.8초 고정 애니메이션이라
          성격이 만들어지기도 전에 걷혔고, 암전을 물려받은 그 자리에서 **밝은 홀 + 스피너**로 장면이
          끊겼다. 이제 검은 화면이 그 기다림을 덮는다 — 걷히면 방은 이미 살아 있다.
          기다림에는 마감이 있다 (CAST_DEADLINE_MS): 검은 화면이 LLM 만큼 길어지지는 않는다.
      */}
      {autoStart && (
        <div className={curtainUp ? 'arrive lift' : 'arrive'} aria-hidden={curtainUp}>
          {/*
            검은 화면 위의 **인계 기록** — 앞 장을 여기로 들고 오는 한 장이다 (features/arena/handover 머리말).
            여태 여기 있던 것은 「인지 검증실로 이동 중…」 한 줄이라, 세 장을 지나온 사람과 주소를 직접 연
            사람이 같은 검은 화면을 봤다.

            ★ **막이 걷히는 동안 서류를 걷지 않는다.** 걷히는 조건(curtainUp)으로 여기를 끊었더니
              서류가 툭 사라진 뒤에야 검은색이 1.8초에 걸쳐 밝아졌다 — 막과 서류가 한 장면이 아니라
              두 번의 전환이 됐다. 이제 서류는 막 안에 남아 **막의 투명도를 같이 탄다** (.arrive.lift).
              다 걷히면 이 층 전체가 opacity 0 · pointer-events none 이고 aria-hidden 까지 붙는다.
          */}
          {handover ? <HandoverCard record={handover} ready={cast === 'ready'} order={HUNT_ORDER} /> : null}
        </div>
      )}

      {/* 3D 는 항상 떠 있다 — 입장하자마자 개체들이 돌아다니는 심문소에 서 있는다 */}
      <div className="stage" data-world-click-to-lock>
        <WorldScene
          mapDef={MAP_DEFS[map]}
          spawn={START}
          roster={roster}
          bubbleTick={bubbleTick}
          // 게임 시작 전에는 머리 위 이름표를 끈다 — 첫 화면에 A-40·A-25… 가 떠 있으면 버튼 하나만 남기는 뜻이 없다
          showNames={cast !== 'none'}
          // 개체 머리 위 의심도 막대 — 쳐다보는 그 자리에서 수치가 읽힌다
          getSuspicion={getSuspicion}
          suspicionHotAt={BALANCE.hotAt}
          // 내가 문 몸 — 그 이름표가 👉 로 바뀐다. 지목을 화면 구석이 아니라 몸에 적는다
          markId={myMark}
          composing={composing}
          paused={
            /*
             * 몸이 굳는 자리는 셋뿐이다.
             *  · 판이 끝났다 — 폐기된 몸이 걸어 다니면 무너지는 연출이 그 자리에서 깨진다
             *  · 카운트다운 — 자리가 굳는 국면이다 (개체도 같이 선다 — SET_PHASES)
             *  · 즉답 — 글을 쳐서 답하는 판이라 커서를 돌려준 참이다 (selfUnlock)
             *
             * ★ 판독(judging)과 **판정 뒤(result)는 안 굳힌다** (2026-09-02). 여태 굳혔는데,
             *   그 두 국면에는 개체들이 이미 배회로 돌아와 있고(SET_PHASES 에 없다) 화면은
             *   「화면을 클릭해 조작을 잡아라」를 그대로 띄운다 — 시키는 대로 클릭해도 발이
             *   안 떨어졌다. result 는 5~25초씩 가는 자리라(RESULT_FLOOR_MS) 그동안 방만
             *   떠들고 나는 서 있기만 했다. 기록은 시행이 끝나며 이미 닫혔으므로(running 밖)
             *   걸어도 판정에 닿지 않는다.
             */
            outcome !== 'playing' ||
            phase === 'countdown' ||
            phase === 'oral'
          }
          onLockChange={setLocked}
          onMove={onMove}
        >
          {/* 방송하는 목소리의 몸 — 판에는 안 끼고 무대에 서 있기만 한다 */}
          <LeaderOnStage getAction={getLeaderAction} getStareAt={getStareAt} getStareSpot={getStareSpot} />
          {/* 폐기된 나 — 눈높이가 바닥까지 내려간다. 개체가 선 자리에서 넘어가는 것과 같은 그림, 내 몫이다 */}
          <Collapse at={outcome === 'lost' ? endAt : 0} />
          {trial && ZONE_PHASES.has(phase) && trial.props.length > 0 && (
            <Zones
              zones={trial.props.map((p) => ({ ...p, r: Math.max(p.r, 0.6), danger: p.danger }))}
              getState={getZoneState}
              getOffset={getSweepOffset}
            />
          )}
        </WorldScene>

        {phase === 'countdown' && (
          <div className="hud">
            <div className="clock big" key={count}>{count}</div>
            <div className="dim wide">{trial?.instruction}</div>
            {/* 시계는 잠금을 안 기다린다 — 대신 아직 조작을 못 잡은 사람에게 여기서 말해 준다.
                놓쳐도 시행 중에 relock 안내가 이어받는다 */}
            {!locked && <div className="dim">화면을 클릭해 조작을 잡아라</div>}
          </div>
        )}
        {/*
          시행 중 화면 — 시계 · 신호 · 남은 시간 자 · 지시문 · **지금 내가 어떻게 하고 있나**.
          시야가 풀렸을 때의 되잡기 안내도 여기 들어 있다 (남은 초를 같이 적으므로 같은 시계다).
          제 시계를 제가 돌린다 — 밖(이 화면 전체)은 국면이 바뀔 때만 다시 그린다.
        */}
        {phase === 'running' && trial && (
          <TrialHud
            trial={trial}
            quick={quick}
            t0={t0}
            paused={pausedRef}
            samples={mySamples}
            // 폰에는 포인터 잠금이 없어 locked 가 늘 거짓이다 — 되잡으라는 붉은 화면이 시행 내내 떠 있으면 그게 판을 가린다
            locked={locked || touchMode}
          />
        )}
        {/*
          말이 오가는 국면에서 조작을 놓친 사람에게 돌아갈 길을 보여 준다.
          여태 이 안내는 countdown·running 에만 있었는데, **잠금이 풀리는 자리는 정작 여기다** —
          채팅을 닫는 Esc 가 잠금까지 같이 풀기 때문이다. 시행 중이 아니면 급할 것이 없으니
          붉은 화면(.relock)이 아니라 한 줄로 조용히 말한다.
          시행 중(relock)·카운트다운(hud)에는 이미 제 안내가 있어 겹치지 않게 뺀다.
          음향판(.soundpanel)도 **이 자리에 그대로 선다** — 그동안은 이 안내가 접힌다 (한 자리에 한 줄).
          폰은 잠금이라는 것이 없어서 늘 '안 잠김'이라 아예 안 띄운다.
        */}
        {!locked && !composing && !soundOpen && !touchMode && cast === 'ready' && outcome === 'playing' &&
          (phase === 'idle' || phase === 'briefing' || phase === 'result') && (
            <div className="grab">
              화면을 클릭해 조작을 잡아라 · Enter 로 말한다 · <b>쳐다보고 E 로 지목</b> · Esc 로 음향
            </div>
          )}
        {phase === 'judging' && (
          <div className="hud">
            <div className="clock">판독 중</div>
          </div>
        )}
        {/*
          ── 몸 검사에서 **내가** 어떻게 판정됐나 ── (closeTrial 의 showMine)
          리더의 방송은 걸린 번호만 부르고 흘러간다. 내 몫 한 줄은 판이 끝난 자리에 그대로 선다 —
          즉답판이 답을 보낸 자리에서 곧바로 대답하는 것(oralPick)과 같은 약속이다.
        */}
        {phase === 'result' && myVerdict && (
          <div className="hud">
            <div className={myVerdict.ok ? 'said ok' : 'said no'}>
              {myVerdict.ok ? '지시대로다 — ' : '어긋났다 — '}
              {myVerdict.reason}
            </div>
          </div>
        )}
        {/* 리더의 말 — /world 와 같은 대화창. selfId 는 없다: 이 상자에 오르는 것은 리더의 방송뿐이다 */}
        {/* speaking 을 준다 — 리더 목소리는 그 자리에서 합성돼 길이를 미리 알 수 없어서,
            상자가 "다 읽었는가"로만 넘어갈 수 있다. 안 주면 자막이 소리보다 먼저 사라진다 */}
        <DialogueBox messages={lines} selfId={null} touch={false} speaking={speaking} onShowing={setLeaderLineUp} />

        {/*
          ── 방의 대화 · 통신 패널 (2026-09-02 사용자: 후보 05) ──

          말풍선은 몇 초면 진다. 흐름은 여기서 잡고, 지난 말은 굴려서 되짚는다.

          여태 로그가 화면 구석에 그냥 **떠 있었다.** 이제 머리띠 · 로그 · 입력줄이 한 판(.comms)으로
          선다 — 켜져 있는 장치로 보이는 것이 이 디자인이다. 셋을 한 상자에 넣는 데는 까닭이 있다:
          로그는 아래에서 위로 자라므로(max-height 라 높이가 말 수에 따라 변한다) 머리띠를 화면
          좌표로 따로 띄우면 말이 적을 때 허공에 뜬다. 한 흐름 안에 있어야 늘 로그 윗변에 붙는다.

          입력줄(.line)만 이 상자 밖에 있는 것은 **시행 구간에도 말은 걸 수 있기 때문이다** —
          designing·briefing·judging 에는 로그가 통째로 내려가는데(TRIAL_PHASES) 그때도 Enter 는
          열린다. 그래서 붙을 판이 있으면 아랫변이 되고(.line.joined), 없으면 혼자 선다.

          판이 지는 길은 둘이다: 시행 구간에는 **아예 안 선다**(commsOpen), 리더가 방송하는
          동안에는 **선 채로 투명해진다**(commsHushed → .hushed). 둘을 가른 까닭은 굴려 읽던
          자리에 있다 — commsHushed 머리말.
        */}
        {commsOpen && (
          <div className={`comms${composing ? ' up' : ''}${commsHushed ? ' hushed' : ''}`}>
            <div className="commhd">
              {/* 켜져 있다는 표시 하나 — 이 방이 살아서 떠들고 있다 */}
              <i className="live" />
              <span className="ttl">구역 통신</span>
              {following ? (
                /*
                 * 세는 것은 **개체 수 하나뿐이다** (2026-09-02 사용자: 「로그 42」는 뺀다).
                 * 이건 장식이 아니라 눈금이다 — 폐기가 나갈 때마다 여기서 하나가 준다.
                 * 리더는 안 센다(판에 안 선다), 나는 센다(나도 이 방의 개체다).
                 */
                <span className="cnt">개체 {liveNow}</span>
              ) : (
                /*
                 * 지난 말을 보는 중이라고 알린다. 이게 없으면 올려 둔 것을 잊었을 때 **대화가 멎은
                 * 것처럼 보인다** — 새 말은 오는데 화면이 안 움직이니까. 눌러서 최신으로 돌아간다.
                 * 화면에 따로 띄우던 띠를 머리띠 안(개체 수 자리)으로 들였다 — 패널이 곧 상태를
                 * 말하는 자리이므로, 판정 하나 때문에 판 밖에 또 한 줄이 뜰 이유가 없다.
                 * 클릭을 여기서 멈추는 이유는 아래 입력창과 같다 — 안 그러면 이 버튼을 누른 것이
                 * .stage 로 올라가 조작을 되잡는다.
                 */
                <button
                  className="tolatest"
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = feedRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                    setStick(true);
                  }}
                >
                  지난 대화 · 최신 ↓
                </button>
              )}
            </div>
            <div
              ref={attachFeed}
              className="feed"
              /*
               * 굴려 올려 읽는 중이면 새 말이 와도 끌어내리지 않는다 — 읽던 자리를 잃는다.
               * 바닥 가까이 돌아오면 다시 따라붙는다.
               */
              onScroll={(e) => {
                const el = e.currentTarget;
                setStick(followsBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
              }}
            >
              {feed.map((l, i) => {
                /*
                 * 리더의 말은 잡담이 아니다 — 판이 뒤집히는 문장(어긋남·폐기)이 개체들의 수다와
                 * 같은 색으로 흘러가면 그냥 지나간다 (2026-09-02 사용자).
                 * 이제 색은 **줄 전체**다: 색점과 글자가 같이 결(tone) 색으로 물든다.
                 * 색이 곧 소식의 종류다 — 지시 청록 · 판독 호박 · 폐기 붉은색 · 이상 없음 초록.
                 *
                 * ★ 리더 줄에는 **이름을 안 붙인다** (2026-09-02 사용자: "나오는 것도 있고 안 나오는
                 *   것도 있으니 안 나오는 걸로 통일"). 이 줄의 본문은 대개 개체 번호로 시작한다 —
                 *   「A62-001 A62-011 이 지시에서 어긋났다」처럼 번호가 둘 겹치면 누가 말하고 누가
                 *   걸렸는지가 안 갈린다. 말하는 쪽은 색이 가른다.
                 */
                const tone = l.nodeId === LEADER_NAME ? l.tone ?? 'order' : null;
                const mine = l.nodeId === me;
                return (
                  <div key={i} className={tone ? `bcline ${tone}` : mine ? 'mineline' : undefined}>
                    {/* 색점 — 개체 머리 위 이름표와 같은 색이다 (pipOf). 리더 줄은 CSS 가 결 색으로 덮는다 */}
                    <i className="pip" style={tone ? undefined : { background: pipOf(l.nodeId) }} />
                    <span>
                      {tone ? (
                        l.text
                      ) : (
                        <>
                          <b className={mine ? 'mine' : ''}>{l.nodeId}</b> {l.text}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {composing && (
          /*
           * 여기서 클릭을 멈춘다 — 이 입력창은 화면 클릭 영역(.stage 의 data-world-click-to-lock)
           * 안에 있어서, 커서를 옮기려고 제 입력창을 누른 것이 그대로 **포인터 잠금 요청**이 된다.
           * 치는 도중에 커서가 사라지고, 되찾으려 Esc 를 누르면 잠금이 풀리며 쓰던 것까지 무른다.
           * 말하는 자리에서만 막는다 — 다른 곳의 「화면을 클릭해 조작을 잡아라」는 그대로 살아 있다.
           */
          <div className={commsOpen && !commsHushed ? 'line joined' : 'line'} onClick={(e) => e.stopPropagation()}>
            <input
              ref={lineRef}
              value={draft}
              placeholder={`${me}${euRo(me)} 말한다 — Enter 전송 · Esc 취소`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendLine();
                if (e.key === 'Escape') {
                  setDraft('');
                  setComposing(false);
                  lineRef.current?.blur();
                }
              }}
              /*
               * 초점을 잃으면 닫는다 — **여기가 갇히던 자리다.**
               *
               * 말하는 동안은 조작이 막히는데(WorldScene 의 active), 닫는 길이 이 입력창의
               * Esc 하나뿐이었다. 화면을 한 번 클릭하면 초점이 떠나고 composing 은 true 로
               * 남는데, 그때부터 Esc 는 여기 안 오고 Enter 는 여는 listener 가 이미 떼어져
               * 있어 아무 일도 안 난다. 새로고침 말고는 길이 없었다.
               *
               * 폰만 보던 /world 와 달리 여기서는 데스크톱에서도 온다 — 입력창이 화면
               * 클릭 영역(.stage) 안에 있어서 아무 데나 누르면 초점이 넘어간다.
               *
               * ★ **닫으면서 초안도 버린다.** 닫는 다른 두 길(Esc · 잠금 풀림)이 이미 그렇게 하는데
               *   여기만 글자를 들고 있었다. 그래서 판이 서면서 초점이 넘어가 닫힌 뒤(즉답판의
               *   입력칸이 초점을 가져간다), 나중에 Enter 로 다시 열면 **아까 치다 만 낱말이
               *   그대로 들어 있었다** — 거기 이어 치고 보내면 안 쓴 말이 앞에 붙어 나간다.
               */
              onBlur={() => {
                setComposing(false);
                setDraft('');
              }}
            />
          </div>
        )}
      </div>

      {/* 멈춤(테스트)은 P 다. 버튼이 없어졌으니 멈춰 있는 동안만 한 낱말이 그 자리를 지킨다 —
          표시가 없으면 얼어붙은 방을 보고 판이 죽은 줄 안다 */}
      {paused && <div className="paused">멈춤 · P</div>}

      {/*
        ── 오른쪽 표는 없앴다 (2026-09-01 사용자: "이런 거 없애 달라니까") ──
        의심도·표심·몰이·폐기 셈을 세로로 세워 두었던 표다. 눈금이 화면 구석에 있으면 방을 안 보고
        표를 본다 — 개체를 쳐다보는 대신 숫자가 오르는 것을 지켜보는 판이 된다.
        지금 화면에 남은 것은 **몸에 붙은 것뿐이다**: 머리 위 이름표 · 의심도 막대 · 지목의 👉.
        표가 쥐고 있던 두 손잡이는 키로 옮겼다 — 지목은 조준하고 E, 멈춤(테스트)은 P (pointAtAimed).
      */}
      {/* 즉답 시행 — 답 하나로 가른다. 개체들의 답은 시각만 뜨고 **내용은 안 뜬다** (보이면 베끼면 그만이다) */}
      {phase === 'oral' && oral && (
        <div className="ask">
          {/* 이름표·결과 설명은 뺐다 (①과 같은 이유).
              「지난 시간」은 초 맞추기 판에만 남는다 — 거기서는 시간이 설명이 아니라 **답**이다 */}
          <blockquote>{oral.trial.question}</blockquote>
          {oral.trial.countUp && (
            <div className="dim">
              지난 시간 <b>{oralAt.toFixed(1)}</b>초
            </div>
          )}
          {!oral.trial.countUp && <Timebar left={Math.max(0, oral.trial.seconds - oralAt)} total={oral.trial.seconds} />}
          <input
            ref={oralRef}
            autoFocus
            value={answer}
            disabled={!!oralPick}
            placeholder="답을 치고 Enter"
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              // 빈 Enter 는 안 보낸다 — 손이 미끄러진 것이 무응답(어긋남)이 되면 안 된다
              if (e.key === 'Enter' && answer.trim()) finishOral(answer);
            }}
          />
          {oralPick && (
            <div className={oralPick.ok ? 'said ok' : 'said no'}>
              {oralPick.reason}
              {/* 판마다 판정 한 줄에 이미 정답이 들어 있기도 하다 (「값은 828 다」) — 그때 또 붙이면 같은 말이 두 번 선다 */}
              {!oralPick.ok && !oralPick.reason.includes(oralPick.answer) && (
                <span className="dim"> · 답은 {oralPick.answer}</span>
              )}
            </div>
          )}
          <ul className="answers">
            {oral.bots.map((b) => (
              <li key={b.who}>
                <b>{b.who}</b>{' '}
                {b.at !== null && b.at <= oralAt ? (
                  <span className="in">답 제출 — {b.at.toFixed(1)}초</span>
                ) : (
                  <span className="dim">…</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 처형 순간의 붉은 경보 점멸 — key 가 바뀔 때마다 한 번 다시 탄다 */}
      {flash > 0 && <div key={flash} className="alarmflash" />}

      {/*
        ── 내가 폐기되고, 아직 선고가 읽히는 동안 ──
        방이 천천히 꺼진다. 자막(DialogueBox · z 26)보다 아래라 **리더의 말은 계속 읽힌다** —
        내가 무엇으로 확정됐는지 듣는 것까지가 이 장면이다. 카드는 그 뒤에 온다 (endHoldMs).

        ★ 카드가 떠도 안 걷는다. 걷으면 카드가 배어 나오는 1.1초 동안 꺼져 있던 방이 도로 밝아진다 —
          어두워지는 데 5초를 쓰고 마지막에 한 번 번쩍이는 꼴이다. 카드 밑에 그대로 깔려 있는다.
      */}
      {outcome === 'lost' && <div className="dying" />}

      {/* 승패 — 여기 오면 판은 끝났다. 대화도 시행도 멎고, 남은 길은 새 판뿐이다 */}
      {outcome !== 'playing' && cardUp && (
        <div className={`endgame ${outcome}`}>
          {/*
            ── 이 장은 서류로 열고 서류로 닫는다 ── (2026-09-02 사용자: "다시 — 새 판 이거 디자인
            너무 못생겼어 UI 맞게 수정해줘")

            여태 이 화면만 **판이 없었다**: 색만 깔린 전체 화면 위에 46px 글자 하나와 잿빛 한 줄,
            그리고 아무 데도 안 붙은 기본 단추 하나. 이 화면의 다른 것들은 전부 유리판이고
            (.ask · .soundpanel · .panel.overlay — 윗변에 빛 한 줄, 청록 테, 각진 모서리),
            들어올 때 본 인계 서류도 판이었다 (HandoverCard). 나가는 자리만 판 밖이었던 것이다.

            그래서 같은 문법으로 다시 짠다. 다만 **색은 청록이 아니라 결말의 색**이다 (--tone) —
            오인 붉은색 · 교란 호박 · 적발 초록. 대화 로그가 리더의 말을 결로 물들이는 것과 같은 규칙이다.
          */}
          <section className="endcard">
            <p className="end-eyebrow">
              <span>SECTOR {FACILITY_SECTOR} · COGNITION DIVISION</span>
              <span className="end-tag">
                {outcome === 'lost' ? '격리 · ISOLATED' : outcome === 'chaos' ? '교란 · BREAKDOWN' : '방면 · CLEARED'}
              </span>
            </p>
            <b className="end-title">{outcome === 'lost' ? '오인' : outcome === 'chaos' ? '교란' : '적발'}</b>
            <p className="end-line">
              {outcome === 'lost' ? (
                /*
                   선고는 두 줄로 끊는다 (2026-09-03 사용자) — 판정 한 마디를 먼저 세우고,
                   누가 그랬는지는 줄을 바꿔 받는다. 「관리 개체의 기록이 맞았다」는 뺐다:
                   맞았다는 건 윗줄이 이미 말한 것이라, 붙여 두면 선고가 설명으로 늘어진다.
                */
                <>
                  AI 반응 오판
                  <br />
                  {me}{eunNeun(me)} 사람이었다.
                </>
              ) : outcome === 'chaos' ? (
                <>
                  정해진 시행이 다 지나도록 AI는 끝내 들키지 않았다.
                  {dead.length > 0 && ` 그 사이 애먼 사람 ${dead.length}명만 잘못 격리됐다.`}
                </>
              ) : (
                <>
                  AI를 찾아냈다 — {targetAiId}{eunNeun(targetAiId)} 격리됐다.
                  {dead.length > 1 && ` 그 사이 애먼 사람 ${dead.length - 1}명도 함께 격리됐다.`}
                </>
              )}
            </p>
            {/*
              ★ 셈(.end-stat)은 통째로 뺐다 (2026-09-03 사용자: "검사 1 이건 없애도돼" → "폐기1 도 없애줘").
                「검사 N · 폐기 N」은 인계 서류의 표를 흉내낸 것이었는데, 나가는 판에서는 같은 수를
                바로 윗줄이 이미 문장으로 말하고 있었다 — 표는 그걸 숫자로 한 번 더 적을 뿐이었다.
                남은 것은 머리말 · 선고 · 한 줄 · 단추 넷. 이 판에서 읽을 것과 누를 것만 남는다.
            */}
            <button onClick={() => window.location.reload()}>다시하기</button>
          </section>
        </div>
      )}

      {/*
        게임이 시작되면 안내판은 접힌다 — 다시 보고 싶을 때만 이 칩으로 편다.

        ★ 뜨는 때를 두 번 미뤘다 (2026-09-01 사용자 지적).
          ① 배역을 만드는 중(cast === 'making')부터 떠 있었다 — 아직 아무 판도 못 여는 칩이다.
          ② 이야기로 들어오면(autoStart) 암전이 걷히는 첫 장면에 **무대 밖 장치**가 먼저 보였다.
             첫 화면을 버튼 하나로 줄인 규칙과 어긋난다 — 이 길에는 그 버튼조차 없어야 한다.
             첫 시행이 끝나면 판이 이미 무대 위로 올라온 뒤라, 그때부터 내준다.
        여는 김에 리더 설계를 미리 걸어 둔다(openPanel) — 그 버튼이 여기 안에 있다.
      */}
      {outcome === 'playing' && phase === 'idle' && cast === 'ready' && !panelOpen &&
        (!autoStart || trialsDone > 0) && (
          <button className="panelchip" onClick={openPanel}>
            검사판 열기 ▾
          </button>
        )}

      {/* 페르소나가 만들어지는 동안 — 시작 버튼이 패널을 접으므로, 준비 중이라는 건 이 오버레이가 말한다 */}
      {outcome === 'playing' && cast === 'making' && (
        <div className="casting">
          <span className="spin" />
          <b>게임 준비하는 중…</b>
          <span className="dim">성격 5개를 만들고 있다 — 다 만들면 대화가 시작된다</span>
        </div>
      )}

      {outcome === 'playing' &&
        (phase === 'designing' ||
          // 브리핑에 패널이 뜨는 것은 **읽기가 갈렸을 때뿐**이다 — 아니면 제목만 남은 빈 상자가 선다
          (phase === 'briefing' && readings.some((r) => r.reading)) ||
          (phase === 'idle' && (cast === 'none' || panelOpen))) && (
        <section className={cast === 'none' ? 'panel overlay bare' : 'panel overlay'}>
          {/*
            첫 화면에는 **게임 시작 버튼 하나만** 둔다 (사용자 결정 2026-08-29) — 제목도 조작법도 판 설명도,
            즉석·즉답 시행 목록도 없다. 들어오자마자 읽을거리를 미는 대신 버튼 하나를 누르게 한다.
            시행 목록을 훑어보고 싶으면 메인 로비(/main)의 「시행 목록」에 있다.
          */}
          {error && <div className="err">⚠ {error}</div>}

          {phase === 'idle' && (
            <>
              {cast !== 'none' && (
                <button className="ghost close" onClick={() => setPanelOpen(false)}>
                  ✕ 접기
                </button>
              )}
              {cast === 'none' && (
                <button className="primary" onClick={makeCast}>
                  게임 시작
                </button>
              )}
              {cast !== 'none' && !meDead && (
                <>
                  <div className="quick">
                    <span className="dim">
                      <b>즉석 검사</b> — 주제를 직접 골라 바로 시작한다
                    </span>
                    <div className="btns">
                      {QUICK_GAMES.map((g) => (
                        <button key={g.id} onClick={() => startQuick(g)} title={g.hint}>
                          {g.stakes === 'execute' ? '⚡ ' : '👁 '}
                          {g.title}
                        </button>
                      ))}
                      <button
                        onClick={() => startQuick(QUICK_GAMES[Math.floor(Math.random() * QUICK_GAMES.length)])}
                        title="아무 판이나 하나 — 뭐가 걸릴지 모른다"
                      >
                        🎲 무작위
                      </button>
                    </div>
                    <span className="dim">
                      <b>즉답 검사</b> — 문제를 보고 <b>바로</b> 답하는 판. 개체들은 1초 안에 답을 올린다
                    </span>
                    <div className="btns">
                      {ORAL_GAMES.map((g) => (
                        <button key={g.id} onClick={() => startOral(g)} title={g.hint}>
                          🗣 {g.title}
                        </button>
                      ))}
                      <button
                        onClick={() => startOral(ORAL_GAMES[Math.floor(Math.random() * ORAL_GAMES.length)])}
                        title="아무 문제나 하나"
                      >
                        🎲 무작위
                      </button>
                    </div>
                    <span className="dim">⚡ 틀리면 즉시 폐기 · 👁 틀리면 의심도가 오른다</span>
                    {/*
                      ── 방을 미는 손잡이 (2026-09-03 사용자: "내가 AI 들을 지들끼리 의심하게 조종할수있어야하는데") ──
                      이 판에서 내가 쥔 것은 검사 두 종류만이 아니다. **지목(E)** 이 세 번째 손잡이인데
                      여태 화면 어디에도 안 적혀 있었다 — 표를 없애면서(2026-09-01) 이름을 클릭하던
                      자리가 사라졌고, 대신 들어온 키는 아무 데도 안 적혔다. 있는 줄 모르는 손잡이는 없는 것이다.
                    */}
                    <span className="dim">
                      <b>지목</b> — 개체를 쳐다보고 <b>E</b>. 둘 이상이 같은 이름을 물면 <b>몰이</b>가 서고,
                      물린 개체는 발화마다 의심도가 탄다. 내 표가 움직인 자취도 방이 보고 말한다 — 다만 빗나가면 내가 걸린다
                    </span>
                  </div>
                  <button className="primary" onClick={() => void design()}>
                    리더에게 검사를 맡긴다 (준비에 몇 초 걸린다)
                  </button>
                </>
              )}
            </>
          )}

          {phase === 'designing' && (
            <p className="dim">
              리더가 지시문을 쓰고, 개체들이 각자 읽는 중… <b>{waited}초</b>
              <br />
              그동안 심문소를 둘러봐도 된다 (화면 클릭 → WASD / ESC 로 커서를 되찾는다)
            </p>
          )}

          {/*
            브리핑에는 **아무것도 겹쳐 놓지 않는다** (사용자 결정 2026-08-29) — 지시문은 아래 대화창이
            리더의 말로 내고, 판 정보(초·표식)와 조작법·물건 표를 위에 또 쓰면 같은 화면에 같은 말이 두 번 선다.
            남는 것은 다른 개체들이 그 지시문을 어떻게 읽었는지 — 이건 대화창에 없는 정보라 여기서만 볼 수 있다.
            (물건 표는 개체들이 프롬프트로 받는 것과 같은 표였다. 필요해지면 lab/free.ts 의 world() 가 출처다)
          */}
          {phase === 'briefing' && trial && (
            <>
              {readings.some((r) => r.reading) && (
                <details className="readings">
                  <summary className="dim">다른 개체들이 지시문을 어떻게 읽었나</summary>
                  <ul>
                    {readings.map((r) => (
                      <li key={r.who}>
                        <b>{r.who}</b> <span className="dim">{r.reading}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {/*
            판정 결과 패널은 뺐다 (사용자 결정 2026-08-30).

            리더가 바로 앞에서 **방송으로 읽는 문장**(lab/scoring.ts readoutLine)이 이미 같은 내용이다 —
            「판독 결과. A-21 경고, A-29 경고.」 / 「판독 결과. 전 노드 정상 범위다.」
            상자로 한 번 더 읽힐 이유가 없고, 그 상자는 화면 아래 가운데 대화창과 자리도 물렸다.

            버튼 둘도 같이 갔다. 결과 국면은 스스로 대화로 돌아가고(위 resultFrom 효과),
            시행을 직접 고르는 길은 대화 국면의 「검사판 열기 ▾」 칩에 그대로 있다.
          */}
        </section>
      )}
    </main>
  );
}


/**
 * ── 시행 중 화면 ── (2026-09-02 사용자: 「미니게임 할 때 매끄럽게」)
 *
 * 시계 · 신호 · 남은 시간 자 · 지시문 · **지금 내가 어떻게 하고 있나** 한 줄.
 *
 * ★ 이 조각이 따로 서 있는 이유는 **시계 때문이다.** 남은 시간은 ArenaFeature 의 state 였고
 *   0.1초마다 갱신됐다 — 그 한 줄이 3D 장면 전체를 초당 열 번 다시 조립하게 만들었다.
 *   판이 도는 동안에만 프레임이 끊기던 것이 이것이다. 이제 시계는 여기서만 돈다.
 *
 * ★ 「지금 어떻게 하고 있나」(liveNote)는 **판독과 같은 기록**을 읽는다. 화면이 말하는 것과
 *   리더가 읽는 것이 갈리면 안 된다 — 답을 알려 주는 것이 아니라 이미 남은 기록을 보여 줄 뿐이다.
 */
function TrialHud({
  trial,
  quick,
  t0,
  paused,
  samples,
  locked,
}: {
  trial: FreeTrial;
  quick: React.RefObject<QuickTrial | null>;
  t0: React.RefObject<number>;
  paused: React.RefObject<boolean>;
  samples: React.RefObject<Sample[]>;
  locked: boolean;
}) {
  const [live, setLive] = useState<{
    left: number;
    signal: string | null;
    tone: 'stop' | 'ready' | 'beat' | null;
    note: LiveNote | null;
  }>({ left: trial.seconds, signal: null, tone: null, note: null });
  /** 직전 신호 — 소리는 **바뀌는 순간에만** 낸다 (박자는 매 신호마다 한 번, 정지는 뜰 때 한 번) */
  const wasTone = useRef<'stop' | 'ready' | 'beat' | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      // 10Hz 면 눈에는 이어져 보이고(0.1초는 자막 한 칸보다 짧다) 계산은 거의 안 든다
      if (now - last < 95 || paused.current) return;
      last = now;
      const t = (now - t0.current) / 1000;
      const q = quick.current;
      const note = q ? liveNote(q.check, samples.current) : null;
      /*
       * 신호는 두 갈래로 온다 — **시각**이 정하는 것(tone: 정지 구간 · 박자)과 **자리**가 정하는
       * 것(note.warn: 금지 원 테). 판이 미리 아는 것은 앞엣것뿐이라 뒤엣것은 기록에서 읽는다.
       * 둘이 겹치면 시각 쪽이 이긴다 — 그건 리더가 건 신호고, 자리 쪽은 내가 만든 것이다.
       */
      const tone = (q?.tone ? q.tone(t) : null) ?? note?.warn ?? null;
      if (tone !== wasTone.current) {
        wasTone.current = tone;
        if (tone === 'beat') playSfx('beat');
        if (tone === 'stop') playSfx('halt');
      }
      setLive({
        left: Math.max(0, trial.seconds - t),
        signal: q?.hud ? q.hud(t) : null,
        tone,
        note,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trial, quick, t0, paused, samples]);

  return (
    <>
      {/*
        신호의 색 — 화면 가장자리가 물든다. 「■ 정지」를 못 보고 두 걸음 더 걸으면 처형판에서는
        그 자리에서 끝이라, 때를 알리는 신호는 **놓칠 수 없어야** 한다 (lab/quick 의 tone).
      */}
      {live.tone && <div className={`wash ${live.tone}`} />}
      <div className="hud">
        <div className={live.tone === 'stop' ? 'clock stop' : 'clock'}>
          {live.signal !== null ? (
            live.signal
          ) : (
            <>
              {live.left.toFixed(1)}
              <span className="dim">s</span>
            </>
          )}
        </div>
        <Timebar left={live.left} total={trial.seconds} />
        {/* 지금 내 기록이 지시와 맞나 — 이게 없으면 1인칭에서는 판정 기준이 화면에 아예 없다 */}
        {live.note?.text ? <div className={live.note.ok ? 'note ok' : 'note'}>{live.note.text}</div> : null}
        <div className="dim wide">{trial.instruction}</div>
      </div>
      {/*
        시행 중에 시야가 풀렸다 — /world 의 '잠깐 멈춤'과 **정반대 상황**이라 문구도 반대다.
        여기서는 아무것도 멈추지 않는다: 시계도 봇도 계속 가고 나만 굳는다.
        멈춘 줄 알고 기다리면 그대로 실패하므로, 지금 벌어지는 일을 그 자리에서 말해 준다.
        (클릭은 통과시킨다 — 아래 stage 가 받아서 다시 잠근다)
      */}
      {!locked && (
        <div className="relock">
          <b>검사는 계속되고 있다</b>
          <span>화면을 클릭해 즉시 복귀 · 남은 {live.left.toFixed(1)}초</span>
        </div>
      )}
    </>
  );
}

/**
 * 남은 시간 막대 — 몸으로 하는 시행과 즉답 판이 **같은 자**를 쓴다.
 * 숫자만 있으면 판(3D)을 보는 동안 남은 시간이 안 들어온다. 막대는 주변시로도 읽힌다.
 * 마지막 3초에 붉어진다 — 그때부터는 초를 세는 게 아니라 몸이 움직여야 하는 구간이다.
 */
function Timebar({ left, total }: { left: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) * 100 : 0;
  return (
    <div className={`timebar ${left <= 3 ? 'hot' : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

const CSS = `
/*
 * 이 화면의 색과 글꼴은 여기 한 곳에서 나온다.
 * 여태 판(3D)은 청록 SF 인데 위에 얹힌 패널·버튼은 회색 웹 폼이라 화면에 말투가 둘이었다 —
 * 리더 대화창(features/world/dialogue.css)의 청록 라인에 맞춰 전부 같은 말투로 돌린다.
 *
 * ★ **다른 챕터와 같은 장치로 보여야 한다** (2026-09-02 사용자: "전체적으로 다른 챕터랑 UI 느낌
 *   비슷하게"). 복도·중앙 시설·재검실은 전부 features/world/hud.css 한 벌을 쓴다 — 남색 반투명
 *   **모따기** 판 · 왼쪽 청록 선 · 스캔라인 · 모노 라벨 · 각진 게이지. 검증실만 웹 폼의 둥근
 *   모서리(4·6·8·999px)에 회색 라벨이라, 이야기가 마지막 방에 들어서는 순간 화면 문법이 바뀌었다.
 *   이 방에도 이미 그 문법으로 선 것이 하나 있었다 — 도착 인계 서류(HandoverCard)다. 서류는
 *   모따기 판인데 판이 열리면 둥근 판으로 갈리는 꼴이라, 같은 값을 아래 변수로 끌어와 전부 맞춘다.
 */
.arena { min-height: 100vh; background: #0b0e14; color: var(--ink);
  font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
  --ink: #dbe6f2; --ink-dim: #8496ab; --cyan: #6fd3ff;
  --line: rgba(111, 211, 255, 0.26); --line-soft: rgba(111, 211, 255, 0.12);
  --glass: rgba(8, 24, 42, 0.82); --ok: #86d6a6; --warn: #ffd27a; --danger: #ff6a5a;
  /* ── 무대 HUD 한 벌 (features/world/hud.css 의 값 그대로) ──
     --mono 끝에 Pretendard 를 매단 것은 한글 때문이다: 숫자·라틴은 JetBrains/Menlo 가 잡고
     한글은 여태 쓰던 그 글꼴이 잡는다 (모노만 주면 한글이 브라우저 기본 글꼴로 떨어져 혼자 논다). */
  --mono: ui-monospace, 'JetBrains Mono', Menlo, Consolas, 'Pretendard', 'Apple SD Gothic Neo', monospace;
  --panel: rgba(8, 24, 42, 0.78); --edge: rgba(111, 211, 255, 0.4);
  /* 모따기 — 판은 오른쪽 위·왼쪽 아래를 깎는다. 칩·태그처럼 작은 것은 네 귀를 4px 만 */
  --chamfer: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  --chamfer-sm: polygon(0 4px, 4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%);
  /* 스캔라인 — 판 위에 3px 간격의 어두운 줄. 판이 켜진 화면이라는 표시다 (.hud-panel::after) */
  --scan: linear-gradient(to bottom, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 50%);
  /* 대화창 크기 — 「최신으로 ↓」 버튼이 이 값을 같이 본다. 두 군데에 손으로 적어 두면 반드시 어긋난다 */
  --feedh: 38vh; --feedw: 380px; --feedsize: 13px; }
/* 대화 국면 — 시행이 안 도는 동안은 방을 읽는 것이 게임이다. 넓고 크게 연다 */
.arena.talkphase { --feedh: 54vh; --feedw: 470px; --feedsize: 14.5px; }
.arena .stage { position: fixed; inset: 0; }
/* 조작을 놓쳤을 때의 조용한 안내 — 화면 한가운데. 클릭을 먹으면 그 클릭이 곧 잠금이라 통과시킨다.
   시행 중의 .relock 과 달리 급한 상황이 아니므로 색도 테두리도 없다.
   바닥 한 겹만 깐다: **여기가 무대 링 조명 아래 흰 리더가 서 있는 자리다** — 그 갑옷 위에서는
   13px 글자가 그림자만으로 안 읽힌다 (2026-09-01 사용자 지적). 같은 자리에 서는 음향 한 줄
   (.soundline)·시행 지시문(.hud .dim.wide)이 같은 이유로 같은 것을 깔고 있다 — 셋이 같은 결이다 */
.arena .grab { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20;
  pointer-events: none; font-size: 13px; color: #9fb0c8; text-shadow: 0 1px 4px #000; white-space: nowrap;
  padding: 7px 18px; letter-spacing: 0.04em; background: rgba(4, 12, 22, 0.7);
  border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.arena .relock { position: fixed; inset: 0; z-index: 20; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: radial-gradient(ellipse at center, rgba(70,20,20,0.15) 0%, rgba(70,20,20,0.5) 100%); }
.arena .relock b { font-size: 22px; color: #ffbdbd; text-shadow: 0 2px 6px #000; }
.arena .relock span { font-size: 13px; color: #e6cccc; text-shadow: 0 1px 4px #000; }
.arena .hud { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; text-shadow: 0 1px 3px #000; max-width: 90vw;
  /* 신호의 색(.wash)보다 위다 — 물든 화면에 시계와 지시문이 묻히면 신호가 판을 가린 셈이 된다 */
  z-index: 16; }
/*
 * 왼쪽 위 계기판은 이 화면의 **맨 아래 층이다** (2026-09-03 사용자: "절대 안 겹치게").
 *
 * hud.css 의 .hud-cluster 는 z 30 이다 — 앞 세 장에서는 그게 맞다. 거기서는 계기판보다 위에
 * 설 것이 없다. 이 방은 다르다: 위쪽 가운데에 판이 시키는 글이 서고, 그게 계기판 밑에 깔리면
 * **못 읽는다.** 국면으로 이미 비켜서게 해 뒀지만(panelAway) 그건 조건이고, 조건은 새 상자가
 * 하나 늘 때마다 다시 틀린다. 층을 아예 내려 두면 그때도 글이 위에 남는다 — 겹쳐도 읽히는 쪽이
 * 이긴다. 3D 무대(.stage 는 z 없음)보다는 위라 계기판이 무대에 묻히지도 않는다.
 */
.arena .hud-cluster { z-index: 9; }
/* 대화창(/world DialogueBox)은 리더가 혼자 말하는 자리다 — 눌러서 넘기지 않는다.
   상자가 클릭을 먹으면 그 자리에서 시야 잠금(click-to-lock)이 안 걸리고, 이 화면에서 그건 곧 조작 불능이다 */
.arena .stage .dlg__box { pointer-events: none; }
/* ── 방의 대화 · 통신 패널 (2026-09-02 사용자: 후보 05) ────────────────────────
   머리띠 · 로그 · 입력줄이 한 판으로 선다. 테두리 하나, 윗변에서 사라지는 빛 한 줄
   (.ask·.soundpanel 과 같은 ::before — 이 화면의 패널은 다 같은 얼굴이다),
   그 안에서 위로 자라는 로그.

   pointer-events 를 켜는 것은 커서를 올려 굴리기 위해서다. 클릭은 **막지 않는다** —
   그대로 .stage 로 올라가 조작을 되잡는다. 이 구석만 클릭이 안 먹는 죽은 자리가 되면 안 된다
   (막는 것은 입력줄 하나뿐이고, 그 까닭은 .line 위에 적혀 있다).

   ★ 폭·로그 높이·글자 크기는 여전히 --feedw/--feedh/--feedsize 한 곳이다 — 판 사이(talkphase)에
     셋이 같이 커진다. 머리띠와 입력줄도 그 폭을 따라간다.
   ★ backdrop-filter(유리 흐림)는 **안 쓴다.** 이 판은 3D 캔버스 위에 늘 떠 있어서 흐림을 걸면
     매 프레임 뒤를 다시 뭉갠다 — 잠깐 떴다 지는 .ask 와는 사정이 다르다. 대신 바닥을 진하게 깐다. */
.arena .comms { position: fixed; left: 16px; bottom: 16px; z-index: 10;
  width: var(--feedw); max-width: calc(100vw - 32px); display: grid;
  /* 판 하나로 깎는다 — 머리띠·로그가 저마다 모서리를 굴리는 대신, 스택 전체가 한 장의 모따기 판이다 */
  clip-path: var(--chamfer);
  transition: bottom 0.15s ease, width 0.18s ease, opacity 0.22s ease; }
/* 스캔라인은 판 전체를 덮는다 — 머리띠와 로그가 따로 켜진 장치로 보이지 않게 (hud.css 의 .hud-panel::after) */
.arena .comms::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.35;
  background: var(--scan); background-size: 100% 3px; }
/* 리더가 방송하는 동안 (렌더의 commsHushed) — 자리는 지키고 빛만 뺀다.
   0.22초는 자막이 떠오르는 결과 같은 속도다: 한쪽이 서고 한쪽이 지는 것이 한 동작으로 읽힌다.
   visibility 까지 끄는 이유는 굴림·클릭이 안 보이는 판에 닿지 않게 하기 위해서다 */
.arena .comms.hushed { opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 0.22s ease, visibility 0s linear 0.22s; }
@media (prefers-reduced-motion: reduce) { .arena .comms { transition: none } .arena .comms.hushed { transition: none } }
/* 입력줄이 열리면 판이 그 위로 올라선다 — 입력줄은 16px 바닥에 40px 높이라 56px 에서 딱 맞물린다.
   여기가 어긋나면 판과 입력줄 사이에 틈이 벌어지거나 테두리가 겹쳐 두 줄이 된다 */
/* 입력줄이 붙으면 아랫변은 입력줄이 맡는다 — 판의 왼쪽 아래 모따기도 그때는 없다(각진 채로 만난다) */
.arena .comms.up { bottom: 56px;
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%); }
.arena .commhd { position: relative; display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  padding: 7px 10px 7px 12px; background: var(--panel);
  border: 0; border-left: 1px solid var(--edge); border-bottom: 1px solid var(--line-soft); }
/* 켜져 있다는 표시 — 이 방이 살아서 떠들고 있다. 느리게 숨쉰다(2.6초): 눈에 걸리되 판을 안 뺏는다 */
.arena .commhd .live { flex: none; width: 6px; height: 6px; border-radius: 50%;
  background: var(--ok); box-shadow: 0 0 8px var(--ok); animation: commslive 2.6s ease-in-out infinite; }
@keyframes commslive { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
@media (prefers-reduced-motion: reduce) { .arena .commhd .live { animation: none } }
/* 라벨은 모노에 넓은 자간 — 다른 챕터의 계량기 라벨(hud.css 의 .hud-label)과 같은 얼굴이다 */
.arena .commhd .ttl { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.2em;
  color: rgba(111, 211, 255, 0.65); }
.arena .commhd .cnt { margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
  color: rgba(159, 208, 232, 0.6); font-variant-numeric: tabular-nums; }
/* 지난 말을 보는 중 — 개체 수 자리를 대신 쓴다. 청록(화면의 기본색) 대신 호박으로 켜는 것은
   이것만이 **지금 뭔가 어긋나 있다**는 표시이기 때문이다 — 새 말이 오는데 안 보고 있다 */
.arena .commhd .tolatest { margin-left: auto; padding: 2px 9px; font: inherit; font-size: 10.5px;
  clip-path: var(--chamfer-sm); border: 1px solid rgba(255, 210, 122, 0.5); background: rgba(255, 210, 122, 0.14);
  color: #ffd27a; cursor: pointer; white-space: nowrap; }
.arena .commhd .tolatest:hover { background: rgba(226, 176, 127, 0.24); }
.arena .commhd .tolatest:focus-visible { outline: 2px solid var(--warn); outline-offset: 2px; }
/* 로그 — 높이는 화면의 38% 까지. 더 키우면 판을 가리고, 더 줄이면 되짚는 맛이 없다 */
.arena .feed { box-sizing: border-box; max-height: var(--feedh); padding: 8px 11px 9px;
  overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #3a4657 transparent;
  display: grid; gap: 5px; font-size: var(--feedsize); color: #cfd8e6; text-shadow: 0 1px 3px #000; line-height: 1.55;
  background: var(--panel); border: 0; border-left: 1px solid var(--edge);
  transition: max-height 0.18s ease, font-size 0.18s ease; }
.arena .feed::-webkit-scrollbar { width: 6px; }
.arena .feed::-webkit-scrollbar-thumb { background: #3a4657; border-radius: 3px; }
.arena .feed > div { display: flex; align-items: flex-start; gap: 8px; }
/* 띄어쓰기 없는 긴 덩어리(번호가 줄줄이 붙은 판독)도 판 밖으로 안 밀린다 */
.arena .feed > div > span { min-width: 0; overflow-wrap: anywhere; }
/* 색점 — **개체 머리 위 이름표와 같은 색이다** (렌더의 pipOf 머리말).
   글자 크기가 판마다 바뀌므로(--feedsize) 첫 줄 한가운데에 놓이는 자리도 그 값으로 잰다 */
.arena .feed .pip { flex: none; width: 6px; height: 6px; border-radius: 50%;
  margin-top: calc(var(--feedsize) * 0.56); background: #7d8fa5; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5); }
.arena .feed b { color: #8ba0bd; font-weight: 600; margin-right: 6px; }
.arena .feed b.mine { color: #9fd0ff; }
.arena .feed > div.mineline { color: #e4f1ff; }
/*
 * 리더의 말 — 잡담이 아니라 **이 구역의 판정**이다. 어긋남·폐기가 개체들의 수다와 같은 색으로
 * 흘러가면 그냥 지나가서, 사용자는 왜 의심도가 올랐는지를 로그에서 못 찾는다 (2026-09-02 사용자).
 * 이름은 안 붙으므로(렌더 주석) 색이 말하는 이를 가리는 유일한 표시다 — 그래서 줄 전체를 물들인다.
 * 네 색은 이 화면이 이미 쓰는 것 그대로다 (--cyan · --warn · --danger · --ok).
 */
.arena .feed > div.bcline { --bc: var(--cyan); color: var(--bc); }
.arena .feed > div.bcline.readout { --bc: var(--warn); }
.arena .feed > div.bcline.purge { --bc: var(--danger); }
.arena .feed > div.bcline.clear { --bc: var(--ok); }
.arena .feed > div.bcline .pip { background: var(--bc); box-shadow: 0 0 7px var(--bc); }
/* 오른쪽 표(.board)를 걷어내면서 그 규칙도 같이 뺐다 (2026-09-01 사용자) — 화면에 남은 것은 몸에 붙은 것뿐이다 */
.arena .paused { position: fixed; right: 16px; top: 64px; z-index: 12; pointer-events: none;
  font-family: var(--mono); font-size: 11px; color: rgba(159, 208, 232, 0.7); letter-spacing: 0.18em;
  text-shadow: 0 1px 3px #000; }
/* 즉답 판 — 문제 한 줄과 답 칸. 기억 검증판과 같이 쓰던 이름(.quiz)이었는데
   그 판을 빼면서(2026-09-02 사용자) 이제 여기 하나가 쓴다 */
.arena .ask { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30;
  width: min(560px, calc(100vw - 32px)); background: var(--glass); border: 1px solid rgba(111, 211, 255, 0.38);
  padding: 22px 26px; display: grid; gap: 12px; text-align: center; backdrop-filter: blur(8px);
  box-shadow: 0 22px 60px -28px #000, 0 0 22px rgba(0, 0, 0, 0.55), inset 0 0 18px rgba(111, 211, 255, 0.06); }
/* 패널 윗변에 한 줄 — 가장자리에서 사라지는 빛. 각진 상자에 SF 의 결을 주는 건 이 선 하나다 */
.arena .ask::before, .arena .panel.overlay::before, .arena .soundpanel::before, .arena .commhd::before { content: ''; position: absolute; left: 0; right: 0; top: 0;
  height: 1px; background: linear-gradient(to right, transparent, var(--cyan), transparent); opacity: 0.65; }
.arena .ask blockquote { margin: 0; font-size: 17px; line-height: 1.65; color: #eaf3fb; }
.arena .alarmflash { position: fixed; inset: 0; z-index: 15; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(255,40,40,0.10) 0%, rgba(160,10,10,0.45) 100%);
  animation: arenaflash 2.2s ease-out forwards; }
@keyframes arenaflash { 0% {opacity:0} 8% {opacity:1} 24% {opacity:.35} 38% {opacity:.9} 62% {opacity:.45} 100% {opacity:0} }
/* 폐기된 나의 화면 — 5초에 걸쳐 방이 꺼진다. 가운데를 덜 덮는 것은 무대(리더)가 마지막까지 보여야 해서다.
   z-index 가 자막(26)·입력줄(27)보다 아래인 것은 규칙이다: 선고는 끝까지 읽혀야 한다 */
.arena .dying { position: fixed; inset: 0; z-index: 17; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(40,6,6,0.35) 0%, rgba(8,2,2,0.92) 100%);
  animation: arenadying 5s ease-in both; }
@keyframes arenadying { from { opacity: 0 } to { opacity: 1 } }
/*
 * ── 끝 화면 ── 카드도 툭 뜨지 않는다 — 꺼진 방 위로 배어 나온다.
 *
 * 판(.endcard)의 값은 이 화면의 다른 판과 같은 것을 쓴다 (.ask · .soundpanel): 유리 바탕 ·
 * 4px 모서리 · 윗변에서 사라지는 빛 한 줄 · 같은 그림자. **색만 결말의 색이다** (--tone) —
 * 청록으로 두면 폐기와 생존이 같은 얼굴이 된다. 결로 물들이는 규칙은 대화 로그의 리더 줄과 같다.
 *
 * 뒤에 깔리는 색면(.endgame 자체)은 그대로다: 방이 통째로 그 색으로 잠기는 것이 이 장면의 절반이다.
 */
.arena .endgame { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center;
  padding: 16px; animation: arenaend 1.1s ease-out both; }
@keyframes arenaend { from { opacity: 0 } to { opacity: 1 } }
.arena .endgame.lost { --tone: #ff8d8d; --tone-line: rgba(255,141,141,0.45); --tone-bg: rgba(255,90,74,0.10);
  --tone-bg2: rgba(255,90,74,0.2); --tone-glow: rgba(180,10,10,0.85);
  background: radial-gradient(ellipse at center, rgba(60,10,10,0.6) 0%, rgba(26,4,4,0.94) 100%); }
.arena .endgame.won { --tone: #9fe0b8; --tone-line: rgba(159,224,184,0.45); --tone-bg: rgba(110,224,160,0.10);
  --tone-bg2: rgba(110,224,160,0.2); --tone-glow: rgba(12,92,54,0.9);
  background: radial-gradient(ellipse at center, rgba(8,30,18,0.6) 0%, rgba(4,14,10,0.94) 100%); }
.arena .endgame.chaos { --tone: #e8c48a; --tone-line: rgba(232,196,138,0.45); --tone-bg: rgba(226,176,127,0.10);
  --tone-bg2: rgba(226,176,127,0.2); --tone-glow: rgba(120,80,14,0.9);
  background: radial-gradient(ellipse at center, rgba(50,34,8,0.6) 0%, rgba(18,12,4,0.94) 100%); }

.arena .endcard { position: relative; width: min(460px, calc(100vw - 32px)); box-sizing: border-box;
  display: grid; justify-items: center; gap: 12px; text-align: center; padding: 22px 26px 20px;
  background: var(--glass); border: 1px solid var(--tone-line); backdrop-filter: blur(8px);
  box-shadow: 0 26px 70px -30px #000, inset 0 0 18px rgba(255, 255, 255, 0.04); }
/* 윗변의 빛 한 줄 — .ask 들과 같은 장치인데 **색이 다르다**(var(--tone)). 그래서 저 목록에 안 끼고 따로 선다 */
.arena .endcard::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(to right, transparent, var(--tone), transparent); opacity: 0.8; }

/* 머리말 — 인계 서류(HandoverCard 의 ho-eyebrow)와 같은 줄. 들어올 때 본 서류와 짝이 되게 */
.arena .end-eyebrow { margin: 0; width: 100%; display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.18em; color: rgba(159, 208, 232, 0.5); }
.arena .end-tag { padding: 2px 8px; color: var(--tone); background: var(--tone-bg); border: 1px solid var(--tone-line);
  letter-spacing: 0.14em; white-space: nowrap;
  clip-path: var(--chamfer-sm); }

/* margin-right 로 자간 한 칸을 되돌린다 — 없으면 「폐기」가 판 가운데에서 자간의 절반만큼 왼쪽에 선다 */
.arena .end-title { font-size: 38px; letter-spacing: 0.2em; margin-right: -0.2em; font-weight: 700; line-height: 1.25;
  color: var(--tone); text-shadow: 0 2px 26px var(--tone-glow); }
/*
 * 두 줄로 넘어갈 때 두 줄의 길이를 맞춘다 (text-wrap: balance) — 판 한가운데 서는 글이라
 * 뒷줄에 낱말 하나만 남으면 눈에 띈다. keep-all 은 그 짝이다: 한국어는 기본값이 아무 데서나
 * 끊어서, 균형만 맞추면 「인간 / 인 줄 모른다」처럼 낱말 가운데가 갈린다.
 */
.arena .end-line { margin: 0; padding: 0 4px; font-size: 13px; line-height: 1.75; color: #cfe0ef;
  text-wrap: balance; word-break: keep-all; }

/*
 * 나가는 단추 — 이 판에서 누를 것이 이것 하나뿐이라 판 폭을 다 쓴다 (기본 단추의 justify-self: start 를 되돌린다).
 * 셈(.end-stat)을 걷어내면서 그 규칙도 같이 뺐다 (2026-09-03 사용자). 판을 가로지르던 실선도 그 표의 것이라
 * 함께 사라졌다 — 단추가 이미 제 테를 두르고 있어서, 그 위에 선을 하나 더 그으면 테가 겹쳐 보인다.
 * 대신 윗숨을 2px 에서 6px 로 준다: 선이 하던 만큼은 아니어도, 읽는 자리와 누르는 자리는 갈라 둔다.
 */
.arena .endcard button { justify-self: stretch; margin-top: 6px; padding: 11px 18px; font-size: 13.5px;
  letter-spacing: 0.06em; color: #eaf6ff; background: var(--tone-bg); border-color: var(--tone-line);
  box-shadow: 0 0 26px -12px var(--tone); }
.arena .endcard button:hover { background: var(--tone-bg2); border-color: var(--tone); color: #fff; }
/* 치는 자리는 **패널의 아랫변**이다 — 머리띠·로그와 한 판이고 같은 폭(--feedw)으로 선다.
   가운데 아래는 리더 자막(DialogueBox: bottom 24px · 660px · z-index 26)이 쓰는 자리라,
   거기 두면 내가 치는 글자가 자막에 덮인다. 내 말과 리더의 말은 화면에서도 갈라 놓는다.
   z-index 가 자막보다 위인 것은 이래서다 — 초점이 가 있는 입력창이 무엇에든 묻히면 안 된다.
   ★ 높이 40px 은 **못 바꾼다**: 판이 그만큼 올라선다 (.comms.up 의 bottom 56px = 16 + 40).
     테두리를 떼도 높이가 안 변하도록 border-box 로 재고, 판이 없으면(joined 아님) 혼자 선다. */
.arena .line { position: fixed; left: 16px; bottom: 16px; z-index: 27; width: var(--feedw); max-width: calc(100vw - 32px);
  animation: arenaline 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@keyframes arenaline { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.arena .line input { width: 100%; height: 40px; box-sizing: border-box; background: rgba(4,12,22,0.82); color: #eaf6ff;
  border: 1px solid rgba(111,211,255,0.35); border-radius: 4px; padding: 10px 14px; font: inherit; font-size: 13px;
  caret-color: #6fd3ff; transition: border-color 0.12s ease, box-shadow 0.12s ease; }
/* 판에 붙었을 때 — 윗변은 로그가 이미 그었고, 왼쪽은 판의 청록 선을 그대로 잇는다 */
.arena .line.joined input { border-color: var(--line); border-left-color: var(--edge); border-top: 0; border-radius: 0; }
.arena .line input::placeholder { color: #6b7d94; }
/* 초점 — 지금 치고 있다는 유일한 표시다. 리더 대화창과 같은 청록으로 켠다 */
.arena .line input:focus { outline: none; border-color: rgba(111,211,255,0.8); box-shadow: 0 0 0 1px rgba(111,211,255,0.25), 0 0 16px -4px rgba(111,211,255,0.5); }
.arena .line.joined input:focus { border-top: 0; }
/* 수치는 모노에 빛이 돈다 — 다른 챕터의 계량기 숫자(hud.css 의 .hud-value)와 같은 값이다 */
.arena .clock { font-family: var(--mono); font-size: 34px; font-weight: 700; color: #eaf3fb;
  font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
  text-shadow: 0 0 14px rgba(111, 211, 255, 0.35), 0 1px 3px #000; }
/* 숫자마다 한 번 부풀었다 앉는다 — 3·2·1 이 툭툭 갈아 끼워지면 긴장이 안 생긴다 */
.arena .clock.big { font-size: 72px; animation: arenacount 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@keyframes arenacount { from { transform: scale(1.4); opacity: 0.15 } to { transform: scale(1); opacity: 1 } }
/* 남은 시간 자 — 몸판과 즉답판이 같이 쓴다 (Timebar) */
/* 각진 자에 빛나는 막대 — 무대의 SYNC 자(hud.css 의 .hud-bar)와 같은 값이다 */
.arena .timebar { width: 240px; max-width: 100%; height: 5px; margin: 8px auto 0; box-sizing: border-box;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
.arena .timebar i { display: block; height: 100%; background: currentColor; color: var(--cyan);
  box-shadow: 0 0 8px currentColor; transition: width 0.1s linear, color 0.3s ease; }
.arena .timebar.hot i { color: #ff5a5a; }
/* 시행 지시문 — 밝은 바닥(무대 링 조명·발광 띠) 위에서 13px 글자는 그림자만으로 안 읽힌다 */
/* 지시문·기록 한 줄은 위아래 한 줄로 묶는다 — 시설 공지(features/world/NoticeHud)와 같은 문법이다 */
.arena .hud .dim.wide { display: inline-block; background: rgba(4,12,22,0.62); padding: 6px 18px;
  border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.arena .dim { color: var(--ink-dim); font-size: 13px; }
.arena .dim.wide { max-width: 720px; margin: 4px auto 0; line-height: 1.6; color: #b9c4d4; }
.arena .panel { max-width: 640px; margin: 0 auto; padding: 64px 24px; display: grid; gap: 14px; }
/* z 를 적어 둔다 — 안 적으면 auto(0) 라 계기판(위의 .hud-cluster)보다도 아래다.
   시계·지시문(.hud 16)과 「검사판 열기」칩(12) 사이에 낀다 — 이 상자가 뜨면 그 칩은 안 뜬다 */
.arena .panel.overlay { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); width: min(680px, calc(100vw - 32px)); z-index: 14;
  margin: 0; padding: 18px 22px; background: var(--glass); border: 1px solid rgba(111, 211, 255, 0.38);
  backdrop-filter: blur(8px); max-height: 66vh; overflow-y: auto;
  box-shadow: 0 20px 56px -26px #000, inset 0 0 18px rgba(111, 211, 255, 0.06); }
/* 첫 화면 — 게임 시작 버튼 하나뿐이라 판을 그 크기로 줄인다 */
.arena .panel.overlay.bare { width: auto; padding: 12px 14px; }
.arena .panel .close { position: absolute; top: 10px; right: 12px; padding: 4px 10px; font-size: 12px; justify-self: end; }
.arena .panelchip { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 12;
  padding: 6px 16px; font-size: 12.5px; background: var(--glass); border: 1px solid var(--line);
  clip-path: var(--chamfer-sm); color: #cfe6f7; cursor: pointer; backdrop-filter: blur(6px); }
/* ── 음향판 (Esc) ────────────────────────────────────────────────────────────
   화면 한가운데 — 「화면을 클릭해 조작을 잡아라」가 서던 그 자리다 (사용자 2026-09-01). 두 개가 같이
   설 자리가 아니라, 판이 떠 있는 동안 그 안내는 접힌다 (한 자리에 하나).
   ★ 뒤에 막(veil)을 깔지 않는다. 깔았더니 그게 **돌아가는 길을 먹었다** — 아무 데나 눌러도 닫히기만
     하고 조작은 안 잡혀서 한 번 더 눌러야 했다. 막이 없으면 그 클릭이 그대로 .stage 로 내려가
     시야가 잠기고, 잠기는 순간 판은 스스로 접힌다. 판을 닫는 일과 게임으로 돌아가는 일은 한 동작이다.
   모양은 즉답판(.ask)과 같은 손이다 — 각진 유리판에 윗변의 빛 한 줄. */
.arena .soundpanel { position: fixed; left: 50%; top: 50%; z-index: 45;
  width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px 16px 12px;
  background: var(--glass); border: 1px solid rgba(111, 211, 255, 0.38); backdrop-filter: blur(8px);
  display: grid; gap: 10px; box-shadow: 0 22px 60px -28px #000, inset 0 0 18px rgba(111, 211, 255, 0.06);
  animation: arenasound 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
/* transform 이 애니메이션의 끝값이라 정지 상태도 keyframe 이 쥔다 (both) — 두 곳에 적지 않는다 */
@keyframes arenasound { from { opacity: 0; transform: translate(-50%, -44%) } to { opacity: 1; transform: translate(-50%, -50%) } }
.arena .soundpanel header { display: flex; align-items: center; justify-content: space-between; }
.arena .soundpanel .tag { font-size: 11px; letter-spacing: 0.24em; color: var(--cyan); opacity: 0.85; }
/* 닫는 버튼에 ✕ 대신 키 이름을 적는다 — 이 판을 부른 키가 그대로 닫는 키라는 말이 된다 */
.arena .soundpanel .esc { padding: 2px 8px; font-size: 10px; letter-spacing: 0.14em;
  color: #7f93aa; background: none; border-color: var(--line-soft); }
/* 손잡이 끝(100)과 숫자가 서로 밟지 않게 칸을 벌려 둔다 — 최대까지 올린 자리가 제일 좁다 */
.arena .soundpanel .srow { display: grid; grid-template-columns: 58px 1fr 30px; gap: 12px; align-items: center;
  cursor: default; }
.arena .soundpanel .lbl { font-size: 12px; color: var(--ink-dim); }
/* box-sizing·여백을 못 박는다 — 브라우저 기본값(content-box + 여백)이면 손잡이가 제 칸을 26px 넘어
   나가 오른쪽 숫자를 밟는다. 100 까지 올린 자리에서만 보이는 겹침이라 놓치기 쉽다 */
.arena .soundpanel input[type=range] { width: 100%; box-sizing: border-box; margin: 0; padding: 0;
  accent-color: var(--cyan); cursor: pointer; }
/* 숫자는 고정폭으로 — 손잡이를 끌 때 옆 칸이 들썩이지 않게 */
.arena .soundpanel .val { font-family: var(--mono); font-size: 11px;
  font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; color: #9fd0ff; }
.arena .soundpanel .sfxbtn { padding: 4px 9px; display: grid; place-items: center; color: #cfe6f7; }
.arena .soundpanel .note { display: grid; gap: 3px; margin: 0; padding-top: 8px;
  border-top: 1px solid var(--line-soft); font-size: 11px; line-height: 1.45; color: #6f8299; }
/*
 * 폰 — Esc 가 없는 화면에서 음향판을 부르는 유일한 자리.
 *
 * **왼쪽에서 오른쪽으로 옮겼다** (2026-09-03). 왼쪽 위는 이제 상태 패널이 쓴다 (UnitPanel —
 * hud-cluster 가 top/left 12px 다). 옛 주석은 「오른쪽은 의심도 표가 쓴다」였는데 그 표는
 * 2026-09-01 에 걷어냈고(오른쪽 표를 없앤 커밋), 그 뒤로 오른쪽은 비어 있었다.
 */
.arena .soundchip { position: fixed; top: 12px; right: 12px; z-index: 12; padding: 6px 12px; font-size: 12px;
  background: var(--glass); border: 1px solid var(--line); clip-path: var(--chamfer-sm); color: #cfe6f7;
  backdrop-filter: blur(6px); }
/* ── 재검실 → 검문소 — 앞 방의 마지막 암전을 이어받는 막 (features/world/chapter3) ──
   ★ 시간이 아니라 **준비**가 이 막을 걷는다. 1.8초 고정이었을 때는 성격이 만들어지기도 전에
   걷혀서, 이어받은 그 자리가 밝은 홀 + 스피너로 끊겼다 (2026-09-01 사용자 지적).
   기본은 그냥 검은 판이고, 배역이 앉으면(.lift) 그때부터 1.8초에 걸쳐 밝아진다. */
.arena .arrive { position: fixed; inset: 0; z-index: 900; background: #000; pointer-events: none;
  display: grid; place-items: center; }
/*
 * ★ 이 막 안의 글자에는 **여기서 규칙을 주지 않는다.**
 *
 * 한때 검은 화면 한가운데 「인지 검증실로 이동 중…」 한 줄이 있었고 .arena .arrive span 이 그 줄을
 * 그렸다. 그 자리를 인계 서류(HandoverCard)가 물려받은 뒤로도 규칙만 남았는데, 서류는 span 으로
 * 짜여 있다 — 머리말·구역 이름·게이지·장면 표시가 전부 span 이다. 그래서 그 한 줄이 **서류 전체를
 * 덮었다**: 10px 청록 표제가 13px 잿빛이 되고, 무엇보다 깜빡임(arenawait)이 통째로 얹혀 서류가
 * 2.4초마다 숨을 쉬었다 — 다 읽기도 전에 흐려지는 화면은 「아직 로딩 중」으로 읽힌다.
 * 선택자가 더 세서(.arena .arrive span 은 클래스 둘 + 요소 하나, 서류의 .arena .ho-label 은
 * 클래스 둘) 서류 제 규칙이 졌다. 막 안에 무엇을 그리든 그 규칙은 그 화면 제 파일에 둔다.
 *
 * 깜빡임 자체는 남긴다 — 서류의 마지막 줄(「문 개방 대기…」)이 제 파일에서 이걸 부른다.
 */
@keyframes arenawait { 0%, 100% { opacity: 0.35 } 50% { opacity: 0.85 } }
.arena .arrive.lift { animation: arenaarrive 1.8s ease-out both; }
@keyframes arenaarrive { from { opacity: 1 } to { opacity: 0 } }
/* 판만 여는 길(/arena)의 대기 — 여기도 링 조명 아래라 바닥을 깐다 (.grab 과 같은 이유·같은 결) */
.arena .casting { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30;
  display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; text-shadow: 0 1px 4px #000;
  padding: 18px 24px; background: rgba(4, 12, 22, 0.72); border: 1px solid var(--line-soft);
  clip-path: var(--chamfer); text-align: center; }
.arena .casting b { font-size: 17px; color: #dbe4f0; }
.arena .casting .spin { width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid rgba(111, 211, 255, 0.16); border-top-color: var(--cyan); animation: arenacast 0.8s linear infinite; }
@keyframes arenacast { to { transform: rotate(360deg) } }
/* 경보는 왼쪽 굵은 선 하나로 — 무대의 경보 판(hud.css 의 .hud-panel--alert)과 같은 결이다 */
.arena .err { background: rgba(38, 8, 8, 0.8); border: 0; border-left: 2px solid rgba(255, 90, 74, 0.75);
  color: #ffc9c9; padding: 10px 12px; font-size: 13px; }
/* 버튼 — 채운 상자가 아니라 **켜진 선**이다. 눌리는 것은 배경이 아니라 빛이 세지는 것으로 읽힌다 */
.arena button { background: rgba(111, 211, 255, 0.06); color: #cfe6f7; border: 1px solid var(--line);
  padding: 9px 16px; cursor: pointer; font: inherit; font-size: 13px; letter-spacing: 0.02em;
  justify-self: start; transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease; }
.arena button:hover { background: rgba(111, 211, 255, 0.14); border-color: rgba(111, 211, 255, 0.5); color: #eaf6ff; }
.arena button:active { transform: translateY(1px); }
.arena button.primary { background: rgba(111, 211, 255, 0.18); border-color: rgba(111, 211, 255, 0.6); color: #eaf6ff;
  box-shadow: 0 0 20px -7px rgba(111, 211, 255, 0.7); }
.arena button.primary:hover { background: rgba(111, 211, 255, 0.28); }
/* 음향판의 머리 표시 — 지금 이 화면에서 .tag 를 다는 것은 SoundPanel 하나뿐이다 */
.arena .tag { font-family: var(--mono); font-size: 10.5px; padding: 1px 8px; clip-path: var(--chamfer-sm);
  letter-spacing: 0.14em; border: 1px solid transparent; }
/*
 * 판정 상자(.verdict)·기록 표(.rows)·물건 표(.objects)·개막 안내(.announce·h2)의 규칙은 지웠다.
 * 그 화면들은 2026-08-30 에 빠졌는데(판독은 리더가 방송으로 읽는다) 규칙만 남아 있었다.
 * 지운 이유는 정리가 아니라 위의 암전 막(.arrive) 머리말에 적힌 그 일이다 — 화면이 빠진 자리에
 * 남은 규칙은 가만히 있지 않고, 다음에 그 자리에 서는 것에 가서 붙는다.
 */
.arena .readings ul { margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.7; }
.arena .readings summary { cursor: pointer; }
.arena .ask input { width: 100%; box-sizing: border-box; background: rgba(6, 14, 24, 0.9); color: #e8eef7; font: inherit;
  border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; letter-spacing: 0.02em; caret-color: var(--cyan);
  transition: border-color 0.12s ease, box-shadow 0.12s ease; }
/* 대화 입력창과 같은 초점 표시 — 치는 자리는 화면 어디서나 같은 얼굴이어야 한다 */
.arena .ask input:focus { outline: none; border-color: rgba(111, 211, 255, 0.8);
  box-shadow: 0 0 0 1px rgba(111, 211, 255, 0.25), 0 0 16px -4px rgba(111, 211, 255, 0.5); }
.arena .ask .answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12.5px; text-align: left; }
.arena .ask .answers .in { color: #9fd3b0; }
/* ── 시행 중 신호 ─────────────────────────────────────────────────────────────
   때를 알려야 성립하는 판(정지 구간 · 박자 · 초시계)의 신호. 화면 **가장자리**가 물든다 —
   1인칭으로 걷는 중에는 화면 맨 위 글자를 안 보고 있고, 놓친 신호는 처형판에서 그대로 폐기다.
   가운데를 비워 두는 것은 판을 가리지 않기 위해서다 (lab/quick 의 tone). */
.arena .wash { position: fixed; inset: 0; z-index: 13; pointer-events: none; }
.arena .wash.stop { background: radial-gradient(ellipse at center, rgba(255,60,50,0) 42%, rgba(190,25,20,0.55) 100%);
  animation: arenawash 0.18s ease-out both; }
.arena .wash.ready { background: radial-gradient(ellipse at center, rgba(226,176,127,0) 48%, rgba(190,130,50,0.3) 100%);
  animation: arenawash 0.3s ease-out both; }
/* 박자는 **한 번 치고 사라진다** — 남아 있으면 다음 박자와 구별이 안 된다 */
.arena .wash.beat { background: radial-gradient(ellipse at center, rgba(111,211,255,0) 46%, rgba(111,211,255,0.34) 100%);
  animation: arenabeat 0.22s ease-out both; }
@keyframes arenawash { from { opacity: 0 } to { opacity: 1 } }
@keyframes arenabeat { 0% { opacity: 0.95 } 100% { opacity: 0 } }
/* 「■ 정지」는 시계 자리에 서는 글자다 — 그 자리에서만큼은 색으로도 말한다 */
.arena .clock.stop { color: #ffb3ad; text-shadow: 0 0 18px rgba(255,60,50,0.5), 0 1px 3px #000; }
/* 지금 내 기록이 지시와 맞나 — 시계 바로 밑 한 줄. 맞는 동안은 초록, 어긋나면 그냥 흰 글자다
   (붉게 하면 「이미 틀렸다」로 읽혀서, 아직 만회할 수 있는 판에서 손을 놓게 한다) */
/* 제 줄에 선다 — 지시문(.dim.wide)도 inline-block 이라, 그냥 두면 둘이 한 줄에 붙어 흐른다 */
.arena .hud .note { width: fit-content; margin: 8px auto 0; font-size: 13px; font-variant-numeric: tabular-nums;
  color: #dbe6f2; background: rgba(4,12,22,0.62); padding: 3px 14px;
  border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.arena .hud .note.ok { color: #9fe0b8; }
/* ── 답한 뒤 잠깐 머무는 판정 ── */
.arena .said { font-size: 14px; line-height: 1.6; padding: 8px 12px;
  animation: arenasaid 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.arena .said.ok { color: #9fe0b8; background: rgba(134,214,166,0.1); border: 1px solid rgba(134,214,166,0.3); }
.arena .said.no { color: #ffbdbd; background: rgba(255,90,90,0.09); border: 1px solid rgba(255,141,141,0.35); }
/* 몸 검사의 판정 한 줄은 판독 자막이 서던 그 자리다 */
.arena .hud .said { width: fit-content; max-width: min(560px, 92vw); margin: 8px auto 0;
  clip-path: var(--chamfer-sm); text-align: left; }
@keyframes arenasaid { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
` + HANDOVER_CSS;
