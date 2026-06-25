/**
 * Owns request identity, current-work guards, and pending-job dedupe for video workflows.
 */

interface VideoWorkloadLifecycleInput {
	videoId: string;
	requestId?: unknown;
	workloadKey: string;
}

export interface VideoWorkloadRun {
	effectiveRequestId: string;
	isCurrent(): boolean;
	resolveRequestId(): string | undefined;
	runOrJoin(
		jobFactory: () => Promise<void>,
		onJoin?: () => void,
	): Promise<"ran" | "joined">;
}

/**
 * Encapsulates all mutable lifecycle maps for one family of video workloads.
 */
export class VideoWorkloadLifecycle {
	private readonly requestIds = new Map<string, string>();
	private readonly latestWorkloadKeys = new Map<string, string>();
	private readonly pendingJobs = new Map<string, Promise<void>>();
	private readonly maxEntries: number;

	/**
	 * Creates lifecycle state with a cap for stale request bookkeeping.
	 */
	public constructor(maxEntries = 300) {
		this.maxEntries = maxEntries;
	}

	/**
	 * Starts tracking one video workload and returns the run interface for it.
	 */
	public begin(input: VideoWorkloadLifecycleInput): VideoWorkloadRun {
		const { videoId, workloadKey } = input;
		const effectiveRequestId = input.requestId ? String(input.requestId) : "";

		if (input.requestId) {
			this.requestIds.set(videoId, effectiveRequestId);
		}
		this.latestWorkloadKeys.set(videoId, workloadKey);

		return {
			effectiveRequestId,
			isCurrent: () => this.isCurrent(videoId, workloadKey),
			resolveRequestId: () =>
				this.resolveRequestId(videoId, effectiveRequestId),
			runOrJoin: (jobFactory, onJoin) =>
				this.runOrJoin(
					videoId,
					effectiveRequestId,
					workloadKey,
					jobFactory,
					onJoin,
				),
		};
	}

	/**
	 * Checks whether a run still owns the latest workload slot for a video.
	 */
	private isCurrent(videoId: string, workloadKey: string): boolean {
		return this.latestWorkloadKeys.get(videoId) === workloadKey;
	}

	/**
	 * Resolves the newest request id for a video, falling back to the run id.
	 */
	private resolveRequestId(
		videoId: string,
		fallbackRequestId: string,
	): string | undefined {
		return this.requestIds.get(videoId) || fallbackRequestId || undefined;
	}

	/**
	 * Runs a new workload or joins an equivalent pending workload.
	 */
	private async runOrJoin(
		videoId: string,
		requestId: string,
		workloadKey: string,
		jobFactory: () => Promise<void>,
		onJoin?: () => void,
	): Promise<"ran" | "joined"> {
		const pendingJob = this.pendingJobs.get(workloadKey);
		if (pendingJob) {
			onJoin?.();
			await pendingJob;
			this.finalize(videoId, requestId);
			return "joined";
		}

		try {
			const job = Promise.resolve().then(jobFactory);
			this.pendingJobs.set(workloadKey, job);
			await job;
			return "ran";
		} finally {
			this.pendingJobs.delete(workloadKey);
			this.finalize(videoId, requestId);
		}
	}

	/**
	 * Clears stale request and latest-work entries after a run completes or joins.
	 */
	private finalize(videoId: string, requestId: string): void {
		if (requestId && this.requestIds.get(videoId) === requestId) {
			this.requestIds.delete(videoId);
		}
		this.pruneRequestIds();
		this.pruneLatestWorkloadKeys();
	}

	/**
	 * Prunes old request entries when many videos have been touched.
	 */
	private pruneRequestIds(): void {
		this.pruneMapEntries(this.requestIds);
	}

	/**
	 * Prunes latest-work entries only when they no longer have pending jobs.
	 */
	private pruneLatestWorkloadKeys(): void {
		this.pruneMapEntries(
			this.latestWorkloadKeys,
			(_videoId, latestWorkload) => !this.pendingJobs.has(latestWorkload),
		);
	}

	/**
	 * Removes the oldest removable entries until the map fits the lifecycle cap.
	 */
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
