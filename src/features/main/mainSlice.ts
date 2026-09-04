import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { loadGuestNick } from '@/shared/guest';

export interface MainState {
  /** 게스트 닉네임 — 로그인이 없으므로 localStorage 에서 복원한다 (src/shared/guest.ts) */
  nickname: string;
  /** "코드로 입장" 입력값 */
  joinCode: string;
}

const initialState: MainState = { nickname: loadGuestNick(), joinCode: '' };

export const mainSlice = createSlice({
  name: 'main',
  initialState,
  reducers: {
    setNickname(s, a: PayloadAction<string>) { s.nickname = a.payload; },
    setJoinCode(s, a: PayloadAction<string>) { s.joinCode = a.payload; },
  },
  selectors: {
    selectNickname: (s) => s.nickname,
    selectJoinCode: (s) => s.joinCode,
  },
});

export const mainActions = mainSlice.actions;
export const mainSelectors = mainSlice.selectors;
