import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface LlmState { prompt: string; response: string; status: 'idle' | 'loading' | 'error' }
const initialState: LlmState = { prompt: '', response: '', status: 'idle' };

export const llmSlice = createSlice({
  name: 'llm',
  initialState,
  reducers: {
    setPrompt(s, a: PayloadAction<string>) { s.prompt = a.payload; },
    requested(s) { s.status = 'loading'; s.response = ''; },
    responded(s, a: PayloadAction<string>) { s.status = 'idle'; s.response = a.payload; },
    failed(s) { s.status = 'error'; },
  },
  selectors: { selectPrompt: (s) => s.prompt, selectResponse: (s) => s.response, selectStatus: (s) => s.status },
});

export const llmActions = llmSlice.actions;
export const llmSelectors = llmSlice.selectors;
