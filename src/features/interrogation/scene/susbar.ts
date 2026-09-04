/**
 * 머리 위 의심도 막대의 **색** — 눈금이 어느 칸에 있는가 (SeatAvatar 가 쓴다).
 *
 * 옛 시행판(`src/arena3d/scene/susbar.ts`)의 결정을 그대로 가져왔다. 그 파일에 적힌 이유도 여기서 그대로 산다:
 *
 *   · **색이 눈금을 말한다** (2026-09-02 사용자: "의심도 바 색 바꿀 수 있나? 잘 안 보여").
 *     길이만으로는 방을 훑다가 "누가 타고 있나"를 못 잡는다 — 뜨거운 칸은 **색이 튀어야** 한다.
 *   · **0 일 때도 빈 막대가 보여야 한다** (2026-09-02 사용자: "0%일 때 색도 바꾸고 싶어. 지금 너무 검정이라 안 보여").
 *     판이 서기 전에는 전원이 0 이라, 그때 화면에 있는 것은 빈 막대뿐인데 그게 어두운 벽에 묻히면
 *     눈금이 어디서 차오르는지를 알 수가 없다. 그래서 중간 톤 + 검은 테다.
 *
 * 칸을 가르는 선만 이 판의 것으로 바꿨다. 옛 판은 처형판이 서는 문턱(70)이 그 선이었는데, 이 판에는
 * 그런 문턱이 없다 — 대신 **격리선(100)에서 거꾸로 잰다**: 몰이 한 번(지목+동조+가산 ≈ 20)이면 닿는
 * 거리에 붉은 칸을 두어, 색이 붉어진 몸은 "다음 몰이에 격리될 수 있다"로 읽힌다.
 */
import { SUSPICION } from '@/world/mp/game-protocol';

export type SusLevel = 'calm' | 'warm' | 'hot';

/** 붉어지는 선 — 격리선에서 몰이 한 번(지목 8 + 동조 5 + 가산 6 ≈ 20) 거리 */
export const SUS_HOT = SUSPICION.cut - (SUSPICION.accuse + SUSPICION.agree + SUSPICION.mobCap);

/** 눈금 하나(0~100)가 어느 칸인가 */
export function susLevel(sus: number, hotAt: number = SUS_HOT): SusLevel {
  if (sus >= hotAt) return 'hot';
  return sus >= hotAt / 2 ? 'warm' : 'calm';
}

/**
 * 칸마다의 색과 빛. 붉은 칸에만 빛을 얹는다 — 방 건너에서도 **그 몸 하나가 먼저 눈에 들어야** 한다.
 */
export const SUS_LOOK: Record<SusLevel, { fill: string; glow: string }> = {
  calm: { fill: '#6fe3a6', glow: 'none' },
  warm: { fill: '#ffc061', glow: 'none' },
  hot: { fill: '#ff4d4d', glow: '0 0 9px rgba(255,70,70,0.95)' },
};

/** 빈 막대의 색 — 밝은 벽과 어두운 구석 양쪽에서 서는 중간 톤 (머리말) */
export const SUS_TRACK = '#66798f';
