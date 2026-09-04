> HTML 원본(`plan-world2-code.html`)에서 자동 변환 — 표는 `|` 로 갈라진 줄이고, 그림·색은 원본에만 있다.


빌리되 건드리지 않는다

 Who is human · 코드 처리 기획서 · world2 집행 개정 v1 · 자매 문서: 게임 개발 · 전체 흐름

# 빌리되 건드리지 않는다

 world2 의 격리는 이미 코드에 원칙으로 박혀 있다 — 자체 맵 등록부(MAPS2),
 아무 데도 안 보내는 가짜 연결(SOLO), Redux 미등록, 자체 대본 엔진.
 본판과의 실질 결합은 딱 둘: 의심도 싱글턴의 bindCross 슬롯과,
 아직 아무도 안 읽는 아레나 인계(handover.ts).

 이 문서는 게임 개발 기획서(「어디서 죽을 것인가」)의 개정 다섯을
 그 격리를 깨지 않고 얹는 방법을 파일 단위로 적는다.
 원칙은 제목 그대로다 — 본판의 기하와 컴포넌트는 빌리고, 본판의 등록부와 루프는 건드리지 않는다.

 현재

## 무엇이 어디에 있나 — 탐색으로 확인한 사실

 자산 | 파일 | 비고 | 

 코어 탑 기하 | src/world/map/central.tsx (L190–244 코어 탑) | 8각 홀 + 원형 단 + 콘솔 링 + 발광 띠. 본판 등록부 소속 | 

 치수 단일 출처 | src/world/map/central/layout.ts | dais r4.5 · CORE_KEEPOUT r5.9 — 동심원 안쪽 반경이 이미 있다 | 

 락다운 조명 | src/features/world/CentralChapterScene.tsx:61-81 | 전역 재질 색 교체 + 언마운트 복구 + 맥동 광원 — 재사용할 패턴 | 

 world2 집행 | src/features/world2/execution.ts (203줄) | posted→watch→approach→unsling→aim→dead/blocked/spared + 개입 3종 구현 완료 | 

 집행자 몸 | src/features/world2/Executioner.tsx | 새 모델 없음 — 순찰과 같은 s2_guard21 GLB | 

 조각 전파 | src/features/world2/fragments.ts | 신뢰도 감쇠 · 출처 소실 0.3 · hop 뒤틀림 | 

 경보도 | src/features/world2/alert.ts | SYNC 자리를 대신하는 셋 공용 계량기 | 

 아레나 인계 | src/features/world2/handover.ts | write-only — 아레나가 아직 안 읽는다 (파일 스스로 L16-17 에 기록) | 

 의심도 싱글턴 | src/world/mp/suspicion.ts | bindCross 단일 슬롯 — 두 판이 공유하는 유일한 진짜 결합점 | 

 시험 | tests/features/world2/scenario2.test.ts | 태그 · 성격 · 간격 · 조각 · 집행 문턱 | 

 "본판 등록부를 건드리지 않는다. 복도조차 본판 복도를 안 빌리고 새로 지었다."
 src/world2/map/index.ts 머리말 — 코드에 이미 적힌 격리 원칙

 작업

## 일곱 개의 손질 — 개정 다섯을 코드에 대응시킨다

 # | 작업 | 파일 | 무엇을 · 왜 | 대응 개정 | 

 1 | CoreTower 추출 | 
 src/world/map/central/CoreTower.tsx (신설)
src/world/map/central.tsx (사용처로 축소) | 
 코어 탑 메시를 공유 컴포넌트로 뽑는다. 본판 central.tsx 는 그걸 import 하는 첫 사용처가 된다 — 렌더 결과 불변. | 
 1 · 4 | 

 2 | central2 방 신설 | 
 src/world2/map/central2.tsx (신설)
src/world2/map/index.ts (MAPS2 등록) | 
 CoreTower + 8각 홀을 조합해 world2 전용 방을 짓는다. 치수는 layout.ts 의 dais r4.5 / keepout r5.9 를 읽어 온다. 콘솔 히트박스 포함. 본판 MAPS 는 안 건드린다. | 
 1 – 4 | 

 3 | 동심원 필드 | 
 src/features/world2/corefield.ts (신설) | 
 zone(pos) → 'core'|'hall'|'shadow' + 배율표(전파 ×3/×1/×0.4 · 판독 · 조명 · 개입 반경). 순수 데이터 모듈 — 값의 단일 출처. 렌더도 네트워크도 모른다. | 
 2 · 3 | 

 4 | 집행 확장 | 
 src/features/world2/execution.ts
