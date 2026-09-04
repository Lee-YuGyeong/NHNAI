/** 에셋 레지스트리 — GLB 는 여기 등록하고 id 로만 참조 */
export interface AssetDef { url: string }

export const ASSETS = {
  /** 3D 월드 아바타 (로봇, idle/walk/jump 클립). humanish 에서 가져옴 — 원본 78MB 를 1.2MB 로 줄인 것 */
  robot: { url: '/world/robot.glb' },

  /**
   * SF 복도 맵 부품 — Tripo Studio CLI(tools/tripo-studio-parts.sh + tools/corridor-sci-parts.json) → tools/corridor-sci-glb.sh.
   * 링·콘솔은 형상만 쓰고 재질은 map/corridor.tsx 가 덮는다. (이전 Black & Gold 부품 22개는 2026-08-29 에 뺐다 — git 이력에 있다)
   */
  sci_bulkhead: { url: '/world/corridor/sci_bulkhead.glb' },
  sci_console: { url: '/world/corridor/sci_console.glb' },
  sci_blast_door: { url: '/world/corridor/sci_blast_door.glb' },

  /*
   * 옛 창고 맵(널판 창고) 부품 중 심문소가 tint 해 재사용하는 셋 — Tripo text-to-model(힉스필드 MCP 의 tripo_3d) → tools/warehouse-glb.sh.
   * (갓등·랙·널판·무대턱·헤더 빔·연단은 2026-08-29 격납고 홀로 재구성하며 뺐다 — git 이력에 있다)
   */
  roof_truss: { url: '/world/warehouse/roof_truss.glb' },
  /**
   * 무대 위의 리더 — 최종보스 대형 로봇의 몸. 2026-09-01 에 새로 뽑았다 (그 전에는 사용자가 준 리깅 GLB + 클립 3개였다).
   * Tripo Studio 로 **빈손 T/A 포즈**를 뽑고 리깅해 뼈·스킨만 남긴 것 — 클립은 없다. 움직임은 features/world/enforcerPose.ts 가 코드로 만든다.
   * 절차는 tools/leader-robot-glb.sh 주석에, 프롬프트는 tools/leader-parts.json 에. features/warehouse/LeaderRobot.tsx 가 쓴다
   */
  leader_robot: { url: '/world/warehouse/leader_robot.glb' },
  /** 리더의 대형 캐논 — 따로 생성한 프롭(tools/leader-parts.json 의 leader_cannon). LeaderRobot 이 오른손 뼈에 붙인다 */
  leader_cannon: { url: '/world/warehouse/leader_cannon.glb' },
  /**
   * 무장 심문 AI — Tripo Studio 생성 → 리깅 → 프리셋 애니메이션(걷기·달리기·사격…) → tools/enforcer-glb.sh. 의심도 100 이면 달려와 쏜다
   * (features/world/Enforcer.tsx)
   */
  enforcer: { url: '/world/enforcer.glb' },
  /** 무장 심문 AI 의 소총 — 따로 생성한 프롭(tools/enforcer-parts.json 의 sci_rifle). Enforcer.tsx 가 오른손 뼈에 붙인다 */
  enforcer_rifle: { url: '/world/enforcer_rifle.glb' },
  /**
   * 시나리오 2 의 개체 열 — **성격마다 다른 몸**이다 (기획서 「어디가 닳았나」).
   * Tripo Studio text-to-model 로 하나씩 뽑았다: 프롬프트는 tools/scenario2-cast-parts.json,
   * 뽑기는 tools/tripo-studio-parts.sh, 경량화는 tools/scenario2-cast-glb.sh.
   *
   * ★ **리깅도 클립도 없다.** 이 개체들은 서 있기만 한다 — 걸어가는 하나(작업 구역의 배경 개체)만
   *   기존 리깅 아바타 `robot` 을 쓴다 (features/world2/Unit.tsx). 리깅은 값도 비싸고 클립 이름이
   *   어긋나기 쉽다 (features/world/enforcerPose.ts 머리말의 그 함정).
   * ★ 프롬프트에 성격을 안 적었다. **닳은 자리만** 적으면 성격이 따라 나온다는 것이 이 기획서의 규칙이다.
   */
  s2_u104: { url: '/world/cast2/s2_u104.glb' },
  s2_u089: { url: '/world/cast2/s2_u089.glb' },
  s2_u012: { url: '/world/cast2/s2_u012.glb' },
  s2_u201: { url: '/world/cast2/s2_u201.glb' },
  s2_u063: { url: '/world/cast2/s2_u063.glb' },
  s2_u118: { url: '/world/cast2/s2_u118.glb' },
  s2_u137: { url: '/world/cast2/s2_u137.glb' },
  s2_guard21: { url: '/world/cast2/s2_guard21.glb' },
  s2_seer: { url: '/world/cast2/s2_seer.glb' },
  s2_leader: { url: '/world/cast2/s2_leader.glb' },

  steel_column: { url: '/world/warehouse/steel_column.glb' },
  x_brace: { url: '/world/warehouse/x_brace.glb' },

  /**
   * 격납고 홀(map/warehouse.tsx)에 늘어놓은 것들 — 바닥 화물 컨테이너 · 천장 갠트리 크레인의 호이스트 ·
   * 등 뒤 벽 충전 도크 · 홀을 도는 감시 드론. 프롬프트는 tools/warehouse-parts.json,
   * 뽑기는 tools/tripo-studio-parts.sh, 경량화는 tools/warehouse-glb.sh (오차 1 = Studio v3.1 줄).
   * 리깅도 클립도 없다 — 드론이 도는 것은 warehouse.tsx 가 코드로 돌린다.
   */
  cargo_container: { url: '/world/warehouse/cargo_container.glb' },
  crane_hoist: { url: '/world/warehouse/crane_hoist.glb' },
  charge_dock: { url: '/world/warehouse/charge_dock.glb' },
  watch_drone: { url: '/world/warehouse/watch_drone.glb' },
  /**
   * 옆벽에서 **움직이는 것 둘** — 도는 배기 팬과 훑는 검사 암 (2026-09-02 사용자: "맵 꾸밀만한거
   * 있을까? 역동적이고 여기에 잘 어울리는 glb"). 여태 이 홀에서 움직이는 것은 감시 드론 하나뿐이라,
   * 개체들이 말을 멈추면 화면이 사진이 됐다. 바닥은 못 쓴다 — 배회 마당에 물건을 놓으면 시행
   * 판정이 흔들린다 (warehouse/layout.ts 의 ★). 그래서 **벽 위쪽 죽은 자리**에 건다.
   * 팬은 날개만 뽑아 통째로 돌린다 (테는 원이라 돌아도 티가 안 난다).
   */
  hall_fan: { url: '/world/warehouse/hall_fan.glb' },
  wall_arm: { url: '/world/warehouse/wall_arm.glb' },

  /**
   * 작업 구역(world2/map/work.tsx)의 소각로 화구 — 방에 하나뿐인 주역 프롭.
   * UX Pilot 로 정면 컨셉 이미지를 그리고 그것을 Tripo image-to-model 에 넣었다 — text-to-model 프롬프트는
   * tools/work-parts.json 에, 경량화는 tools/work-glb.sh (60k — 하나뿐이라 예산을 크게 준다).
   * 정규화 치수 [0.794(깊이) × 1(높이) × 1(폭)], **정면이 로컬 +x** 라 세울 때 rotationY 로 돌린다 (work.tsx).
   */
  incinerator: { url: '/world/work/incinerator.glb' },


  /**
   * 심문소 맵 — Tripo Studio CLI(tools/tripo-studio-parts.sh) → tools/interrogation-glb.sh. 트러스·기둥·가새는 창고 부품을 tint 해 재사용한다.
   * (심문 의자는 2026-08-28 뺐다 — 빈 무대)
   */
  sci_rack: { url: '/world/interrogation/sci_rack.glb' },
  ring_lamp: { url: '/world/interrogation/ring_lamp.glb' },
  metal_case: { url: '/world/interrogation/metal_case.glb' },

  /**
   * 물리 미니게임 — 정지선(features/trial). 심문소 홀 안에 레인을 깔고 그 위에 세우는 소품 둘:
   * 목표 정지선의 게이트(레인마다 하나)와 출발선의 비콘. Tripo text-to-model(힉스필드 MCP tripo_3d, 2026-09-04)
   * → tools/trial-glb.sh. 프롬프트는 tools/trial-parts.json. 리깅도 클립도 없다.
   */
  trial_gate: { url: '/world/trial/trial_gate.glb' },
  trial_beacon: { url: '/world/trial/trial_beacon.glb' },
  /** 낙하 생존의 낙하물 — 천장에서 떨어지는 화물 포드. 위치는 서버 스냅샷이 준다(features/trial/games/fall) */
  trial_pod: { url: '/world/trial/trial_pod.glb' },
} satisfies Record<string, AssetDef>;

export type AssetId = keyof typeof ASSETS;
