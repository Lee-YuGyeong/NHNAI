/**
 * 1인칭 대화창 — 3D 월드에서 누가 한 마디 하면 화면 아래에 비주얼 노벨식 대화 상자가 뜬다 (2026-08-29 참고 이미지).
 *
 * 구성: 왼쪽 둥근 초상(플레이어 말은 전부 로봇 — 나도 AI 로 위장 중이다. 과학자·정부요원·시스템은 대본이 지정, public/ui/portrait-*.webp) ·
 * 위 이름 탭 · 본문(타자 애니메이션) · 우하단 ▼(다 찍혔고 다음이 있다는 표시). 프레임은 SVG 선으로 그린다 — 청록 라인, 모서리 깎임, 안쪽 가는 장식선.
 * 초상은 모서리를 둥글리고 아래·가장자리를 패널색으로 녹여 "붙인 사진"이 아니라 상자의 일부로 읽히게 한다.
 *
 * 속마음(ChatLine.thought)은 **글자 색만** 다르다 — 이름표도 초상도 내가 말할 때 그대로고, 또렷한 청백 대신 물러난 회색
 * (2026-08-31 사용자: 보랏빛도 「속마음」 이름표도 빼고, 그냥 내가 얘기하는 것처럼).
 * **속마음은 소리가 없다** — 생각은 들리는 것이 아니다 (2026-08-30 사용자: TTS 는 넣지 말자).
 *
 * 흐름: 새 메시지가 오면 줄을 선다 → 한 글자씩 찍는다(구두점 뒤엔 잠깐 멈춤) → 다 찍히면 잠시 머물다 다음 줄로 → 줄이 비면 사라진다.
 * 상자를 클릭하면 찍는 중엔 다 보여주고, 다 찍혔으면 다음으로 넘긴다. 걷기(포인터 잠금)를 방해하지 않게 상자 밖은 pointer-events 없음.
 *
 * 성능: 타자는 setTimeout 사슬 하나 — 프레임 루프를 돌리지 않는다. 메시지 큐는 ref 로, 렌더는 현재 줄·찍힌 글자 수만.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { voiceLines, type Playing } from './voice';
import type { ChatLine, PortraitKind } from './worldSlice';

import './dialogue.css';

/**
 * 대사 속도 — "대사가 너무 늦어 답답하다"(2026-08-30 사용자) → 타자·머무름을 1.1배 빠르게.
 * 음성도 같은 배율로 튼다 (voice.ts VOICE_RATE) — 자막과 소리가 같이 빨라져야 한 줄의 길이가 맞는다.
 */
const PACE = 1.1;
/** 글자당 타자 간격(ms)과 구두점 뒤 멈춤 */
const TYPE_MS = 34 / PACE;
const PAUSE_MS = 170 / PACE;
const PAUSE_CHARS = /[.,!?…;:。！？]/;
/** 다 찍힌 뒤 머무는 시간 — 짧은 문장도 읽을 수 있게 바닥이 있고, 긴 문장은 글자 수에 비례 */
const HOLD_MIN_MS = 2600 / PACE;
const HOLD_PER_CHAR_MS = 55 / PACE;
const HOLD_MAX_MS = 9000 / PACE;
/** 줄이 비면 이만큼 뒤에 사라진다 */
const LINGER_MS = 1800;

/**
 * 초상 두 장 — 사용자가 고른 이미지(연구원·상자형 흰 로봇)를 tools 의 sharp 스크립트로 얼굴 중심 정사각 크롭 + 채도 낮춤 + 남색 오버레이 +
 * 가장자리를 패널색으로 녹이는 비네트 처리한 것 (2026-08-29). 내 말은 연구원, 남의 말은 로봇.
 */
const PORTRAITS: Record<PortraitKind, string> = {
  human: '/ui/portrait-human.webp',
  robot: '/ui/portrait-robot.webp',
  /** 챕터 대본의 목소리들 — 통신으로 들어오는 과학자·정부요원, 시설 방송(시스템) */
  scientist: '/ui/portrait-scientist.webp',
  agent: '/ui/portrait-agent.webp',
  system: '/ui/portrait-system.webp',
  /** 내 보고 대사 — 신경 인터페이스를 쓰고 아바타에 접속해 있는 요원(사용자가 준 이미지, 2026-08-29). 복도 배경 위에 합성 */
  me: '/ui/portrait-me.webp',
  /** 총 든 로봇 — 무장 심문 AI(ENFORCER)와 중앙 시설의 총 든 경비. enforcer.glb 를 헤드리스로 렌더해 복도 배경 위에 합성 (2026-08-30) */
  enforcer: '/ui/portrait-enforcer.webp',
};

