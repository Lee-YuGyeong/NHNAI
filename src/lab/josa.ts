/**
 * 조사 고르기 — 「A62-024**가** 사람으로 의심된다」·「48 × 3 **은** 얼마인가」·「F **으로** 시작하는」.
 *
 * 이 게임의 말은 **번호와 알파벳 위에 한국어 조사를 얹는다.** 개체 이름은 A62-024 이고,
 * 문제는 48 × 3 이고, 단어 판은 F 로 시작한다 — 화면에는 숫자와 알파벳으로 적히지만 읽을 때는
 * 한국어(공이사 · 삼 · 에프)이고, **조사는 읽은 소리의 받침을 따라간다.** 그래서 문자열만 보고
 * 「이/가」를 못 고른다.
 *
 * 틀린 조사가 눈에 걸리는 자리는 하필 제일 큰 글자다 — 리더의 방송이다. 「A62-024 이 사람으로
 * 의심된다」는 조사가 틀렸을 뿐 아니라 **「이 사람」으로도 읽힌다.** 그 방에서 리더가 하는 말이
 * 어색하면 나머지도 안 믿긴다.
 *
 * 규칙을 여기 한 곳에 둔다 — lab/oral 의 문제 문장과 features/arena 의 방송이 같이 쓴다.
 * 이 파일은 순수하다(three 도 React 도 모른다). 워커에 번들돼도 안전하다.
 */

/** 소리 내어 읽었을 때의 끝소리 */
interface Tail {
  /** 받침이 있는가 */
  has: boolean;
  /** 그 받침이 ㄹ 인가 — 「로/으로」만 이걸 따로 본다 */
  rieul: boolean;
}

/** 숫자 하나를 읽은 소리 — 영 · 일 · 삼 · 육 · 칠 · 팔 에 받침이 있고, 그중 일 · 칠 · 팔 이 ㄹ 이다 */
const NUM: Tail[] = [
  { has: true, rieul: false }, // 0 영
  { has: true, rieul: true }, //  1 일
  { has: false, rieul: false }, // 2 이
  { has: true, rieul: false }, // 3 삼
  { has: false, rieul: false }, // 4 사
  { has: false, rieul: false }, // 5 오
  { has: true, rieul: false }, // 6 육
  { has: true, rieul: true }, //  7 칠
  { has: true, rieul: true }, //  8 팔
  { has: false, rieul: false }, // 9 구
];

/** 이름에 받침이 있는 영문자 — 에프 · 엘 · 엠 · 엔 · 알 · 에스 · 엑스, 이 일곱뿐이다 */
const LETTER_TAIL = 'FLMNRSX';
/** 그중 ㄹ 받침 — 엘 · 알 */
const LETTER_RIEUL = 'LR';

/** 한글 낱자의 끝소리 자리 — 초성·중성 뒤 28칸이 종성이고, 8번이 ㄹ 이다 */
const HANGUL_RIEUL = 8;

/**
 * 그 말의 끝소리. 읽는 법을 모르는 글자로 끝나면 null 이다.
 *
 * **뒤에서부터 읽을 수 있는 글자를 찾는다** — 조사 앞에 붙는 것이 「A62-024」처럼 붙임표로
 * 끝나거나 「(48)」처럼 괄호로 닫힐 수 있는데, 소리를 내는 것은 그 앞의 글자다.
 */
function tailOf(word: string): Tail | null {
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const c = word[i];
    if (c >= '0' && c <= '9') return NUM[Number(c)];
    const up = c.toUpperCase();
    if (up >= 'A' && up <= 'Z') return { has: LETTER_TAIL.includes(up), rieul: LETTER_RIEUL.includes(up) };
    const code = c.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      const jong = code % 28;
      return { has: jong !== 0, rieul: jong === HANGUL_RIEUL };
    }
  }
  return null;
}

/** 받침이 있으면 앞엣것, 없으면 뒤엣것. 읽는 법을 모르면 받침 없는 쪽으로 — 그편이 덜 틀린다 */
const pick = (word: string, withTail: string, without: string): string =>
  tailOf(word)?.has ? withTail : without;

/** 「이」인가 「가」인가 */
export const iGa = (word: string): string => pick(word, '이', '가');
/** 「은」인가 「는」인가 */
export const eunNeun = (word: string): string => pick(word, '은', '는');
/** 「을」인가 「를」인가 */
export const eulReul = (word: string): string => pick(word, '을', '를');
/** 「로」인가 「으로」인가 — 받침이 없거나 ㄹ 이면 「로」다 */
export const euRo = (word: string): string => {
  const t = tailOf(word);
  return t && t.has && !t.rieul ? '으로' : '로';
};
