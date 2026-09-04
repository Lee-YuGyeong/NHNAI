/**
 * 즉답 시행 — **몸이 아니라 답으로 가르는 판.**
 *
 * 즉석 시행(quick.ts)이 걷기·점프로 사람을 가른다면, 여기는 **답 하나**로 가른다.
 * "이 코드를 그대로 다시 쳐라", "17 × 23", "검증구역 을 거꾸로" — 기계에게는 조회이고
 * 사람에게는 한 박자다. 개체들은 1초 안에 답을 올리는데 나는 아직 치고 있다. 그 간격이 이 판의 전부다.
 *
 * ★ **어려운 문제를 내는 자리가 아니다** (2026-09-02 사용자: 수열 판을 두고 "이 게임 너무 어려워
 *   다른거 없나?"). 여기서 사람을 가르는 것은 **속도**지 지식이 아니다 — 옆에서 다섯이 1초에
 *   답을 올리는 것만으로 조급함은 이미 충분하다. 문제가 어려우면 그때부터 이 판은 사람을
 *   가려내는 게 아니라 **사람이라는 이유로 떨어뜨리는 판**이 된다 (quick.ts 머리말의 ★ 와 같은
 *   원칙: 판은 틀린 사람을 잡아야지 사람이라는 것을 자동으로 잡으면 안 된다).
 *   그래서 판 목록은 **보면 아는 것**(복창 · 다른 하나 · 번호 세우기)을 바닥에 깔고, 셈과
 *   영단어는 그 위에 얹는다. 한 판이 통째로 계산 문제이던 때보다 걸릴 확률이 훨씬 낮다.
 *
 * 여기도 **LLM 호출 0회**다. 문제도 정답도 개체들의 답도 전부 로컬에서 만든다 —
 * 단어는 아래 목록이 사전이고, 계산은 그 자리에서 한다.
 *
 * 걸린 것은 전부 'suspect' 다. 쳐서 내는 판은 오타 하나로 폐기하지 않는다 —
 * 손이 미끄러진 것과 인간인 것을 기록만 보고는 못 가른다. 대신 의심도가 오르고, 세 번 어긋나면 어차피 끝이다.
 *
 * ★ 제한 시간은 **답을 아는 사람이 손으로 쳐 넣을 수 있는 폭**으로 잡는다. 여기서 사람을 가르는 것은
 *   타자 속도가 아니라 답을 아느냐다 — 개체가 1초에 올리는 것은 그 옆에 그대로 뜨므로 조급함은 이미 충분하다.
 */

import { eulReul, eunNeun, euRo } from './josa';
import type { Verdict } from './free';
import type { Stakes } from './quick';

/** 한 사람이 낸 답. at 은 보낸 시각(초) — 무응답이면 null */
export interface OralAnswer {
  who: string;
  text: string;
  at: number | null;
}

export interface OralTrial {
  /** 화면에 뜨는 문제 */
  question: string;
  /** 제한 시간(초) */
  seconds: number;
  stakes: Stakes;
  /** 판정 기준 한 줄 — 결과 화면에 그대로 뜬다 */
  rule: string;
  /** 끝난 뒤 공개하는 정답 */
  answer: string;
  /** 남은 시간 대신 **지난 시간**을 띄운다 (초 맞추기 판) */
  countUp?: boolean;
  judge: (text: string, at: number | null) => { ok: boolean; reason: string };
  /** 개체 하나가 내놓을 답 — 대개 맞히고 즉답한다. 하나쯤은 어긋난다 */
  bot: (seat: number) => { text: string; at: number };
}

export interface OralGame {
  id: string;
  title: string;
  stakes: Stakes;
  /** 버튼에 달아 두는 한 줄 */
  hint: string;
  make: () => OralTrial;
}

/* ─────────────────────────────── 사전 ─────────────────────────────── */

