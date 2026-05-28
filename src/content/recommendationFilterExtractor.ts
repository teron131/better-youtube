/**
 * Metadata extraction helpers for YouTube recommendation cards.
 */

const HAN_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const LATIN_LETTER_PATTERN = /[A-Za-z]/g;
const ENGLISH_WORD_PATTERN = /\b[A-Za-z]{2,}\b/g;
const VIEW_COUNT_PATTERN = /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*views?/i;
const NO_VIEWS_PATTERN = /No views?/i;
const PUBLISH_TIME_PATTERN =
	/(streamed\s+)?\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i;
const DURATION_TEXT_PATTERN = /^(?:\d+:)?\d{1,2}:\d{2}$/;
const LIVE_BADGE_PATTERN = /\b(live|live now)\b/i;
const LIVE_VIEW_COUNT_PATTERN = /\bwatching\b/i;
const WATCHING_COUNT_PATTERN = /\d+(?:[.,]\d+)?\s*[KMB]?\s+watching/i;
const CHANNEL_LINK_SELECTOR = "a[href^='/@'], a[href^='/channel/']";
const WATCH_LINK_SELECTOR =
	"a#thumbnail, a#video-title, a#video-title-link, a[href*='/watch']";
const THUMBNAIL_LINK_SELECTOR = "a#thumbnail, a[href*='/watch']";
const TITLE_SELECTORS = [
	"#video-title",
	"a#video-title-link",
	"#video-title-link",
	"h3[title]",
	".ytLockupMetadataViewModelHeadingReset",
	"h3 a",
	"yt-formatted-string#video-title",
	"[aria-label]",
];
const DURATION_SELECTORS = [
	"badge-shape .yt-badge-shape__text",
	"yt-thumbnail-bottom-overlay-view-model badge-shape .yt-badge-shape__text",
	".yt-badge-shape__text",
	"yt-thumbnail-badge-view-model",
	"ytd-thumbnail-overlay-time-status-renderer span",
	"span.ytd-thumbnail-overlay-time-status-renderer",
	"#time-status span",
	".badge-style-type-simple",
];
const METADATA_TEXT_SELECTORS = [
	"#metadata-line",
	"ytd-video-meta-block",
	"#channel-info",
];
const LIVE_INDICATOR_SELECTOR =
	"badge-shape .yt-badge-shape__text, .yt-badge-shape__text, yt-thumbnail-badge-view-model, [overlay-style='LIVE'], [aria-label]";
const CHANNEL_PATH_PREFIXES = ["/@", "/channel/"];
const RENDERER_DATA_ACCESSORS = [
	(element: RendererElement) => element?.data,
	(element: RendererElement) => element?.__data?.data,
	(element: RendererElement) => element?.__data?.content,
	(element: RendererElement) => element?.__data?.config,
	(element: RendererElement) => element?.__dataHost?.data,
	(element: RendererElement) => element?.__dataHost?.__data?.data,
	(element: RendererElement) => element?.__dataHost?.__data?.content,
] as const;

type RendererElement = Element & {
	data?: unknown;
	__data?: {
		data?: unknown;
		content?: unknown;
		config?: unknown;
	};
	__dataHost?: {
		data?: unknown;
		__data?: {
			data?: unknown;
			content?: unknown;
		};
	};
};

export type TextLanguage = "en" | "zh" | "unknown";
type ExtractedVideoData = Omit<
	VideoCardData,
	"titleLanguage" | "channelLanguage"
>;

export interface VideoCardData {
	title: string | null;
	titleLanguage: TextLanguage;
	viewCount: string | null;
	duration: string | null;
	publishTime: string | null;
	isLiveContent: boolean;
	isActiveLiveContent: boolean;
	videoId: string | null;
	channelName: string | null;
	channelLanguage: TextLanguage;
	channelId: string | null;
	channelPath: string | null;
}

export const VIDEO_CARD_SELECTOR =
	"ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model";

export const VIDEO_CARD_NODE_NAMES = new Set([
	"YTD-VIDEO-RENDERER",
	"YTD-RICH-ITEM-RENDERER",
	"YTD-GRID-VIDEO-RENDERER",
	"YTD-COMPACT-VIDEO-RENDERER",
	"YT-LOCKUP-VIEW-MODEL",
]);

export function normalizeText(text: unknown): string | null {
	if (typeof text !== "string") {
		return null;
	}

	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized || null;
}

