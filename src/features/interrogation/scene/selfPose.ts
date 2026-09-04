/**
 * 내 몸의 자세 — FreeRig · StopRig · DiscRig 가 매 프레임 쓰고, SelfAvatar 가 읽어 내 몸을 그린다.
 *
 * ★ features/trial 의 common/selfPose.ts **그 자체**를 다시 내보낸다. 예전엔 같은 모양을 이 폴더에도 하나
 *   두고 있었는데(다른 세션 소유의 폴더를 안 건드리려고), 회전 원판이 검문소에 들어오면서 그 리그
 *   (features/trial 의 DiscRig — 서버 예측 보정이 통째로 들어 있어 베껴 올 수 없다)가 저쪽 selfPose 에
 *   쓰기 시작했다. 싱글턴이 둘이면 리그가 쓴 자리를 아바타가 못 읽는다 — 그래서 하나로 합쳤다.
 *   쓰는 쪽(FreeRig · StopRig · SelfAvatar · HallScene)은 여전히 이 경로만 본다.
 */
export { selfPose, type SelfPose } from '@/features/trial/games/common/selfPose';