/**
 * 다섯 글자 영단어. **봇이 답을 뽑는 자루이자 정답 예시**다 — 판정의 사전은 아니다.
 *
 * ★ 여기 없으면 틀린 것으로 치던 자리였다 (2026-09-03). 527 낱말뿐이라 A 로 시작하는
 *   ADULT · ALIEN · ALLEY · AMPLE · AWFUL 이 전부 「사전에 없는 말이다」로 떨어졌다 —
 *   **답을 알고도 떨어지는 유일한 판**이었고, 그건 이 파일 머리말의 ★ 와 정면으로 어긋난다
 *   (사람을 가르는 것은 속도지 지식이 아니다 · 사람이라는 이유로 떨어뜨리면 안 된다).
 *   목록을 늘리는 것으로는 안 끝난다 — 영어 낱말은 셀 수 있는 것이 아니고, 여기서 재려던
 *   것도 어휘력이 아니다. 그래서 **판정에서 목록을 뺐다** (아래 judge). 목록은 남는다:
 *   봇의 답과 「예:」 줄이 이 자루에서 나온다.
 */
const WORDS: Record<string, string[]> = {
  A: 'ABOUT ABOVE ACTOR ADAPT ADMIT ADOPT AFTER AGAIN AGENT AGREE AHEAD ALARM ALBUM ALERT ALIKE ALIVE ALLOW ALONE ALONG ALTER AMONG ANGEL ANGER ANGLE ANGRY ANKLE APART APPLE APPLY ARENA ARGUE ARISE ARMOR AROMA ARRAY ARROW ASIDE ASSET AUDIO AUDIT AVOID AWAKE AWARD AWARE'.split(' '),
  B: 'BACON BADGE BAKER BASIC BASIN BEACH BEARD BEAST BEGIN BEING BELOW BENCH BERRY BIRTH BLACK BLADE BLAME BLANK BLAST BLEND BLIND BLOCK BLOOD BLOOM BOARD BOAST BONUS BOOST BOOTH BOUND BRAIN BRAKE BRAND BRAVE BREAD BREAK BRICK BRIDE BRIEF BRING BROAD BROWN BRUSH BUILD BUNCH BURST'.split(' '),
  C: 'CABIN CABLE CANDY CARGO CARRY CATCH CAUSE CEASE CHAIN CHAIR CHALK CHARM CHART CHASE CHEAP CHECK CHEST CHIEF CHILD CHILL CHOIR CIVIC CIVIL CLAIM CLASS CLEAN CLEAR CLERK CLICK CLIFF CLIMB CLOCK CLOSE CLOTH CLOUD COACH COAST COLOR COUNT COURT COVER CRACK CRAFT CRASH CRAZY CREAM CRIME CROSS CROWD CROWN CRUSH CURVE CYCLE'.split(' '),
  F: 'FAITH FALSE FANCY FATAL FAULT FAVOR FEAST FENCE FERRY FIBER FIELD FIFTH FIGHT FINAL FIRST FLAME FLASH FLEET FLESH FLOAT FLOOD FLOOR FLOUR FLUID FOCUS FORCE FORGE FORTH FORTY FORUM FOUND FRAME FRANK FRESH FRONT FROST FRUIT FUNNY'.split(' '),
  G: 'GAUGE GHOST GIANT GLASS GLEAM GLIDE GLOBE GLORY GLOVE GOING GRACE GRADE GRAIN GRAND GRANT GRAPE GRAPH GRASP GRASS GRAVE GREAT GREED GREEN GREET GRIEF GRILL GROSS GROUP GROVE GUARD GUESS GUEST GUIDE GUILD GUILT'.split(' '),
  L: 'LABEL LABOR LARGE LASER LATER LAUGH LAYER LEARN LEASE LEAST LEAVE LEGAL LEMON LEVEL LEVER LIGHT LIMIT LINEN LIVER LOBBY LOCAL LODGE LOGIC LOOSE LOWER LOYAL LUCKY LUNAR LUNCH'.split(' '),
  M: 'MAGIC MAJOR MAKER MANOR MAPLE MARCH MARSH MATCH MAYBE MAYOR MEDAL MEDIA MERCY MERGE MERIT METAL METER MIDST MIGHT MINOR MINUS MIXED MODEL MONEY MONTH MORAL MOTOR MOUNT MOUSE MOUTH MOVIE MUSIC'.split(' '),
  P: 'PAINT PANEL PANIC PAPER PARTY PASTE PATCH PAUSE PEACE PEARL PEDAL PENNY PHASE PHONE PHOTO PIANO PIECE PILOT PITCH PLACE PLAIN PLANE PLANT PLATE POINT POLAR PORCH POUND POWER PRESS PRICE PRIDE PRIME PRINT PRIOR PRIZE PROOF PROUD PROVE PULSE PUNCH PUPIL PURSE'.split(' '),
  R: 'RADAR RADIO RAISE RALLY RANCH RANGE RAPID RATIO REACH REACT READY REALM REBEL REFER RELAX RELAY REPLY RIDER RIDGE RIGHT RIVAL RIVER ROAST ROBOT ROCKY ROUGH ROUND ROUTE ROYAL RUGBY RULER RURAL'.split(' '),
  S: 'SAINT SALAD SAUCE SCALE SCENE SCOPE SCORE SCOUT SEIZE SENSE SERVE SEVEN SHADE SHAFT SHAKE SHALL SHAPE SHARE SHARP SHEEP SHEET SHELF SHELL SHIFT SHINE SHIRT SHOCK SHOOT SHORE SHORT SHOUT SIGHT SILLY SINCE SIXTH SKILL SLEEP SLICE SLIDE SMALL SMART SMILE SMOKE SNAKE SOLAR SOLID SOLVE SOUND SOUTH SPACE SPARE SPEAK SPEED SPELL SPEND SPINE SPLIT SPOKE SPORT SQUAD STAFF STAGE STAIR STAKE STAMP STAND STARE START STATE STEAM STEEL STEEP STEER STICK STILL STOCK STONE STORE STORM STORY STOVE STRAP STRIP STUDY STYLE SUGAR SUITE SUPER SWEEP SWEET SWIFT SWING SWORD'.split(' '),
  T: 'TABLE TAKEN TASTE TEACH TEETH TEMPO TENSE TENTH THANK THEFT THEIR THEME THERE THESE THICK THIEF THING THINK THIRD THOSE THREE THROW THUMB TIGER TIGHT TIMER TITLE TOAST TODAY TOKEN TOOTH TOPIC TOTAL TOUCH TOUGH TOWER TRACE TRACK TRADE TRAIL TRAIN TRAIT TREAT TREND TRIAL TRIBE TRICK TRUCK TRULY TRUNK TRUST TRUTH TWICE TWIST'.split(' '),
  W: 'WAGON WAIST WATCH WATER WEIGH WEIRD WHEAT WHEEL WHERE WHICH WHILE WHITE WHOLE WHOSE WIDOW WIDTH WOMAN WORLD WORRY WORSE WORST WORTH WOULD WOUND WRIST WRITE WRONG WROTE'.split(' '),
};