/**
 * 초상 고르기 — 대본이 지정하지 않은 말은 **전부 로봇**이다. 나도 로봇: 플레이어는 AI 로 위장한 잠입자라 화면에 사람 얼굴이
 * 뜨면 안 된다 (2026-08-29 사용자 지적 — 처음엔 내 말에 연구원 사진을 붙였었다). 누가 나인지는 초상 테 색(따뜻한 색)으로 갈린다.
 */
export function portraitFor(kind: PortraitKind | undefined, _isSelf: boolean): string {
  return PORTRAITS[kind ?? 'robot'];
}

/** 글자만 놓고 잰 타자 시간(ms). scale 은 목소리에 맞춘 늘임 (paceFor) */
function typingTime(text: string, scale = 1): number {
  let t = 0;
  for (const ch of text) t += (PAUSE_CHARS.test(ch) ? PAUSE_MS : TYPE_MS) * scale;
  return t;
}

/** 다 찍은 뒤 글자 수로 잰 머무름 */
function charHold(text: string): number {
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, text.length * HOLD_PER_CHAR_MS));
}

/** 한 줄이 화면에 머무는 시간(ms) — 타자 + 머무름. 챕터 대본이 세계 연출(조명·정지)을 대사에 맞출 때 쓴다 */
export function lineDuration(text: string): number {
  return typingTime(text) + charHold(text);
}

/** 음성이 끝난 뒤 이만큼 더 머문다 — 말끝이 잘려 보이지 않게 */
const VOICE_TAIL_MS = 450;

/**
 * **목소리에 맞춘 타자** (2026-08-30 사용자: "글 쓰는 속도는 너무 빠른데 음성이 느려서 답답하다").
 *
 * 예전엔 글자 간격이 고정(34ms)이라, 클립이 있는 줄은 한 문장이 1초 만에 다 찍히고 나머지 4초는
 * 다 찍힌 글을 보며 소리만 기다렸다 — 읽을 것이 없는 침묵이 줄마다 붙었다. 이제 클립이 있으면
 * 그 길이의 VOICE_TYPE 만큼에 걸쳐 **말과 함께** 찍는다. 한 줄의 전체 길이(lineDurationFor)는 그대로라
 * 대본의 연출 타이밍은 건드리지 않는다 — 타자와 머무름의 몫만 바뀐다.
 *
 * 클립이 없는 줄(플레이어 채팅, LLM 이 지은 대답, 심문소의 실시간 방송)은 예전 그대로 고정 간격이다.
 */
const VOICE_TYPE = 0.92;
/** 늘임의 한계 — 짧은 감탄사에 클립이 길다고 글자 하나에 1초를 쓰지는 않는다 / 반대로 너무 몰아치지도 않는다 */
const TYPE_SCALE_MAX = 4.5;
const TYPE_SCALE_MIN = 0.75;
/** 목소리에 맞춰 찍은 줄이 다 찍힌 뒤 최소한 이만큼은 머문다 */
const VOICE_HOLD_MIN_MS = 700;

/** 이 줄을 어떻게 찍고 얼마나 머물까 */
interface Pace {
  /** 글자 간격 배율 (1 = 예전 그대로) */
  scale: number;
  /** 다 찍은 뒤 머무는 시간(ms) */
  hold: number;
}

function paceFor(nickname: string, text: string, isSelf: boolean): Pace {
  const type = typingTime(text);
  const hold = charHold(text);
  const voiceMs = (voiceLines.durationOf(nickname, text, isSelf) ?? 0) * 1000;
  if (!voiceMs) return { scale: 1, hold };
  // 줄의 전체 길이는 lineDurationFor 과 같은 값이어야 한다 — 대본이 그걸로 다음 줄을 잡는다
  const total = Math.max(type + hold, voiceMs + VOICE_TAIL_MS);
  const want = Math.min(voiceMs * VOICE_TYPE, total - VOICE_HOLD_MIN_MS);
  const scale = Math.max(TYPE_SCALE_MIN, Math.min(TYPE_SCALE_MAX, want / (type || 1)));
  return { scale, hold: Math.max(VOICE_HOLD_MIN_MS, total - typingTime(text, scale)) };
}

