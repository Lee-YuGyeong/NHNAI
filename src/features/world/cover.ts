/**
 * 위장 상태 한마디 — 「지금 내가 위험한가」를 낱말 하나로 접는다.
 *
 * 숫자만 보고는 안 읽힌다 (2026-08-31 사용자: 라벨을 게임 분위기에 맞게). 의심도 구간과 동기화 이탈을
 * 한 낱말로 접어: 위장 유지 → 주시됨 → 동기화 이탈 → 추적 중 → 노출 직전.
 *
 * 순수 함수다 (three·DOM·React 없음). 두 화면이 같은 말을 써야 해서 여기 있다 —
 * 무대 위 HUD(features/world/StatusPanel)와 무대를 넘길 때의 인계 기록(features/arena/handover).
 * 챕터에서 「추적 중」이던 사람이 다음 방 인계 화면에서 「주시됨」으로 적혀 있으면 그 사이에
 * 무슨 일이 있었는지를 플레이어가 찾게 된다 — 아무 일도 없었는데.
 */

export type CoverTone = '' | 'warn' | 'bad';

export interface Cover {
  text: string;
  tone: CoverTone;
}

export function coverStatus(susp: number, syncLow: boolean): Cover {
  if (susp >= 80) return { text: '노출 직전', tone: 'bad' };
  if (susp >= 60) return { text: '추적 중', tone: 'bad' };
  if (syncLow) return { text: '동기화 이탈', tone: 'warn' };
  if (susp >= 30) return { text: '주시됨', tone: 'warn' };
  return { text: '위장 유지', tone: '' };
}