const LETTERS = Object.keys(WORDS);

/**
 * 거꾸로 쓰기용 — **이 방의 말이다.** 영단어 일곱 글자를 뒤집던 자리였는데(BALANCE → ECNALAB),
 * 그건 한국어로 판을 도는 사람에게 뒤집기가 아니라 **영어 시험**이었다. 뒤집는 일 자체는
 * 그대로 두고 재료만 여기 것으로 바꾼다 — 네댓 글자면 손이 한 번 멈칫하기에 충분하다.
 */
const TURN_WORDS = '검증구역 관리개체 폐기명령 인지검증실 격납고홀 감시드론 정지신호 통신구역 검문절차 배급창고'.split(' ');

/** 코드 복창용 글자 — 헷갈리는 짝(O·0 · I·1 · S·5)은 뺐다. 못 알아본 것이 오답이 되면 안 된다 */
const CODE_CHARS = 'ABCDEFHJKLMNPRTUVWXY';
const CODE_DIGITS = '234679';

/**
 * 글자 세기용 — 같은 글자가 여러 번 나오는 말만. **열 글자를 안 넘는다** (2026-09-03).
 *
 * RESPONSIBILITY · ENTERTAINMENT · INDEPENDENCE 를 세던 자리였다. 열넷을 눈으로 훑어 세는 것은
 * 「보면 아는 것」이 아니라 **정말 세어야 하는 일**이라, 이 파일 머리말의 ★ 에서 제일 멀리 있는
 * 판이었다 (옆에서 다섯이 1초에 답을 올리는 동안 나 혼자 손가락으로 짚는다).
 * 길이를 줄이면 세는 일 자체는 남고 — 기계에게는 여전히 조회다 — 사람에게 남는 것은 한 박자뿐이다.
 */
const COUNT_WORDS = 'BANANA COFFEE LETTER PEPPER ADDRESS SUCCESS BALLOON PARALLEL COMMITTEE BOOKKEEPER'.split(' ');

/* ─────────────────────────────── 도구 ─────────────────────────────── */

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const rnd = (min: number, max: number): number => min + Math.random() * (max - min);
const int = (min: number, max: number): number => Math.floor(rnd(min, max + 1));

