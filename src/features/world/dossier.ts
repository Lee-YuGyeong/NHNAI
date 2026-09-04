/**
 * 내 기록 — 이 구역이 **나에 대해 기억하는 것** (2026-08-30 사용자 설계: "내가 말하는 방향에 따라 결과가 달라지는 느낌").
 *
 * 지금까지 판정은 전부 그 자리에서 끝났다. 복도에서 무슨 말을 했든 중앙 시설의 검문은 그것을 몰랐다.
 * 그래서 여기 한 줄씩 쌓아 두고, 검문 감독(src/lab/director.ts)에게 통째로 실어 보낸다. 그러면 이런 문장이 나온다 —
 *
 *   "아까는 4 구역이라고 했다."
 *
 * 이건 분기표로는 못 만든다. 앞 장면에서 내가 **무슨 말을 했는지**에 달려 있고, 그 말은 미리 정해져 있지 않기 때문이다.
 * 게임이 AI 로 만들어졌다는 걸 플레이어가 체감하는 자리가 여기다.
 *
 * 무엇이 쌓이나:
 *   say   내가 입력줄로 친 한 마디 전부 (WorldFeature.sendLine)
 *   note  관측된 행동과 판정 — 추궁 결과(interrogation), 뒷걸음 판정(backstep), 감독이 남긴 한 줄(director.note),
 *         명판을 읽었는가(identity)
 *
 * 순수 저장소다 (three·DOM·React 없음). 챕터를 import 하지 않는다 — 무대 이름은 `at()` 으로 받는다 (순환 참조 방지).
 * 서버로 가지 않는다: 내 화면이 기억하는 내 행적이다.
 */

export type EntryKind = 'say' | 'note';

export interface Entry {
  /** performance.now() */
  at: number;
  /** 어느 무대에서 있었던 일인가 */
  scene: string;
  kind: EntryKind;
  text: string;
}

/**
 * 얼마나 들고 있나 — 프롬프트에 실리는 건 뒤에서 몇 줄뿐이라(lines) 더 들고 있어 봐야 소용이 없다.
 * 다만 개발 확인용으로 판 전체를 훑을 수 있게 넉넉히 둔다.
 */
const MAX = 80;
/** 프롬프트에 기본으로 싣는 줄 수 — 너무 길면 모델이 최근 답이 아니라 옛 기록을 판정한다 */
const PROMPT_LINES = 12;

const entries: Entry[] = [];
const listeners = new Set<() => void>();
let scene = '구역';

function notify() {
  for (const fn of listeners) fn();
}

function push(kind: EntryKind, text: string): void {
  const t = text.trim();
  if (!t) return;
  const last = entries[entries.length - 1];
  // 같은 무대에서 같은 관측이 연달아 들어오면(프레임 판정이 그렇다) 한 줄로 둔다
  if (last && last.kind === kind && last.scene === scene && last.text === t) return;
  entries.push({ at: performance.now(), scene, kind, text: t.slice(0, 120) });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  notify();
}

export const dossier = {
  all(): readonly Entry[] {
    return entries;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 지금 무대 — 이 뒤로 쌓이는 줄에 이 이름이 붙는다 (챕터들이 단계가 바뀔 때 부른다) */
  at(label: string): void {
    if (label) scene = label;
  },
  /** 내가 한 말 */
  say(text: string): void {
    push('say', text);
  },
  /** 관측된 행동·판정 한 줄 */
  note(text: string): void {
    push('note', text);
  },
  /**
   * 감독에게 실어 보낼 줄들 — 오래된 것부터, 마지막이 가장 최근이다.
   * 무대 이름을 앞에 붙인다: 어디서 한 말인지가 곧 모순을 잡는 근거다.
   */
  lines(limit = PROMPT_LINES): string[] {
    return entries
      .slice(-limit)
      .map((e) => (e.kind === 'say' ? `[${e.scene}] 통행자: "${e.text}"` : `[${e.scene}] 관측: ${e.text}`));
  },
  reset(): void {
    entries.length = 0;
    scene = '구역';
    notify();
  },
};
