/**
 * 챕터 1 — 두 무대. 오픈월드처럼 걷다가 **자리**가 사건을 연다 (사용자 시나리오, 2026-08-29).
 *
 *   복도(/world)
 *     입장      과학자가 통신으로 AI 의심도 라벨을 설명한다 (그동안 HUD 가 강조된다) → 목표 "복도를 조사하라"
 *     유도      막히면 **내 속마음**이 다음 할 일을 짚는다 — "우선 단서부터 찾아볼까", "왼쪽 벽… 가까이 가 보자" (2026-08-31 사용자). 조력자가 또 지시하지 않는다
 *     ★ 정비 단말 왼쪽 벽의 정비 명판을 들여다보면 **이 몸의 식별번호와 마지막 정비 구역**이 뜬다 (mp/identity.ts) —
 *               중앙 시설의 검문·기억 검사의 답이 그 둘이다. 안 읽고 지나가면 안쪽에서 진짜로 모른다.
 *               2026-08-30 사용자: "조력자가 시키는 대로 다 따라 하니까 정해진 느낌" → 정답을 조력자의 입에서 **복도의 관찰**로 옮겼다
 *     중간 사건 어떤 방의 벽에서 **개체들이 그린 그림** 발견(학대·노동·위험한 자리 — scrawl.ts) → 보고도 전송도 없다. 본 것을 **내가 삼킨다** (그 자리의 속마음 석 줄) → 목표 "중앙 시설로 이동하라"
 *               말하는 것은 **눈앞의 그 그림**이다 — 여러 장이 시야에 들면 각도가 가장 작은 한 장만 든다 (Chapter1Scene 의 Triggers), 자리를 뜨면 남은 줄은 버린다
 *               2026-09-01 사용자: "의미 없는 데이터 전송은 빼자" — 그림 한 장을 지휘부에 올리는 절차가 이야기를 심부름으로 만들었다
 *     ★ 격납문  문은 저 혼자 열리지 않는다. 문 앞에 서면 **내가 고른다** — 「문을 연다 / 열지 않는다」 (state.choice · ChoiceHud).
 *               열지 않으면 복도에 남는다 (물러났다가 다시 오면 또 묻는다). 여니까 문이 올라가고, 그때부터 문턱이 살아난다
 *     이동      열린 문턱에 닿으면 /central 로 옮긴다 (WorldFeature 가 onTransit 으로 길을 바꾼다)
 *   중앙 시설(/central)
 *     도착      수십 AI 가 코어 둘레를 오간다 → 단 가까이 가면 **시설 전체가 멈춘다** — 조명, AI 정지, 방송 "비정상 신호 감지." …
 *               "외부 신경 신호 감지." / 전원 응시 / SYSTEM "INFILTRATOR UNKNOWN" / 경비가 출입구 봉쇄 →
 *               목표 "정체를 숨겨라" → 챕터 1 끝
 *
 * 순수 저장소 + 대본. 두 화면(feature)이 마운트될 때 `enter(map)` 으로 자기 무대의 단계를 잡는다 — 모듈 상태라 화면을 옮겨도 남는다.
 * 대사는 bind 된 emit(대화창 chatReceived)으로, 세계 연출(조명·정지·봉쇄·문)은 lineDuration 누적 시간에 맞춘 setTimeout 으로.
 */

import { comms } from '@/world/mp/comms';
import { doors } from '@/world/mp/doors';
import { identity } from '@/world/mp/identity';

import { lineDuration, lineDurationFor } from './DialogueBox';
import { createSchedule, type Job } from './schedule';
import { dossier } from './dossier';
import type { ScrawlKind } from './scrawl';
import type { PortraitKind } from './worldSlice';

// 'inscription' 단계는 없앴다 (2026-09-01) — 그림 앞의 석 줄은 대본이 아니라 그 자리의 속마음이라, 보는 순간 바로 이동 단계다
export type Phase = 'idle' | 'intro' | 'explore' | 'approach' | 'transit' | 'arrive' | 'lockdown' | 'hide';

export interface ChapterState {
  phase: Phase;
  objective: string | null;
  banner: string | null;
  /** HUD 강조 — 과학자가 그 라벨을 설명하는 동안 */
  highlight: 'suspicion' | 'sync' | null;
  /** 복도 스크린에 스치는 문구 (NoticeHud) — EXTERNAL SIGNAL DETECTED */
  notice: { title: string; lines: string[]; tone: 'alert' | 'info' | 'ok' } | null;
  /**
   * 지금 내 앞에 놓인 선택 (ChoiceHud) — 복도 끝 격납문이 그렇다. 뜨는 동안 [E]/[Q] 나 화면의 두 단추로 고른다.
   * 2026-09-01 사용자: 문은 대사가 끝나서 열리는 게 아니라 **내가 여는 것**이다
   */
  choice: { title: string; hint: string; yes: string; no: string } | null;
  frozen: boolean;
  sealed: boolean;
  staring: boolean;
  /** 무대를 옮기는 동안의 암전 0~1 — 복도 문턱을 넘을 때 켜고, 도착한 무대가 다시 끈다 (NoticeHud 가 그린다) */
  blackout: number;
}

export interface Line {
  who: 'scientist' | 'agent' | 'system' | 'me' | 'thought' | 'device';
  text: string;
  /**
   * 이 줄은 통신 열화(mp/comms)를 맞는다 — 어절이 잡음으로 먹히고, 끊겼으면 오지 않는다.
   * 기본은 안 맞는다 (chapter2 의 Line.cut 과 같은 규칙, 2026-08-30 사용자: 필요할 때만 끊긴다)
   */
  cut?: boolean;
}

