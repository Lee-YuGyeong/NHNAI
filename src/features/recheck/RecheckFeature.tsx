/**
 * 재검실 — 중앙 시설 검문에서 **감독이 끌고 온** 사람만 보는 방 (features/world/chapter2.ts 의 detain 무브).
 * 화면·입력·네트워크는 WorldFeature 가 쥐고, 여기는 맵과 챕터 3 만 얹는다 (CentralFeature 와 같은 모양).
 */

import { useEffect } from 'react';

import { WorldFeature } from '@/features/world/WorldFeature';

import { Chapter3Scene } from '@/features/world/Chapter3Scene';
import { warmCast } from '@/lab/cast-warm';

export function RecheckFeature() {
  /*
   * 검문소의 배역을 **여기서부터** 데운다 (src/lab/cast-warm.ts).
   * 재검실은 검문소 바로 앞 방이고, 여기 문답은 대본이 없어 몇 분이 걸린다 — 그 몇 분이면 성격
   * 다섯이 다 지어진다. 여태 데우는 자리는 대기방과 /play 뿐이라, 이 주소를 직접 열고 이야기를
   * 이어 가면(확인용으로 자주 여는 길이다) 검문소가 암전 뒤에서 LLM 을 통째로 기다렸다.
   * 이미 데우는 중이면 아무 일도 하지 않는다 — 길목마다 걸어 둬도 호출은 한 번뿐이다.
   */
  useEffect(warmCast, []);
  return (
    <WorldFeature map="recheck">
      <Chapter3Scene />
    </WorldFeature>
  );
}