src/features/world2/Executioner.tsx
src/features/world2/Hud2.tsx | 

 ① approach 중 이동 허용 — 문 방향 ±35° 만 flee() 판정, 도달 타이머는 위치 무관 고정.

 ② cover · standIn 발동에 거리 조건(4 m) — corefield 의 개입 반경을 읽는다.

 ③ 콘솔 → dimmed 15 초 플래그. 비용은 기존 콘솔 규칙 그대로(units 전원 −1 · alert +12).

 ④ 조명 국면 — CentralChapterScene.tsx:61-81 의 재질 교체 + 복구 패턴을 그대로 이식한 CoreLight.
 | 
 1 · 3 · 4 | 

 5 | 죽음의 목격 조각 | 
 src/features/world2/fragments.ts
src/features/world2/execution.ts | 
 dead · spared 전이 시 zone 배율 반경 안 개체 전원에게 「처리되는 걸 봤다」 조각 생성(신뢰도 1.00, 기존 감쇠 규칙에 태운다). 경보도는 위치 무관 고정 +25 — 헌법 9 조. | 
 2 | 

 6 | 인계 확장 | 
 src/features/world2/handover.ts | 
 처형 결과(위치 zone · 목격 수 · 대신 부서진 개체 id)를 scenario2:verdict 에 추가. 아레나가 읽는 건 후속 작업이지만, 「빈 자리」 연출(미결 P2)의 데이터가 여기서 준비된다. | 
 5 | 

 7 | 결합점 가드 | 
 src/world/mp/suspicion.ts | 
 bindCross(fn, owner) 에 소유자 태그를 받아, 이미 다른 소유자가 걸려 있으면 console.warn. 동작 불변 — 규약뿐이던 방어를 로그로 승격. | 
 공통 | 

### corefield 의 모양 — 이 파일이 값의 전부를 쥔다

 // src/features/world2/corefield.ts — 순수 데이터. 렌더·네트워크·모델을 모른다.
export type Zone = 'core' | 'hall' | 'shadow'

export const FIELD = {
 core: { r: 6, spread: 3, read: 'max', light: 'max', reach: 6 }, // 개입 가능 6+
 hall: { r: 10, spread: 1, read: 'base', light: 'base', reach: 3 },
 shadow: { spread: 0.4, read: 'none', light: 'dim', reach: 1 },
} as const

export function zone(pos: Vec2): Zone // 코어 중심 거리로만 판정
export function witnessRadius(z: Zone): number // fragments 가 부른다
export function interveneRadius(z: Zone): number // execution 이 부른다

 순서

## 다섯 단계 — 매 단계가 그 자체로 돌아간다

 "순서의 원칙은 하나다 — 모델은 네 번째다. 규칙만으로 소문이 돌고 태도가 움직이고 사람이 죽기까지 하는 뼈대가 먼저 서야 한다."
 「한 마디의 값」 · 로드맵 — 이 작업 전체가 모델 0 회이므로 이 원칙과 정합한다

 기하
 CoreTower 추출 → 본판 렌더 회귀 확인 → central2 신축 + MAPS2 등록. 이 단계 끝에 world2 에서 코어가 서 있는 방을 걸어 다닐 수 있다.

 작업 1 · 2 — 렌더만

 필드
 corefield.ts + fragments 연결. 코어권에서 건 말이 방 전체에 퍼지는 것부터 확인한다 — 집행 없이도 이 방이 이미 다르게 논다.

 작업 3 · 5 전반 — 시험 먼저

 집행
 execution.ts 확장 — 이동 · 거리 조건 · 콘솔 · 조명. HUD 에 「[이동] 누구 곁으로」 한 줄.

 작업 4 — MIN_WALK_MS 불변 확인

 연결
 죽음의 목격 조각 + handover 확장 + bindCross 가드. central2 어둠 국면(EMPTY_SEAT) · 아레나가 나중에 읽을 데이터가 여기서 쌓이기 시작한다.

 작업 5 후반 · 6 · 7

 시험 · 문서
 scenario2.test.ts 에 세 시험 추가, 기획서 6종 + 이 3종을 docs/design/ 에 마크다운으로 내려둔다.

 아래 표 참조

 지키는 선

