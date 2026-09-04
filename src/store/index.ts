import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { introSlice } from '@/features/intro/introSlice';
import { mainSlice } from '@/features/main/mainSlice';
import { worldSlice } from '@/features/world/worldSlice';
import { profileSlice } from '@/features/profile/profileSlice';
import { llmSlice } from '@/features/llm/llmSlice';
import { ttsSlice } from '@/features/tts/ttsSlice';
import { labSlice } from '@/features/lab/labSlice';
import { talkSlice } from '@/features/talk/talkSlice';
import { gameSlice } from '@/features/game/gameSlice';
import { trialSlice } from '@/features/trial/trialSlice';

/** 등록부: 각 feature 의 slice 를 여기 한 줄씩 추가 (병렬 작업 시 충돌면은 이 줄뿐) */
export const rootReducer = combineSlices(
  introSlice,
  mainSlice,
  worldSlice,
  profileSlice,
  llmSlice,
  ttsSlice,
  labSlice,
  talkSlice,
  gameSlice,
  trialSlice,
);

export const store = configureStore({ reducer: rootReducer });

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