/**
 * 목소리까지 친 길이 — 클립(voice manifest)이 있으면 "글자 기준"과 "음성 끝 + 여유" 중 긴 쪽. 음성이 다 말하기 전에 넘어가지 않는다
 * (2026-08-29 사용자 지적). 챕터 대본은 이걸로 다음 줄·연출을 잡는다
 */
export function lineDurationFor(nickname: string, text: string, isSelf: boolean): number {
  const base = lineDuration(text);
  const voice = voiceLines.durationOf(nickname, text, isSelf);
  return voice ? Math.max(base, voice * 1000 + VOICE_TAIL_MS) : base;
}

interface Line {
  key: string;
  nickname: string;
  text: string;
  isSelf: boolean;
  portrait?: PortraitKind;
  /** 소리 내지 않은 속마음 — 글자 색만 물러난 회색으로 그린다 (dialogue.css 의 dlg--thought) */
  thought?: boolean;
}

export interface DialogueBoxProps {
  messages: readonly ChatLine[];
  selfId: string | null;
  /** 폰 — 조이스틱 위로 올리고 작게 */
  touch: boolean;
  /**
   * 바깥 목소리가 지금 줄을 아직 읽고 있는가 — 주면 다 읽을 때까지 상자를 붙잡는다.
   *
   * `/world` 는 주지 않는다. 거기 목소리는 미리 뽑아 둔 클립이라 길이를 알고 있어서
   * (voice.ts `durationOf`) 아래 클립 연장이 이미 처리한다. 심문소의 리더 목소리는
   * 그 자리에서 합성돼 길이를 **미리 알 수 없고**, "아직 말하는 중인가"로만 알 수 있다
   * (shared/broadcast `selectBroadcastSpeaking`).
   *
   * 이걸 준다는 것은 **소리는 내가 낸다**는 뜻이기도 하다 — 상자는 클립을 틀지 않는다.
   */
  speaking?: boolean;
  /** 입력줄이 열려 있다 — 상자를 그 높이만큼 올려 입력줄이 **상자 아래**에 놓이게 (2026-08-30 사용자: 대사 위가 아니라 아래에) */
  lifted?: boolean;
  /**
   * **상자가 화면에 서 있는가**를 바깥에 알린다 — 뜰 때 true, 사라질 때 false.
   *
   * 검증실(features/arena)이 이걸 쓴다: 리더가 방송하는 동안 구역 통신 패널을 내리는데
   * (commsHushed), 그 기준이 여태 `speaking`(소리가 나는 중인가) 하나였다. 그런데 **자막은
   * 소리보다 오래 남는다** — 다 읽고도 말끝 여유(VOICE_TAIL_MS)만큼 머물고, 소리가 아예
   * 안 나가면(엔진 정지·음소거) 자막만 제 타이머로 돈다. 그 사이에 패널이 도로 올라와서
   * 리더의 자막과 개체들의 잡담이 겹쳐 보였다 (2026-09-02 사용자).
   *
   * 그래서 「소리가 나는 중인가」가 아니라 **「리더의 말이 화면에 있는가」**를 상자가 직접 알린다.
   * 안 주면 아무 일도 안 한다 — /world · /world2 · /lab 의 호출부는 그대로다.
   */
  onShowing?: (showing: boolean) => void;
}