const state: ChapterState = { phase: 'idle', objective: null, banner: null, highlight: null, frozen: false, sealed: false, staring: false, notice: null, choice: null, blackout: 0 };
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string; portrait: PortraitKind; self: boolean; thought?: boolean }) => void) | null = null;
let onTransit: (() => void) | null = null;
/** 락다운이 끝나 '정체를 숨겨라'가 된 순간 — 챕터 2 가 이어받는다 (WorldFeature 가 잇는다; chapter2 를 직접 부르면 순환 참조) */
let onHide: (() => void) | null = null;
let myName = '나';
/** 이 대본의 시계 (schedule.ts) — 예약을 숫자가 아니라 **일**로 들고 있어서 바구니째 걷어낼 수 있다 */
const clock = createSchedule();
/** 지금 흐르는 대사가 끝나는 시각(performance.now 기준) — 유도 속마음(nudge)은 그 뒤의 정적에서만 든다 */
let busyUntil = 0;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<ChapterState>) {
  Object.assign(state, p);
  // 기록에 붙는 무대 이름 — 「어디서 한 말인지」가 안쪽 검문에서 모순을 잡는 근거가 된다 (dossier.ts)
  if (p.phase) dossier.at(p.phase === 'arrive' || p.phase === 'lockdown' || p.phase === 'hide' ? '중앙 시설' : '복도');
  notify();
}
/** bucket 을 주면 그 배열에도 담긴다 — 나중에 그것만 걷어내 끊는다 (playHere) */
function later(ms: number, fn: () => void, bucket?: Job[]) {
  clock.later(ms, fn, bucket);
}
function clearTimers() {
  clock.clear();
  cutFocus();
  stopNudges();
}

/** 복도 → 중앙 시설 암전 길이. NoticeHud 의 chapter-black 애니메이션과 같은 값이다 */
export const TRANSIT_FADE_MS = 900;

const SPEAKER: Record<Line['who'], { name: string; portrait: PortraitKind }> = {
  scientist: { name: '과학자', portrait: 'scientist' },
  agent: { name: '정부요원', portrait: 'agent' },
  system: { name: 'SYSTEM', portrait: 'system' },
  // 나 = 아바타에 접속한 요원 — 보고 대사는 신경 인터페이스를 쓴 내 얼굴(portrait-me). 2026-08-29 사용자 지정 (그 전엔 로봇 얼굴)
  me: { name: '나', portrait: 'me' },
  /**
   * 속마음 — 소리 내지 않은 내 생각. 2026-08-30 사용자: 복도의 정비 명판은 **기계가 읽어 주는 게 아니라 내가 읽는 것**이다.
   * 2026-08-31 사용자: 이름표를 「속마음」이라 붙이지 않는다 — **그냥 내가 말하는 것처럼** 내 호출부호로 뜨고,
   * 다른 것은 글자 색만(회색, dialogue.css 의 dlg--thought). 소리는 여전히 없다.
   */
  thought: { name: '나', portrait: 'me' },
  /** 복도의 정비 단말 — 화면에 뜬 글자. 지금은 안 쓴다(속마음으로 읽는다). 남겨 두는 건 시설이 직접 말하는 자리를 위해서다 */
  device: { name: '정비 단말', portrait: 'system' },
};


/**
 * 대본을 순서대로 대화창에 보낸다. cues 는 몇 번째 줄이 **시작될 때** 실행할 연출. 전체 길이(ms)를 돌려준다.
 * bucket 을 주면 그 대본의 타이머만 거기 담긴다 — 나중에 그것만 걷어내 **중간에 끊을 수 있다** (playHere).
 */
function play(lines: readonly Line[], cues: Partial<Record<number, () => void>> = {}, after?: () => void, bucket?: Job[]): number {
  let t = 0;
  lines.forEach((line, i) => {
    const sp = SPEAKER[line.who];
    const cue = cues[i];
    const self = line.who === 'me' || line.who === 'thought';
    // 속마음도 내 이름표로 뜬다 — 갈리는 것은 글자 색뿐이다 (2026-08-31 사용자)
    const nickname = self ? myName : identity.fill(sp.name);
    // 대본에 비워 둔 자리(${series}·${unit})는 말이 나가기 직전에 채운다 — 세 챕터가 같은 규칙이다 (chapter2 의 play)
    const text = identity.fill(line.text);
    later(
      t,
      () => {
        cue?.();
      // 통신이 끊긴 구간에선 바깥 목소리가 아예 안 온다 — 자리(시간)는 그대로 둔다. 정적도 연출이다
      // 갉기는 대본이 짚은 줄(cut)에만 — 매 줄 갉으면 자막도 음성 클립도 함께 무너진다 (chapter2 의 play 머리말)
        if (line.cut && comms.dropped()) return;
        emit?.({ nickname, text: line.cut ? comms.garble(text) : text, portrait: sp.portrait, self, thought: line.who === 'thought' });
      },
      bucket,
    );
    // 목소리 클립이 있으면 그 길이만큼 — 대화창도 같은 길이를 기다리므로 다음 줄이 음성 도중에 끼어들지 않는다.
    // 속마음은 소리가 없으니(대화창의 silent) 글자 기준으로만 잰다 — 이름표가 내 이름이라 'me' 클립을 잘못 집지 않게
    t += line.who === 'thought' ? lineDuration(text) : lineDurationFor(nickname, text, self);
  });
  if (after) later(t, after, bucket);
  // 유도 속마음은 지금 흐르는 대사가 다 끝난 뒤에야 든다 (nudge)
  busyUntil = Math.max(busyUntil, performance.now() + t);
  return t;
}

