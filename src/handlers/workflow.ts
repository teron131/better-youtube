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
