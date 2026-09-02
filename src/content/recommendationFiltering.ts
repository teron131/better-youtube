/**
 * Recommendation filtering runtime for YouTube recommendation surfaces.
 */

import { STORAGE_KEYS } from "@/core/constants";
import {
  FEED_FILTER_STORAGE_KEYS,
  type FeedFilterSettings,
  type FilteredVideoRecord,
  hasActiveHideFilters,
  loadFeedFilterSettings,
  type StoredSubscriptions,
} from "@/core/recommendationFilters";
import { getSessionStorageValue, getStorageValue, setSessionStorageValue } from "@/core/storage";

import {
  extractVideoData,
  getContainingVideoCard,
  getNormalizedChannelId,
  normalizeChannelPath,
  normalizeText,
  queueVideoCardForReprocessing,
  VIDEO_CARD_SELECTOR,
  type VideoCardData,
} from "./recommendationFilterExtractor";
import {
  type FilterReason,
  getTriggeredFilter,
  hasIncompleteMetadata,
} from "./recommendationFilterPolicy";

const SUBSCRIPTIONS_PAGE_PATH = "/feed/channels";
const HISTORY_PAGE_PATH = "/feed/history";
const CHANNEL_PAGE_PREFIXES = ["/@", "/channel/", "/c/", "/user/"];
const MAX_METADATA_RETRY_COUNT = 6;
const METADATA_RETRY_DELAY_MS = 2000;
const SETTLING_RESCAN_DELAYS_MS = [1500, 4000, 8000];
const HISTORY_LIMIT = 100;
const VIDEO_CARD_METADATA_ATTRIBUTES = ["aria-label", "data-video-id", "href", "title"];
const RECOMMENDATION_SECTION_SELECTOR = "ytd-rich-section-renderer";
const FILTERED_RECOMMENDATION_SECTION_SELECTOR = `${RECOMMENDATION_SECTION_SELECTOR}[data-filtered-section]`;
const FEED_FILTER_STORAGE_KEY_SET = new Set<string>(Object.values(FEED_FILTER_STORAGE_KEYS));

type SubscriptionLookup = {
  ids: Set<string>;
  paths: Set<string>;
  names: Set<string>;
};

type FilterRecordEntry = {
  key: string;
  title: string;
  reason: string;
};

function isExtensionContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

function logFilteringError(action: string, error: unknown): void {
  if (isExtensionContextInvalidatedError(error)) {
    console.debug(`[recommendation-filter] skipped ${action} after context invalidation`);
    return;
  }

  console.error(`[recommendation-filter] ${action} failed`, error);
}

function createEmptySubscriptionLookup(): SubscriptionLookup {
  return {
    ids: new Set(),
    paths: new Set(),
    names: new Set(),
  };
}

