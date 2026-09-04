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
map/       warehouse   창고 시네마 라운지 (건물·조명·가구). humanish 에서 이식
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
→ `welcome` 이 오면 `WorldScene` 을 띄운다. 가져온 것은 **입장 · 걷기 · 점프 · 시야 · 말풍선 · 명부**뿐이다.
humanish 의 라운드·투표·처형·인트로 영상·주제·봇·달리기·구글 인증·대화 기록은 전부 뺐다.

- 좌표는 절대 Redux 에 넣지 않는다 (`net/remote-players`, `input/input` 의 머리말).
- 서버가 받아주는 좌표 범위는 `mp/constants.ts` 의 `WORLD` 하나다. 맵을 넓히면 거기부터 고친다.
- 가구 충돌 박스는 `mp/collide.ts` 의 `COLLIDERS` — `map/warehouse.tsx` 의 배치를 옮기면 같이 고친다.
- 프로토콜(`mp/protocol.ts`)을 고치면 워커 핸들러와 `net/connection.ts` 를 **같은 커밋에서** 고친다.