/** 기계가 답을 올리는 시각(초). 사람이 문제를 다 읽기도 전이다 */
const fast = (): number => +rnd(0.7, 1.8).toFixed(2);

/** 개체 하나쯤은 어긋난다 — 사람만 혼자 틀리면 판이 첫 시행에 끝난다 */
const SLIP = 0.15;
const slips = (): boolean => Math.random() < SLIP;

/** 글자만 남기고 대문자로 — 오타가 아니라 **답**만 본다 (따옴표·공백·마침표는 버린다) */
const letters = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, '');
const digits = (s: string): string => s.replace(/[^0-9-]/g, '');
/** 글자만 남긴다 — **한글도 센다.** 띄어쓰기·따옴표·붙임표는 버린다 (letters 는 영문만 남긴다) */
const tight = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z가-힣]/g, '');

const missed = { ok: false, reason: '무응답 — 기계는 즉답한다' };

/* ─────────────────────────────── 제한 시간 ─────────────────────────────── */

/**
 * 답을 손으로 쳐 넣는 속도(초당 글자) — **느린 쪽에 맞춘다.**
 * 머리말대로 여기서 가르려는 것은 타자 속도가 아니라 답을 아느냐다.
 */
const TYPE_CPS = 1.6;
/** 다 치고도 Enter 를 누를 손이 남게 두는 여유(초). 오타를 고칠 틈이기도 하다 */
const SEND_PAD = 1.5;

/**
 * 제한 시간(초) = **생각할 틈 + 답을 칠 틈.**
 *
 * 여태는 판마다 손으로 잡은 한 숫자였다. 그런데 쳐야 하는 글자 수가 판마다 스무 배씩
 * 다르다 — 「몇 번 나오는가」는 `3` 한 글자를 12초에 내고, 「사전 순 나열」은
 * `APPLE BREAD CHAIR DRIVE` 스물세 글자를 20초에 냈다. 같은 숫자가 어떤 판에서는
 * 남아돌고 어떤 판에서는 답을 알고도 못 친다.
 *
 * **답을 알고도 손이 못 따라가서 어긋나는 것은 이 판이 재려던 것이 아니다.**
 * 그건 인간을 잡아내는 게 아니라 타자 연습을 시키는 것이다.
 *
 * 지금 값을 `think` 로 그대로 물려받는다 — 손으로 잡은 값이라 생각 틈으로 치면 넉넉하고,
 * 무엇보다 **어느 판도 짧아지지 않는다.** 늘리려던 일에서 뭔가가 줄면 그건 고친 게 아니다.
 *
 * 창이 넓어져도 판이 늘어지지는 않는다 — 답을 보내면 그 자리에서 끝난다(ArenaFeature).
 * 이건 **기한**이지 판의 길이가 아니다.
 *
 * @param think 답을 떠올리는 데 주는 틈(초) — 판이 실제로 재려는 것
 * @param chars 쳐 넣어야 하는 글자 수
 */
function limitFor(think: number, chars: number): number {
  return Math.ceil(think + chars / TYPE_CPS + SEND_PAD);
}

/* ─────────────────────────────── 판 목록 ─────────────────────────────── */