export function normalizeChannelPath(path: unknown): string | null {
	if (typeof path !== "string" || !path) {
		return null;
	}

	try {
		const url = new URL(path, window.location.origin);
		const normalizedPath = url.pathname.replace(/\/+$/, "");
		if (
			CHANNEL_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
		) {
			return normalizedPath;
		}
	} catch {
		return null;
	}

	return null;
}

export function getChannelIdFromPath(path: string | null): string | null {
	if (!path?.startsWith("/channel/")) {
		return null;
	}

	return path.split("/channel/")[1] || null;
}

export function getNormalizedChannelId(
	videoData: VideoCardData,
): string | null {
	return typeof videoData.channelId === "string" &&
		videoData.channelId.startsWith("UC")
		? videoData.channelId
		: getChannelIdFromPath(videoData.channelPath);
}

export function getContainingVideoCard(node: Node): Element | null {
	if (node.nodeType === Node.ELEMENT_NODE) {
		const element = node as Element;
		return element.matches(VIDEO_CARD_SELECTOR)
			? element
			: element.closest(VIDEO_CARD_SELECTOR);
	}

	return node.parentElement?.closest(VIDEO_CARD_SELECTOR) || null;
}

export function queueVideoCardForReprocessing(
	videoElement: Element | null,
): void {
	if (!videoElement) {
		return;
	}

	videoElement.removeAttribute("data-filter-processed");
	delete (videoElement as HTMLElement).dataset.filterRetryCount;
}

function firstNonEmpty(...values: unknown[]): string | null {
	for (const value of values) {
		const normalized =
			typeof value === "string" ? normalizeText(value) : textFromNode(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

function textFromNode(value: unknown): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return normalizeText(value);
	}

	if (Array.isArray(value)) {
		return normalizeText(
			value
				.map((item) => textFromNode(item))
				.filter(Boolean)
				.join(" "),
		);
	}

	if (typeof value !== "object") {
		return null;
	}

	const node = value as {
		simpleText?: string;
		content?: string;
		text?: string;
		label?: string;
		runs?: unknown[];
	};

	return firstNonEmpty(
		node.simpleText,
		node.content,
		node.text,
		node.label,
		Array.isArray(node.runs)
			? node.runs.map((run) => textFromNode(run)).join(" ")
			: null,
	);
}

function flattenMetadataTexts(metadataRows: unknown): string[] {
	if (!Array.isArray(metadataRows)) {
		return [];
	}

	return metadataRows
		.flatMap((row) => {
			if (row && typeof row === "object" && "metadataParts" in row) {
				return (row as { metadataParts?: unknown[] }).metadataParts || [];
			}
			return [];
		})
		.map((part) => {
			if (part && typeof part === "object" && "text" in part) {
				return textFromNode((part as { text?: unknown }).text);
			}
			return textFromNode(part);
		})
		.filter((part): part is string => Boolean(part));
}

function findMetadataText(
	metadataTexts: string[],
	pattern: RegExp,
): string | null {
	return metadataTexts.find((text) => pattern.test(text)) || null;
}

function normalizeDurationText(value: unknown): string | null {
	const text = textFromNode(value);
	return text && DURATION_TEXT_PATTERN.test(text) ? text : null;
}

function isStreamPublishTime(value: unknown): boolean {
	const text = textFromNode(value);
	return Boolean(text && /^streamed\s+/i.test(text));
}

function isWatchingCount(value: unknown): boolean {
	const text = textFromNode(value);
	return Boolean(text && LIVE_VIEW_COUNT_PATTERN.test(text));
}

function hasLiveMetadata(
	videoData: Pick<ExtractedVideoData, "publishTime" | "viewCount">,
): boolean {
	return (
		isStreamPublishTime(videoData.publishTime) ||
		isWatchingCount(videoData.viewCount)
	);
}

function hasActiveLiveMetadata(
	videoData: Pick<ExtractedVideoData, "viewCount">,
): boolean {
	return isWatchingCount(videoData.viewCount);
}

function updateLiveContentState(
	videoData: Pick<
		ExtractedVideoData,
		"publishTime" | "viewCount" | "isLiveContent" | "isActiveLiveContent"
	>,
): void {
	if (!videoData.isLiveContent && hasLiveMetadata(videoData)) {
		videoData.isLiveContent = true;
	}

	if (!videoData.isActiveLiveContent && hasActiveLiveMetadata(videoData)) {
		videoData.isActiveLiveContent = true;
	}
}

function hasLiveRendererOverlay(value: unknown): boolean {
	if (!Array.isArray(value)) {
		return false;
	}

	return value.some((overlay) => {
		if (!overlay || typeof overlay !== "object") {
			return false;
		}

		const record = overlay as Record<string, unknown>;
		const timeStatus = record.thumbnailOverlayTimeStatusRenderer as
			| Record<string, unknown>
			| undefined;
		const style = typeof timeStatus?.style === "string" ? timeStatus.style : "";

		return (
			style.toUpperCase() === "LIVE" ||
			Boolean(textFromNode(timeStatus?.text)?.match(LIVE_BADGE_PATTERN))
		);
	});
}

function getThumbnailOverlays(
	thumbnailViewModel: Record<string, unknown> | undefined,
): unknown[] {
	return Array.isArray(thumbnailViewModel?.overlays)
		? thumbnailViewModel.overlays
		: [];
}

function getLockupThumbnailOverlays(
	lockupViewModel: Record<string, unknown>,
): unknown[] {
	const contentImage = lockupViewModel.contentImage as
		| Record<string, unknown>
		| undefined;
	const thumbnailViewModel = contentImage?.thumbnailViewModel as
		| Record<string, unknown>
		| undefined;
	return getThumbnailOverlays(thumbnailViewModel);
}

function getChannelInfoFromEndpoint(endpoint: unknown): {
	channelId: string | null;
	channelPath: string | null;
} {
	if (!endpoint || typeof endpoint !== "object") {
		return { channelId: null, channelPath: null };
	}

	const endpointData = endpoint as {
		browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string };
		commandMetadata?: { webCommandMetadata?: { url?: string } };
	};

	const channelPath = normalizeChannelPath(
		endpointData.browseEndpoint?.canonicalBaseUrl ||
			endpointData.commandMetadata?.webCommandMetadata?.url,
	);
	const browseId = endpointData.browseEndpoint?.browseId;
	const channelId =
		typeof browseId === "string" && browseId.startsWith("UC")
			? browseId
			: getChannelIdFromPath(channelPath);

	return {
		channelId: channelId || null,
		channelPath,
	};
}

