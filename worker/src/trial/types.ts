import type { TrialResultWire } from '../../../src/world/mp/protocol';

/** 한 판의 숨겨진 물리 조건값 — 게임마다 그 게임에 맞는 필드 하나만 채워진다. 구간(20초)마다 다르므로 배열이다. */
export interface TrialCondition {
  gravity?: readonly number[];
  friction?: readonly number[];
  lightFilter?: readonly (string | null)[];
  /** 회전 원판 — 구간별 표면 마찰계수 (DISC_GRIP) */
  grip?: readonly number[];
  /** 움직이는 플랫폼 — 구간별 발판 배속. 눈에 보이는 값이라 비밀은 아니지만 기록으로 남긴다 */
  platformPace?: readonly number[];
}

/**
 * DO 저장소 전용 판정 결과 — `TrialResultWire` 에 조건값 하나만 얹은 모양이다.
 * ★ 절대 와이어로 안 나간다. 방송·전송은 언제나 `TrialResultWire`(조건값 없는 쪽)만 쓴다.
 */
export interface TrialResult extends TrialResultWire {
  condition: TrialCondition;
}
