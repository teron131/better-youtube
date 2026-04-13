/**
 * Recommendation filtering runtime for YouTube recommendation surfaces.
 */

import { STORAGE_KEYS } from "@/core/constants";
import {
	type FeedFilterSettings,
	type FilterStats,
	type FilteredVideoRecord,
	type StoredSubscriptions,
	loadFeedFilterSettings,
	getFilterStats,
	DEFAULT_FILTER_STATS,
} from "@/core/recommendationFilters";
import { getStorageValue, setStorageValue } from "@/core/storage";
import {
	extractVideoData,
	getContainingVideoCard,
	getNormalizedChannelId,
	normalizeChannelPath,
	normalizeText,
	queueVideoCardForReprocessing,
	type VideoCardData,
	VIDEO_CARD_NODE_NAMES,
	VIDEO_CARD_SELECTOR,
} from "./recommendationFilterExtractor";

const SUBSCRIPTIONS_PAGE_PATH = "/feed/channels";
const CHANNEL_PAGE_PREFIXES = ["/@", "/channel/", "/c/", "/user/"];
const MAX_METADATA_RETRY_COUNT = 6;
const METADATA_RETRY_DELAY_MS = 2000;
const SETTLING_RESCAN_DELAYS_MS = [1500, 4000, 8000];
const HISTORY_LIMIT = 100;

type TriggeredFilter = {
	shouldFilter: true;
	reason: keyof Omit<FilterStats, "total">;
	details: string;
};

type FilterResult = TriggeredFilter | { shouldFilter: false };

type SubscriptionLookup = {
	ids: Set<string>;
	paths: Set<string>;
	names: Set<string>;
};