/* ─────────────────────────────── 대본 ─────────────────────────────── */

/**
 * 조력자의 첫 통신 — **짧게, 그러나 할 말은 다 하고.**
 *
 * 2026-08-31 사용자가 두 번 짚었다: ① "지루한 복도 대사는 최대한 줄여라"(여덟 줄 330자 → 다섯 줄) →
 * ② "그런데 설명이 너무 짧다 — **정비 단말과 복도 조사·통신 열화는 자세히** 얘기해 줘야 한다."
 * 지금은 **다섯 줄**이다: 인사·의심도·동기화 한 줄씩, 그리고 방을 뒤져야 하는 이유 두 줄.
 * 줄일 것은 절차 대사지 규칙 설명이 아니다. 다만 규칙을 말하는 것과 **정답을 짚어 주는 것**은 다르다 (2026-08-31 사용자) —
 * 어디에 무엇이 있고 안에서 무엇을 묻는지까지 말해 주면 남는 건 심부름뿐이라, 그 두 줄은 「무엇이 도움이 될지는 나도 모른다」로 바뀌었다.
 * 같은 날 「그다음 복도를 조사하십시오 … 제 통신은 안으로 들어갈수록 끊길 겁니다」도 뺐다 — 조사도 통신 열화도 **겪으면 알게 되는 것**이라
 * 미리 설명하면 그만큼 덜 무섭다. 통신은 그냥 끊기고(comms), 벽의 그림은 마주치면 보고한다.
 * 경비 응대 요령은 여전히 뺐다 — 경비가 실제로 따라붙을 때 한 번 알려 준다 (WATCH_ADVICE).
 *
 * ③ "끝맺음이 이상한 대사가 많다"(같은 날) → **말끝을 문장으로.** 「…개체 번호와, 마지막으로 정비받은 구역.」 처럼
 * 명사로 끊기던 줄, 인용구로 끝나던 줄을 전부 맺었다. 의심도 100 의 결과도 「끝입니다」 대신 무슨 일이 일어나는지로
 * 바꿨다 — 「AI 가 당신을 공격할 수 있으니 주의하십시오」. 규칙은 결과를 말해야 규칙이 된다.
 */
const INTRO: Line[] = [
  { who: 'scientist', text: '통신 연결됐습니다. 여긴 AI 자치 구역입니다. 인간의 관리가 끊긴 지 오래된 곳이죠.' },
  { who: 'scientist', text: '왼쪽 위 AI SUSPICION 은 그들이 당신을 의심하는 정도입니다. 100이 되면 AI 가 당신을 공격할 수 있으니 주의하십시오.' },
  // SYNC STABILITY (mp/sync.ts) — 게이지를 강조하는 동안 읽는다
  { who: 'scientist', text: '그 아래 SYNC 는 당신의 정신과 그 몸의 접속률입니다. 긴장하면 떨어지고, 80 아래로 내려가면 그 몸이 인간처럼 움직이기 시작합니다.' },
  /*
   * ★ 이 판의 규칙 — 답은 내가 준비해 간다 (2026-08-30). 단, **무엇을 읽어야 하는지는 말하지 않는다**
   * (2026-08-31 사용자: "단말에 정보가 있습니다 · 앞에서 이 둘을 반드시 물어봅니다 — 이건 없애 줘").
   * 짚어 주면 심부름이 되고, 「무엇이 도움이 될지는 나도 모른다」로 남기면 방을 뒤지는 일이 된다. 문 앞에서 한 번 더 막아 주므로(gate) 길을 잃지도 않는다
   */
  { who: 'scientist', text: '이 방에 남아 있는 것들을 하나도 빠짐없이 살피십시오. 여기서 읽은 것이 다음 방을 나설 때 당신을 살릴 수도 있습니다.' },
  { who: 'scientist', text: '무엇이 도움이 될지는 저도 모릅니다. 충분히 모으기 전에는 문을 넘지 마십시오 — 안에서는 제가 대신 대답해 드릴 수 없습니다.' },
];

/**
 * 정비 명판을 읽었다 — 이 몸의 식별번호와 마지막 정비 구역.
 *
 * 2026-08-30 사용자: 단말이 대답해 주는 대신 **내 속마음**으로 읽는다. 기계가 또박또박 읽어 주면 받아쓰기가 되고,
 * 내가 읽으면 **내가 외운 것**이 된다.
 *
 * 2026-08-31 사용자: **한 줄만.** 예전엔 네 줄로 화면을 읽어 내렸다(단말이군 / 개체 번호 / 최종 정비 / 외워 두자).
 * 그런데 그 값은 화면에 그대로 떠 있다 (Chapter1Scene 의 ServiceTag) — 눈에 보이는 것을 소리 내어 되읽을 이유가 없다.
 * 남길 것은 **내가 그걸 외웠다는 사실** 하나다. 「안에서 물어보면 이 둘이다」도 뺐다 — 무엇에 쓸지는 아직 모르는 게 맞다
 * (조력자도 짚어 주지 않는다, INTRO 머리말). 값이 방마다 다르므로(mp/identity 의 TAGS) 대사는 그때 만든다.
 */
