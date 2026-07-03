/**
 * Pure recommendation-filter policy for extracted YouTube video metadata.
 */

import type { FeedFilterSettings } from "@/core/recommendationFilters";
import type { VideoCardData } from "./recommendationFilterExtractor";

export type FilterReason =
	| "views"
	| "live-viewers"
	| "mix"
	| "keywords"
	| "duration"
	| "age"
	| "language";

type TriggeredFilter = {
	shouldFilter: true;
	reason: FilterReason;
	details: string;
};

type FilterResult = TriggeredFilter | { shouldFilter: false };

function parseViewCount(text: string): number {
	const cleaned = text
		.replace(/views?/i, "")
		.replace(/watching/i, "")
		.replace(/,/g, "")
		.trim();
	const match = cleaned.match(/([\d.]+)\s*([KMB]?)/i);

	if (match) {
		let number = parseFloat(match[1]);
		const suffix = match[2].toUpperCase();
		if (suffix === "K") number *= 1000;
		else if (suffix === "M") number *= 1000000;
		else if (suffix === "B") number *= 1000000000;
		return number;
	}

	const directNumber = parseFloat(cleaned);
	return Number.isNaN(directNumber) ? 0 : directNumber;
}

function parseDuration(text: string): number {
	const cleaned = text.trim();

	if (cleaned.includes(":")) {
		const parts = cleaned.split(":").map((part) => parseInt(part.trim(), 10));
		if (parts.some((part) => Number.isNaN(part))) {
			return 0;
		}

		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
	}

	let totalSeconds = 0;
	const hourMatch = cleaned.match(/(\d+)\s*h(our)?s?/i);
	const minMatch = cleaned.match(/(\d+)\s*m(in(ute)?)?s?/i);
	const secMatch = cleaned.match(/(\d+)\s*s(ec(ond)?)?s?/i);

	if (hourMatch) totalSeconds += parseInt(hourMatch[1], 10) * 3600;
	if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
	if (secMatch) totalSeconds += parseInt(secMatch[1], 10);

	return totalSeconds;
}

function parseVideoAgeYears(text: string): number {
	const normalizedText = text.trim().toLowerCase();
	if (
		normalizedText.includes("today") ||
		normalizedText.includes("yesterday") ||
		normalizedText.includes("just now")
	) {
		return 0;
	}

	const match = normalizedText.match(/(\d+(?:\.\d+)?)\s+(year|month)/i);
	if (!match) {
		return 0;
	}

	const value = parseFloat(match[1]);
	const unit = match[2].toLowerCase();

	switch (unit) {
		case "year":
			return value;
		case "month":
			return value / 12;
		default:
			return 0;
	}
}

function formatAgeYears(ageYears: number): string {
	const roundedYears =
		ageYears >= 10 ? Math.round(ageYears) : Math.round(ageYears * 10) / 10;
	return `${roundedYears} year${roundedYears === 1 ? "" : "s"}`;
}

function checkViewsFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (!settings.viewsFilterEnabled || settings.minViews <= 0) {
		return { shouldFilter: false };
	}

	if (videoData.isActiveLiveContent || !videoData.viewCount) {
		return { shouldFilter: false };
	}

	const viewCount = parseViewCount(videoData.viewCount);
	if (viewCount < settings.minViews) {
		return {
			shouldFilter: true,
			reason: "views",
			details: `Low views: ${videoData.viewCount} (${viewCount})`,
		};
	}

	return { shouldFilter: false };
}

function checkMixFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (!settings.mixFilterEnabled || !videoData.isGeneratedMix) {
		return { shouldFilter: false };
	}

	return {
		shouldFilter: true,
		reason: "mix",
		details: "YouTube Mix card",
	};
}

function checkLiveViewerFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (
		!settings.liveViewerFilterEnabled ||
		settings.minLiveViewers <= 0 ||
		!videoData.isActiveLiveContent
	) {
		return { shouldFilter: false };
	}

	if (!videoData.viewCount) {
		return { shouldFilter: false };
	}

	const viewerCount = parseViewCount(videoData.viewCount);
	if (viewerCount < settings.minLiveViewers) {
		return {
			shouldFilter: true,
			reason: "live-viewers",
			details: `Low live viewers: ${videoData.viewCount} (${viewerCount})`,
		};
	}

	return { shouldFilter: false };
}

function checkDurationFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (
		!settings.durationFilterEnabled ||
		(!settings.minDuration && !settings.maxDuration) ||
		!videoData.duration
	) {
		return { shouldFilter: false };
	}

	const durationSeconds = parseDuration(videoData.duration);
	const minOk =
		!settings.minDuration || durationSeconds >= settings.minDuration;
	const maxOk =
		!settings.maxDuration || durationSeconds <= settings.maxDuration;

	if (!minOk || !maxOk) {
		return {
			shouldFilter: true,
			reason: "duration",
			details: `Duration: ${videoData.duration} (${durationSeconds}s) outside range [${settings.minDuration || 0}, ${settings.maxDuration || "∞"}]`,
		};
	}

	return { shouldFilter: false };
}

function checkAgeFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (
		!settings.ageFilterEnabled ||
		settings.maxAgeYears <= 0 ||
		!videoData.publishTime
	) {
		return { shouldFilter: false };
	}

	const videoAgeYears = parseVideoAgeYears(videoData.publishTime);
	if (videoAgeYears >= settings.maxAgeYears) {
		return {
			shouldFilter: true,
			reason: "age",
			details: `Too old: ${videoData.publishTime} (${formatAgeYears(videoAgeYears)})`,
		};
	}

	return { shouldFilter: false };
}

function checkKeywordsFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (
		!settings.keywordFilterEnabled ||
		settings.keywords.length === 0 ||
		!videoData.title
	) {
		return { shouldFilter: false };
	}

	const titleLower = videoData.title.toLowerCase();
	for (const keyword of settings.keywords) {
		if (keyword && titleLower.includes(keyword.toLowerCase())) {
			return {
				shouldFilter: true,
				reason: "keywords",
				details: `Banned keyword: "${keyword}"`,
			};
		}
	}

	return { shouldFilter: false };
}

function checkLanguageFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (!settings.englishOnlyTitles) {
		return { shouldFilter: false };
	}

	if (!videoData.titleLanguage || videoData.titleLanguage === "unknown") {
		return {
			shouldFilter: true,
			reason: "language",
			details: "Title language: unknown (English only mode)",
		};
	}

	if (videoData.titleLanguage !== "en") {
		return {
			shouldFilter: true,
			reason: "language",
			details: `Title language: ${videoData.titleLanguage} (English only mode)`,
		};
	}

	if (
		videoData.channelLanguage &&
		videoData.channelLanguage !== "unknown" &&
		videoData.channelLanguage !== "en"
	) {
		return {
			shouldFilter: true,
			reason: "language",
			details: `Channel language: ${videoData.channelLanguage} (English only mode)`,
		};
	}

	return { shouldFilter: false };
}

export function hasIncompleteMetadata(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): boolean {
	return Boolean(
		(settings.viewsFilterEnabled &&
			settings.minViews > 0 &&
			!videoData.viewCount &&
			!videoData.isLiveContent) ||
			(settings.liveViewerFilterEnabled &&
				settings.minLiveViewers > 0 &&
				videoData.isActiveLiveContent &&
				!videoData.viewCount) ||
			(settings.durationFilterEnabled &&
				(settings.minDuration || settings.maxDuration) &&
				!videoData.duration &&
				!videoData.isActiveLiveContent) ||
			(settings.ageFilterEnabled &&
				settings.maxAgeYears > 0 &&
				!videoData.publishTime) ||
			(settings.keywordFilterEnabled &&
				settings.keywords.length > 0 &&
				!videoData.title) ||
			(settings.englishOnlyTitles && !videoData.title),
	);
}

export function getTriggeredFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	return (
		[
			checkMixFilter(videoData, settings),
			checkLiveViewerFilter(videoData, settings),
			checkViewsFilter(videoData, settings),
			checkDurationFilter(videoData, settings),
			checkAgeFilter(videoData, settings),
			checkLanguageFilter(videoData, settings),
			checkKeywordsFilter(videoData, settings),
		].find((result) => result.shouldFilter) ?? { shouldFilter: false }
	);
}
