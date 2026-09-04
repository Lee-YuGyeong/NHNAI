/** 테마 프리셋 (배경·조명·카메라). 새 테마 = 항목 추가 */
export interface ThemeDef {
  background: string;
  camera: { position: [number, number, number]; fov: number };
}

export const THEMES = {
  bar: { background: '#120b1a', camera: { position: [0, 2, 6], fov: 45 } },
} satisfies Record<string, ThemeDef>;

export type ThemeId = keyof typeof THEMES;