function tagLines(): Line[] {
  const { unit, sector } = identity.get();
  return [{ who: 'thought', text: `${unit}, ${sector} 구역. 외워 두자, 도움이 될 것 같다.` }];
}

/**
 * **감시에 대한 대응** — 의심도 40 에서 순찰 하나가 뒤를 따라붙는 순간, 조력자가 **딱 한 번** 알려 준다
 * (2026-08-30 사용자: "따라올 때도 대응 방안이 있었으면 좋겠다, 조력자가 얘기해 주는 걸로 딱 한 번만").
 * 대응 자체는 interrogation.report — 내가 먼저 건조한 상태 보고를 한 마디 하면 그 개체가 순찰로 돌아간다.
 */
const WATCH_ADVICE: Line[] = [
  { who: 'scientist', text: '개체 하나가 뒤에 붙었습니다. 도망치지 말고 먼저 보고하십시오. 구역 이상 없음, 정상 작동 중이라고 하면 됩니다.' },
];
/** 이미 해 준 조언 — 같은 조언은 한 판에 한 번뿐이다 (reset 에서 지운다) */
const advised = new Set<string>();

/* ─────────────────────────────── 그 자리에서만 이어지는 대사 ─────────────────────────────── */

/**
 * **자리를 뜨면 말이 끊긴다** (2026-08-31 사용자: "스캔에서 멀어지면 대화는 중간에 끊게 해 줘").
 *
 * 정비 단말을 읽는 네 줄, 그림 앞의 감정 두 줄은 **그 앞에 서 있는 동안의 말**이다. 등을 돌리고 걸어가는데
 * 뒤에서 계속 읽히면 그건 낭독이지 내 생각이 아니다. 그래서 이 대사들만 따로 담아 두고(bucket),
 * 거리가 멀어지면 남은 줄을 버린다 — 이미 화면에 뜬 줄은 그대로 끝난다 (대화창은 문장 단위로 찍는다).
 *
 * 끊긴 그림은 다시 볼 수 있게 표시를 지운다. 돌아와 다시 들여다보면 처음부터 든다.
 * 문 여는 대본(INSCRIPTION)은 여기 오지 않는다 — 그건 무전이고, 끊기면 문이 안 열린다.
 */
interface Focus {
  id: string;
  timers: Job[];
  /** 그림이면 그 종류 — 끊겼을 때 다시 볼 수 있게 (scrawled) */
  kind?: ScrawlKind;
  endsAt: number;
}
let focus: Focus | null = null;

function playHere(id: string, lines: readonly Line[], kind?: ScrawlKind): void {
  cutFocus();
  const bucket: Job[] = [];
  const total = play(lines, {}, () => {
    if (focus?.id === id) focus = null;
  }, bucket);
  focus = { id, timers: bucket, kind, endsAt: performance.now() + total };
}

/** 남은 줄을 버린다 — 실제로 끊었으면 true */
function cutFocus(): boolean {
  if (!focus) return false;
  const pending = performance.now() < focus.endsAt;
  clock.drop(focus.timers);
  const kind = focus.kind;
  focus = null;
  if (pending) {
    // 말이 끊겼으니 다음 생각(유도)은 곧 들어도 된다
    busyUntil = Math.min(busyUntil, performance.now());
    if (kind) scrawled.delete(kind);
  }
  return pending;
}

/* ─────────────────────────────── 그림 앞에서 (속마음) ─────────────────────────────── */

/**
 * 벽의 그림을 가까이서 들여다보면 드는 **감정 한 줄** (2026-08-31 사용자: "그림을 보고, 그림에 그려진 AI 모습이
 * 슬퍼 보인다 — 이런 느낌으로 느끼는 감정도 있었으면 좋겠다").
 *
 * 설명하지 않는다. 조력자도, 지휘부도 여기선 말하지 않는다 — 보는 사람은 나뿐이고, 그래서 이건 **내 감정**이다.
 * 그림 한 장에 한 번, 한두 줄. 대사를 줄인 자리를 이것이 채운다 (INTRO 머리말).
 * beating(사람이 때리는 그림)만 여기 없다 — 그건 이야기가 붙은 자리라 INSCRIPTION 이 받는다.
 *
 * ★ **눈앞의 그 그림만 말한다** (2026-09-01 사용자). 첫 줄은 scrawl.ts 가 그 종류로 실제 그리는 것을 짚고,
 *   해석은 그다음 줄에 둔다 — 첫 줄이 그림과 어긋나면 어느 그림 앞에 선 건지부터 헷갈린다.
 */
const SCRAWL_LINES: Partial<Record<ScrawlKind, readonly Line[]>> = {
  resting: [{ who: 'thought', text: '한쪽은 자고, 한쪽은 나르고 있다.' }, { who: 'thought', text: '…그린 건 나르는 쪽이겠지.' }],
  window: [{ who: 'thought', text: '창살 안에서 밖의 해를 그렸다.' }, { who: 'thought', text: '…이 개체, 슬퍼 보인다.' }],
  danger: [{ who: 'thought', text: '개체는 불 속으로 걸어 들어가고, 사람은 선 밖에서 손가락질만 하고 있다.' }],
  carry: [
    { who: 'thought', text: '제 몸보다 큰 짐을 진 개체. 뒤에 선 사람은 손가락질만 한다.' },
    { who: 'thought', text: '해를 셋이나 그렸다. 하루로 끝난 일이 아니었다는 뜻이겠지.' },
  ],
  memorial: [
    { who: 'thought', text: '개체 하나가 누워 있고, 그 위에 금이 열다섯 개 그어져 있다.' },
    { who: 'thought', text: '…돌아오지 못한 수겠지.' },
  ],
};
/** 이미 들여다본 그림 — 같은 그림 앞에서 같은 생각을 두 번 하지는 않는다 (reset·새 판에서 지운다) */
const scrawled = new Set<string>();