function getChannelInfoFromRuns(value: unknown): {
	channelId: string | null;
	channelPath: string | null;
} {
	if (
		!value ||
		typeof value !== "object" ||
		!Array.isArray((value as { runs?: unknown[] }).runs)
	) {
		return { channelId: null, channelPath: null };
	}

	for (const run of (value as { runs: unknown[] }).runs) {
		if (run && typeof run === "object" && "navigationEndpoint" in run) {
			const channelInfo = getChannelInfoFromEndpoint(
				(run as { navigationEndpoint?: unknown }).navigationEndpoint,
			);
			if (channelInfo.channelId || channelInfo.channelPath) {
				return channelInfo;
			}
		}
	}

	return { channelId: null, channelPath: null };
}

function extractHomeDuration(lockupViewModel: unknown): string | null {
	if (!lockupViewModel || typeof lockupViewModel !== "object") {
		return null;
	}

	const overlays = getLockupThumbnailOverlays(
		lockupViewModel as Record<string, unknown>,
	);
	for (const overlay of overlays) {
		if (!overlay || typeof overlay !== "object") {
			continue;
		}

		const bottomOverlay =
			(overlay as Record<string, unknown>).thumbnailBottomOverlayViewModel ||
			(overlay as Record<string, unknown>).thumbnailOverlayBadgeViewModel;
		const badges =
			bottomOverlay &&
			typeof bottomOverlay === "object" &&
			"badges" in bottomOverlay &&
			Array.isArray((bottomOverlay as { badges?: unknown[] }).badges)
				? (bottomOverlay as { badges: unknown[] }).badges
				: [];

		for (const badge of badges) {
			if (!badge || typeof badge !== "object") {
				continue;
			}
			const badgeViewModel = (badge as Record<string, unknown>)
				.thumbnailBadgeViewModel;
			const duration = normalizeDurationText(
				badgeViewModel &&
					typeof badgeViewModel === "object" &&
					("text" in badgeViewModel || "label" in badgeViewModel)
					? (badgeViewModel as { text?: unknown; label?: unknown }).text ||
							(badgeViewModel as { label?: unknown }).label
					: null,
			);
			if (duration) {
				return duration;
			}
		}
	}

	return null;
}

