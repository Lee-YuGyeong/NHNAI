/** 에셋 레지스트리 — GLB 는 여기 등록하고 id 로만 참조 */
export interface AssetDef { url: string }

export const ASSETS = {
  /** 3D 월드 아바타 (로봇, idle/walk/jump 클립). humanish 에서 가져옴 — 원본 78MB 를 1.2MB 로 줄인 것 */
  robot: { url: '/world/robot.glb' },
  /**
   * 금지 원을 둘러싸는 말뚝 — 빈 바닥에 붉은 원만 그려 놓으면 「저기가 어디였더라」가 되므로 **물건을 세운다**.
   * 힉스필드 MCP 로 뽑았다 (generate_image → generate_3d, 텍스처 없음) → tools/arena-glb.sh 로 2k 삼각형까지 줄인 것.
   * 프롬프트는 tools/arena-parts.json. **색은 안 들어 있다** — 표식의 상태(다음/안/밟음/금지)에 따라
   * map/markers.tsx 가 그때그때 칠한다.
   *
   * ★ 짝이던 zone_beacon 은 뺐다. 처음엔 받침만 지름 0.83m 로 나와서(기둥은 0.06m) 손으로
   *   지어 세웠는데, 그 기둥도 결국 뺐다 — **가야 하는 원에는 아무것도 안 세운다**
   *   (map/markers.tsx 의 렌더 머리말). 이 판에 서는 GLB 는 말뚝과 아래 검사문 둘뿐이다.
   */
  hazard_beacon: { url: '/world/arena/hazard_beacon.glb' },
  /**
   * 검사문 — 「문 사이로 지나가라」 판(lab/quick 의 gate)에 서는 갠트리 문 하나.
   * Tripo Studio text-to-model(tools/arena-parts.json → tripo-studio-parts.sh) → tools/arena-glb.sh 로
   * 텍스처를 벗기고 4k 삼각형까지 줄인 것. **색은 여기도 안 들어 있다** — 말뚝과 같은 약속이다.
   *
   * ★ 처음 뽑은 것은 공항 금속탐지기 꼴(폭 0.63 : 키 1.0)이라 버렸다. 문틈을 판정 폭 2.6m 에
   *   맞추면 키가 6.9m 로 천장을 뚫는다. 「차량 검문 갠트리 · 계근대 문틀」로 다시 적어 뽑은 것이
   *   지금 것이다 (폭 1.0 : 키 0.71 → 문틈 2.6m 에 키 3.05m).
   */
  gate_frame: { url: '/world/arena/gate_frame.glb' },
  // bartender: { url: '/models/bartender.glb' },
} satisfies Record<string, AssetDef>;

export type AssetId = keyof typeof ASSETS;