## 이 작업에서 어기면 안 되는 것

 사람이 죽는 판정에 모델을 부르지 않는다
 execution.ts 머리말에 이미 적혀 있는 선이다. 이번 확장은 전부 규칙 · 위치 기반 —
 zone 판정, 거리 조건, 콘솔 플래그. 모델 호출 0 회를 유지한다.

 MIN_WALK_MS 는 어떤 경로로도 줄지 않는다
 이동을 허용해도 도달 타이머는 시작 시점에 방 값으로 고정. 플레이어가 다가가도, 물러나도,
 콘솔을 눌러도 시간은 그대로다 — 헌법 14 조 「집행은 걸어온다 · 최소 8 초」.

 본판 등록부 · 본판 루프에 쓰기 금지
 건드려도 되는 본판 파일은 둘뿐이다 — central.tsx (CoreTower 추출의 사용처 정리),
 suspicion.ts (가드 추가, 동작 불변). 나머지는 전부 world2 신설 · 수정.

 값은 corefield 한 곳에만 적는다
 배율 · 반경이 execution 과 fragments 에 따로 적히는 순간 밸런싱이 두 곳을 쫓아다니게 된다.
 레벨 문서가 수치의 기준이듯(「한 마디의 값」 · 문서 지도), 코드에서는 corefield 가 기준이다.

 시험

## tests/features/world2/scenario2.test.ts 에 더하는 것

 시험 | 무엇을 확인하나 | 

 zone 배율 | 같은 발화를 코어권 / 홀 / 그늘에서 → 목격 개체 수가 배율대로 갈리는가 | 

 타이머 불변 | approach 중 플레이어 좌표를 아무리 바꿔도 dead 도달 시각이 같은가 · 문 방향 이동만 flee 가 되는가 | 

 개입 거리 | 태도 +3 개체가 5 m 밖이면 standIn 이 안 나오고, 4 m 안이면 나오는가 | 

 콘솔 비용 | dimmed 15 초 동안 목격 반경 ×0.4 · 태도 −1 · 경보 +12 가 정확히 한 번씩 찍히는가 | 

 경보 고정 | 죽음 위치가 어디든 경보도 증가가 +25 로 같은가 (헌법 9 조 회귀 방지) | 

 기존 시험(태그 · 성격 · 간격 · 조각 · 집행 문턱)과 같은 파일, 같은 결. 본판 쪽은
 CoreTower 추출 후 /central 렌더 회귀만 눈으로 확인하면 된다 — 로직 변화가 없다.

 정리

## 문서가 코드보다 몇 세대 뒤처져 있다

 기획서 6종(「걸어오는 것」 「누가 듣고 있나」 등)은 리포지터리에 파일로 존재하지 않고
 소스 주석에만 인용돼 있다. 이 작업과 함께 정리한다:

 할 일 | 내용 | 

 docs/design/ 신설 | 기획서 6종 + 이번 3종을 마크다운으로 내려 코드와 같이 버전 관리한다 | 

 README.md L174 | "/central = 3D 맵 단독 확인" — 실제(챕터 1 후반 + 챕터 2 본 무대)와 다르다. 고친다 | 

 docs/DEVELOPMENT.md | 같은 stale 서술 + world2 언급 0 건. §구조 표에 scenario2 행을 더한다 | 

 이 작업이 끝나면 world2 는 방 하나(central2)와 모듈 하나(corefield)를 얻고,
 본판은 아무것도 잃지 않는다 — 바뀐 본판 파일은 컴포넌트 추출 하나와 경고 로그 하나뿐이다.

 그리고 값이 한 곳에 모인다. 코어의 배율을 바꾸고 싶으면 corefield.ts 한 파일이다 —
 레벨 문서가 수치의 기준이듯, 코드에서는 이 파일이 기준이다.

