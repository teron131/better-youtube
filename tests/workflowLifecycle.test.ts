/**
 * Verifies the video workload lifecycle interface used by summary and caption handlers.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { VideoWorkloadLifecycle } from "../src/background/workloads.ts";

test("failed joined work releases request identity and allows another run", async () => {
  const lifecycle = new VideoWorkloadLifecycle();
  const first = lifecycle.begin({ videoId: "video", requestId: "first", workloadKey: "job" });
  const running = first.runOrJoin(async () => {
    throw new Error("provider failed");
  });
  const second = lifecycle.begin({ videoId: "video", requestId: "second", workloadKey: "job" });
  const joining = second.runOrJoin(async () => assert.fail("duplicate job"));
  await Promise.all([
    assert.rejects(running, /provider failed/),
    assert.rejects(joining, /provider failed/),
  ]);
  const next = lifecycle.begin({ videoId: "video", workloadKey: "job" });
  assert.equal(next.resolveRequestId(), undefined);
  assert.equal(await next.runOrJoin(async () => {}), "ran");
});

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

test("cancelling the latest owner aborts inference and permits an immediate retry", async () => {
  const lifecycle = new VideoWorkloadLifecycle();
  const old = lifecycle.begin({ videoId: "video", requestId: "old", workloadKey: "same" });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldJob = old.runOrJoin(() => pending);
  const joined = lifecycle.begin({ videoId: "video", requestId: "joined", workloadKey: "same" });
  lifecycle.cancel("video", "old");
  assert.equal(old.signal.aborted, false);
  lifecycle.cancel("video", "joined");
  assert.equal(joined.signal.aborted, true);
  assert.equal(old.isCurrent(), false);
  const retry = lifecycle.begin({ videoId: "video", requestId: "retry", workloadKey: "same" });
  let finishRetry!: () => void;
  const retryJob = retry.runOrJoin(
    () =>
      new Promise<void>((resolve) => {
        finishRetry = resolve;
      }),
  );
  await Promise.resolve();
  release();
  await oldJob;
  assert.equal(retry.isCurrent(), true);
  assert.equal(retry.resolveRequestId(), "retry");
  assert.equal(retry.signal.aborted, false);
  finishRetry();
  assert.equal(await retryJob, "ran");
});