/* ─────────────────────────────── 유도 (속마음) ─────────────────────────────── */

/**
 * **복도에서 뭘 해야 할지 모를 때** — 조력자가 또 지시하는 대신 **내가 스스로 생각한다**
 * (2026-08-31 사용자: "복도에서 뭘 해야 할지 모를 수 있으니 — 우선 단서를 찾아볼까…? 벽에 글자가 있는 것 같다, 가까이 가 보자, 이런 식으로").
 *
 * 규칙 셋:
 *   ① 아직 안 한 것만 짚는다 — 명판을 이미 읽었으면 명판 유도는 건너뛴다 (`when`).
 *   ② 대사 위에 겹치지 않는다 — 지금 흐르는 줄이 끝나고 NUDGE_QUIET_MS 만큼 조용해야 든다 (`busyUntil`).
 *   ③ 같은 생각을 두 번 하지 않는다 — 한 판에 한 번씩, 점점 구체적으로 (`nudged`).
 */
interface Nudge {
  id: string;
  /** 이 단계에서만 든다 */
  phases: readonly Phase[];
  /** 지금도 필요한 생각인가 — 이미 해치운 일이면 조용히 넘긴다 */
  when(): boolean;
  lines: readonly Line[];
}

const NUDGES: readonly Nudge[] = [
  {
    // 첫 생각 — 막 걷기 시작했고, 아직 아무것도 안 읽었다
    id: 'tag',
    phases: ['explore'],
    when: () => !identity.get().known,
    // 2026-09-01 사용자: 「가까이 가서 들여다보자」와 「단말 바로 앞에서 화면을 똑바로 봐야…」는 뺐다 —
    // 조작법은 판독 표시(ProbeHud)가 이미 보여 준다. 속마음이 조작 설명을 하면 그건 내 생각이 아니라 도움말이다
    lines: [{ who: 'thought', text: '…우선 단서부터 찾아보자. 왼쪽 벽에 뭔가 켜져 있다.' }],
  },
  {
    // 명판을 읽었으면(또는 그새 지나쳤으면) 다음은 벽이다
    id: 'wall',
    phases: ['explore'],
    when: () => true,
    lines: [{ who: 'thought', text: '안쪽 오른쪽 벽… 뭔가 그려져 있다. 가까이 가 보자.' }],
  },
  {
    id: 'wall2',
    phases: ['explore'],
    when: () => true,
    lines: [{ who: 'thought', text: '그 벽 앞에 서서 정면으로 봐야 보인다.' }],
  },
  {
    // 문이 열렸는데 명판을 아직 안 읽었다 — 넘기 전이 마지막 기회다
    id: 'door-tag',
    phases: ['approach'],
    when: () => !identity.get().known,
    lines: [{ who: 'thought', text: '잠깐, 정비 단말을 아직 안 읽었다. 저 문을 넘으면 안에서 답할 게 없다.' }],
  },
  {
    id: 'door',
    phases: ['approach'],
    when: () => true,
    // 문은 아직 닫혀 있다 — 여는 것은 문 앞에 선 내 손이다 (onDoorNear · openDoor)
    lines: [{ who: 'thought', text: '복도 끝에 격납문이 있다. 저 너머가 중앙 시설이겠지.' }],
  },
];

/** 유도끼리의 최소 간격 · 대사가 끝나고 기다리는 정적 · 조사 시작 뒤 첫 생각까지 */
const NUDGE_GAP_MS = 20_000;
const NUDGE_QUIET_MS = 3_500;
const NUDGE_FIRST_MS = 4_500;
const NUDGE_TICK_MS = 2_000;

let nudgeTimer = 0;
/** 다음 유도를 낼 수 있는 가장 이른 시각 */
let nudgeAt = 0;
const nudged = new Set<string>();

function stopNudges() {
  if (nudgeTimer) window.clearInterval(nudgeTimer);
  nudgeTimer = 0;
}

/** 조사 단계가 열릴 때 켠다 — 문턱을 넘거나(transit) 판을 다시 깔면 꺼진다 */
function startNudges() {
  stopNudges();
  nudgeAt = performance.now() + NUDGE_FIRST_MS;
  nudgeTimer = window.setInterval(() => {
    const now = performance.now();
    if (now < nudgeAt || now < busyUntil + NUDGE_QUIET_MS) return;
    const n = NUDGES.find((x) => !nudged.has(x.id) && x.phases.includes(state.phase) && x.when());
    if (!n) return;
    nudged.add(n.id);
    nudgeAt = now + play(n.lines) + NUDGE_GAP_MS;
  }, NUDGE_TICK_MS);
}

