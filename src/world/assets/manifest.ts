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
   * 특수인공지능대응센터 홀(map/govcenter.tsx, 검문소 /interrogation 의 배경) — 유리 방 안의 서버 랙 · 워크스테이션,
   * 끝벽·옆벽의 철문, 문 옆 벽등. Tripo Studio text-to-model(tools/govcenter-parts.json → tripo-studio-parts.sh)
   * → tools/govcenter-glb.sh. 리깅도 클립도 없다. 알베도는 버리고 노멀맵만 쓴다.
   */
  gov_server_rack: { url: '/world/govcenter/gov_server_rack.glb' },
  gov_workstation: { url: '/world/govcenter/gov_workstation.glb' },
  gov_steel_door: { url: '/world/govcenter/gov_steel_door.glb' },
  gov_wall_lamp: { url: '/world/govcenter/gov_wall_lamp.glb' },
  /**
   * 옆벽 콘솔 — 이 홀 **전용**이다. 복도 부품 sci_console 을 쓰던 자리인데, 그건 모서리가 둥근 덩어리라
   * 각지고 반듯한 콘크리트 홀에서 벽 밑의 검은 혹으로 읽혔다. 게다가 이 맵은 콘솔의 청색 튜브·표시등을
   * **안 그린다** — 형태만으로 읽혀야 하는데 형태가 없었다.
   * UX Pilot 로 정면 컨셉 이미지를 그리고(소각로와 같은 절차) Tripo image-to-model 에 넣었다 —
   * 프롬프트는 tools/govcenter-parts.json, 경량화는 tools/govcenter-glb.sh.
   * ★ sci_console 은 복도·격납고 홀·중앙 시설·재검실·작업 구역이 그대로 쓴다 — 저 여섯은 건드리지 않는다.
   */
  gov_console: { url: '/world/govcenter/gov_console.glb' },

  /**
   * 검문소(/interrogation) 플레이어의 몸 — 군인 넷 (2026-09-04 사용자 제공 Tripo 리깅 GLB → tools/soldier-glb.sh).
   * 뼈 41개 + 클립 5개(preset:biped:walk · run · jump · agree · angry). 원본 77MB → 1.2MB. 어느 몸인지는 서버가 입장 때 정한다
   * (mp/bodies.ts). 그리는 것은 world/avatar/SoldierAvatar.tsx — 걷기·달리기 클립의 제자리 이동(root motion)은 로드 때 뗀다.
   */
  sol_fit_m: { url: '/world/soldier/sol_fit_m.glb' },
  sol_fit_f: { url: '/world/soldier/sol_fit_f.glb' },
  sol_heavy_m: { url: '/world/soldier/sol_heavy_m.glb' },
  sol_heavy_f: { url: '/world/soldier/sol_heavy_f.glb' },
  /**
   * 검문소 무대 위의 처형자 + 총 (2026-09-04 사용자 제공 Tripo GLB → tools/executioner-glb.sh). 몸은 리깅만 있고 클립은 없다 —
   * 무장 심문 AI 와 같은 자세 엔진(features/world/enforcerPose)이 코드로 움직인다. 총은 tools/gun-orient.mjs 로 소총 기준 좌표
   * (총열 +z · 위 +y · 길이 1)로 돌려 구웠다. 의심도 100% 로 격리되는 순간 그 몸을 쏜다 (features/interrogation/scene/Executioner).
   */
  executioner: { url: '/world/executioner/executioner.glb' },
  executioner_gun: { url: '/world/executioner/gun.glb' },

  /**
   * 물리 미니게임 — 움직이는 플랫폼(2026-09-05). 공중 부양 팔각 발판과 출발·도착 비콘.
   * Tripo Studio text-to-model(tools/platform-parts.json → tripo-studio-parts.sh) → tools/platform-glb.sh. 알베도는 버리고 노멀맵만 쓴다
   */
  hover_pad: { url: '/world/platform/hover_pad.glb' },
  pad_beacon: { url: '/world/platform/pad_beacon.glb' },
  /** 회전 원판 생존(features/trial/games/disc) — Tripo Studio(tools/disc-parts.json → tripo-studio-parts.sh → disc-glb.sh). 원판 자체는 코드 기하 + 힉스필드 텍스처 */
  disc_hub: { url: '/world/disc/disc_hub.glb' },
  disc_beacon: { url: '/world/disc/disc_beacon.glb' },

  /**
   * 물리 미니게임 — 정지선(features/trial). 심문소 홀 안에 레인을 깔고 그 위에 세우는 소품 둘:
   * 목표 정지선의 게이트(레인마다 하나)와 출발선의 비콘. Tripo text-to-model(힉스필드 MCP tripo_3d, 2026-09-04)
   * → tools/trial-glb.sh. 프롬프트는 tools/trial-parts.json. 리깅도 클립도 없다.
   */
  trial_gate: { url: '/world/trial/trial_gate.glb' },
  trial_beacon: { url: '/world/trial/trial_beacon.glb' },
  /**
   * 낙하 생존의 공들 — 무게가 다른 다섯(mp/constants FALL_BALLS 와 같은 순서·id). 위치는 서버 스냅샷이 준다
   * (features/trial/games/fall/FallingBalls). trial_pod 는 그 전의 낙하물(화물 포드) — 지금은 안 쓴다.
   */
  trial_pod: { url: '/world/trial/trial_pod.glb' },
  /** 낙하 생존 — 천장 배출 호퍼. 마당 위를 격자로 덮어 공이 "기계에서 나온다"로 읽히게 (FallScene 의 격자).
   *  Tripo 크레딧 0 이라 tools/trial-hopper-glb.py 로 **코드 생성** — 정점색 단일 프리미티브다 */
  trial_hopper: { url: '/world/trial/trial_hopper.glb' },
  ball_basketball: { url: '/world/trial/ball_basketball.glb' },
  ball_soccer: { url: '/world/trial/ball_soccer.glb' },
  ball_baseball: { url: '/world/trial/ball_baseball.glb' },
  ball_pingpong: { url: '/world/trial/ball_pingpong.glb' },
  ball_bowling: { url: '/world/trial/ball_bowling.glb' },
} satisfies Record<string, AssetDef>;

export type AssetId = keyof typeof ASSETS;