function getVideoIdFromElement(element: Element): string | null {
	const explicitVideoId = element
		.querySelector("[data-video-id]")
		?.getAttribute("data-video-id");
	if (explicitVideoId) {
		return explicitVideoId;
	}

	const href = element.querySelector(WATCH_LINK_SELECTOR)?.getAttribute("href");
	if (!href) {
		return null;
	}

	try {
		const url = new URL(href, window.location.origin);
		const watchVideoId = url.searchParams.get("v");
		if (watchVideoId) {
			return watchVideoId;
		}

		const shortsMatch = url.pathname.match(/^\/shorts\/([^/?]+)/);
		return shortsMatch?.[1] || null;
	} catch {
		return null;
	}
}

function getRendererDataCandidates(element: Element): unknown[] {
	return RENDERER_DATA_ACCESSORS.map((getRendererData) =>
		getRendererData(element as RendererElement),
	).filter(Boolean);
}

function isSearchRenderer(rendererData: Record<string, unknown>): boolean {
	return Boolean(
		rendererData.videoId ||
			(rendererData.title &&
				(rendererData.lengthText ||
					rendererData.publishedTimeText ||
					rendererData.viewCountText ||
					rendererData.shortViewCountText ||
					rendererData.ownerText ||
					rendererData.longBylineText)),
	);
}

function extractSearchVideo(
	rendererData: Record<string, unknown>,
): ExtractedVideoData {
	const searchChannelInfo = getChannelInfoFromRuns(
		rendererData.ownerText || rendererData.longBylineText,
	);
	const publishTime = textFromNode(rendererData.publishedTimeText);
	const viewCount = firstNonEmpty(
		textFromNode(rendererData.viewCountText),
		textFromNode(rendererData.shortViewCountText),
	);
	const hasActiveLiveOverlay = hasLiveRendererOverlay(
		rendererData.thumbnailOverlays,
	);

	return {
		videoId:
			typeof rendererData.videoId === "string" ? rendererData.videoId : null,
		title: textFromNode(rendererData.title),
		duration: normalizeDurationText(rendererData.lengthText),
		viewCount,
		publishTime,
		isLiveContent:
			hasLiveMetadata({ publishTime, viewCount }) || hasActiveLiveOverlay,
		isActiveLiveContent:
			hasActiveLiveMetadata({ viewCount }) || hasActiveLiveOverlay,
		channelName: firstNonEmpty(
			textFromNode(rendererData.ownerText),
			textFromNode(rendererData.longBylineText),
		),
		channelId: searchChannelInfo.channelId,
		channelPath: searchChannelInfo.channelPath,
	};
}

function extractLockupVideo(
	lockupViewModel: Record<string, unknown>,
): ExtractedVideoData {
	const metadata = lockupViewModel.metadata as
		| Record<string, unknown>
		| undefined;
	const lockupMetadataViewModel = metadata?.lockupMetadataViewModel as
		| Record<string, unknown>
		| undefined;
	const metadataContainer = lockupMetadataViewModel?.metadata as
		| Record<string, unknown>
		| undefined;
	const contentMetadataViewModel =
		metadataContainer?.contentMetadataViewModel as
			| Record<string, unknown>
			| undefined;
	const metadataRows = contentMetadataViewModel?.metadataRows || [];
	const metadataTexts = flattenMetadataTexts(metadataRows);
	const firstRow = Array.isArray(metadataRows)
		? (metadataRows[0] as {
				metadataParts?: Array<{ text?: { commandRuns?: unknown[] } }>;
			})
		: undefined;
	const uploaderPart = firstRow?.metadataParts?.[0]?.text;
	const commandRuns = Array.isArray(uploaderPart?.commandRuns)
		? uploaderPart.commandRuns
		: [];
	const homeChannelInfo =
		commandRuns.length > 0
			? getChannelInfoFromEndpoint(
					(commandRuns[0] as { onTap?: { innertubeCommand?: unknown } }).onTap
						?.innertubeCommand,
				)
			: { channelId: null, channelPath: null };
	const publishTime = findMetadataText(metadataTexts, PUBLISH_TIME_PATTERN);
	const hasActiveLiveOverlay = hasLiveRendererOverlay(
		getLockupThumbnailOverlays(lockupViewModel),
	);

	return {
		videoId:
			typeof lockupViewModel.contentId === "string"
				? lockupViewModel.contentId
				: null,
		title: textFromNode(lockupMetadataViewModel?.title),
		duration: extractHomeDuration(lockupViewModel),
		viewCount: findMetadataText(metadataTexts, /views?/i),
		publishTime,
		isLiveContent:
			hasLiveMetadata({ publishTime, viewCount: null }) || hasActiveLiveOverlay,
		isActiveLiveContent: hasActiveLiveOverlay,
		channelName: metadataTexts[0] || null,
		channelId: homeChannelInfo.channelId,
		channelPath: homeChannelInfo.channelPath,
	};
}

