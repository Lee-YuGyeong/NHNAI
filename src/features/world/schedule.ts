/**
 * 대본의 시계 — 예약해 둔 일들.
 *
 * 세 챕터(chapter1·2·3)는 대사도 연출도 전부 여기에 예약한다. 예약을 손잡이 없는 숫자가 아니라
 * **일(Job)** 로 들고 있는 덕에, 바구니(bucket) 하나만 걷어내 중간에 끊을 수 있다
 * (chapter1 의 playHere: 자리를 뜨면 남은 줄을 버린다).
 */

/** 예약해 둔 일 하나 */
export interface Job {
  /** setTimeout 손잡이 */
  id: number;
  /** 일어날 시각 (performance.now 기준) */
  at: number;
  fn: () => void;
}

export interface Schedule {
  /**
   * ms 뒤에 한다. `bucket` 을 주면 그 배열에도 담긴다 — 나중에 그것만 걷어내 중간에 끊을 수 있다
   * (chapter1 의 playHere: 자리를 뜨면 남은 줄을 버린다).
   */
  later(ms: number, fn: () => void, bucket?: Job[]): Job;
  /** 예약을 전부 지운다 (판을 되감을 때) */
  clear(): void;
  /** 바구니 하나만 지운다 — 그 안의 일들만 없던 것이 된다 */
  drop(bucket: Job[]): void;
}

export function createSchedule(): Schedule {
  /** 아직 안 일어난 일 전부 — 바구니에 담긴 것도 여기 함께 있다 */
  const live = new Set<Job>();

  const arm = (job: Job, ms: number) => {
    job.id = window.setTimeout(() => {
      live.delete(job);
      job.fn();
    }, Math.max(0, ms));
  };

  const kill = (job: Job) => {
    window.clearTimeout(job.id);
    live.delete(job);
  };

  const later: Schedule['later'] = (ms, fn, bucket) => {
    const job: Job = { id: 0, at: performance.now() + ms, fn };
    live.add(job);
    arm(job, ms);
    bucket?.push(job);
    return job;
  };

  return {
    later,
    clear() {
      for (const job of [...live]) kill(job);
    },
    drop(bucket) {
      for (const job of bucket) kill(job);
      bucket.length = 0;
    },
  };
}
