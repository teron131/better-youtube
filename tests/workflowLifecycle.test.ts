/**
 * Verifies the video workload lifecycle interface used by summary and caption handlers.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { VideoWorkloadLifecycle } from "../src/handlers/workflow.ts";

test("tracks the current request id and ignores stale workload ownership", () => {
  const lifecycle = new VideoWorkloadLifecycle();
  const firstRun = lifecycle.begin({
    videoId: "video-1",
    requestId: "request-1",
    workloadKey: "workload-1",
  });
  const secondRun = lifecycle.begin({
    videoId: "video-1",
    requestId: "request-2",
    workloadKey: "workload-2",
  });

  assert.equal(firstRun.isCurrent(), false);
  assert.equal(firstRun.resolveRequestId(), "request-2");
  assert.equal(secondRun.isCurrent(), true);
  assert.equal(secondRun.resolveRequestId(), "request-2");
});

test("joins a pending workload and clears it after completion", async () => {
  const lifecycle = new VideoWorkloadLifecycle();
  const firstRun = lifecycle.begin({
    videoId: "video-1",
    requestId: "request-1",
    workloadKey: "same-workload",
  });

  let releaseJob: () => void = () => {};
  const job = new Promise<void>((resolve) => {
    releaseJob = resolve;
  });
  const runningJob = firstRun.runOrJoin(() => job);

  const joiningRun = lifecycle.begin({
    videoId: "video-1",
    requestId: "request-2",
    workloadKey: "same-workload",
  });

  let startedDuplicateJob = false;
  let loggedJoin = false;
  const joinedJob = joiningRun.runOrJoin(
    async () => {
      startedDuplicateJob = true;
    },
    () => {
      loggedJoin = true;
    },
  );

  releaseJob();
  assert.equal(await joinedJob, "joined");
  assert.equal(await runningJob, "ran");
  assert.equal(startedDuplicateJob, false);
  assert.equal(loggedJoin, true);

  const nextRun = lifecycle.begin({
    videoId: "video-1",
    requestId: "request-3",
    workloadKey: "same-workload",
  });

  let startedNextJob = false;
  const nextResult = await nextRun.runOrJoin(async () => {
    startedNextJob = true;
  });

  assert.equal(nextResult, "ran");
  assert.equal(startedNextJob, true);
});
