import assert from "node:assert/strict";
import test from "node:test";

import {
	getChromeTabTrackPriority,
	getChromeTabTrackType,
} from "../src/core/transcript/chromeTab.ts";

test("prefers auto-generated English tracks over manual English tracks", () => {
	const manualEnglishTrack = {
		languageCode: "en-US",
		kind: null,
		name: "English (United States)",
		vssId: ".en",
	};
	const autoEnglishTrack = {
		languageCode: "en",
		kind: "asr",
		name: "English (auto-generated)",
		vssId: "a.en",
	};

	const sortedTracks = [manualEnglishTrack, autoEnglishTrack].sort(
		(leftTrack, rightTrack) =>
			getChromeTabTrackPriority(leftTrack) -
			getChromeTabTrackPriority(rightTrack),
	);

	assert.equal(sortedTracks[0], autoEnglishTrack);
	assert.equal(getChromeTabTrackType(autoEnglishTrack), "auto");
	assert.equal(getChromeTabTrackType(manualEnglishTrack), "manual");
});

test("recognizes auto-generated tracks from metadata when kind is missing", () => {
	const inferredAutoTrack = {
		languageCode: "en",
		kind: null,
		name: "English (auto-generated)",
		vssId: "a.en",
	};
	const manualTrack = {
		languageCode: "en",
		kind: null,
		name: "English",
		vssId: ".en",
	};

	assert.equal(getChromeTabTrackType(inferredAutoTrack), "auto");
	assert.equal(getChromeTabTrackPriority(inferredAutoTrack), 0);
	assert.equal(getChromeTabTrackPriority(manualTrack), 1);
});
