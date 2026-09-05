/**
 * 게임 카드의 그림 — 판마다 한 장.
 *
 * ★ 스크린샷이 아니라 **도해**다. 이 프로젝트에는 미니게임 썸네일이 없고(public/ 에 없다),
 *   있더라도 여섯 장이 다 어두운 3D 홀이라 서로 구분이 안 된다. 대신 그 판이 무엇을 재는지를
 *   선 몇 개로 그린다 — 원판은 도는 방향, 다리는 기우는 쪽.
 * ★ CDN 아이콘 대신 인라인 SVG (lobby/console.tsx 와 같은 규칙 — 배포본에서 외부 요청이
 *   나가지 않는다). 색은 전부 currentColor 라 카드가 켜지면 그림도 같이 켜진다.
 * ★ 목록에 없는 둘(정지선 · 색 사냥)도 여기 남는다 — 주소로 들어가면 그 판은 그대로 돌고,
 *   목록에 도로 세울 때 그림부터 다시 그리게 되면 안 된다 (catalog.ts 머리말).
 */
import type { TrialGame } from '@/world/mp/protocol';

const BOX = { viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': true } as const;
const LINE = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
/** 감춰진 값 · 지나간 자국은 흐리게 — 진한 선은 지금 거기 있는 것에만 쓴다 */
const GHOST = { ...LINE, strokeOpacity: 0.42 } as const;

export function GameGlyph({ id }: { id: TrialGame }) {
  switch (id) {
    // 정지선 — 레인 셋 위를 달려 온 자국과, 그 끝에 그어진 선
    case 'stopline':
      return (
        <svg {...BOX}>
          <path d="M4 14h30M4 24h30M4 34h30" {...GHOST} />
          <path d="M38 8v32" {...LINE} />
          <path d="M6 24h16" {...LINE} strokeDasharray="2 4" />
          <circle cx="27" cy="24" r="3.2" {...LINE} />
        </svg>
      );
    // 낙하 생존 — 위에서 내려오는 덩어리 셋과, 그 아래 서 있는 몸
    case 'fall':
      return (
        <svg {...BOX}>
          <rect x="9" y="6" width="7" height="7" {...LINE} />
          <rect x="30" y="13" width="6" height="6" {...LINE} />
          <rect x="20" y="4" width="5" height="5" {...GHOST} />
          <path d="M12.5 17v6M33 23v5M22.5 13v5" {...GHOST} strokeDasharray="2 3" />
          <circle cx="24" cy="31" r="3.2" {...LINE} />
          <path d="M18 42c0-4 2.7-7 6-7s6 3 6 7" {...LINE} />
          <path d="M6 42h36" {...GHOST} />
        </svg>
      );
    // 색 사냥 — 위에서 내려오는 빛과, 그 아래 놓인 구슬 셋 (하나만 켜져 있다)
    case 'colorhunt':
      return (
        <svg {...BOX}>
          <path d="M24 4l12 14H12z" {...GHOST} />
          <circle cx="14" cy="32" r="5" {...GHOST} />
          <circle cx="24" cy="34" r="5.6" {...LINE} />
          <circle cx="24" cy="34" r="2.2" fill="currentColor" />
          <circle cx="34" cy="32" r="5" {...GHOST} />
        </svg>
      );
    // 움직이는 플랫폼 — 발판 둘, 그 사이를 건너뛰는 포물선. 오른쪽 발판은 옆으로 흐른다
    case 'platform':
      return (
        <svg {...BOX}>
          <path d="M5 32h12M31 27h12" {...LINE} />
          <path d="M11 20q13-14 26-2" {...LINE} strokeDasharray="3 3" />
          <circle cx="11" cy="27" r="3" {...LINE} />
          <path d="M36 36v4M40 38h4" {...GHOST} />
          <path d="M31 36h12" {...GHOST} strokeDasharray="2 3" />
        </svg>
      );
    // 회전 원판 — 도는 원판, 도는 방향, 바깥으로 밀려나는 몸
    case 'disc':
      return (
        <svg {...BOX}>
          <ellipse cx="24" cy="28" rx="18" ry="8" {...LINE} />
          <ellipse cx="24" cy="28" rx="8" ry="3.4" {...GHOST} />
          <circle cx="33" cy="26" r="2.8" {...LINE} />
          <path d="M36 20l4 2-1.6 4" {...LINE} />
          <path d="M28 24q6-4 10-2" {...GHOST} strokeDasharray="2 3" />
        </svg>
      );
    // 무게 중심 다리 — 받침 위에서 기운 판자와, 무거운 쪽에 얹힌 상자
    case 'seesaw':
      return (
        <svg {...BOX}>
          <path d="M7 20l34 12" {...LINE} />
          <path d="M24 26l-6 14h12z" {...LINE} />
          <rect x="31" y="22" width="9" height="9" {...LINE} transform="rotate(19 35.5 26.5)" />
          <circle cx="14" cy="20" r="2.6" {...GHOST} />
          <path d="M6 42h36" {...GHOST} />
        </svg>
      );
    // 무너지는 타워 — 쌓인 층 둘, 맨 위 층이 기울어 빠져나간다
    case 'tower':
      return (
        <svg {...BOX}>
          <rect x="10" y="34" width="28" height="7" {...LINE} />
          <rect x="12" y="25" width="24" height="7" {...LINE} />
          <path d="M13 21l22-5 1.6 6.8-22 5z" {...GHOST} />
          <circle cx="22" cy="20" r="2.6" {...LINE} />
          <path d="M31 8l4 4-4 4" {...GHOST} />
        </svg>
      );
    // 회전 봉 넘기 — 축에서 도는 봉, 그 위를 넘는 포물선
    case 'bar':
      return (
        <svg {...BOX}>
          <circle cx="24" cy="34" r="2.6" {...LINE} />
          <path d="M8 30l32 8" {...LINE} />
          <path d="M10 38q14-18 28-6" {...GHOST} strokeDasharray="3 3" />
          <circle cx="12" cy="24" r="3" {...LINE} />
          <path d="M6 42h36" {...GHOST} />
        </svg>
      );
  }
}
