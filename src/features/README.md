# features/ — 서비스별 작업 폴더

한 사람 = 한 폴더. 다른 폴더의 파일은 import 하지 않는다 (공유는 `src/shared/` 또는 store 경유).

```
features/<name>/
  <name>Slice.ts      상태 (createSlice)
  <Name>Feature.tsx   진입 컴포넌트 (인트로 버튼 → 이 화면)
```

추가 절차: 폴더 생성(main 참고) → `features/index.ts` 한 줄(title/path/owner) → `store/index.ts` 한 줄 → 인트로에서 버튼 확인.

테스트는 소스 옆이 아니라 루트 `tests/` 아래에 **소스 구조를 그대로 따라** 둔다
(`tests/features/main/MainFeature.test.tsx`) — 남의 폴더에 파일을 만들지 않아도 되게 (humanish 방식).
`npm test` 로 돌린다. 예시: `tests/lab/rules.test.ts`(순수 함수) · `tests/features/main/…`(화면 조각).
