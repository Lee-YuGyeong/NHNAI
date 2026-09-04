/**
 * 문 상태 — 맵의 격납문이 열렸는가. 순수 저장소 (three·React 없음).
 * 이야기(features/world/chapter1.ts)가 열고, 맵(map/corridor.tsx)의 문 컴포넌트가 프레임마다 읽어 문짝을 올린다.
 * 충돌 박스는 안 바뀐다 — 열린 문 앞(문턱)에 닿으면 이야기가 다음 맵으로 옮긴다.
 */

export interface DoorState {
  /** 복도 먼 끝(중앙 시설 쪽) 격납문 — 0 닫힘 … 1 열림 (목표) */
  corridorFar: number;
  /** 중앙 시설 먼 끝 격납문 = 인지 검증실 — 챕터 2 의 끝에 열린다 */
  centralFar: number;
  /** 재검실의 문 — 챕터 3 이 끝나면 열린다 (통과든 사격이든 여기로 나간다) */
  recheck: number;
  /**
   * 격납고 홀(= 인지 검증실)의 등 뒤 격납문 — **이야기로 들어온 길에서만 움직인다.**
   *
   * 앞의 셋과 방향이 반대다: 저쪽은 닫혀 있다가 **나가려고** 열리고, 이건 열린 채로 시작해
   * 들어선 뒤에 **닫힌다.** 인계 서류가 「문 개방」이라고 적어 두는데(features/arena/HandoverCard)
   * 막이 걷히면 문 없이 홀 한가운데였다 — 앞 세 장이 문마다 열고 봉쇄하며 왔는데 마지막 방만
   * 문이 없었다. 이제 들어온 문이 등 뒤에서 닫힌다: 돌아서면 그 문이 있다.
   *
   * 판만 여는 길(/arena · /interrogation)은 이걸 안 건드린다 — 거기는 들어온 문이 없다.
   */
  hall: number;
}

const state: DoorState = { corridorFar: 0, centralFar: 0, recheck: 0, hall: 0 };

export const doors = {
  get(): DoorState {
    return state;
  },
  openCorridorFar(): void {
    state.corridorFar = 1;
  },
  openCentralFar(): void {
    state.centralFar = 1;
  },
  openRecheck(): void {
    state.recheck = 1;
  },
  /** 홀의 격납문을 연다 — 이야기로 들어오는 동안(암전 · 인계 서류) 열어 둔다 */
  openHall(): void {
    state.hall = 1;
  },
  /** 들어섰다 — 등 뒤에서 닫는다 */
  closeHall(): void {
    state.hall = 0;
  },
  reset(): void {
    state.corridorFar = 0;
    state.centralFar = 0;
    state.recheck = 0;
    state.hall = 0;
  },
};
