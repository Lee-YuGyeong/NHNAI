/**
 * 대본의 시계 — 예약해 둔 일들과 **앞당기기**.
 *
 * 세 챕터(chapter1·2·3)는 대사도 연출도 전부 `setTimeout` 한 줄로 예약해 왔다. 그것만으로는
 * **넘길 수가 없다**: 대화창이 지금 줄을 넘겨도 다음 줄은 제 시각에 매달려 있어서, 빨리 넘긴 만큼
 * 그대로 정적이 된다 (2026-09-02 사용자: T 로 대사를 넘긴다).
 *
 * 그래서 예약을 손잡이 없는 숫자가 아니라 **일(Job)** 로 들고 있는다 — 언제(at), 무엇을(fn),
 * 그리고 그것이 대사 한 줄인가(line). 그러면 `pull()` 이 이렇게 할 수 있다:
 *
 *   ① 아직 안 나온 대사 중 가장 이른 것을 **지금** 부른다
 *   ② 나머지 예약을 전부 그만큼 앞으로 당긴다 — 사이 간격은 그대로다
 *
 * 곧 **시간을 그만큼 감는 것**이다. 줄 사이의 리듬도, 대사에 맞춰 둔 연출(조명·정지·봉쇄)도
 * 서로의 자리를 지킨다. 앞당길 수 있는 것은 대사가 있을 때뿐이라, 대사가 다 끝난 뒤의
 * 무대 이동은 저 혼자 당겨지지 않는다 (pull 은 0 을 돌려주고 아무것도 안 건드린다).
 */

/** 예약해 둔 일 하나 */
export interface Job {
  /** setTimeout 손잡이 */
  id: number;
  /** 일어날 시각 (performance.now 기준) — 앞당기면 이 값이 줄어든다 */
  at: number;
  fn: () => void;
  /** 대사 한 줄인가 — 앞당기기가 집는 것은 대사뿐이다 */
  line: boolean;
}

export interface Schedule {
  /**
   * ms 뒤에 한다. `bucket` 을 주면 그 배열에도 담긴다 — 나중에 그것만 걷어내 중간에 끊을 수 있다
   * (chapter1 의 playHere: 자리를 뜨면 남은 줄을 버린다). `line` 은 이 일이 대사 한 줄이라는 표시다.
   */
  later(ms: number, fn: () => void, bucket?: Job[], line?: boolean): Job;
  /** 예약을 전부 지운다 (판을 되감을 때) */
  clear(): void;
  /** 바구니 하나만 지운다 — 그 안의 일들만 없던 것이 된다 */
  drop(bucket: Job[]): void;
  /**
   * 다음 대사를 **지금** 부르고 나머지를 그만큼 당긴다. 돌려주는 값은 당긴 시간(ms) —
   * 0 이면 앞당길 대사가 없어 아무것도 안 했다는 뜻이다 (부르는 쪽은 이 값으로 제가 들고 있는
   * 절대 시각들을 같이 당긴다: busyUntil · endsAt 같은 것들).
   */
  pull(): number;
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

  const later: Schedule['later'] = (ms, fn, bucket, line = false) => {
    const job: Job = { id: 0, at: performance.now() + ms, fn, line };
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
    pull() {
      const now = performance.now();
      let next: Job | null = null;
      for (const job of live) if (job.line && (!next || job.at < next.at)) next = job;
      if (!next) return 0;
      const delta = Math.max(0, next.at - now);
      /*
       * 먼저 나머지를 당겨 두고 나서 그 줄을 부른다 — 순서가 반대면 그 줄이 새로 예약하는 것들까지
       * 한 번 더 당겨져 두 번 감긴다 (대사의 fn 안에서 다음 연출을 거는 자리가 있다).
       */
      for (const job of live) {
        if (job === next) continue;
        window.clearTimeout(job.id);
        job.at = Math.max(now, job.at - delta);
        arm(job, job.at - now);
      }
      kill(next);
      next.fn();
      return delta;
    },
  };
}