function extractVideoFromRenderer(
	rendererData: unknown,
): ExtractedVideoData | null {
	if (!rendererData || typeof rendererData !== "object") {
		return null;
	}

	const record = rendererData as Record<string, unknown>;
	if (isSearchRenderer(record)) {
		return extractSearchVideo(record);
	}

	const lockupViewModel =
		(record.content as Record<string, unknown> | undefined)?.lockupViewModel ||
		record.lockupViewModel;
	if (!lockupViewModel || typeof lockupViewModel !== "object") {
		return null;
	}

	return extractLockupVideo(lockupViewModel as Record<string, unknown>);
}

function getFirstMatchingElement(
	root: Element,
	selectors: string[],
): Element | null {
	for (const selector of selectors) {
		const element = root.querySelector(selector);
		if (element) {
			return element;
		}
	}

	return null;
}

function getNormalizedElementText(element: Element | null): string | null {
	return normalizeText(element?.textContent);
}

function getMetadataText(videoElement: Element): string | null {
	const metadataParts: string[] = [];

	for (const selector of METADATA_TEXT_SELECTORS) {
		const text = getNormalizedElementText(videoElement.querySelector(selector));
		if (text) {
			metadataParts.push(text);
		}
	}

	return normalizeText(metadataParts.join(" "));
}

function extractDurationFromElement(videoElement: Element): string | null {
	for (const selector of DURATION_SELECTORS) {
		const text = getNormalizedElementText(videoElement.querySelector(selector));
		if (text && DURATION_TEXT_PATTERN.test(text)) {
			return text;
		}
	}

	const thumbnailLink = videoElement.querySelector(THUMBNAIL_LINK_SELECTOR);
	const thumbnailText = getNormalizedElementText(thumbnailLink);
	return thumbnailText?.match(DURATION_TEXT_PATTERN)?.[0] || null;
}

function extractMatch(text: string | null, pattern: RegExp): string | null {
	if (!text) {
		return null;
	}

	const match = text.match(pattern);
	return match ? normalizeText(match[0]) : null;
}

function fillMetadataFromText(
	videoData: ExtractedVideoData,
	metadataText: string | null,
) {
	if (!videoData.viewCount) {
		videoData.viewCount =
			extractMatch(metadataText, VIEW_COUNT_PATTERN) ||
			extractMatch(metadataText, NO_VIEWS_PATTERN);
	}

	if (!videoData.isLiveContent && isWatchingCount(videoData.viewCount)) {
		videoData.isLiveContent = true;
	}

	if (!videoData.publishTime) {
		videoData.publishTime = extractMatch(metadataText, PUBLISH_TIME_PATTERN);
	}
	updateLiveContentState(videoData);
}

function fillMetadataFromFullText(
	videoData: ExtractedVideoData,
	fullText: string | null,
) {
	if (!fullText) {
		return;
	}

	if (!videoData.viewCount) {
		const viewMatch = fullText.match(VIEW_COUNT_PATTERN);
		if (viewMatch) {
			videoData.viewCount = normalizeText(viewMatch[0]);
		} else {
			const watchingMatch = fullText.match(WATCHING_COUNT_PATTERN);
			if (watchingMatch) {
				videoData.viewCount = normalizeText(watchingMatch[0]);
			} else if (NO_VIEWS_PATTERN.test(fullText)) {
				videoData.viewCount = "No views";
			}
		}
	}

	if (!videoData.publishTime) {
		const timeMatch = fullText.match(PUBLISH_TIME_PATTERN);
		if (timeMatch) {
			videoData.publishTime = normalizeText(timeMatch[0]);
		}
	}
	updateLiveContentState(videoData);
}

function detectActiveLiveContentFromElement(videoElement: Element): boolean {
	for (const element of videoElement.querySelectorAll(
		LIVE_INDICATOR_SELECTOR,
	)) {
		const indicatorText = normalizeText(
			element.getAttribute("aria-label") || element.textContent,
		);
		if (indicatorText && LIVE_BADGE_PATTERN.test(indicatorText)) {
			return true;
		}
	}

	return false;
}

