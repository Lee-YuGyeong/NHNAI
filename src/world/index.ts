export { worldState, type Transform } from './core/WorldState';
export { disposeObject3D } from './core/dispose';
export { ASSETS, type AssetId } from './assets/manifest';
export { useAsset, preloadAsset } from './assets/loader';
export { WorldCanvas } from './scene/WorldCanvas';
export { THEMES, type ThemeId } from './scene/themes';
export { Avatar } from './avatar/Avatar';
export { qualitySettings, type QualityTier } from './perf/quality';

// ── 멀티플레이 3D 월드 (humanish 에서 이식) ──
export { WorldScene, type WorldSceneProps } from './scene/WorldScene';
export { RobotAvatar } from './avatar/RobotAvatar';
export { Corridor, Lights, FOCUS } from './map/corridor';
export { MAPS, type MapId, type MapDef } from './map';
export { WorldConnection, worldWsBase, type WorldEvents } from './net/connection';
export { remotePlayers, type RemotePlayer } from './net/remote-players';
export { getTouchMode, subscribeTouchMode, watchPointerKind, input, resetInput } from './input/input';
export { TouchControls, SpeakButton } from './input/TouchControls';
export { spawnFor } from './mp/spawn';
export { seatColor } from './mp/validate';
export { PROTOCOL_VERSION, ROOM_MAX_PLAYERS, ROOM_CODE_RE, NICK_MAX_LEN, CHAT_MAX_LEN } from './mp/constants';
export type { AnimState, PlayerSnapshot, ErrorCode } from './mp/protocol';