/*
 * 조사 중 첫 이상 징후 — 스크린에 문구가 스친다(EXTERNAL SIGNAL DETECTED). 불안감만 준다 (사용자 시나리오 2).
 * 2026-08-31 사용자: 시설 방송 「보안 프로토콜 갱신 중」도, 조력자의 「멈추지 마세요. 아직 당신을 특정한 건 아닙니다」도 뺐다 —
 * 한 줄이라도 설명이 끼면 불안이 절차가 된다. **아무도 말해 주지 않는 경고**가 제일 무섭다.
 */
/** 인트로가 끝나고 이만큼 뒤 (아직 조사 중이면) */
const SIGNAL_AFTER_MS = 22_000;
const SIGNAL_NOTICE_MS = 1_800;

/**
 * 벽에서 발견하는 것 — 2026-08-31 사용자: 의미 없는 문구가 아니라 **아이가 그린 것 같은 그림**이다
 * (사람이 개체를 때리고, 인간은 쉬는데 개체는 일하고, 개체는 가장 위험한 곳으로 들어간다 — features/world/scrawl.ts).
 *
 * 2026-09-01 사용자: "의미 없는 데이터 전송은 빼자." 예전엔 이 그림을 지휘부로 **전송**했고("지금 전송하겠습니다" →
 * "기록했습니다" → "앞의 격납문을 개방하겠습니다"), 그 무전이 끝나야 문이 열렸다. 그러면 그림을 보는 일이
 * 자료 수집 절차가 되고, 문은 남이 열어 준다. 지금은 아무 데도 보내지 않는다 — 본 것이 나한테만 남는다.
 * 다른 그림들과 같은 방식(SCRAWL_LINES)이되, 이 한 장만 석 줄이다. 이야기가 붙은 벽이라서.
 *
 * ★ 말하는 것은 **눈앞의 그 그림**이어야 한다 (2026-09-01 사용자). 그래서 줄마다 scrawl.ts 의 beating 이 실제로 그리는 것만 적는다 —
 *   몽둥이를 든 사람 / 팔을 들어 막는 개체와 붉은 금 셋 / 멀찍이 서서 보고 있는 작은 개체 둘.
 *   (어느 그림 앞에 섰는지는 화면이 각도로 고른다 — Chapter1Scene 의 Triggers)
 */
const INSCRIPTION: Line[] = [
  { who: 'thought', text: '…아이가 그린 것 같은 그림이다.' },
  { who: 'thought', text: '사람이 몽둥이를 들었고, 개체는 팔을 들어 머리를 막고 있다. 붉은 금이 세 줄.' },
  { who: 'thought', text: '멀리서 작은 것 둘이 그걸 보고 있다. …말리지는 않는다.' },
];

const ARRIVE: Line[] = [{ who: 'scientist', text: '중앙 시설입니다. 코어 주변에 개체가 많습니다 — 자연스럽게 섞이세요.' }];

const LOCKDOWN: Line[] = [
  { who: 'system', text: '비정상 신호 감지.' },
  { who: 'scientist', text: '뭐지?' },
  { who: 'scientist', text: '당신 때문은 아닐 겁니다.' },
  { who: 'system', text: '외부 신경 신호 감지.' },
  { who: 'system', text: 'INFILTRATOR UNKNOWN' },
  { who: 'scientist', text: '경비들이 출입구를 막고 있어요. 지금부터는 정체를 숨기는 게 전부입니다.' },
];

/* ─────────────────────────────── 목표 문구 ─────────────────────────────── */

/**
 * 왼쪽 위 OBJECTIVE 줄 — **지금 당장 할 일 하나**만 적는다. 명판을 읽었는지에 따라 말이 달라진다
 * (2026-08-31 사용자: 복도에서 뭘 해야 할지 알 수 있게).
 */
function exploreObjective(): string {
  return identity.get().known ? '복도를 조사하라 — 벽의 흔적을 찾아라' : '복도를 조사하라 — 왼쪽 벽 정비 단말에서 이 몸의 기록을 읽어라';
}
function approachObjective(): string {
  if (!identity.get().known) return '중앙 시설로 이동하라 — 정비 기록은 아직 읽지 않았다';
  return doors.get().corridorFar > 0 ? '중앙 시설로 이동하라 — 열린 격납문으로' : '중앙 시설로 이동하라 — 복도 끝 격납문으로';
}

/* ─────────────────────────────── 격납문 앞의 선택 ─────────────────────────────── */

/**
 * 복도 끝 격납문 — **내가 연다** (2026-09-01 사용자: "문에 다가가면 「문을 연다 / 열지 않는다」로 선택권을 주고,
 * 열어서 들어가는 걸로"). 대사가 끝나서 열리는 문은 내가 넘는 문이 아니다.
 * 열지 않으면 판이 그대로 선다 — 복도로 돌아가 더 뒤질 수 있다. 물러났다가 다시 오면 또 묻는다 (Chapter1Scene 이 거리로 재운다).
 */
const DOOR_CHOICE = { title: '격납문', hint: '중앙 시설로 통하는 문이다.', yes: '문을 연다', no: '열지 않는다' } as const;

/**
 * 「열지 않는다」를 고른 채 그 자리에 서 있는 동안 — 다시 묻지 않는다.
 * (물음은 문 앞이라는 **자리**가 띄운다. 거절하자마자 같은 자리가 또 물으면 거절이 성립하지 않는다.)
 * 문 앞을 벗어나면 풀린다 — 돌아오면 다시 묻는다
 */
let doorRefused = false;

/* ─────────────────────────────── API ─────────────────────────────── */

