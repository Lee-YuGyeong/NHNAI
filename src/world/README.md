# world/ — three.js 관리 라이브러리

Redux·feature 에 의존하지 않는 순수 three/R3F 레이어. feature 는 이걸 가져다 조립만 한다.

```
core/      WorldState  60fps 값(좌표 등) — Redux 밖 가변 상태
           dispose     GPU 리소스 해제
assets/    manifest    에셋 레지스트리 (id → url). URL 하드코딩 금지
           loader      useAsset(id) · preloadAsset(id)
scene/     WorldCanvas 표준 Canvas (하나만). camera·gl·onCreated 등 Canvas 옵션을 그대로 받는다
           WorldScene  멀티플레이 씬 (카메라·이동·점프·원격 아바타 보간·말풍선). Redux 를 모른다 — 명부는 props
           themes      배경/조명/카메라 프리셋
avatar/    Avatar      캐릭터 1명 (캡슐 플레이스홀더)
           RobotAvatar GLB 휴머노이드 로봇 — public/world/robot.glb (클립 없음. idle/walk/jump/angry/agree 를 뼈로 직접 만든다)
map/       index       맵 등록부 MAPS (corridor · warehouse · interrogation) — 배경·안개·노출·씬·조명·초점·충돌을 한 묶음으로. WorldScene 이 map prop 으로 고른다
           corridor    ★ /world 맵. SF 우주선 복도 — 8각 단면 셸 + 절차 생성 리브 + 발광 튜브, Tripo 부품 3개(격벽 링·콘솔·격납문)를 corridor/layout.ts 의 숫자로 조립
                       (프레임 2종·청동 문은 tools/brass-frame-glb.py 가 짠다. 나머지 20개는 Tripo → tools/corridor-glb.sh)
           corridor/   part(공용 로더) · layout(치수) · walls · screen · lighting · floor-ceiling-plants (부품 컴포넌트)
           warehouse   /warehouse 맵. 격납고 홀 — 복도와 같은 8각 강판 셸(map/scifi.tsx 공용 키트)에 관찰창·모니터·8각 무대·링 조명. 텍스처는 복도 5장 + 심문소 2장을 재사용
           warehouse/  layout(치수·배치·충돌 COLLIDERS)
           interrogation  /interrogation 3D 디지털 심문소. 청색 격자 바닥·강판 벽·심문 의자(Tripo)·링 조명·관찰창·모니터 — 텍스처 6장은 힉스필드 (public/textures/interrogation/)
           interrogation/ layout(치수·배치·충돌 COLLIDERS)
           parts       창고·심문소 공용 조립 헬퍼 (Instanced · Parts · useTiled)
           gallery     이전 맵. 갤러리 홀 (검은 대리석·다크 우드 슬랫·금빛 라인 조명·파티클 웨이브 액자·반사 바닥) — 참고용
input/     input       조작의 단일 출처 (키보드·조이스틱 → 가변 객체 `input`). 터치 모드 판정. 1·2 = 이모트(화남·동의)
           TouchControls 폰용 조이스틱·시야 드래그·점프·💬
net/       connection  WebSocket 래퍼 (콜백 인터페이스 WorldEvents)
           remote-players 원격 플레이어 좌표 링버퍼 (가변 Map — 리렌더 없음)
mp/        ★ 워커(worker/src)와 같이 읽는 순수 파일. react/three/DOM 을 끌어오지 마라
           constants · protocol · spawn · collide · interp · validate
perf/      quality     품질 티어 (dpr/그림자)
```

## 멀티플레이 3D 월드 (humanish 이식)

`features/world/WorldFeature.tsx` 가 조립한다: 방 번호 + 닉네임 → `worker/`(Durable Object)에 WebSocket
→ `welcome` 이 오면 `WorldScene` 을 띄운다. 배경은 `map/corridor.tsx` 의 Black & Gold 복도다 (부품 GLB 는 public/world/corridor/, 화면 그림은 캔버스로 그린다). 가져온 것은 **입장 · 걷기 · 점프 · 시야 · 말풍선 · 명부**뿐이다.
humanish 의 라운드·투표·처형·인트로 영상·주제·봇·달리기·구글 인증·대화 기록은 전부 뺐다.

- 좌표는 절대 Redux 에 넣지 않는다 (`net/remote-players`, `input/input` 의 머리말).
- 서버가 받아주는 좌표 범위는 `mp/constants.ts` 의 `WORLD` 하나다. 맵을 넓히면 거기부터 고친다.
- 벽·가구 충돌 박스는 복도가 `mp/collide.ts` 의 `COLLIDERS`(`map/corridor/layout.ts` 의 배치를 옮기면 같이 고친다), 창고가 `map/warehouse/layout.ts`, 심문소가 `map/interrogation/layout.ts` 의 `COLLIDERS`. 판정 함수는 `mp/collide.ts` 하나이고 박스 목록만 인자로 받는다.
- 바닥 반사(`MeshReflectorMaterial`)는 씬을 한 번 더 그린다. `Corridor quality="low"`(터치·통합 GPU)에서는 반사가 빠지고 리브드 스트립도 절반이다. 그림자맵은 정적이라 에셋이 뜬 뒤 한 번만 굽는다(`StaticShadows`).
- 프로토콜(`mp/protocol.ts`)을 고치면 워커 핸들러와 `net/connection.ts` 를 **같은 커밋에서** 고친다.
