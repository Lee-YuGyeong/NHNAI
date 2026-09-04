import { BackToRoot } from '@/shared/BackToRoot';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { llmActions, llmSelectors } from './llmSlice';

/** LLM 테스트 화면 — 실제 호출은 서버(API 키는 브라우저에 두지 않음)를 통해. 담당자가 연결 */
export function LlmFeature() {
  const dispatch = useAppDispatch();
  const prompt = useAppSelector(llmSelectors.selectPrompt);
  const response = useAppSelector(llmSelectors.selectResponse);
  const status = useAppSelector(llmSelectors.selectStatus);

  const send = () => {
    dispatch(llmActions.requested());
    // TODO: fetch('/api/llm', …) → dispatch(llmActions.responded(text))
    dispatch(llmActions.responded(`(mock) ${prompt}`));
  };

  return (
    <main style={{ padding: 64 }}>
      <BackToRoot />
      <h2>LLM 테스트</h2>
      <textarea value={prompt} rows={4} style={{ width: '100%' }} onChange={(e) => dispatch(llmActions.setPrompt(e.target.value))} />
      <button onClick={send} disabled={status === 'loading'}>보내기</button>
      <pre>{response}</pre>
    </main>
  );
}
