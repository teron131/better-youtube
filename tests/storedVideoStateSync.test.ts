import assert from "node:assert/strict";
import test from "node:test";

import { subscribeToStoredVideoState } from "../src/sidepanel/lib/stored-video-state-sync.ts";

test("subscribing immediately syncs cached video state", async () => {
	const updates: Array<{ transcript: string }> = [];
	let listener:
		| ((changes: Record<string, unknown>, areaName: string) => void)
		| null = null;

	const cleanup = subscribeToStoredVideoState({
		relevantKeys: new Set(["video-1"]),
		loadState: async () => ({ transcript: "refined transcript" }),
		updateState: (state) => updates.push(state),
		addStorageListener: (nextListener) => {
			listener = nextListener;
		},
		removeStorageListener: () => {
			listener = null;
		},
	});

	await Promise.resolve();

	assert.deepEqual(updates, [{ transcript: "refined transcript" }]);
	assert.equal(typeof listener, "function");

	cleanup();
	assert.equal(listener, null);
});

test("only relevant local storage changes trigger a sync", async () => {
	const updates: Array<{ transcript: string }> = [];
	const storedStates = [
		{ transcript: "initial transcript" },
		{ transcript: "refined transcript" },
	];
	let listener:
		| ((changes: Record<string, unknown>, areaName: string) => void)
		| null = null;

	subscribeToStoredVideoState({
		relevantKeys: new Set(["video-1"]),
		loadState: async () => storedStates.shift() ?? null,
		updateState: (state) => updates.push(state),
		addStorageListener: (nextListener) => {
			listener = nextListener;
		},
		removeStorageListener: () => {
			listener = null;
		},
	});

	await Promise.resolve();
	listener?.({ unrelated: {} }, "local");
	await Promise.resolve();
	listener?.({ "video-1": {} }, "sync");
	await Promise.resolve();
	listener?.({ "video-1": {} }, "local");
	await Promise.resolve();

	assert.deepEqual(updates, [
		{ transcript: "initial transcript" },
		{ transcript: "refined transcript" },
	]);
});
