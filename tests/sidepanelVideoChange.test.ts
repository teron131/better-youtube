import assert from "node:assert/strict";
import test from "node:test";

import { MESSAGE_ACTIONS } from "../src/core/constants.ts";
import { currentVideoUrlFromMessage } from "../src/sidepanel/lib/current-video.ts";

test("sidepanel accepts content-script video-change messages", () => {
	assert.equal(
		currentVideoUrlFromMessage({
			action: MESSAGE_ACTIONS.CURRENT_VIDEO_CHANGED,
			videoId: "abc123XYZ_9",
			url: "https://www.youtube.com/watch?v=old-video-1",
		}),
		"https://www.youtube.com/watch?v=abc123XYZ_9",
	);
});

test("sidepanel can recover the changed video id from the message URL", () => {
	assert.equal(
		currentVideoUrlFromMessage({
			action: MESSAGE_ACTIONS.CURRENT_VIDEO_CHANGED,
			url: "https://www.youtube.com/watch?v=nextVideo42_",
		}),
		"https://www.youtube.com/watch?v=nextVideo42_",
	);
});

test("sidepanel ignores unrelated runtime messages", () => {
	assert.equal(
		currentVideoUrlFromMessage({
			action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
			videoId: "abc123XYZ_9",
		}),
		null,
	);
});
