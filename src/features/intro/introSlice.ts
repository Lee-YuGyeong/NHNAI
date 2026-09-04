import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** 랜딩의 구간 — 상단 내비가 가리키는 것. 화면에 지금 보이는 구간이 상태다 */
export type IntroSection = 'hero' | 'about' | 'roles' | 'rules';

export interface IntroState {
  /** 뷰포트에 가장 많이 들어와 있는 구간 (내비 활성 표시용) */
  section: IntroSection;
}
const initialState: IntroState = { section: 'hero' };

export const introSlice = createSlice({
  name: 'intro',
  initialState,
  reducers: {
    setSection(s, a: PayloadAction<IntroSection>) { s.section = a.payload; },
  },
  selectors: { selectSection: (s) => s.section },
});

export const introActions = introSlice.actions;
export const introSelectors = introSlice.selectors;
