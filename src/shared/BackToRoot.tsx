import { Link } from 'react-router-dom';

/** 각 서비스 화면 좌상단 공통 버튼 → 서비스 선택(/) */
export function BackToRoot() {
  return (
    <Link to="/" style={{ position: 'fixed', top: 12, left: 12, zIndex: 10 }}>
      <button>← 처음</button>
    </Link>
  );
}