export function DialogueBox({ messages, selfId, touch, speaking, lifted = false, onShowing }: DialogueBoxProps) {
  const queue = useRef<Line[]>([]);
  /** 마지막으로 줄 세운 메시지의 열쇠. undefined = 아직 기준선을 안 잡았다, '' = 마운트 때 기록이 비어 있었다 */
  const seen = useRef<string | undefined>(undefined);
  const [current, setCurrent] = useState<Line | null>(null);
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);
  /**
   * 지금 상자가 뭘 하는 중인가 — typing(찍는 중) · holding(다 찍고 머무는 중) · lingering(줄이 비어 사라지길 기다리는 중) · idle(없음).
   * 새 메시지는 lingering·idle 이면 바로 띄우고, typing·holding 이면 줄에 세운다. (lingering 중 온 메시지가 줄에만 서고 영영 안 뜨던 버그)
   */
  const phase = useRef<'typing' | 'holding' | 'lingering' | 'idle'>('idle');
  /** 지금 줄의 목소리 — 틀었으면 길이·시작 시각. 다 찍힌 뒤 이 소리가 끝날 때까지는 머문다 */
  const voice = useRef<Promise<Playing | null>>(Promise.resolve(null));
  /** 지금 줄의 타자 속도·머무름 — 클립이 있으면 목소리에 맞춰 늘어난다 (paceFor) */
  const pace = useRef<Pace>({ scale: 1, hold: HOLD_MIN_MS });
  /**
   * 머무름이 시작된 시각. `speaking` 이 바뀌면 아래 효과가 다시 도는데, 그때마다 머무름을
   * 처음부터 다시 세면 줄 하나가 몇 배로 늘어난다. 0 = 아직 안 머물고 있다 (advance 가 되돌린다)
   */
  const holdFrom = useRef(0);
  /** 바깥 목소리 때문에 붙잡혀 있었나 — 풀린 뒤 말끝 여유를 줄지 정한다 */
  const wasHeld = useRef(false);
  /**
   * 소리를 바깥에서 내는 화면인가 (speaking 을 주면 그렇다).
   *
   * 그런 화면에서 클립까지 틀면 **같은 문장이 두 목소리로 겹친다.** 지금 안 겹치는 것은
   * 이름이 한 글자 어긋나서일 뿐이다 — 심문소 리더는 'A-1'(lab/personas), 월드 음성
   * 명부에는 'A-01'(public/world/voice/manifest.json). 누가 이름을 맞추는 순간 겹친다.
   * 우연이 지켜 주는 것을 규칙으로 바꾼다.
   *
   * ref 인 이유: advance 의 의존성을 늘리지 않으려고. 화면이 바뀌는 값이 아니다.
   */
  const ownVoice = useRef(false);
  ownVoice.current = speaking !== undefined;

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /**
   * 다음 줄로 — 줄이 비면 잠시 뒤 사라진다.
   *
   * `now` 는 **내 손으로 넘긴 것**이라는 표시다 (상자 클릭). 그때는 여운(LINGER_MS)을 안 둔다:
   * 저절로 끝난 대사는 잠깐 남아 여운이 되지만, 넘긴 대사는 **치우라는 뜻**이라 그 1.8초가 그대로 답답함이 된다
   * (2026-09-02 사용자: 한 번 더 누르면 말풍선이 끝나고 없어져야 한다).
   */
  const advance = useCallback((now = false) => {
    clearTimer();
    holdFrom.current = 0;
    wasHeld.current = false;
    const next = queue.current.shift();
    if (next) {
      phase.current = 'typing';
      setCurrent(next);
      setShown(0);
      setVisible(true);
      // 이 줄의 목소리 — 클립이 있는 대본 문장만 소리가 난다. 앞 클립은 끊는다.
      // 소리를 바깥에서 내는 화면이면 틀지 않는다 (ownVoice) — 두 목소리가 겹친다
      /*
       * 소리가 없는 줄 — ① 소리를 바깥에서 내는 화면(ownVoice, 심문소의 리더 방송) ② **속마음**(2026-08-30 사용자:
       * "속마음은 TTS 없애도 된다"). 생각은 소리가 안 난다. 그때는 글자 간격도 예전 그대로다.
       */
      const silent = ownVoice.current || next.thought === true;
      pace.current = silent ? { scale: 1, hold: charHold(next.text) } : paceFor(next.nickname, next.text, next.isSelf);
      voice.current = silent ? Promise.resolve(null) : voiceLines.play(next.nickname, next.text, next.isSelf);
      return;
    }
    if (now) {
      phase.current = 'idle';
      setVisible(false);
      setCurrent(null);
      return;
    }
    phase.current = 'lingering';
    timer.current = window.setTimeout(() => {
      phase.current = 'idle';
      setVisible(false);
      setCurrent(null);
    }, LINGER_MS);
  }, []);

  // 새 메시지 → 줄 세우기. 마운트 때 이미 있던 기록은 기준선으로 삼아 건너뛴다 (들어오자마자 옛 대화가 줄줄이 찍히지 않게)
  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = messages.length ? messages[messages.length - 1].key : '';
      return;
    }
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.key === seen.current) return;
    let i = messages.length - 1;
    while (i >= 0 && messages[i].key !== seen.current) i--;
    const fresh = messages.slice(i + 1);
    seen.current = last.key;
    if (fresh.length === 0) return;
    // 내가 친 말은 대화창에 안 띄운다 — 내 말은 화면의 채팅 로그(SelfChatLog)로 흐르고, AI 판정에만 들어간다 (2026-08-29 사용자 지적).
    // 대본의 "나" 대사(id 가 내 id 지만 portrait 지정)는 띄운다
    for (const m of fresh) {
      const isSelf = m.id === selfId;
      if (isSelf && !m.portrait) continue;
      queue.current.push({ key: m.key, nickname: m.nickname, text: m.text, isSelf, portrait: m.portrait, thought: m.thought });
    }
    /*
     * 붙잡혀 있는데(wasHeld) 다음 줄이 왔다 = 소리도 그리로 넘어갔다는 뜻이니 곧장 넘어간다.
     * **붙잡는 동안에는 타이머가 없어서 여기서 안 깨우면 상자가 영영 멈춘다** — 아래 효과는
     * current·shown·speaking 이 바뀔 때만 도는데, 줄 세우기는 ref 라 그중 무엇도 안 건드린다.
     */
    if (phase.current === 'idle' || phase.current === 'lingering' || wasHeld.current) advance();
  }, [messages, selfId, advance]);

  // 타자 — 한 글자씩. 다 찍히면 머문 뒤 다음으로
  useEffect(() => {
    if (!current) return;
    clearTimer();
    if (shown < current.text.length) {
      phase.current = 'typing';
      const ch = current.text[shown - 1] ?? '';
      timer.current = window.setTimeout(() => setShown((n) => n + 1), (PAUSE_CHARS.test(ch) ? PAUSE_MS : TYPE_MS) * pace.current.scale);
      return clearTimer;
    }
    phase.current = 'holding';
    if (holdFrom.current === 0) holdFrom.current = performance.now();
    const hold = pace.current.hold;
    /** 글자 기준으로 아직 남은 머무름 */
    const left = () => Math.max(0, hold - (performance.now() - holdFrom.current));

    /*
     * 바깥 목소리(심문소의 리더 방송)가 이 줄을 아직 읽고 있으면 **타이머를 걸지 않고** 붙잡는다.
     * speaking 이 꺼질 때 이 효과가 다시 돌고 그때 넘어간다.
     *
     * 글자 기준으로 재면 안 되는 이유: 자막은 타자 속도(글자당 89ms), 소리는 안내 방송
     * 속도(글자당 182ms)라 소리가 2배 넘게 길다. 머무름에 천장(9초)까지 있어서 지시문이
     * 길수록 벌어지기만 한다 — 상한선인 165자 방송이면 자막이 13.6초 먼저 사라진다.
     *
     * **줄이 비었을 때만** 붙잡는다. 다음 줄이 서 있다는 것은 소리도 이미 그리로 넘어갔다는
     * 뜻이라(상자는 "지금 읽고 있는 문장"만 받는다), 거기서 붙잡으면 자막이 소리를 못 따라간다.
     */
    if (speaking && queue.current.length === 0) {
      wasHeld.current = true;
      return clearTimer;
    }
    // 붙잡혔다 풀렸으면 말끝 여유는 둔다 — 머무름은 그 사이에 이미 지났어도 소리가 방금 멎었다
    timer.current = window.setTimeout(advance, Math.max(left(), wasHeld.current ? VOICE_TAIL_MS : 0));
    wasHeld.current = false;

    // 클립(월드 음성)이 아직 말하는 중이면 그 끝(+여유)까지 늘린다. 클립이 없거나 못 받았으면 글자 기준 그대로
    let stale = false;
    void voice.current.then((v) => {
      if (stale || !v || phase.current !== 'holding') return;
      const voiceLeft = v.startedAt + v.duration * 1000 + VOICE_TAIL_MS - performance.now();
      if (voiceLeft > left()) {
        clearTimer();
        timer.current = window.setTimeout(advance, voiceLeft);
      }
    });
    return () => {
      stale = true;
      clearTimer();
    };
  }, [current, shown, advance, speaking]);

  useEffect(
    () => () => {
      clearTimer();
      voiceLines.stop();
    },
    [],
  );

  const onClick = () => {
    if (!current) return;
    // 찍는 중이면 문장을 끝내고, 다 찍혔으면 넘긴다 — 넘길 줄이 없으면 **곧바로 치운다** (advance 의 now)
    if (shown < current.text.length) setShown(current.text.length);
    else advance(true);
  };

  /*
   * 서 있는지를 바깥에 알린다 (onShowing 머리말). 재는 값이 `visible` 인 것은 그것이 곧
   * 아래 렌더 조건이기 때문이다 — 줄이 서면 참이 되고, 마지막 줄이 여운(LINGER_MS)까지
   * 지나 사라질 때 거짓이 된다. 콜백은 ref 로 받는다: 부르는 쪽이 매 렌더 새 함수를 넘겨도
   * 이 효과가 다시 돌지 않게 (알리는 것은 값이 바뀔 때 한 번이면 된다).
   */
  const showingCb = useRef(onShowing);
  showingCb.current = onShowing;
  useEffect(() => {
    showingCb.current?.(visible);
  }, [visible]);

  const portrait = useMemo(() => (current ? portraitFor(current.portrait, current.isSelf) : ''), [current]);
  if (!current && !visible) return null;

  const done = current ? shown >= current.text.length : true;
  const more = queue.current.length > 0;

  return (
    <div
      className={`dlg ${visible ? 'dlg--in' : 'dlg--out'} ${touch ? 'dlg--touch' : ''} ${lifted ? 'dlg--lifted' : ''} ${current?.thought ? 'dlg--thought' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="dlg__box" onClick={onClick}>
        <Frame />
        <div className={`dlg__portrait ${current?.isSelf ? 'dlg__portrait--self' : ''}`}>
          {portrait ? <img src={portrait} alt="" draggable={false} /> : null}
          <span className="dlg__portrait-ring" />
        </div>
        <div className="dlg__name">
          <span>{current?.nickname}</span>
        </div>
        <p className="dlg__text">
          {current?.text.slice(0, shown)}
          {!done ? <span className="dlg__caret" /> : null}
        </p>
        <span className={`dlg__next ${done ? 'dlg__next--on' : ''} ${more ? 'dlg__next--more' : ''}`} aria-hidden="true">
          ▼
        </span>
        <span className="dlg__deco" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

/**
 * 프레임 — 900×210 좌표계의 SVG. 바깥 테(모서리 깎임)·이름 탭 자리(왼쪽 위가 파여 있다)·안쪽 장식선·오른쪽 아래 짧은 눈금.
 * 초상 자리(왼쪽 200px)는 프레임 안에서 8각으로 한 번 더 두른다 (CSS clip-path).
 */
function Frame() {
  return (
    <svg className="dlg__frame" viewBox="0 0 900 210" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dlgFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1a2c" stopOpacity="0.82" />
          <stop offset="1" stopColor="#04101c" stopOpacity="0.9" />
        </linearGradient>
        <filter id="dlgGlow" x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* 바탕 — 이름 탭이 파고드는 왼쪽 위는 낮게 */}
      <path
        d="M22 6 H200 L214 20 H230 V6 H860 L894 40 V174 L858 204 H60 L22 166 Z"
        fill="url(#dlgFill)"
        stroke="#6fd3ff"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        filter="url(#dlgGlow)"
      />
      {/* 안쪽 가는 선 — 오른쪽 위·아래를 따라 */}
      <path d="M244 18 H846 L880 46" fill="none" stroke="#3f8fc2" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.9" />
      <path d="M876 92 V170 L846 194 H620" fill="none" stroke="#3f8fc2" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <path d="M232 194 H360" fill="none" stroke="#3f8fc2" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
      {/* 오른쪽 아래 눈금 */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={700 + i * 12} y={184} width={6} height={3} fill="#6fd3ff" opacity={i % 2 ? 0.35 : 0.8} />
      ))}
      {/* 왼쪽 아래 작은 데이터 무늬 */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={236} y={176 + i * 6} width={40 - i * 12} height={2} fill="#6fd3ff" opacity={0.45 - i * 0.1} />
      ))}
    </svg>
  );
}
