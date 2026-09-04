/**
 * 개체 계열 번호 — 이름표 「A17-023」과 방송 「모델 A-17」의 앞자리 **17**. **판마다 바뀐다.**
 *
 * 2026-09-01 사용자: "A-17 에 17도 랜덤으로 하고 싶어". 뒤 세 자리는 이미 무작위였는데
 * (world/mp/identity 의 TAGS · lab/personas 의 이름 풀) 앞자리만 늘 17 이라 판이 바뀌어도 같은 시설이었다.
 *
 * **한 판 안에서는 절대 안 바뀐다.** 첫 화면(lobby/Intro)의 번호대, 복도의 정비 명판, 중앙 시설의 보안 공지,
 * 마지막 무대(아레나)의 이름표가 전부 같은 계열이어야 한다 — Intro 의 NODE_RANGE 머리말이 그 이유를 적어 두었다:
 * "첫 화면에 적힌 번호가 방에 들어가서 다르면 그 뒤 화면을 전부 의심하게 된다".
 * 그래서 **페이지가 열릴 때 한 번** 뽑고 그 뒤로는 아무도 못 바꾼다 (module 상수 — 다시 뽑는 함수를 두지 않았다).
 *
 * 아무 두 자리 수나 뽑지 않고 후보 목록에서 뽑는 이유: 복도·중앙 시설의 대사는 **음성을 미리 구워 둔다**
 * (tools/voice-lines.mjs 가 대본의 `${series}` 자리를 이 목록만큼 부풀려 클립을 만든다). 목록에 없는 값이 나오면
 * 그 판의 방송·경비 목소리가 통째로 사라진다. 값을 더했으면 `node tools/voice-lines.mjs` 를 한 번 더 돌린다.
 *
 * **아무것도 import 하지 않는 파일이다** — 워커와 같이 읽는 world/mp 도, 순수 로직인 lab 도 여기에 기댄다
 * (shared/broadcast-kind.ts 와 같은 자리이고, 같은 이유로 tsconfig.worker.json 의 include 에 들어 있다).
 * 여기에 import 를 추가하지 않는다. 저쪽 타입 세계에는 `@/` 별칭이 없으므로 mp·lab 에서는 **상대 경로**로 가져간다.
 */

/** 이 몸이 속할 수 있는 계열 — 음성 클립이 이만큼 구워져 있다 */
export const SERIES: readonly number[] = [17, 24, 38, 45, 62, 79];

/** 이 판의 계열. 페이지가 열릴 때 한 번 */
const CURRENT = SERIES[Math.floor(Math.random() * SERIES.length)];

export function series(): number {
  return CURRENT;
}

/**
 * 이름표 한 장 — 「A17-023」. 뒤는 **세 자리 고정폭**이다: 한 번호가 다른 번호 안에 통째로 들어가지 않아야
 * 호명 감지(lab/talk 의 calledIn)가 엉뚱한 개체를 집지 않는다.
 */
export function unitName(tail: number): string {
  return `A${CURRENT}-${String(tail).padStart(3, '0')}`;
}

/**
 * 대본·공지에 **글자 그대로** 남겨 둔 `${series}` 자리를 이 판의 계열로 바꾼다.
 * 왜 진짜 템플릿 문자열을 안 쓰나 — 대사 문장이 그대로 음성 클립의 열쇠라(features/world/voice.ts),
 * 굽는 쪽(tools/voice-lines.mjs)이 소스에서 문장을 **글자로** 읽어 갈 수 있어야 한다.
 */
export function withSeries(text: string): string {
  return text.replace(/\$\{series\}/g, String(CURRENT));
}
