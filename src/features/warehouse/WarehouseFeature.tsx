/**
 * 창고 3D 맵(격납고 홀) — 3D 월드(/world)와 같은 흐름(방 번호 → 워커 → 걷기·말풍선)에 배경만 격납고 홀이다.
 * 화면·입력·네트워크는 features/world/WorldFeature 가 전부 쥐고, 여기는 어느 맵인지와 **무대 위 리더 로봇**만 얹는다.
 */

import { WorldFeature } from '@/features/world/WorldFeature';

import { LeaderOnHangarStage } from './LeaderRobot';

export function WarehouseFeature() {
  return (
    <WorldFeature map="warehouse">
      <LeaderOnHangarStage />
    </WorldFeature>
  );
}