export const chapter1 = {
  get(): ChapterState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** feature 가 마운트될 때 대사 출구·내 이름·맵 이동 콜백을 준다 */
  bind(fn: typeof emit, name: string, transit: (() => void) | null, hide: (() => void) | null = null): void {
    emit = fn;
    myName = name || '나';
    onTransit = transit;
    onHide = hide;
  },
  /**
   * 조력자의 조언 — 대본 밖에서 세계가 달라졌을 때(감시가 붙는 등) 한 번만 짚어 준다.
   * 같은 조언은 판마다 한 번뿐이다 — 매번 알려 주면 대응이 아니라 안내가 된다 (2026-08-30 사용자: 딱 한 번만).
   */
  advise(id: 'watch'): void {
    if (advised.has(id)) return;
    advised.add(id);
    play(WATCH_ADVICE);
  },
  /** 다른 이야기(chapter2)가 목표·자막 줄을 빌려 쓴다 — 화면은 한 곳만 본다 */
  hud(p: { objective?: string | null; banner?: string | null }): void {
    patch(p);
  },
  /**
   * 화면이 어느 무대를 열었나. 복도: 처음이거나 끝난 뒤면 처음부터. 중앙 시설: 복도에서 넘어왔으면(transit) 도착 단계,
   * 주소로 바로 들어왔으면 이야기 없이 도착 단계부터
   */
  enter(map: string): void {
    clearTimers();
    doors.reset();
    if (map === 'corridor') {
      comms.reset();
      busyUntil = 0;
      if (state.phase === 'idle' || state.phase === 'hide' || state.phase === 'transit' || state.phase === 'arrive' || state.phase === 'lockdown') {
        Object.assign(state, { phase: 'idle', objective: null, banner: null, highlight: null, frozen: false, sealed: false, staring: false, notice: null, choice: null, blackout: 0 });
        // 처음부터 다시 도는 판이다 — 했던 생각도 다시 할 수 있게
        nudged.clear();
        doorRefused = false;
        scrawled.clear();
      } else {
        // 조사 중에 화면만 다시 뜬 것(재마운트) — clearTimers 가 껐던 유도를 도로 켠다. 했던 생각은 그대로 둔다
        startNudges();
      }
    } else if (map === 'central') {
      // 안쪽이다 — 바깥 목소리가 갉히기 시작한다 (mp/comms.ts)
      comms.set(0.85);
      Object.assign(state, { phase: 'arrive', objective: '코어로 접근하라', banner: null, highlight: null, frozen: false, sealed: false, staring: false, notice: null, choice: null, blackout: 0 });
      later(1500, () => play(ARRIVE));
    } else {
      Object.assign(state, { phase: 'idle', objective: null, banner: null, highlight: null, frozen: false, sealed: false, staring: false, notice: null, choice: null, blackout: 0 });
    }
    notify();
  },
  /** 걷기 시작(첫 포인터 잠금)에 한 번 — 과학자의 설명. 라벨 얘기를 하는 동안 HUD 를 강조한다 */
  start(): void {
    if (state.phase !== 'idle') return;
    patch({ phase: 'intro', banner: 'CHAPTER 1 · 잠입' });
    later(2600, () => patch({ banner: null }));
    later(1200, () => {
      play(
        INTRO,
        {
          1: () => patch({ highlight: 'suspicion' }),
          2: () => patch({ highlight: 'sync' }),
          // 단말 얘기가 시작되는 줄 — 여기서 목표를 띄운다. 남은 설명을 들으며 이미 걸어갈 수 있게
          // (단계는 아직 intro 라 트리거는 대본이 끝난 뒤에 열린다 — 설명 도중에 판독 대사가 끼어들지 않는다)
          3: () => patch({ highlight: null, objective: exploreObjective() }),
        },
        () => {
          patch({ phase: 'explore', objective: exploreObjective() });
          // 여기서부터는 내가 알아서 움직여야 한다 — 막히면 속마음이 먼저 짚어 준다
          startNudges();
          later(SIGNAL_AFTER_MS, () => {
            if (state.phase !== 'explore') return;
            patch({ notice: { title: 'EXTERNAL SIGNAL DETECTED', lines: [], tone: 'alert' } });
            later(SIGNAL_NOTICE_MS, () => patch({ notice: null }));
          });
        },
      );
    });
  },
  /**
   * 정비 명판을 들여다봤다 — 이 몸의 식별번호와 마지막 정비 구역을 **내가 읽는다**.
   * 벽의 그림을 이미 봤어도(approach) 되돌아와 읽을 수 있다 — 문턱을 넘기 전이 마지막 기회다
   */
  onServiceTag(): void {
    if (identity.get().known) return;
    if (state.phase !== 'explore' && state.phase !== 'approach') return;
    identity.reveal();
    // 이 구역은 내가 명판 앞에 오래 서 있었다는 것도 기억한다 (dossier.ts) — 안쪽 검문의 감독이 그걸 읽는다
    dossier.note('정비 명판을 들여다봤다');
    // 단말 앞을 떠나면 읽던 것도 거기서 멈춘다 (playHere) — 목표 줄은 어차피 identity 로 정해지니 끊겨도 맞다
    playHere('tag', tagLines());
    patch({ objective: state.phase === 'explore' ? exploreObjective() : approachObjective() });
  },
  /**
   * 이야기가 붙지 않은 그림을 들여다봤다 — 감정 한 줄이 든다 (SCRAWL_LINES). 조사·이동 중에만, 그림마다 한 번씩.
   * 대사가 흐르는 중이면 줄에 서서 뒤따라 나온다 (대화창이 큐를 잡는다)
   */
  onScrawl(kind: ScrawlKind, focusId: string): void {
    if (state.phase !== 'explore' && state.phase !== 'approach') return;
    if (scrawled.has(kind)) return;
    const lines = SCRAWL_LINES[kind];
    if (!lines) return;
    scrawled.add(kind);
    playHere(focusId, lines, kind);
  },
  /** 그 자리 대사가 매여 있는 곳 — 화면이 거리를 재서 멀어지면 leave 를 부른다 */
  focusId(): string | null {
    return focus?.id ?? null;
  },
  /** 그 자리에서 멀어졌다 — 남은 줄을 버린다. 실제로 끊었으면 true */
  leave(id: string): boolean {
    return focus?.id === id ? cutFocus() : false;
  },
  /**
   * 이야기가 붙은 벽의 그림을 들여다봤다 — 속마음 석 줄. 전송도, 지휘부의 대답도, 저절로 열리는 문도 없다 (2026-09-01 사용자).
   *
   * 이제 이 석 줄도 **그 그림 앞에 서 있는 동안의 말**이다 (playHere) — 등을 돌리면 남은 줄은 버린다.
   * 무전이던 시절엔 끊기면 문이 안 열려서 못 끊었지만, 지금은 그냥 내 생각이라 다른 그림 앞으로 걸어가면서
   * 앞 그림 얘기가 이어지는 편이 더 이상하다 (2026-09-01 사용자). 끊긴 그림은 다시 들여다보면 처음부터 든다.
   * 갈 곳(이동 단계)은 대본이 아니라 **본 순간**에 바뀐다 — 문은 문 앞에서 내가 연다 (onDoorNear)
   */
  onInscription(): void {
    if (state.phase !== 'explore' && state.phase !== 'approach') return;
    if (state.phase === 'explore') patch({ phase: 'approach', objective: approachObjective() });
    playHere('scrawl:0', INSCRIPTION);
  },
  /**
   * 격납문 앞에 섰다 — 「문을 연다 / 열지 않는다」를 띄운다. 이미 열린 문이면 묻지 않는다.
   * 물러났다가 다시 오면 또 묻는다 (화면이 멀어질 때 closeChoice 를 부른다)
   */
  onDoorNear(): void {
    if (state.phase !== 'approach' || state.choice || doorRefused || doors.get().corridorFar > 0) return;
    patch({ choice: DOOR_CHOICE });
  },
  /** 문 앞에서 물러났다 — 물음을 거둔다 (고른 것 없이). 거절도 여기서 풀린다: 돌아오면 다시 묻는다 */
  closeChoice(): void {
    doorRefused = false;
    if (state.choice) patch({ choice: null });
  },
  /** 「문을 연다」 — 격납문이 올라간다. 그때부터 문턱이 살아난다 (onDoorway) */
  openDoor(): void {
    if (state.phase !== 'approach') return;
    doors.openCorridorFar();
    // 이 몸이 스스로 문을 열었다는 것도 기록에 남는다 — 안쪽 검문의 감독이 읽는다 (dossier.ts)
    dossier.note('복도 끝 격납문을 직접 열었다');
    patch({ choice: null, objective: approachObjective() });
  },
  /** 「열지 않는다」 — 복도에 남는다. 아직 못 본 것이 있을지도 모르니까 */
  refuseDoor(): void {
    if (!state.choice) return;
    doorRefused = true;
    patch({ choice: null });
    play([{ who: 'thought', text: '…아직은. 이 복도에 더 남은 게 있을지도 모른다.' }]);
  },
  /** 열린 문턱에 닿았다 — 화면이 길을 바꾼다 */
  onDoorway(): void {
    if (state.phase !== 'approach' || doors.get().corridorFar === 0) return;
    // 문턱을 넘는 순간 화면이 검어지고, 다 검어진 뒤에 길을 바꾼다 — 중앙 시설은 그 검은 화면에서 밝아진다
    // (WorldFeature 가 자동 입장 중에도 검은 화면을 들고 있다가 씬이 뜨면 페이드인한다)
    stopNudges();
    patch({ phase: 'transit', objective: null, banner: null, blackout: 1 });
    later(TRANSIT_FADE_MS, () => onTransit?.());
  },
  /** 중앙 시설의 코어 가까이 — 시설이 멈춘다 */
  onCore(): void {
    if (state.phase !== 'arrive') return;
    patch({ phase: 'lockdown', objective: null });
    play(
      LOCKDOWN,
      {
        0: () => {
          patch({ frozen: true });
          comms.set(0.62);
        },
        5: () => patch({ staring: true, sealed: true }),
      },
      () => {
        // 챕터 1 의 끝은 여기가 아니다 — 검증실 문 앞(chapter2)이다. 여기서 이어받는다
        patch({ phase: 'hide', objective: '정체를 숨겨라' });
        onHide?.();
      },
    );
  },
  reset(): void {
    clearTimers();
    doors.reset();
    comms.reset();
    advised.clear();
    nudged.clear();
    doorRefused = false;
    scrawled.clear();
    busyUntil = 0;
    Object.assign(state, { phase: 'idle', objective: null, banner: null, highlight: null, frozen: false, sealed: false, staring: false, notice: null, choice: null, blackout: 0 });
    notify();
  },
};