function parseViewCount(text: string): number {
	const cleaned = text.replace(/views?/i, "").replace(/,/g, "").trim();
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

function parseVideoAge(text: string): number {
	const match = text.match(/(\d+)\s+year/i);
	return match ? parseInt(match[1], 10) : 0;
}

function createEmptySubscriptionLookup(): SubscriptionLookup {
	return {
		ids: new Set(),
		paths: new Set(),
		names: new Set(),
	};
}

function buildSubscriptionLookup(channels: StoredSubscriptions["channels"] = []) {
	const lookup = createEmptySubscriptionLookup();

	for (const channel of channels) {
		if (!channel) {
			continue;
		}

		const channelId =
			typeof channel.channelId === "string" && channel.channelId.startsWith("UC")
				? channel.channelId
				: normalizeChannelPath(channel.channelPath)?.startsWith("/channel/")
					? normalizeChannelPath(channel.channelPath)?.split("/channel/")[1] || null
					: null;
		const channelPath = normalizeChannelPath(channel.channelPath)?.toLowerCase();
		const channelName = normalizeText(channel.name)?.toLowerCase();

		if (channelId) {
			lookup.ids.add(channelId);
		}
		if (channelPath) {
			lookup.paths.add(channelPath);
		}
		if (channelName) {
			lookup.names.add(channelName);
		}
	}

	return lookup;
}

function isSubscribedChannel(
	videoData: VideoCardData,
	subscribedChannels: SubscriptionLookup,
): boolean {
	const channelId = getNormalizedChannelId(videoData);
	const channelPath = normalizeChannelPath(videoData.channelPath)?.toLowerCase();
	const channelName = normalizeText(videoData.channelName)?.toLowerCase();

	return Boolean(
		(channelId && subscribedChannels.ids.has(channelId)) ||
			(channelPath && subscribedChannels.paths.has(channelPath)) ||
			(channelName && subscribedChannels.names.has(channelName)),
	);
}

function normalizePathname(pathname = location.pathname): string {
	const normalizedPath = pathname.replace(/\/+$/, "");
	return normalizedPath || "/";
}

function isSubscriptionsPage(pathname = location.pathname): boolean {
	return normalizePathname(pathname).startsWith(SUBSCRIPTIONS_PAGE_PATH);
}

function isChannelPage(pathname = location.pathname): boolean {
	const normalizedPath = normalizePathname(pathname);
	return CHANNEL_PAGE_PREFIXES.some((prefix) =>
		normalizedPath.startsWith(prefix),
	);
}

function shouldSkipFilteringForPage(pathname = location.pathname): boolean {
	return isSubscriptionsPage(pathname) || isChannelPage(pathname);
}

function getFilteringSkipReason(pathname = location.pathname): string | null {
	if (isSubscriptionsPage(pathname)) {
		return "subscriptions page";
	}
	if (isChannelPage(pathname)) {
		return "channel page";
	}
	return null;
}

function hasActiveHideFilters(settings: FeedFilterSettings): boolean {
	return Boolean(
		settings.viewsFilterEnabled ||
			settings.durationFilterEnabled ||
			settings.keywordFilterEnabled ||
			settings.ageFilterEnabled ||
			settings.englishOnlyTitles,
	);
}

function markVideoCardProcessed(videoElement: Element): void {
	videoElement.setAttribute("data-filter-processed", "true");
}

function resetProcessedVideoCards(root: ParentNode = document): void {
	const videoCards = root.querySelectorAll?.(VIDEO_CARD_SELECTOR) || [];
	for (const videoElement of videoCards) {
		videoElement.removeAttribute("data-filter-processed");
		videoElement.removeAttribute("data-filtered");
		videoElement.removeAttribute("data-filter-reason");
		videoElement.removeAttribute("data-subscribed-channel");
		delete (videoElement as HTMLElement).dataset.titleLanguage;
		delete (videoElement as HTMLElement).dataset.filterRetryCount;
		(videoElement as HTMLElement).style.display = "";
		(videoElement as HTMLElement).style.opacity = "";
		(videoElement as HTMLElement).style.pointerEvents = "";
	}
}

function showVideoCard(videoElement: Element): void {
	(videoElement as HTMLElement).style.display = "";
	(videoElement as HTMLElement).style.opacity = "";
	(videoElement as HTMLElement).style.pointerEvents = "";
}

function hideVideoCard(videoElement: Element, reason: string): void {
	(videoElement as HTMLElement).style.display = "none";
	videoElement.setAttribute("data-filtered", "true");
	videoElement.setAttribute("data-filter-reason", reason);
}

function applySubscribedChannelState(
	videoElement: Element,
	isSubscribed: boolean,
): void {
	if (isSubscribed) {
		videoElement.setAttribute("data-subscribed-channel", "true");
		return;
	}

	videoElement.removeAttribute("data-subscribed-channel");
}

function applyTitleLanguageState(
	videoElement: Element,
	titleLanguage: VideoCardData["titleLanguage"],
): void {
	if (titleLanguage && titleLanguage !== "unknown") {
		(videoElement as HTMLElement).dataset.titleLanguage = titleLanguage;
		return;
	}

	delete (videoElement as HTMLElement).dataset.titleLanguage;
}

function checkViewsFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	if (!settings.viewsFilterEnabled || settings.minViews <= 0 || !videoData.viewCount) {
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
	if (!settings.ageFilterEnabled || settings.maxAgeYears <= 0 || !videoData.publishTime) {
		return { shouldFilter: false };
	}

	const videoAge = parseVideoAge(videoData.publishTime);
	if (videoAge >= settings.maxAgeYears) {
		return {
			shouldFilter: true,
			reason: "age",
			details: `Too old: ${videoData.publishTime} (${videoAge} years)`,
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

	return { shouldFilter: false };
}

function hasIncompleteMetadata(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): boolean {
	return Boolean(
		(settings.viewsFilterEnabled &&
			settings.minViews > 0 &&
			!videoData.viewCount) ||
			(settings.durationFilterEnabled &&
				(settings.minDuration || settings.maxDuration) &&
				!videoData.duration) ||
			(settings.ageFilterEnabled &&
				settings.maxAgeYears > 0 &&
				!videoData.publishTime) ||
			(settings.keywordFilterEnabled &&
				settings.keywords.length > 0 &&
				!videoData.title) ||
			(settings.englishOnlyTitles && !videoData.title),
	);
}

function getTriggeredFilter(
	videoData: VideoCardData,
	settings: FeedFilterSettings,
): FilterResult {
	return [
		checkViewsFilter(videoData, settings),
		checkDurationFilter(videoData, settings),
		checkAgeFilter(videoData, settings),
		checkLanguageFilter(videoData, settings),
		checkKeywordsFilter(videoData, settings),
	].find((result) => result.shouldFilter) ?? { shouldFilter: false };
}

class FeedFilterController {
	private filterSettings: FeedFilterSettings | null = null;
	private filterStats: FilterStats = { ...DEFAULT_FILTER_STATS };
	private subscribedChannels: SubscriptionLookup = createEmptySubscriptionLookup();
	private metadataRetryTimeout: number | null = null;
	private settlingRescanTimeouts: number[] = [];
	private filterTimeout: number | null = null;
	private scrollTimeout: number | null = null;
	private lastUrl = location.href;
	private lastVideoCount = 0;

	public async start(): Promise<void> {
		await this.loadState();
		resetProcessedVideoCards();

		if (!shouldSkipFilteringForPage()) {
			window.setTimeout(() => {
				void this.runAllFilters(true);
			}, 1000);
			this.scheduleSettlingRescans("initial load");
		}

		this.startContentObserver();
		this.startStorageListener();
		this.startNavigationObserver();
		this.startScrollListener();
	}

	private async loadState(): Promise<void> {
		const [settings, stats, subscriptions] = await Promise.all([
			loadFeedFilterSettings(),
			getFilterStats(),
			getStorageValue<StoredSubscriptions>(STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS),
		]);

		this.filterSettings = settings;
		this.filterStats = stats;
		this.subscribedChannels = buildSubscriptionLookup(subscriptions?.channels);
	}

	private clearSettlingRescans(): void {
		for (const timeoutId of this.settlingRescanTimeouts) {
			window.clearTimeout(timeoutId);
		}
		this.settlingRescanTimeouts = [];
	}

	private scheduleSettlingRescans(reason: string): void {
		if (shouldSkipFilteringForPage()) {
			return;
		}

		this.clearSettlingRescans();
		for (const delayMs of SETTLING_RESCAN_DELAYS_MS) {
			const timeoutId = window.setTimeout(() => {
				console.log(
					`[recommendation-filter] running settling rescan after ${delayMs}ms (${reason})`,
				);
				void this.runAllFilters(true);
			}, delayMs);
			this.settlingRescanTimeouts.push(timeoutId);
		}
	}

	private async appendFilteredVideos(
		entries: Array<Pick<FilteredVideoRecord, "title" | "reason">>,
	): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const existing =
			(await getStorageValue<FilteredVideoRecord[]>(STORAGE_KEYS.FILTERED_VIDEOS)) ||
			[];
		const timestamp = new Date().toISOString();
		const nextVideos = [
			...existing,
			...entries.map((entry) => ({ ...entry, timestamp })),
		].slice(-HISTORY_LIMIT);

		await setStorageValue(STORAGE_KEYS.FILTERED_VIDEOS, nextVideos);
	}

	private async persistStats(currentStats: FilterStats): Promise<void> {
		this.filterStats = {
			views: this.filterStats.views + currentStats.views,
			keywords: this.filterStats.keywords + currentStats.keywords,
			duration: this.filterStats.duration + currentStats.duration,
			age: this.filterStats.age + currentStats.age,
			language: this.filterStats.language + currentStats.language,
			total: this.filterStats.total + currentStats.total,
		};

		await setStorageValue(STORAGE_KEYS.FILTER_STATS, this.filterStats);
	}

	private async runAllFilters(forceFullScan = false): Promise<void> {
		if (!this.filterSettings) {
			return;
		}

		const skipReason = getFilteringSkipReason();
		if (skipReason) {
			if (this.metadataRetryTimeout) {
				window.clearTimeout(this.metadataRetryTimeout);
				this.metadataRetryTimeout = null;
			}
			this.clearSettlingRescans();
			resetProcessedVideoCards();
			console.log(`[recommendation-filter] skipping filters on ${skipReason}`);
			return;
		}

		if (!hasActiveHideFilters(this.filterSettings)) {
			resetProcessedVideoCards();
			return;
		}

		const currentStats: FilterStats = { ...DEFAULT_FILTER_STATS };
		const filteredEntries: Array<Pick<FilteredVideoRecord, "title" | "reason">> = [];
		let incompleteCards = 0;

		const videoCards = Array.from(document.querySelectorAll(VIDEO_CARD_SELECTOR));
		const targetCards = videoCards.filter(
			(videoElement) =>
				forceFullScan || !videoElement.hasAttribute("data-filter-processed"),
		);

		for (const videoElement of targetCards) {
			const wasFiltered = videoElement.hasAttribute("data-filtered");
			const videoData = extractVideoData(videoElement);
			const title = videoData.title || "Unknown title";
			const isSubscribed = isSubscribedChannel(videoData, this.subscribedChannels);

			applySubscribedChannelState(videoElement, isSubscribed);
			applyTitleLanguageState(videoElement, videoData.titleLanguage);

			const triggeredFilter = getTriggeredFilter(videoData, this.filterSettings);
			const shouldPreserveSubscribedVideo =
				isSubscribed && this.filterSettings.preserveSubscribedChannels;
			const retryCount = Number(
				(videoElement as HTMLElement).dataset.filterRetryCount || 0,
			);
			const shouldRetryForMetadata =
				!triggeredFilter.shouldFilter &&
				hasIncompleteMetadata(videoData, this.filterSettings) &&
				retryCount < MAX_METADATA_RETRY_COUNT;

			if (shouldRetryForMetadata) {
				(videoElement as HTMLElement).dataset.filterRetryCount = String(
					retryCount + 1,
				);
				showVideoCard(videoElement);
				incompleteCards += 1;
				continue;
			}

			delete (videoElement as HTMLElement).dataset.filterRetryCount;

			if (triggeredFilter.shouldFilter && !shouldPreserveSubscribedVideo) {
				hideVideoCard(videoElement, triggeredFilter.reason);
				markVideoCardProcessed(videoElement);
				currentStats[triggeredFilter.reason] += 1;
				currentStats.total += 1;
				filteredEntries.push({ title, reason: triggeredFilter.details });
				continue;
			}

			if (wasFiltered) {
				videoElement.removeAttribute("data-filtered");
				videoElement.removeAttribute("data-filter-reason");
			}

			showVideoCard(videoElement);
			markVideoCardProcessed(videoElement);
		}

		if (currentStats.total > 0) {
			await Promise.all([
				this.persistStats(currentStats),
				this.appendFilteredVideos(filteredEntries),
			]);
		}

		if (incompleteCards > 0) {
			if (this.metadataRetryTimeout) {
				window.clearTimeout(this.metadataRetryTimeout);
			}
			this.metadataRetryTimeout = window.setTimeout(() => {
				void this.runAllFilters();
			}, METADATA_RETRY_DELAY_MS);
		}
	}

	private startContentObserver(): void {
		const contentRoot = document.querySelector("ytd-app") || document.body;
		if (!contentRoot) {
			return;
		}

		const observer = new MutationObserver((mutations) => {
			const hasNewContent = mutations.some((mutation) => {
				if (mutation.type === "characterData") {
					const videoCard = getContainingVideoCard(mutation.target);
					if (videoCard) {
						queueVideoCardForReprocessing(videoCard);
						return true;
					}
					return false;
				}

				Array.from(mutation.addedNodes).forEach((node) => {
					if (node.nodeType !== Node.ELEMENT_NODE) {
						return;
					}

					const element = node as Element;
					if (element.matches(VIDEO_CARD_SELECTOR)) {
						queueVideoCardForReprocessing(element);
						return;
					}

					element
						.querySelectorAll(VIDEO_CARD_SELECTOR)
						.forEach((videoCard) => {
							queueVideoCardForReprocessing(videoCard);
						});
				});

				return Array.from(mutation.addedNodes).some((node) => {
					if (node.nodeType !== Node.ELEMENT_NODE) {
						return false;
					}

					const element = node as Element;
					return (
						VIDEO_CARD_NODE_NAMES.has(node.nodeName) ||
						Boolean(element.querySelector?.(VIDEO_CARD_SELECTOR))
					);
				});
			});

			if (!hasNewContent) {
				return;
			}

			if (this.filterTimeout) {
				window.clearTimeout(this.filterTimeout);
			}

			this.filterTimeout = window.setTimeout(() => {
				void this.runAllFilters();
				this.scheduleSettlingRescans("content update");
			}, 800);
		});

		observer.observe(contentRoot, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}

	private startStorageListener(): void {
		chrome.storage.onChanged.addListener((changes, areaName) => {
			if (areaName !== "local") {
				return;
			}

			if (changes[STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS]) {
				this.subscribedChannels = buildSubscriptionLookup(
					changes[STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS].newValue?.channels,
				);
				resetProcessedVideoCards();
				void this.runAllFilters(true);
				this.scheduleSettlingRescans("subscription update");
				return;
			}

			const changedKeys = Object.keys(changes);
			const filterKeys = new Set<string>(
				Object.values({
					viewsFilterEnabled: STORAGE_KEYS.VIEWS_FILTER_ENABLED,
					durationFilterEnabled: STORAGE_KEYS.DURATION_FILTER_ENABLED,
					keywordFilterEnabled: STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
					ageFilterEnabled: STORAGE_KEYS.AGE_FILTER_ENABLED,
					englishOnlyTitles: STORAGE_KEYS.ENGLISH_ONLY_TITLES,
					preserveSubscribedChannels:
						STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS,
					minViews: STORAGE_KEYS.MIN_VIEWS,
					minDuration: STORAGE_KEYS.MIN_DURATION,
					maxDuration: STORAGE_KEYS.MAX_DURATION,
					maxAgeYears: STORAGE_KEYS.MAX_AGE_YEARS,
					keywords: STORAGE_KEYS.FILTER_KEYWORDS,
				}),
			);

			if (!changedKeys.some((key) => filterKeys.has(key))) {
				return;
			}

			void loadFeedFilterSettings().then((settings) => {
				this.filterSettings = settings;
				resetProcessedVideoCards();
				void this.runAllFilters(true);
				this.scheduleSettlingRescans("settings change");
			});
		});
	}

	private startNavigationObserver(): void {
		const navigationObserverTarget =
			document.querySelector("title") || document.head || document.documentElement;
		if (!navigationObserverTarget) {
			return;
		}

		new MutationObserver(() => {
			const currentUrl = location.href;
			if (currentUrl === this.lastUrl) {
				return;
			}

			this.lastUrl = currentUrl;
			resetProcessedVideoCards();
			this.clearSettlingRescans();
			window.setTimeout(() => {
				void this.runAllFilters(true);
			}, 1500);
			this.scheduleSettlingRescans("navigation");
		}).observe(navigationObserverTarget, {
			subtree: true,
			characterData: true,
			childList: true,
		});
	}

	private startScrollListener(): void {
		window.addEventListener(
			"scroll",
			() => {
				if (this.scrollTimeout) {
					window.clearTimeout(this.scrollTimeout);
				}

				this.scrollTimeout = window.setTimeout(() => {
					const currentVideoCount =
						document.querySelectorAll(VIDEO_CARD_SELECTOR).length;

					if (currentVideoCount > this.lastVideoCount) {
						this.lastVideoCount = currentVideoCount;
						void this.runAllFilters();
						this.scheduleSettlingRescans("scroll growth");
					}
				}, 1000);
			},
			{ passive: true },
		);
	}
}

export function startRecommendationFiltering(): void {
	const controller = new FeedFilterController();
	void controller.start();
}
