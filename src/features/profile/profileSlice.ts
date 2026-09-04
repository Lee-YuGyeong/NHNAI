import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ProfileState { nickname: string; interests: string[] }
const initialState: ProfileState = { nickname: '', interests: [] };

export const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    setNickname(s, a: PayloadAction<string>) { s.nickname = a.payload; },
    setInterests(s, a: PayloadAction<string[]>) { s.interests = a.payload; },
  },
  selectors: { selectNickname: (s) => s.nickname, selectInterests: (s) => s.interests },
});

export const profileActions = profileSlice.actions;
export const profileSelectors = profileSlice.selectors;
