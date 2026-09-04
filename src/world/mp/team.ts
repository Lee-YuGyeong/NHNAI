/**
 * 팀 생존 — 같은 방 사람들 중 누가 쓰러졌나. 쓰러진 사람은 채팅에 표식(DOWN_MARK)을 한 줄 보내고, 받는 쪽은 표식을 대화창에 안 띄우고 여기 적는다.
 * (서버 프로토콜엔 '쓰러짐' 이 없다 — 채팅은 전원에게 그대로 중계되므로 그 위에 얹는다. 방송(broadcast)은 호스트 좌석만 보낼 수 있어 못 쓴다.)
 *
 * 남은 팀원 = 명부(roster, 나 제외) − 쓰러진 사람. 내가 쓰러졌고 남은 팀원이 없으면 처음으로 돌아간다 (WorldFeature).
 * 순수 저장소. 방을 옮기거나 다시 시작하면 reset.
 */

/** 채팅으로 보내는 "쓰러졌다" 표식 — 사람이 칠 일이 없는 문자열. 서버는 앞뒤 공백만 다듬으므로 그대로 온다 */
export const DOWN_MARK = '⟦DOWN⟧';

const downed = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

export const team = {
  /** 바뀔 때마다 오르는 번호 — useSyncExternalStore 스냅샷 */
  version(): number {
    return version;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  isDown(id: string): boolean {
    return downed.has(id);
  },
  down(id: string): void {
    if (downed.has(id)) return;
    downed.add(id);
    notify();
  },
  /** 명부(나 제외) 중 아직 서 있는 사람 수 */
  alive(rosterIds: readonly string[]): number {
    let n = 0;
    for (const id of rosterIds) if (!downed.has(id)) n += 1;
    return n;
  },
  reset(): void {
    if (!downed.size) return;
    downed.clear();
    notify();
  },
};