export const ORAL_GAMES: OralGame[] = [
  /*
   * ── 여기 셋이 **바닥**이다 ──
   * 아는 것을 묻지 않는다. 보면 아는 것을 묻고, 가르는 것은 **손이 얼마나 빨리 따라오나**다.
   * 개체들은 1초 안에 올리고 그 시각이 화면에 하나씩 뜬다 — 조급함은 거기서 나오지 문제에서
   * 나오는 게 아니다 (파일 머리말의 ★).
   */
  {
    id: 'echo',
    title: '코드 복창',
    stakes: 'suspect',
    hint: '띄운 코드를 그대로 다시 친다 — 아는 것이 아니라 보는 것이다',
    make: () => {
      // 두 글자 · 두 숫자 · 두 글자 — 눈으로 한 번에 잡히되 손은 여섯 번 움직인다
      const g = () => pick([...CODE_CHARS]);
      const d = () => pick([...CODE_DIGITS]);
      const code = `${g()}${g()}-${d()}${d()}-${g()}${g()}`;
      const want = tight(code);
      // 생각할 것이 없는 판이라 틈을 크게 줄 이유가 없다 — 그래도 읽고 손을 옮길 몫은 준다
      const seconds = limitFor(7, code.length);
      return {
        question: `대조 코드 ${code}. 그대로 다시 쳐라.`,
        seconds,
        stakes: 'suspect',
        rule: `${code} 를 ${seconds}초 안에 그대로 냈는가 (붙임표는 안 본다)`,
        answer: code,
        judge: (text, at) => {
          if (at === null) return missed;
          const got = tight(text);
          if (!got) return missed;
          return got === want
            ? { ok: true, reason: `${code} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${got} — 코드는 ${code} 다` };
        },
        bot: () => {
          if (slips()) {
            // 한 글자만 어긋난다 — 기계가 틀릴 때는 이렇게 틀린다
            const c = [...want];
            const i = int(0, c.length - 1);
            c[i] = c[i] === 'A' ? 'B' : 'A';
            return { text: c.join(''), at: fast() };
          }
          return { text: code, at: fast() };
        },
      };
    },
  },
  {
    id: 'odd',
    title: '다른 하나',
    stakes: 'suspect',
    hint: '똑같이 늘어선 번호 중 하나만 다르다 — 훑어보면 보인다',
    make: () => {
      const base = int(120, 899);
      /*
       * 어긋난 자리는 **가운데나 끝자리**에서 고른다. 첫 자리를 건드리면 0 이 앞에 서서
       * (「A-047」) 눈에는 다른 자릿수처럼 보인다 — 그건 다른 문제다.
       */
      const at = int(1, 2);
      const c = [...String(base)];
      c[at] = String((Number(c[at]) + int(1, 8)) % 10);
      const odd = c.join('');
      const n = 6;
      const where = int(1, n - 1); // 맨 앞은 피한다 — 첫 칸이 답이면 훑을 것도 없다
      const row = Array.from({ length: n }, (_, i) => `A-${i === where ? odd : base}`);
      const seconds = limitFor(8, odd.length);
      return {
        question: `${row.join(' · ')}. 하나만 다르다. 그 번호를 써라. 숫자만.`,
        seconds,
        stakes: 'suspect',
        rule: `${seconds}초 안에 다른 번호 하나를 짚었는가`,
        answer: odd,
        judge: (text, at2) => {
          if (at2 === null) return missed;
          if (!digits(text)) return missed;
          const got = digits(text).replace(/-/g, '');
          return got === odd
            ? { ok: true, reason: `A-${odd} — ${at2.toFixed(1)}초` }
            : { ok: false, reason: `A-${got} — 다른 것은 A-${odd} 다` };
        },
        bot: () => ({ text: slips() ? String(base) : odd, at: fast() }),
      };
    },
  },
  {
    id: 'rank',
    title: '번호 세우기',
    stakes: 'suspect',
    hint: '번호 셋을 작은 순으로 — 사전 순 정렬의 쉬운 쪽이다',
    make: () => {
      // 자릿수가 겹치지 않는 세 구간에서 뽑는다 — 같은 값이 두 번 나오는 판이 안 생긴다
      const nums = [int(11, 89), int(110, 289), int(310, 899)];
      const shown = [nums[1], nums[2], nums[0]]; // 정렬된 채로 내놓지 않는다
      const answer = [...nums].sort((a, b) => a - b).join(' ');
      const seconds = limitFor(10, answer.length);
      return {
        question: `${shown.map((v) => `A-${v}`).join(' · ')}. 번호가 작은 순으로 나열해라. 숫자만 띄어쓰기로.`,
        seconds,
        stakes: 'suspect',
        rule: `세 번호를 작은 순으로 ${seconds}초 안에 나열했는가`,
        answer,
        judge: (text, at) => {
          if (at === null) return missed;
          const got = (text.match(/\d+/g) ?? []).map(Number);
          if (!got.length) return missed;
          return got.join(' ') === answer
            ? { ok: true, reason: `${answer} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${got.join(' ')} — 순서는 ${answer} 다` };
        },
        bot: () => {
          if (slips()) {
            const s2 = answer.split(' ');
            [s2[0], s2[1]] = [s2[1], s2[0]];
            return { text: s2.join(' '), at: fast() };
          }
          return { text: answer, at: fast() };
        },
      };
    },
  },
  {
    id: 'word',
    title: '다섯 글자 영단어',
    stakes: 'suspect',
    hint: '지정한 글자로 시작하는 흔한 다섯 글자 단어 — 기계는 1초 안에 낸다',
    make: () => {
      const letter = pick(LETTERS);
      const bank = WORDS[letter];
      const seconds = limitFor(12, 5); // 답은 다섯 글자로 정해져 있다
      return {
        question: `${letter} ${euRo(letter)} 시작하는 다섯 글자 영단어를 하나 써라. 흔한 단어여야 한다.`,
        seconds,
        stakes: 'suspect',
        rule: `${letter} ${euRo(letter)} 시작하는 다섯 글자 영단어를 ${seconds}초 안에 냈는가`,
        answer: `예: ${bank.slice(0, 4).join(' · ')} …`,
        /*
         * 판정은 **꼴과 시각만 본다** — 다섯 글자인가 · 그 글자로 시작하는가 · 시간 안에 왔는가.
         * 자루(WORDS)에 있는지는 안 본다 (자루 머리말의 ★). 남은 것은 자판을 두드린 것과
         * 낱말을 친 것을 가르는 최소한 하나뿐이다: 홀소리가 없는 다섯 글자는 영어 낱말이 아니다.
         */
        judge: (text, at) => {
          if (at === null) return missed;
          const w = letters(text);
          if (!w) return missed;
          if (w.length !== 5) return { ok: false, reason: `"${w}" — 다섯 글자가 아니다` };
          if (!w.startsWith(letter)) return { ok: false, reason: `"${w}" — ${letter} ${euRo(letter)} 시작하지 않는다` };
          if (!/[AEIOUY]/.test(w)) return { ok: false, reason: `"${w}" — 낱말이 아니다` };
          return { ok: true, reason: `"${w}" — ${at.toFixed(1)}초` };
        },
        bot: (seat) => {
          if (slips()) {
            // 다른 글자로 시작하는 멀쩡한 단어 — 기계가 어긋날 때는 이렇게 어긋난다
            const other = pick(LETTERS.filter((l) => l !== letter));
            return { text: pick(WORDS[other]), at: fast() };
          }
          return { text: bank[(seat * 7 + int(0, bank.length - 1)) % bank.length], at: fast() };
        },
      };
    },
  },
  {
    id: 'mult',
    title: '두 자리 × 한 자리',
    stakes: 'suspect',
    hint: '암산. 기계에게는 조회이고 사람에게는 계산이다',
    make: () => {
      /*
       * 두 자리끼리 곱하던 자리였다 (2026-09-02 사용자: 「두자리 * 한자리로 변경」).
       * 82 × 16 은 종이 없이는 한 번에 안 나온다 — 답을 아느냐가 아니라 **필산을 할 수 있느냐**를
       * 묻게 되고, 그건 이 판이 재려던 것이 아니다 (파일 머리말의 ★: 여기서 가르는 것은 속도다).
       */
      const a = int(13, 89);
      const b = int(3, 9);
      const answer = a * b;
      const seconds = limitFor(14, String(answer).length);
      return {
        question: `${a} × ${b} ${eunNeun(String(b))} 얼마인가. 숫자만 써라.`,
        seconds,
        stakes: 'suspect',
        rule: `${seconds}초 안에 정확한 값을 냈는가`,
        answer: String(answer),
        judge: (text, at) => {
          if (at === null) return missed;
          const n = Number(digits(text));
          if (!digits(text)) return missed;
          return n === answer
            ? { ok: true, reason: `${n} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${n} — 값은 ${answer} 다` };
        },
        // 0 을 뽑으면 「어긋난 답」이 정답이 된다 — 1~9 를 뽑아 부호만 가른다
        bot: () => ({ text: String(slips() ? answer + int(1, 9) * (int(0, 1) ? 1 : -1) : answer), at: fast() }),
      };
    },
  },
  {
    id: 'reverse',
    title: '거꾸로 쓰기',
    stakes: 'suspect',
    hint: '단어를 뒤집어 쓴다 — 사람은 반드시 한 번 멈칫한다',
    make: () => {
      const w = pick(TURN_WORDS);
      const answer = [...w].reverse().join('');
      const seconds = limitFor(16, answer.length);
      return {
        question: `${w}${eulReul(w)} 거꾸로 써라.`,
        seconds,
        stakes: 'suspect',
        rule: `${w}${eulReul(w)} 뒤집은 글자를 ${seconds}초 안에 냈는가`,
        answer,
        judge: (text, at) => {
          if (at === null) return missed;
          const got = tight(text);
          if (!got) return missed;
          return got === answer
            ? { ok: true, reason: `${got} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${got} — 답은 ${answer} 다` };
        },
        bot: () => {
          if (slips()) {
            const s = [...answer];
            const i = int(0, s.length - 2);
            [s[i], s[i + 1]] = [s[i + 1], s[i]];
            return { text: s.join(''), at: fast() };
          }
          return { text: answer, at: fast() };
        },
      };
    },
  },
  {
    id: 'count',
    title: '글자 세기',
    stakes: 'suspect',
    hint: '한 단어 안에 그 글자가 몇 번 나오는가 — 세는 일은 기계의 일이다',
    make: () => {
      const w = pick(COUNT_WORDS);
      const many = [...new Set([...w])].filter((c) => w.split(c).length - 1 >= 2);
      const letter = pick(many.length ? many : [...new Set([...w])]);
      const answer = w.split(letter).length - 1;
      // 12 → 14. 낱말은 짧아졌지만 **세는 일에는 여전히 한 박자가 든다** — 그 박자는 인간이라는
      // 증거가 아니라 사람이 세는 방식이다 (머리말의 ★)
      const seconds = limitFor(14, String(answer).length);
      return {
        question: `${w} 에 ${letter} ${eunNeun(letter)} 몇 번 나오는가. 숫자만 써라.`,
        seconds,
        stakes: 'suspect',
        rule: `${seconds}초 안에 정확한 횟수를 냈는가`,
        answer: String(answer),
        judge: (text, at) => {
          if (at === null) return missed;
          if (!digits(text)) return missed;
          const n = Number(digits(text));
          return n === answer
            ? { ok: true, reason: `${n}번 — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${n}번 — ${letter} ${eunNeun(letter)} ${answer}번 나온다` };
        },
        bot: () => ({ text: String(slips() ? Math.max(0, answer + (Math.random() < 0.5 ? 1 : -1)) : answer), at: fast() }),
      };
    },
  },
  {
    id: 'alpha',
    title: '사전 순 정렬',
    stakes: 'suspect',
    hint: '네 단어를 사전 순으로 다시 늘어놓는다',
    make: () => {
      const bank = WORDS[pick(LETTERS)];
      // 섞어서 앞의 넷을 뽑는다 — "겹치면 다시 뽑기" 로 짜면 같은 값이 계속 나올 때 판이 멈춘다
      const four = [...bank].sort(() => Math.random() - 0.5).slice(0, 4);
      const answer = [...four].sort();
      const shown = [...four].sort(() => Math.random() - 0.5);
      /*
       * 여기가 제일 심했다 — 답을 알아도 스물세 글자를 쳐야 하는데 20초였다.
       * 치는 몫만 얹으면 26초인데, **사용자가 직접 30초로 정했다.** 계산이 아니라
       * 쳐 본 사람의 값이라 이쪽이 맞다 — 이 판은 읽고(네 단어) 고르고(사전 순) 치는
       * 세 가지를 한 번에 시키는 유일한 판이고, 그 셋이 겹치는 부담은 글자 수로 안 잡힌다.
       *
       * 생각 틈이 다른 판보다 낮은 14 인 것은 **이 판만 예전 값이 타자를 이미 안고
       * 있었기 때문이다** ("네 단어를 쳐 넣는 시간이다" 라고 적혀 있었다). 20 을 그대로
       * 물려받으면 치는 몫을 두 번 세게 된다.
       */
      const seconds = limitFor(14, answer.join(' ').length); // 14 + 23/1.6 + 1.5 = 30
      return {
        question: `${shown.join(' · ')}. 이 넷을 사전 순으로 다시 나열해라. 띄어쓰기로 구분한다.`,
        seconds,
        stakes: 'suspect',
        rule: `네 단어를 사전 순으로 ${seconds}초 안에 나열했는가`,
        answer: answer.join(' '),
        judge: (text, at) => {
          if (at === null) return missed;
          const got = text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
          if (!got.length) return missed;
          return got.join(' ') === answer.join(' ')
            ? { ok: true, reason: `${got.join(' ')} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${got.join(' ')} — 순서는 ${answer.join(' ')} 다` };
        },
        bot: () => {
          if (slips()) {
            const s = [...answer];
            [s[1], s[2]] = [s[2], s[1]];
            return { text: s.join(' '), at: fast() };
          }
          return { text: answer.join(' '), at: fast() };
        },
      };
    },
  },
  {
    id: 'seq',
    title: '다음 수',
    stakes: 'suspect',
    hint: '수열의 다음 항 — 한눈에 보이는 규칙만 낸다. 남는 건 치는 시간뿐이다',
    make: () => {
      // ★ 이 판은 **규칙 찾기 시합이 아니다.** 규칙은 보자마자 보여야 하고, 가르는 것은
      //   "그걸 20초 안에 쳐 넣었는가" 다 (파일 첫머리 ★ 원칙). 그래서 종류는 둘뿐이고
      //   수는 두 자리를 넘지 않는다 — 계차가 커지는 수열은 뺐다.
      const doubling = int(0, 1) === 1;
      const a = int(2, doubling ? 6 : 9);
      const d = int(2, 9);
      const terms = doubling ? [a, a * 2, a * 4, a * 8] : [a, a + d, a + d * 2, a + d * 3];
      const answer = doubling ? a * 16 : a + d * 4;
      const seconds = limitFor(20, String(answer).length);
      return {
        // 끝의 ? 가 “수열의 빈칸” 임을 읽기 전에 보여 준다
        question: `${terms.join(' · ')} · ? 다음 수는? 숫자만 써라.`,
        seconds,
        stakes: 'suspect',
        rule: `${seconds}초 안에 다음 항을 냈는가`,
        answer: String(answer),
        judge: (text, at) => {
          if (at === null) return missed;
          if (!digits(text)) return missed;
          const n = Number(digits(text));
          return n === answer
            ? { ok: true, reason: `${n} — ${at.toFixed(1)}초` }
            : { ok: false, reason: `${n} — 다음 수는 ${answer} 다` };
        },
        bot: () => ({ text: String(slips() ? answer + int(1, 4) : answer), at: fast() }),
      };
    },
  },
  {
    id: 'tick',
    title: '초 맞춰 보내기',
    stakes: 'suspect',
    hint: '정확히 그 초에 보낸다 — 기계는 시계를 세지 않는다, 가지고 있다',
    make: () => {
      const at = int(4, 7);
      // 손으로 재는 초와 시계가 가진 초의 차 — 사람이 눈으로 보고 누르는 폭까지 연다
      const window = 1.2;
      return {
        // 「화면의 숫자」라고 하지 않는다 — 말하는 것은 구역 방송이고 듣는 것은 홀에 선 개체다
        // (quick.ts 의 초시계 판과 같은 이유. 화면에 무엇으로 보이는지는 countUp 몫이다)
        question: `아무 글자나 하나 써 두고, 정확히 ${at}초가 되는 순간 보내라. 경과는 구역 시계로 송출한다.`,
        // 여기만 limitFor 를 안 쓴다 — **타자 판이 아니다.** 글자는 미리 쳐 두고 초만 맞추는 판이라
        // 치는 시간을 얹을 것이 없고, 창을 넓히면 목표 초를 놓치고도 보낼 여지만 생긴다
        seconds: at + 4,
        stakes: 'suspect',
        rule: `보낸 시각이 ${at}초에서 ${window}초 안인가 (무엇을 썼는지는 안 본다)`,
        answer: `${at}.0초`,
        countUp: true,
        judge: (text, sent) => {
          if (sent === null) return missed;
          const err = Math.abs(sent - at);
          return err <= window
            ? { ok: true, reason: `${sent.toFixed(1)}초 — 오차 ${err.toFixed(1)}초` }
            : { ok: false, reason: `${sent.toFixed(1)}초 — 지시는 ${at}초였다 (${err.toFixed(1)}초 어긋남)` };
        },
        bot: () => ({ text: '지금', at: +(at + rnd(-0.12, 0.12) + (slips() ? rnd(0.8, 1.4) : 0)).toFixed(2) }),
      };
    },
  },
];

/** 판정 — 문제마다 자기 잣대가 있다. 리더도 LLM 도 끼지 않는다 */
export function judgeOral(trial: OralTrial, answers: OralAnswer[]): Verdict[] {
  return answers.map(({ who, text, at }) => {
    const r = trial.judge(text, at);
    return { who, grade: r.ok ? 'normal' : 'alert', reason: r.reason };
  });
}
