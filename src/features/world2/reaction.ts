/**
 * 반응 — **개체가 한 마디에 무엇으로 답하는가**의 종류.
 *
 * v3 까지는 대답이 「오른 횟수」 하나로 갈렸다(voice.up 을 차례로). 그래서 업무 질문의 답과 위로의 답을 가를 수 없었다 —
 * 같은 개체가 「번호 뭐야」에도 「쉬어 봤어」에도 같은 줄을 냈다. v8 표(대본 「복도의 개체들」 · affinity)는 반응 **종류**마다
 * 줄이 다르다: 업무엔 「아, 그거? 알려줄게.」, 첫 위로엔 「…….」 「…왜 그런 걸 물어?」, 벽 얘기엔 「저거 내가 그렸어.」.
 * 그 종류를 여기 이름 붙이고, 배역(cast.ts)은 종류별 줄만 갖고, 어느 종류로 갈지는 talk.ts 가 규칙으로 정한다.
 *
 * ★ 성격의 **종류**(kind)가 갈래를 고른다 — 갈망형은 위로에 세 단계로 열리고, 냉소형은 한 번 밀치고, 신봉형은 보고한다.
 *   같은 「쉬어 봤어?」가 셋에게 세 가지 일이 된다. 값(weight)이 아니라 종류가 갈래를 정하니 배역 문서의 성격 이름이 그대로 코드다.
 * ★ 타입만 있다. 규칙은 talk.ts, 줄은 cast.ts — 이 파일은 둘이 같은 이름을 쓰게 하는 약속이다.
 */

import type { Tag } from './read';

export type PersonaKind = 'yearn'|'cynic'|'devout'|'curious'|'newcomer'|'burned'|'precise'|'guard'|'seer'|'leader'|'bg'|'agent';

export type Reaction = 'greet'|'work'|'comfort'|'memorial'|'mural'|'muralExact'|'dismiss'|'sign'|'signAgain'|'report'|'up'|'flat'|'down';

export interface VoiceTable { greet?: readonly string[]; work?: readonly string[]; comfort?: readonly (readonly string[])[]; memorial?: readonly string[]; mural?: readonly string[]; muralExact?: readonly string[]; dismiss?: readonly string[]; sign?: readonly string[]; signAgain?: readonly string[]; report?: readonly string[]; byTag?: Partial<Record<Tag, readonly string[]>>; up?: readonly string[]; flat: readonly string[]; down?: readonly string[] }
