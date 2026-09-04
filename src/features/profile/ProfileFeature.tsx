import { BackToRoot } from '@/shared/BackToRoot';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { profileActions, profileSelectors } from './profileSlice';

/** 프로필 화면 (담당자가 채운다) */
export function ProfileFeature() {
  const dispatch = useAppDispatch();
  const nickname = useAppSelector(profileSelectors.selectNickname);
  return (
    <main style={{ padding: 64 }}>
      <BackToRoot />
      <h2>프로필</h2>
      <input value={nickname} placeholder="닉네임" onChange={(e) => dispatch(profileActions.setNickname(e.target.value))} />
    </main>
  );
}
