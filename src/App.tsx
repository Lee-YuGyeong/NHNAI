import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Launcher } from '@/Launcher';
import { FEATURES } from '@/features';
import { UiSfx } from '@/shared/UiSfx';
import { BroadcastBanner } from '@/features/tts/BroadcastBanner';
import { TtsPlayer } from '@/features/tts/TtsPlayer';

/**
 * / = **인트로로 보낸다**, /<service> = 각 서비스 화면. 라우트는 features/index.ts 등록부에서 자동 생성.
 *
 * ┌─ 첫 문이 바뀌었다 (2026-09-05 사용자: "/ 가면 무조건 인트로로") ─────────┐
 * │ 여태 루트는 **서비스 선택 목록**(Launcher)이었다 — 화면 스무 개가 케이스 │
 * │ 로 늘어선 개발용 문패다. 이제 이 줄을 게임처럼 연다: 주소창에 아무것도    │
 * │ 안 적고 들어오면 곧장 /intro (표식 → 브리핑 → 배역 → 진행 → 입장).       │
 * │                                                                         │
 * │ 목록은 **지우지 않았다.** 주소만 /menu 로 옮겼다 — 개발 중에 /world ·    │
 * │ /trial · /voice 같은 화면으로 바로 뛰려면 그 목록이 있어야 한다.         │
 * │ 되돌리려면 아래 두 줄의 element 를 맞바꾼다.                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function App() {
  return (
    <BrowserRouter>
      {/* 창고 라운지 배경 — 모든 화면 뒤에 깔린다 (humanish app/layout.tsx 의 .room 이식, CSS 투영) */}
      <div className="room" aria-hidden>
        <div className="room-wall room-wall-l" />
        <div className="room-wall room-wall-r" />
        <div className="room-floor" />
        <div className="room-screen" />
      </div>
      {/*
        누르는 소리 — 화면마다 달지 않고 여기 한 번 단다 (shared/UiSfx). 버튼·링크를 누르면
        철컹거리는 금속음이 난다. 끄는 손잡이는 로비 머리말의 스피커 아이콘이다 (shared/SfxToggle).
      */}
      <UiSfx />
      {/* 리더 방송 재생기 — 어느 화면에 있든 shared/broadcast 로 보낸 방송이 소리로 나온다 */}
      <TtsPlayer />
      {/* 같은 방송을 글자로도 낸다 — 소리를 못 듣거나 못 알아들어도 판이 굴러가게 */}
      <BroadcastBanner />
      {/* 화면 청크(features/index.ts 의 lazy)가 내려오는 동안의 자리 — 뒤에 .room 배경이 이미 있다 */}
      <Suspense
        fallback={
          <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#8794a8', fontFamily: 'system-ui, sans-serif' }}>
            불러오는 중…
          </div>
        }
      >
        <Routes>
          {/* 첫 문 — 루트로 들어오면 무조건 인트로다. replace 라 뒤로가기가 여기로 도로 걸리지 않는다 */}
          <Route path="/" element={<Navigate to="/intro" replace />} />
          {/* 개발용 화면 목록 — 옛 루트 화면이 여기로 옮겨 왔다 */}
          <Route path="/menu" element={<Launcher />} />
          {FEATURES.map((f) => (
            <Route key={f.id} path={f.path} element={<f.Component />} />
          ))}
          {/* 없는 주소도 인트로로 — 루트를 한 번 더 거치지 않고 곧장 보낸다 */}
          <Route path="*" element={<Navigate to="/intro" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
