import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Launcher } from '@/Launcher';
import { FEATURES } from '@/features';
import { UiSfx } from '@/shared/UiSfx';
import { BroadcastBanner } from '@/features/tts/BroadcastBanner';
import { TtsPlayer } from '@/features/tts/TtsPlayer';

/** / = 서비스 선택, /<service> = 각 서비스 화면. 라우트는 features/index.ts 등록부에서 자동 생성 */
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
          <Route path="/" element={<Launcher />} />
          {FEATURES.map((f) => (
            <Route key={f.id} path={f.path} element={<f.Component />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
