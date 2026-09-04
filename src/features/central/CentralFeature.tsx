/**
 * 중앙 시설 — 복도(/world) 끝 격납문이 열리면 여기로 온다 (features/world/chapter1.ts 가 /central?code=…&nick=… 로 보낸다).
 * 화면·입력·네트워크는 WorldFeature 가 쥐고, 여기는 맵과 챕터 1 후반(AI 무리·락다운)만 얹는다.
 */

import { WorldFeature } from '@/features/world/WorldFeature';

import { CentralChapterScene } from '@/features/world/CentralChapterScene';

export function CentralFeature() {
  return (
    <WorldFeature map="central">
      <CentralChapterScene />
    </WorldFeature>
  );
}