function buildFilterRecordKey(videoData: VideoCardData, filterReason: FilterReason): string | null {
  if (videoData.videoId) {
    return `${filterReason}:video:${videoData.videoId}`;
  }

  const titlePart = normalizeText(videoData.title)?.toLowerCase();
  const channelPart =
    normalizeChannelPath(videoData.channelPath)?.toLowerCase() ||
    normalizeText(videoData.channelName)?.toLowerCase();
  const publishTimePart = normalizeText(videoData.publishTime)?.toLowerCase();

  if (!titlePart && !channelPart) {
    return null;
  }

  return [
    filterReason,
    "meta",
    titlePart || "unknown-title",
    channelPart || "unknown-channel",
    publishTimePart || "unknown-time",
  ].join(":");
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

function isHistoryPage(pathname = location.pathname): boolean {
  return normalizePathname(pathname).startsWith(HISTORY_PAGE_PATH);
}

function isChannelPage(pathname = location.pathname): boolean {
  const normalizedPath = normalizePathname(pathname);
  return CHANNEL_PAGE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

function shouldSkipFilteringForPage(pathname = location.pathname): boolean {
  return isSubscriptionsPage(pathname) || isHistoryPage(pathname) || isChannelPage(pathname);
}

function getFilteringSkipReason(pathname = location.pathname): string | null {
  if (isSubscriptionsPage(pathname)) {
    return "subscriptions page";
  }
  if (isHistoryPage(pathname)) {
    return "history page";
  }
  if (isChannelPage(pathname)) {
    return "channel page";
  }
  return null;
}

function markVideoCardProcessed(videoElement: Element): void {
  videoElement.setAttribute("data-filter-processed", "true");
}

function setRecommendationSectionCollapsed(sectionElement: Element, isCollapsed: boolean): void {
  (sectionElement as HTMLElement).style.display = isCollapsed ? "none" : "";
  if (isCollapsed) {
    sectionElement.setAttribute("data-filtered-section", "true");
    sectionElement.setAttribute("data-filter-reason", "section");
    return;
  }

  sectionElement.removeAttribute("data-filtered-section");
  sectionElement.removeAttribute("data-filter-reason");
}

function resetProcessedVideoCards(root: ParentNode = document): void {
  const videoCards = root.querySelectorAll(VIDEO_CARD_SELECTOR);
  for (const videoElement of videoCards) {
    videoElement.removeAttribute("data-filter-processed");
    videoElement.removeAttribute("data-filtered");
    videoElement.removeAttribute("data-filter-reason");
    videoElement.removeAttribute("data-subscribed-channel");
    delete (videoElement as HTMLElement).dataset.titleLanguage;
    delete (videoElement as HTMLElement).dataset.channelLanguage;
    delete (videoElement as HTMLElement).dataset.filterRetryCount;
    (videoElement as HTMLElement).style.display = "";
    (videoElement as HTMLElement).style.opacity = "";
    (videoElement as HTMLElement).style.pointerEvents = "";
  }

  const filteredSections = root.querySelectorAll(FILTERED_RECOMMENDATION_SECTION_SELECTOR);
  for (const sectionElement of filteredSections) {
    setRecommendationSectionCollapsed(sectionElement, false);
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

function isYouTubePremiumPromoSection(sectionElement: Element): boolean {
  const sectionText = normalizeText(sectionElement.textContent)?.toLowerCase();
  return Boolean(
    sectionText?.includes("youtube featured") &&
    (sectionText.includes("youtube premium") || sectionText.includes("try 1 month")),
  );
}

function updateRecommendationSectionVisibility(root: ParentNode = document): void {
  const sectionElements = root.querySelectorAll(RECOMMENDATION_SECTION_SELECTOR);

  for (const sectionElement of sectionElements) {
    const videoCards = Array.from(sectionElement.querySelectorAll(VIDEO_CARD_SELECTOR));
    const allVideoCardsFiltered =
      videoCards.length > 0 &&
      videoCards.every((videoElement) => videoElement.hasAttribute("data-filtered"));
    setRecommendationSectionCollapsed(
      sectionElement,
      isYouTubePremiumPromoSection(sectionElement) || allVideoCardsFiltered,
    );
  }
}

function applySubscribedChannelState(videoElement: Element, isSubscribed: boolean): void {
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

function applyChannelLanguageState(
  videoElement: Element,
  channelLanguage: VideoCardData["channelLanguage"],
): void {
  if (channelLanguage && channelLanguage !== "unknown") {
    (videoElement as HTMLElement).dataset.channelLanguage = channelLanguage;
    return;
  }

  delete (videoElement as HTMLElement).dataset.channelLanguage;
}

class FeedFilterController {
  private filterSettings: FeedFilterSettings | null = null;
  private subscribedChannels: SubscriptionLookup = createEmptySubscriptionLookup();
  private recordedFilterKeys = new Set<string>();
  private pendingVideoCards = new Set<Element>();
  private metadataRetryVideoCards = new Set<Element>();
  private metadataRetryTimeout: number | null = null;
  private settlingRescanTimeouts: number[] = [];
  private filterTimeout: number | null = null;
  private lastUrl = location.href;
  private contentObserver: MutationObserver | null = null;

  public async start(): Promise<void> {
    await this.loadState();
    resetProcessedVideoCards();

    if (!shouldSkipFilteringForPage()) {
      window.setTimeout(() => {
        this.runAllFiltersSafely(true, "initial load");
      }, 1000);
      this.scheduleSettlingRescans("initial load");
    }

    this.updateContentObserver();
    this.startStorageListener();
    this.startNavigationObserver();
  }

  private async loadState(): Promise<void> {
    const [settings, subscriptions, recordedFilterKeys, filteredVideos] = await Promise.all([
      loadFeedFilterSettings(),
      getStorageValue<StoredSubscriptions>(STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS),
      getSessionStorageValue<string[]>(STORAGE_KEYS.FILTERED_VIDEO_KEYS),
      getSessionStorageValue<FilteredVideoRecord[]>(STORAGE_KEYS.FILTERED_VIDEOS),
    ]);

    this.filterSettings = settings;
    this.subscribedChannels = buildSubscriptionLookup(subscriptions?.channels);
    this.recordedFilterKeys = new Set([
      ...(recordedFilterKeys || []),
      ...(filteredVideos || [])
        .map((entry) => entry.key)
        .filter((key): key is string => Boolean(key)),
    ]);
  }

  private clearSettlingRescans(): void {
    for (const timeoutId of this.settlingRescanTimeouts) {
      window.clearTimeout(timeoutId);
    }
    this.settlingRescanTimeouts = [];
  }

  private clearQueuedCardFiltering(): void {
    if (this.filterTimeout !== null) {
      window.clearTimeout(this.filterTimeout);
      this.filterTimeout = null;
    }
  }

  private clearMetadataRetryTimeout(): void {
    if (this.metadataRetryTimeout !== null) {
      window.clearTimeout(this.metadataRetryTimeout);
      this.metadataRetryTimeout = null;
    }
  }

  private clearMetadataRetryState(): void {
    this.clearMetadataRetryTimeout();
    this.metadataRetryVideoCards.clear();
  }

  private shouldObserveContent(): boolean {
    return Boolean(
      this.filterSettings &&
      hasActiveHideFilters(this.filterSettings) &&
      !shouldSkipFilteringForPage(),
    );
  }

  private updateContentObserver(): void {
    if (!this.shouldObserveContent()) {
      this.contentObserver?.disconnect();
      this.contentObserver = null;
      return;
    }

    if (this.contentObserver) {
      return;
    }

    const contentRoot = document.querySelector("ytd-app") || document.body;
    if (!contentRoot) {
      return;
    }

    this.contentObserver = new MutationObserver((mutations) => {
      let queuedAny = false;
      for (const mutation of mutations) {
        queuedAny = this.queueVideoCardsFromMutation(mutation) || queuedAny;
      }

      if (!queuedAny) {
        return;
      }

      this.scheduleQueuedCardFiltering("content update");
    });

    this.contentObserver.observe(contentRoot, {
      attributes: true,
      attributeFilter: VIDEO_CARD_METADATA_ATTRIBUTES,
      childList: true,
      characterData: true,
      subtree: true,
    });
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
        this.runAllFiltersSafely(true, `settling rescan (${reason})`);
      }, delayMs);
      this.settlingRescanTimeouts.push(timeoutId);
    }
  }

  private runAllFiltersSafely(
    forceFullScan = false,
    action = "filter run",
    videoCards?: Element[],
  ): void {
    void this.runAllFilters(forceFullScan, videoCards).catch((error) => {
      logFilteringError(action, error);
    });
  }

  private async appendFilteredVideos(entries: FilterRecordEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const existing =
      (await getSessionStorageValue<FilteredVideoRecord[]>(STORAGE_KEYS.FILTERED_VIDEOS)) || [];
    const timestamp = new Date().toISOString();
    const nextVideos = [...existing, ...entries.map((entry) => ({ ...entry, timestamp }))];
    const dedupedVideos = Array.from(
      new Map(
        nextVideos.map((entry) => [entry.key || `${entry.title}:${entry.reason}`, entry]),
      ).values(),
    ).slice(-HISTORY_LIMIT);

    await setSessionStorageValue(STORAGE_KEYS.FILTERED_VIDEOS, dedupedVideos);
  }

  private async persistRecordedFilterKeys(): Promise<void> {
    await setSessionStorageValue(
      STORAGE_KEYS.FILTERED_VIDEO_KEYS,
      Array.from(this.recordedFilterKeys),
    );
  }

  private getTargetVideoCards(forceFullScan = false, videoCards?: Element[]): Element[] {
    const sourceCards =
      videoCards && videoCards.length > 0
        ? Array.from(new Set(videoCards))
        : Array.from(document.querySelectorAll(VIDEO_CARD_SELECTOR));

    return sourceCards.filter(
      (videoElement) =>
        videoElement.isConnected &&
        (forceFullScan || !videoElement.hasAttribute("data-filter-processed")),
    );
  }

  private async runAllFilters(forceFullScan = false, videoCards?: Element[]): Promise<void> {
    if (!this.filterSettings) {
      return;
    }

    this.updateContentObserver();

    const skipReason = getFilteringSkipReason();
    if (skipReason) {
      this.clearMetadataRetryState();
      this.clearQueuedCardFiltering();
      this.pendingVideoCards.clear();
      this.clearSettlingRescans();
      resetProcessedVideoCards();
      console.log(`[recommendation-filter] skipping filters on ${skipReason}`);
      return;
    }

    if (!hasActiveHideFilters(this.filterSettings)) {
      this.clearMetadataRetryState();
      this.clearQueuedCardFiltering();
      this.pendingVideoCards.clear();
      resetProcessedVideoCards();
      return;
    }

    const filteredEntries: FilterRecordEntry[] = [];
    const nextMetadataRetryVideoCards = new Set(
      Array.from(this.metadataRetryVideoCards).filter((videoElement) => videoElement.isConnected),
    );
    const targetCards = this.getTargetVideoCards(forceFullScan, videoCards);

    for (const videoElement of targetCards) {
      const wasFiltered = videoElement.hasAttribute("data-filtered");
      const videoData = extractVideoData(videoElement);
      const title = videoData.title || "Unknown title";
      const isSubscribed = isSubscribedChannel(videoData, this.subscribedChannels);

      applySubscribedChannelState(videoElement, isSubscribed);
      applyTitleLanguageState(videoElement, videoData.titleLanguage);
      applyChannelLanguageState(videoElement, videoData.channelLanguage);

      const triggeredFilter = getTriggeredFilter(videoData, this.filterSettings);
      const shouldPreserveSubscribedVideo =
        isSubscribed && this.filterSettings.preserveSubscribedChannels;
      const retryCount = Number((videoElement as HTMLElement).dataset.filterRetryCount || 0);
      const shouldRetryForMetadata =
        !triggeredFilter.shouldFilter &&
        hasIncompleteMetadata(videoData, this.filterSettings) &&
        retryCount < MAX_METADATA_RETRY_COUNT;

      if (shouldRetryForMetadata) {
        (videoElement as HTMLElement).dataset.filterRetryCount = String(retryCount + 1);
        showVideoCard(videoElement);
        nextMetadataRetryVideoCards.add(videoElement);
        continue;
      }

      delete (videoElement as HTMLElement).dataset.filterRetryCount;
      nextMetadataRetryVideoCards.delete(videoElement);

      if (triggeredFilter.shouldFilter && !shouldPreserveSubscribedVideo) {
        const filterRecordKey = buildFilterRecordKey(videoData, triggeredFilter.reason);
        const shouldRecordFilter =
          (filterRecordKey && !this.recordedFilterKeys.has(filterRecordKey)) ||
          (!filterRecordKey && !wasFiltered);

        hideVideoCard(videoElement, triggeredFilter.reason);
        markVideoCardProcessed(videoElement);
        if (shouldRecordFilter) {
          if (filterRecordKey) {
            this.recordedFilterKeys.add(filterRecordKey);
            filteredEntries.push({
              key: filterRecordKey,
              title,
              reason: triggeredFilter.details,
            });
          } else {
            filteredEntries.push({
              key: `${triggeredFilter.reason}:fallback:${title}`,
              title,
              reason: triggeredFilter.details,
            });
          }
        }
        continue;
      }

      if (wasFiltered) {
        videoElement.removeAttribute("data-filtered");
        videoElement.removeAttribute("data-filter-reason");
      }

      showVideoCard(videoElement);
      markVideoCardProcessed(videoElement);
    }

    if (filteredEntries.length > 0) {
      await Promise.all([
        this.appendFilteredVideos(filteredEntries),
        this.persistRecordedFilterKeys(),
      ]);
    }

    updateRecommendationSectionVisibility();

    this.metadataRetryVideoCards = nextMetadataRetryVideoCards;
    this.clearMetadataRetryTimeout();

    if (this.metadataRetryVideoCards.size > 0) {
      this.metadataRetryTimeout = window.setTimeout(() => {
        this.metadataRetryTimeout = null;
        const retryVideoCards = Array.from(this.metadataRetryVideoCards).filter(
          (videoElement) => videoElement.isConnected,
        );
        this.metadataRetryVideoCards.clear();
        if (retryVideoCards.length === 0) {
          return;
        }
        this.runAllFiltersSafely(false, "metadata retry", retryVideoCards);
      }, METADATA_RETRY_DELAY_MS);
    }
  }

  private queueVideoCard(videoElement: Element): void {
    queueVideoCardForReprocessing(videoElement);
    this.pendingVideoCards.add(videoElement);
  }

  private queueVideoCardsFromNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as Element;
    let queuedAny = false;

    if (element.matches(VIDEO_CARD_SELECTOR)) {
      this.queueVideoCard(element);
      queuedAny = true;
    }

    if (element.childElementCount === 0) {
      return queuedAny;
    }

    for (const videoCard of element.querySelectorAll(VIDEO_CARD_SELECTOR)) {
      this.queueVideoCard(videoCard);
      queuedAny = true;
    }

    return queuedAny;
  }

  private queueVideoCardsFromMutation(mutation: MutationRecord): boolean {
    let queuedAny = false;

    for (const node of mutation.addedNodes) {
      queuedAny = this.queueVideoCardsFromNode(node) || queuedAny;
    }

    if (mutation.type === "attributes" || mutation.type === "characterData") {
      const videoCard = getContainingVideoCard(mutation.target);
      if (videoCard) {
        this.queueVideoCard(videoCard);
        queuedAny = true;
      }
    }

    return queuedAny;
  }

  private scheduleQueuedCardFiltering(action: string): void {
    if (this.filterTimeout) {
      window.clearTimeout(this.filterTimeout);
    }

    this.filterTimeout = window.setTimeout(() => {
      this.filterTimeout = null;
      const pendingVideoCards = Array.from(this.pendingVideoCards);
      this.pendingVideoCards.clear();

      if (pendingVideoCards.length === 0) {
        return;
      }

      this.runAllFiltersSafely(false, action, pendingVideoCards);
    }, 800);
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
        this.clearQueuedCardFiltering();
        this.pendingVideoCards.clear();
        this.clearMetadataRetryState();
        resetProcessedVideoCards();
        this.updateContentObserver();
        this.runAllFiltersSafely(true, "subscription update");
        this.scheduleSettlingRescans("subscription update");
        return;
      }

      const changedKeys = Object.keys(changes);
      if (!changedKeys.some((key) => FEED_FILTER_STORAGE_KEY_SET.has(key))) {
        return;
      }

      void loadFeedFilterSettings()
        .then((settings) => {
          this.filterSettings = settings;
          this.clearQueuedCardFiltering();
          this.pendingVideoCards.clear();
          this.clearMetadataRetryState();
          resetProcessedVideoCards();
          this.updateContentObserver();
          this.runAllFiltersSafely(true, "settings change");
          this.scheduleSettlingRescans("settings change");
        })
        .catch((error) => {
          logFilteringError("settings reload", error);
        });
    });
  }

  private startNavigationObserver(): void {
    const handleNavigation = () => {
      const currentUrl = location.href;
      if (currentUrl === this.lastUrl) {
        return;
      }

      this.lastUrl = currentUrl;
      this.clearQueuedCardFiltering();
      this.pendingVideoCards.clear();
      this.clearMetadataRetryState();
      resetProcessedVideoCards();
      this.clearSettlingRescans();
      this.updateContentObserver();
      window.setTimeout(() => {
        this.runAllFiltersSafely(true, "navigation");
      }, 1500);
      this.scheduleSettlingRescans("navigation");
    };

    document.addEventListener("yt-navigate-finish", handleNavigation);
    document.addEventListener("yt-page-data-updated", handleNavigation);
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("hashchange", handleNavigation);
  }
}

let activeFeedFilterController: FeedFilterController | null = null;

export function startRecommendationFiltering(): void {
  if (activeFeedFilterController) {
    return;
  }

  activeFeedFilterController = new FeedFilterController();
  void activeFeedFilterController.start().catch((error) => {
    logFilteringError("startup", error);
  });
}
