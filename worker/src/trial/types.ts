import type { TrialResultWire } from '../../../src/world/mp/protocol';

/** 한 라운드의 숨겨진 물리 조건값 — 게임마다 그 게임에 맞는 필드 하나만 채워진다. */
export interface TrialCondition {
  gravity?: number;
  friction?: number;
  lightFilter?: string | null;
}

/**
 * DO 저장소 전용 판정 결과 — `TrialResultWire` 에 조건값 하나만 얹은 모양이다.
 * ★ 절대 와이어로 안 나간다. 방송·전송은 언제나 `TrialResultWire`(조건값 없는 쪽)만 쓴다.
 */
export interface TrialResult extends TrialResultWire {
  condition: TrialCondition;
}