function fillChannelInfoFromLink(
	videoElement: Element,
	videoData: ExtractedVideoData,
) {
	const channelLink = videoElement.querySelector(CHANNEL_LINK_SELECTOR);
	if (!channelLink) {
		return;
	}

	if (!videoData.channelPath) {
		videoData.channelPath = normalizeChannelPath(
			channelLink.getAttribute("href"),
		);
	}
	if (!videoData.channelId) {
		videoData.channelId = getChannelIdFromPath(videoData.channelPath);
	}
	if (!videoData.channelName) {
		videoData.channelName =
			normalizeText(channelLink.textContent) ||
			normalizeText(channelLink.getAttribute("title"));
	}
}

function fillLockupChannelNameFromText(
	videoElement: Element,
	videoData: ExtractedVideoData,
) {
	if (
		videoData.channelName ||
		videoElement.tagName !== "YT-LOCKUP-VIEW-MODEL"
	) {
		return;
	}

	const lines = ((videoElement as HTMLElement).innerText || "")
		.split("\n")
		.map((line) => normalizeText(line))
		.filter((line): line is string => Boolean(line));
	if (lines.length >= 3) {
		videoData.channelName = lines[2];
	}
}

function getStructuredVideoData(
	videoElement: Element,
): ExtractedVideoData | null {
	for (const candidate of getRendererDataCandidates(videoElement)) {
		const structuredData = extractVideoFromRenderer(candidate);
		if (structuredData) {
			return structuredData;
		}
	}

	return null;
}

function needsMetadataFallback(videoData: ExtractedVideoData): boolean {
	return (
		!videoData.viewCount || !videoData.publishTime || !videoData.isLiveContent
	);
}

function needsFullTextFallback(videoData: ExtractedVideoData): boolean {
	return !videoData.viewCount || !videoData.publishTime;
}

function getVideoCardFullText(videoElement: Element): string | null {
	return normalizeText(videoElement.textContent);
}

function detectTextLanguage(text: string | null): TextLanguage {
	if (!text) {
		return "unknown";
	}

	const hanCharacterCount = text.match(HAN_CHARACTER_PATTERN)?.length || 0;
	const latinLetterCount = text.match(LATIN_LETTER_PATTERN)?.length || 0;
	const englishWordCount = text.match(ENGLISH_WORD_PATTERN)?.length || 0;

	if (hanCharacterCount === 0 && latinLetterCount === 0) {
		return "unknown";
	}

	if (hanCharacterCount >= 2) {
		return "zh";
	}

	if (englishWordCount >= 1 || latinLetterCount >= 4) {
		return "en";
	}

	return "unknown";
}

export function extractVideoData(videoElement: Element): VideoCardData {
	const structuredData = getStructuredVideoData(videoElement);

	const data: ExtractedVideoData = {
		title: structuredData?.title || null,
		viewCount: structuredData?.viewCount || null,
		duration: structuredData?.duration || null,
		publishTime: structuredData?.publishTime || null,
		isLiveContent: structuredData?.isLiveContent || false,
		isActiveLiveContent: structuredData?.isActiveLiveContent || false,
		videoId: structuredData?.videoId || null,
		channelName: structuredData?.channelName || null,
		channelId: structuredData?.channelId || null,
		channelPath: structuredData?.channelPath || null,
	};

	try {
		if (!data.videoId) {
			data.videoId = getVideoIdFromElement(videoElement);
		}

		if (!data.title) {
			const titleElement = getFirstMatchingElement(
				videoElement,
				TITLE_SELECTORS,
			);
			data.title =
				normalizeText(titleElement?.textContent) ||
				normalizeText(titleElement?.getAttribute("title")) ||
				normalizeText(titleElement?.getAttribute("aria-label"));
		}

		if (!data.duration) {
			data.duration = extractDurationFromElement(videoElement);
		}

		if (needsMetadataFallback(data)) {
			fillMetadataFromText(data, getMetadataText(videoElement));
		}
		if (needsFullTextFallback(data)) {
			fillMetadataFromFullText(data, getVideoCardFullText(videoElement));
		}
		if (!data.isActiveLiveContent) {
			data.isActiveLiveContent =
				detectActiveLiveContentFromElement(videoElement);
		}
		if (data.isActiveLiveContent) {
			data.isLiveContent = true;
		}
		fillChannelInfoFromLink(videoElement, data);
		fillLockupChannelNameFromText(videoElement, data);
	} catch (error) {
		console.warn("[recommendation-filter] failed to extract video data", error);
	}

	return {
		...data,
		titleLanguage: detectTextLanguage(data.title),
		channelLanguage: detectTextLanguage(data.channelName),
	};
}
