/**
 * Owns request identity, current-work guards, and pending-job dedupe for background video workflows.
 */

interface VideoWorkloadLifecycleInput {
  videoId: string;
  requestId?: unknown;
  workloadKey: string;
}

export interface VideoWorkloadRun {
  effectiveRequestId: string;
  /** Aborts when a workload with a different key begins for the video or its request is cancelled, the same moments isCurrent turns false. */
  signal: AbortSignal;
  isCurrent(): boolean;
  /** The video's newest request ID, so a joined run's messages reach the view that asked most recently. */
  resolveRequestId(): string | undefined;
  /** Joins an in-flight job with the same workload key instead of starting another. */
  runOrJoin(jobFactory: () => Promise<void>, onJoin?: () => void): Promise<"ran" | "joined">;
}

/** One instance per workload family, such as captions or summaries; each video has at most one current workload in it. */
export class VideoWorkloadLifecycle {
  private readonly requestIds = new Map<string, string>();
  private readonly latestWorkloadKeys = new Map<string, string>();
  private readonly pendingJobs = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly maxEntries: number;

  public constructor(maxEntries = 300) {
    this.maxEntries = maxEntries;
  }

  /** Aborts the video's previous workload when its key differs; the same key reuses one controller, so joined requests share cancellation. */
  public begin(input: VideoWorkloadLifecycleInput): VideoWorkloadRun {
    const { videoId, workloadKey } = input;
    const effectiveRequestId = input.requestId ? String(input.requestId) : "";
    const previous = this.latestWorkloadKeys.get(videoId);
    if (previous && previous !== workloadKey) this.controllers.get(previous)?.abort();
    let controller = this.controllers.get(workloadKey);
    if (!controller || controller.signal.aborted) {
      this.pendingJobs.delete(workloadKey);
      controller = new AbortController();
      this.controllers.set(workloadKey, controller);
    }

    if (input.requestId) {
      this.requestIds.set(videoId, effectiveRequestId);
    }
    this.latestWorkloadKeys.set(videoId, workloadKey);

    return {
      effectiveRequestId,
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted && this.isCurrent(videoId, workloadKey),
      resolveRequestId: () => this.resolveRequestId(videoId, effectiveRequestId),
      runOrJoin: (jobFactory, onJoin) =>
        this.runOrJoin(videoId, effectiveRequestId, workloadKey, jobFactory, onJoin),
    };
  }

  /** Cancels only the current request owner so an older view cannot cancel a newer request. */
  public cancel(videoId: string, requestId: string): void {
    if (this.requestIds.get(videoId) !== requestId) return;
    const key = this.latestWorkloadKeys.get(videoId);
    if (!key) return;
    this.controllers.get(key)?.abort();
    this.pendingJobs.delete(key);
    this.controllers.delete(key);
    this.latestWorkloadKeys.delete(videoId);
    this.requestIds.delete(videoId);
  }

  private isCurrent(videoId: string, workloadKey: string): boolean {
    return this.latestWorkloadKeys.get(videoId) === workloadKey;
  }

  private resolveRequestId(videoId: string, fallbackRequestId: string): string | undefined {
    return this.requestIds.get(videoId) || fallbackRequestId || undefined;
  }

  private async runOrJoin(
    videoId: string,
    requestId: string,
    workloadKey: string,
    jobFactory: () => Promise<void>,
    onJoin?: () => void,
  ): Promise<"ran" | "joined"> {
    const pendingJob = this.pendingJobs.get(workloadKey);
    if (pendingJob) {
      try {
        onJoin?.();
        await pendingJob;
        return "joined";
      } finally {
        this.finalize(videoId, requestId);
      }
    }

    const job = Promise.resolve().then(jobFactory);
    try {
      this.pendingJobs.set(workloadKey, job);
      await job;
      return "ran";
    } finally {
      if (this.pendingJobs.get(workloadKey) === job) {
        this.pendingJobs.delete(workloadKey);
        this.controllers.delete(workloadKey);
      }
      this.finalize(videoId, requestId);
    }
  }

  private finalize(videoId: string, requestId: string): void {
    if (requestId && this.requestIds.get(videoId) === requestId) {
      this.requestIds.delete(videoId);
    }
    this.pruneRequestIds();
    this.pruneLatestWorkloadKeys();
  }

  private pruneRequestIds(): void {
    this.pruneMapEntries(this.requestIds);
  }

  private pruneLatestWorkloadKeys(): void {
    this.pruneMapEntries(
      this.latestWorkloadKeys,
      (_videoId, latestWorkload) => !this.pendingJobs.has(latestWorkload),
    );
  }

  private pruneMapEntries<T>(
    map: Map<string, T>,
    canRemove: (key: string, value: T) => boolean = () => true,
  ): void {
    if (map.size <= this.maxEntries) return;

    const overflow = map.size - this.maxEntries;
    let removed = 0;
    for (const [key, value] of map) {
      if (!canRemove(key, value)) continue;
      map.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}
