/**
 * 색 사냥의 그리기용 상태 — 서버 메시지(trial_colorhunt 전체 동기화 · trial_picked · trial_orb)를
 * 받아 든다. fallState 와 같은 규칙: Redux 밖 가변 Map 이고, useFrame 이 읽는다.
 *
 * 진짜 색은 여기 없다 — 서버가 곱셈(조명 × 반사율)을 끝낸 **표시색**뿐이다 (P8). 콘솔에서 이
 * 객체를 파도 화면에 보이는 것 이상이 안 나온다.
 *
 * /trial 과 /interrogation(HallScene)이 **같은 인스턴스**를 쓴다 — 한 화면만 살아 있으므로
 * 화면이 열릴 때 clear() 로 이어받는다.
 */
import type { ColorOrb, S2CMessage } from '@/world/mp/protocol';

type SyncMsg = Extract<S2CMessage, { t: 'trial_colorhunt' }>;

const orbs = new Map<number, ColorOrb>();
let board: { name: string; c: string }[] = [];
/** 조명이 바뀔 때마다 오른다 — SampleBoard 가 프레임마다 비교해서 타일색을 갈아 끼운다 */
let version = 0;

export const huntState = {
  clear(): void {
    orbs.clear();
    board = [];
    version += 1;
  },
  /** 시작 · 조명 전환 · 늦은 입장 — 통째로 갈아끼운다 */
  sync(msg: SyncMsg): void {
    orbs.clear();
    for (const o of msg.orbs) orbs.set(o.id, o);
    board = msg.board;
    version += 1;
  },
  picked(objectId: number): void {
    orbs.delete(objectId);
  },
  orb(o: ColorOrb): void {
    orbs.set(o.id, o);
  },
  /** 프레임마다 — 지금 그릴 구슬들을 out 에 채운다. 돌려주는 값은 개수 */
  orbsInto(out: ColorOrb[]): number {
    let n = 0;
    for (const o of orbs.values()) {
      out[n] = o;
      n += 1;
    }
    return n;
  },
  /** E — 내 자리에서 maxR 안의 가장 가까운 구슬. 없으면 null */
  nearest(x: number, z: number, maxR: number): number | null {
    let best: number | null = null;
    let bestD = maxR;
    for (const o of orbs.values()) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d <= bestD) {
        best = o.id;
        bestD = d;
      }
    }
    return best;
  },
  boardView(): readonly { name: string; c: string }[] {
    return board;
  },
  boardVersion(): number {
    return version;
  },
};

/**
 * 조명 오버레이(DOM, multiply)에 쓰는 색 — 차단된 채널도 완전히 0 으로는 안 내린다(바닥 0x38).
 * 씬이 새까매지는 것을 막는 연출 값일 뿐 판정과 무관하다: 구슬 · 견본판의 표시색은 서버가 이미
 * 곱한 값이라 차단 채널이 원래 0 이고, 0 에 무엇을 곱해도 0 이다. /trial 과 /interrogation 이 같이 쓴다.
 */
export function softLight(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return '#ffffff';
  const f = (v: number) => Math.max(0x38, v).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
