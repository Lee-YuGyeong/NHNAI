/**
 * 라운드 기록의 DO 스토리지 — room-do.ts 의 CODE_KEY/PHASE_KEY/BANS_KEY 와 같은 패턴이다.
 * 하이버네이션·재접속을 넘어 로그 탭이 살아남아야 하므로 storage 가 원본이다.
 */

import type { TrialResult } from './types';

const PREFIX = 'trial:history:';
/** ★ PREFIX 로 시작하지 않는 키를 쓴다 — 그렇지 않으면 list({prefix: PREFIX}) 가 이 카운터까지 기록으로 읽는다 */
const SEQ_KEY = 'trial:seq';

/** 라운드 결과를 저장소에 쌓는다. 키를 0으로 패딩해 storage.list() 의 사전순 = 시간순이 되게 한다. */
export async function appendHistory(storage: DurableObjectStorage, result: TrialResult): Promise<void> {
  const seq = ((await storage.get<number>(SEQ_KEY)) ?? 0) + 1;
  await storage.put(`${PREFIX}${String(seq).padStart(6, '0')}`, result);
  await storage.put(SEQ_KEY, seq);
}

/** 지금까지 쌓인 전체 기록을 오래된 순으로 읽는다. */
export async function readHistory(storage: DurableObjectStorage): Promise<TrialResult[]> {
  const rows = await storage.list<TrialResult>({ prefix: PREFIX });
  return [...rows.values()];
}
