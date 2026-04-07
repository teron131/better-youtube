export function setLatestWorkload(
    latestWorkloads: Map<string, string>,
    videoId: string,
    workloadKey: string,
): void {
    latestWorkloads.set(videoId, workloadKey);
}

export function isCurrentWorkload(
    latestWorkloads: Map<string, string>,
    videoId: string,
    workloadKey: string,
): boolean {
    return latestWorkloads.get(videoId) === workloadKey;
}

export function getCurrentRequestId(
    requestMap: Map<string, string>,
    videoId: string,
    fallbackRequestId: string,
): string | undefined {
    return requestMap.get(videoId) || fallbackRequestId || undefined;
}

export async function runPendingJob(
    pendingJobs: Map<string, Promise<void>>,
    workloadKey: string,
    job: Promise<void>,
): Promise<void> {
    pendingJobs.set(workloadKey, job);
    try {
        await job;
    } finally {
        pendingJobs.delete(workloadKey);
    }
}

export function cleanupRequestEntry(
    requestMap: Map<string, string>,
    videoId: string,
    requestId: string,
): void {
    if (requestId && requestMap.get(videoId) === requestId) {
        requestMap.delete(videoId);
    }
}

export function pruneMapEntries<T>(
    map: Map<string, T>,
    maxEntries: number,
    canRemove: (key: string, value: T) => boolean = () => true,
): void {
    if (map.size <= maxEntries) return;

    const overflow = map.size - maxEntries;
    let removed = 0;
    for (const [key, value] of map) {
        if (!canRemove(key, value)) continue;
        map.delete(key);
        removed += 1;
        if (removed >= overflow) break;
    }
}
