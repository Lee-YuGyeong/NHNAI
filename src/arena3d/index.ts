export { worldState, type Transform } from './core/WorldState';
export { disposeObject3D } from './core/dispose';
export { ASSETS, type AssetId } from './assets/manifest';
export { useAsset, preloadAsset } from './assets/loader';
export { WorldCanvas } from './scene/WorldCanvas';
export { THEMES, type ThemeId } from './scene/themes';
export { Avatar } from './avatar/Avatar';
export { qualitySettings, type QualityTier } from './perf/quality';

// ── 3D 아레나 ──
// src/world 를 그대로 복사한 것이다. **원본은 건드리지 않는다** (그쪽은 3D 월드 담당자 작업분).
// 다른 점은 둘뿐: 서버 연결(net/connection)을 뺐고, 내 좌표를 onMove 콜백으로 넘긴다.
// 남의 아바타는 remotePlayers 보관소를 그대로 쓰되, 서버 대신 **여기서 시뮬레이션해 채운다.**
export { WorldScene, type WorldSceneProps, type ArenaMapDef } from './scene/WorldScene';
export { RobotAvatar, TARGET_HEIGHT as AVATAR_HEIGHT } from './avatar/RobotAvatar';
export { Warehouse, Furniture, Lights, SCREEN_FOCUS } from './map/warehouse';
export { Markers, Zones, type MarkerSpec } from './map/markers';
export { remotePlayers, BODY_R, BODY_GAP, type RemotePlayer } from './net/remote-players';
export { getTouchMode, subscribeTouchMode, watchPointerKind, input, resetInput } from './input/input';
export { TouchControls, SpeakButton } from './input/TouchControls';
export { spawnFor } from './mp/spawn';
export { seatColor } from './mp/validate';
export { PROTOCOL_VERSION, ROOM_MAX_PLAYERS, ROOM_CODE_RE, NICK_MAX_LEN, CHAT_MAX_LEN, EMOTE_MS } from './mp/constants';
export type { AnimState, EmoteState, PlayerSnapshot, ErrorCode } from './mp/protocol';
