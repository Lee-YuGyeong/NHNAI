/**
 * 장면이 직접 세운 개체들의 자리 — 순찰 경비처럼 **네트워크로 오지 않는** AI 들.
 *
 * 의심도 센서(sensor.ts)는 "곁에 누가 있나"를 알아야 응시·뒷걸음을 잴 수 있는데, 여태
 * 원격 플레이어 명부(net/remote-players)만 훑었다. 그 명부는 방에서 온 사람들로만 차므로
 * **혼자 하는 챕터에서는 늘 비어 있었다** — 복도의 유일한 AI 인 경비 둘을 아무리 쳐다봐도
 * 의심도가 안 올랐다. 인트로가 가르치는 세 가지 중 둘이 죽어 있던 셈이다.
 *
 * 원격 명부에 끼워 넣지 않는 이유:
 * - 그 명부는 방 입장·퇴장·퇴실에서 **여러 곳에서 통째로 비워진다**. 맵이 세운 개체가
 *   거기 얹혀 있으면 남의 사정으로 사라진다.
 * - 그리는 쪽도 명부가 아니라 각자다 — 경비는 제 메시를 직접 그린다. 자리만 알리면 된다.
 *
 * 좌표만 담는다. 자세도 애니메이션도 그리는 쪽 몫이다.
 */

export interface Bystander {
  x: number;
  z: number;
  /** 정면 방위(rad, AgentRobot 의 heading = atan2(dx, dz)). 모르면 undefined — 센서는 거리로만 본다 */
  heading?: number;
}

const spots = new Map<string, Bystander>();

/** 개체 몸 반지름(m) — 로봇 아바타 어깨 폭의 절반쯤 */
export const BODY_R = 0.42;

export const bystanders = {
  /** 이 개체가 지금 여기 있다 (프레임마다 불러도 된다 — 같은 자리를 덮어쓸 뿐이다) */
  set(id: string, x: number, z: number, heading?: number): void {
    const at = spots.get(id);
    if (at) {
      at.x = x;
      at.z = z;
      at.heading = heading;
      return;
    }
    spots.set(id, { x, z, heading });
  },
  /** 이 개체가 장면에서 사라졌다 (맵을 옮기면 앞 맵의 경비가 남아 있으면 안 된다) */
  drop(id: string): void {
    spots.delete(id);
  },
  /** 이 개체의 자리 — 없으면 undefined (무장 AI 출동 때 "가장 가까운 경비" 고르기, WorldFeature) */
  at(id: string): Bystander | undefined {
    return spots.get(id);
  },
  each(fn: (b: Bystander) => void): void {
    spots.forEach(fn);
  },
  /** id 와 함께 — 자기 자신을 빼고 볼 때 (경비끼리 겹치지 않게 밀어내기, AgentRobot) */
  entries(fn: (id: string, b: Bystander) => void): void {
    spots.forEach((b, id) => fn(id, b));
  },
  /**
   * (x, z) 에 선 반지름 r 의 몸을 개체들 밖으로 민다 — 플레이어가 경비를 뚫고 지나가지 않게 (WorldScene LocalRig).
   * 개체 몸 반지름은 BODY_R. 겹친 만큼만 개체 반대쪽으로 옮긴 좌표를 돌려준다
   */
  pushOut(x: number, z: number, r: number, except?: string): { x: number; z: number } {
    let ox = x;
    let oz = z;
    spots.forEach((b, id) => {
      if (id === except) return;
      const dx = ox - b.x;
      const dz = oz - b.z;
      const d = Math.hypot(dx, dz);
      const min = r + BODY_R;
      if (d >= min) return;
      if (d < 1e-4) {
        ox += min;
        return;
      }
      const k = (min - d) / d;
      ox += dx * k;
      oz += dz * k;
    });
    return { x: ox, z: oz };
  },
  clear(): void {
    spots.clear();
  },
};
