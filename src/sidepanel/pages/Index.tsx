/**
 * Main page component orchestrating the video processing workflow.
 */

import { ErrorDisplay } from "@ui/components/ErrorDisplay";
import { HeroSection } from "@ui/components/HeroSection";
import { ProcessingStatus } from "@ui/components/ProcessingStatus";
import { SummaryPanel } from "@ui/components/SummaryPanel";
import { TranscriptPanel } from "@ui/components/TranscriptPanel";
import { Button } from "@ui/components/ui/button";
import { VideoInfo } from "@ui/components/VideoInfo";
import { useToast } from "@ui/hooks/use-toast";
import {
	useVideoProcessing,
	type VideoProcessingOptions,
	type VideoProcessingState,
} from "@ui/hooks/use-video-processing";
import { loadExampleData } from "@ui/lib/example-data-loader";
import { getVideoIdFromCurrentTab } from "@ui/lib/video-utils";
import { handleApiError } from "@ui/services/api";
import {
	getRecommendationFilterSettings,
	setRecommendationFilterSetting,
} from "@ui/services/recommendationFilters";
import { triggerCaptionGeneration } from "@ui/services/streaming";
import { Captions, ListFilter, Settings as SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/core/constants";
import type { FeedFilterSettings } from "@/core/recommendationFilters";
import {
	getStorageValue,
	getSubtitles,
	getSubtitlesStorageKey,
	getSummary,
	getSummaryStorageKey,
	getVideoMetadata,
	getVideoMetadataStorageKey,
	setStorageValue,
} from "@/core/storage";
import type { QualityData } from "@/core/types";
import { extractVideoId } from "@/core/utils/url";
import { SIDEPANEL_ROUTE_HREFS } from "../lib/routes";

function segmentsToTranscript(
	segments?: Array<{ text: string }> | null,
): string | null {
	if (!segments?.length) return null;
	return segments.map((segment) => segment.text).join(" ");
}

type CachedVideoState = Partial<VideoProcessingState>;

function resolveSummaryProvider(
	modelUsed?: string,
): "gemini" | "llm" | undefined {
	if (modelUsed?.startsWith("gemini::")) return "gemini";
	if (modelUsed?.startsWith("llm::")) return "llm";
	return undefined;
}

const EMPTY_VIDEO_STATE: CachedVideoState = {
	summaryResult: null,
	scrapedVideoInfo: null,
	scrapedTranscript: null,
	currentStage: "",
	currentStep: 0,
	progressStates: [],
	isLoading: false,
	error: null,
};

function createTranscriptOnlyState(
	transcript: string | null,
	videoInfo: VideoProcessingState["scrapedVideoInfo"] = null,
): CachedVideoState {
	return {
		...EMPTY_VIDEO_STATE,
		scrapedVideoInfo: videoInfo,
		scrapedTranscript: transcript,
		currentStage: transcript
			? "Loaded cached transcript"
			: videoInfo
				? "Loaded cached video info"
				: "",
	};
}

async function loadCachedVideoState(
	videoId: string,
): Promise<CachedVideoState | null> {
	const [storedSummary, storedVideoInfo, storedSubtitles] = await Promise.all([
		getSummary(videoId),
		getVideoMetadata(videoId),
		getSubtitles(videoId),
	]);

	const transcript = segmentsToTranscript(storedSubtitles);
	if (!storedSummary && !storedVideoInfo && !transcript) {
		return null;
	}

	if (!storedSummary) {
		return createTranscriptOnlyState(transcript, storedVideoInfo ?? null);
	}

	return {
		summaryResult: {
			success: true,
			summary: storedSummary.summary,
			quality: (storedSummary.quality as unknown as QualityData) ?? undefined,
			videoInfo: storedVideoInfo ?? undefined,
			transcript: transcript ?? undefined,
			provider: resolveSummaryProvider(storedSummary.modelUsed),
			totalTime: "cached",
			iterations: 0,
			chunksProcessed: 0,
		},
		scrapedVideoInfo: storedVideoInfo ?? null,
		scrapedTranscript: transcript ?? null,
		currentStage: "Loaded cached summary",
		currentStep: 4,
		progressStates: [],
		isLoading: false,
		error: null,
	};
}

function getTrackedStorageKeys(videoId: string): Set<string> {
	return new Set([
		getSubtitlesStorageKey(videoId),
		getVideoMetadataStorageKey(videoId),
		getSummaryStorageKey(videoId),
	]);
}

const RECOMMENDATION_FILTER_TOGGLE_KEYS = [
	"viewsFilterEnabled",
	"durationFilterEnabled",
	"keywordFilterEnabled",
	"ageFilterEnabled",
	"englishOnlyTitles",
] as const;

const RECOMMENDATION_FILTER_STORAGE_KEYS = new Set<string>([
	STORAGE_KEYS.VIEWS_FILTER_ENABLED,
	STORAGE_KEYS.DURATION_FILTER_ENABLED,
	STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
	STORAGE_KEYS.AGE_FILTER_ENABLED,
	STORAGE_KEYS.ENGLISH_ONLY_TITLES,
]);

function hasActiveRecommendationFilters(settings: FeedFilterSettings): boolean {
	return RECOMMENDATION_FILTER_TOGGLE_KEYS.some((key) => settings[key]);
}

const Index = () => {
	const resultsRef = useRef<HTMLDivElement | null>(null);
	const currentUrlVideoIdRef = useRef<string | null>(null);
	const [initialUrl, setInitialUrl] = useState<string>("");
	const [isExampleMode, setIsExampleMode] = useState(false);
	const [lastProcessedUrl, setLastProcessedUrl] = useState<string>("");
	const [lastOptions, setLastOptions] = useState<VideoProcessingOptions>();
	const [showSubtitles, setShowSubtitles] = useState<boolean>(
		DEFAULTS.SHOW_SUBTITLES,
	);
	const [recommendationFiltersEnabled, setRecommendationFiltersEnabled] =
		useState(false);
	const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";
	const { toast } = useToast();
	const {
		isLoading,
		error,
		currentStep,
		currentStage,
		progressStates,
		summaryResult,
		scrapedVideoInfo,
		scrapedTranscript,
		cancelCurrentRun,
		updateState,
		processVideo,
	} = useVideoProcessing();

	// Get current tab URL on mount and when tab changes
	useEffect(() => {
		const loadCurrentTabUrl = async () => {
			const url = await getVideoIdFromCurrentTab();
			if (!url) return;
			setInitialUrl((prev) => (prev === url ? prev : url));
		};

		// Load initial URL
		loadCurrentTabUrl();

		// Listen for tab updates
		const handleTabUpdate = (
			_tabId: number,
			changeInfo: chrome.tabs.TabChangeInfo,
			tab: chrome.tabs.Tab,
		) => {
			if (changeInfo.url && tab.active) {
				loadCurrentTabUrl();
			}
		};

		const handleTabActivated = () => {
			loadCurrentTabUrl();
		};

		if (typeof chrome !== "undefined" && chrome.tabs) {
			chrome.tabs.onUpdated.addListener(handleTabUpdate);
			chrome.tabs.onActivated.addListener(handleTabActivated);
		}

		// Cleanup listeners on unmount
		return () => {
			if (typeof chrome !== "undefined" && chrome.tabs) {
				chrome.tabs.onUpdated.removeListener(handleTabUpdate);
				chrome.tabs.onActivated.removeListener(handleTabActivated);
			}
		};
	}, []);

	useEffect(() => {
		const loadShowSubtitles = async () => {
			try {
				const stored = await getStorageValue<boolean>(
					STORAGE_KEYS.SHOW_SUBTITLES,
				);
				if (stored !== null) {
					setShowSubtitles(stored !== false);
				}
			} catch (error) {
				console.error("Failed to load subtitles overlay setting:", error);
			}
		};

		loadShowSubtitles();
	}, []);

	useEffect(() => {
		const loadRecommendationFilterState = async () => {
			try {
				const settings = await getRecommendationFilterSettings();
				setRecommendationFiltersEnabled(
					hasActiveRecommendationFilters(settings),
				);
			} catch (error) {
				console.error("Failed to load recommendation filter settings:", error);
			}
		};

		void loadRecommendationFilterState();

		if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
			return;
		}

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		) => {
			if (areaName !== "local") return;
			if (
				!Object.keys(changes).some((key) =>
					RECOMMENDATION_FILTER_STORAGE_KEYS.has(key),
				)
			) {
				return;
			}
			void loadRecommendationFilterState();
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	useEffect(() => {
		if (!initialUrl || isExampleMode) return;

		const nextVideoId = extractVideoId(initialUrl);
		if (!nextVideoId) return;

		if (currentUrlVideoIdRef.current === nextVideoId) {
			return;
		}

		let cancelled = false;

		const syncStateForVideoChange = async () => {
			try {
				currentUrlVideoIdRef.current = nextVideoId;
				cancelCurrentRun();
				const cachedState = await loadCachedVideoState(nextVideoId);
				if (cancelled) return;

				setLastProcessedUrl(initialUrl);
				setLastOptions(undefined);
				updateState(cachedState ?? EMPTY_VIDEO_STATE);
			} catch (error) {
				console.error("Failed to load cached summary:", error);
			}
		};

		syncStateForVideoChange();

		return () => {
			cancelled = true;
		};
	}, [cancelCurrentRun, initialUrl, isExampleMode, updateState]);

	useEffect(() => {
		const trackedUrl = lastProcessedUrl || initialUrl;
		if (!trackedUrl || isLoading || isExampleMode) return;

		const videoId = extractVideoId(trackedUrl);
		if (!videoId || typeof chrome === "undefined" || !chrome.storage?.onChanged)
			return;

		let cancelled = false;
		const relevantKeys = getTrackedStorageKeys(videoId);

		const syncStoredState = async () => {
			try {
				const cachedState = await loadCachedVideoState(videoId);
				if (cancelled) return;
				if (!cachedState) {
					return;
				}
				updateState(cachedState);
			} catch (error) {
				console.error("Failed to sync stored video state:", error);
			}
		};

		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		) => {
			if (areaName !== "local") return;
			if (!Object.keys(changes).some((key) => relevantKeys.has(key))) return;
			void syncStoredState();
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			cancelled = true;
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, [initialUrl, isExampleMode, isLoading, lastProcessedUrl, updateState]);

	const handleToggleSubtitles = async (nextState: boolean) => {
		setShowSubtitles(nextState);

		try {
			await setStorageValue(STORAGE_KEYS.SHOW_SUBTITLES, nextState);
		} catch (error) {
			console.error("Failed to save subtitles overlay setting:", error);
			setShowSubtitles(!nextState);
			toast({
				title: "Update Failed",
				description: "Couldn't update subtitles overlay setting.",
				variant: "destructive",
			});
			return;
		}

		broadcastToggleSubtitles(nextState);
	};

	const handleToggleRecommendationFilters = async () => {
		const nextState = !recommendationFiltersEnabled;
		setRecommendationFiltersEnabled(nextState);

		try {
			await Promise.all(
				RECOMMENDATION_FILTER_TOGGLE_KEYS.map((key) =>
					setRecommendationFilterSetting(key, nextState),
				),
			);
		} catch (error) {
			console.error("Failed to save recommendation filter settings:", error);
			try {
				const settings = await getRecommendationFilterSettings();
				setRecommendationFiltersEnabled(
					hasActiveRecommendationFilters(settings),
				);
			} catch (reloadError) {
				console.error(
					"Failed to reload recommendation filter settings:",
					reloadError,
				);
				setRecommendationFiltersEnabled(!nextState);
			}
			toast({
				title: "Update Failed",
				description: "Couldn't update recommendation filters.",
				variant: "destructive",
			});
		}
	};

	const loadExample = useCallback(() => {
		setIsExampleMode(true);
		const example = loadExampleData();

		updateState({
			currentStage: "Example ready",
			currentStep: 4,
			progressStates: example.progressStates,
			scrapedVideoInfo: example.videoInfo,
			scrapedTranscript: example.transcript,
			summaryResult: example.summaryResult,
			isLoading: false,
			error: null,
		});

		requestAnimationFrame(() => {
			resultsRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		});
	}, [updateState]);

	useEffect(() => {
		if (import.meta.env.VITE_DEMO_MODE !== "true") return;
		loadExample();
	}, [loadExample]);

	const resolveVideoUrl = async (url: string): Promise<string | null> => {
		const trimmed = url.trim();
		if (trimmed) return trimmed;

		const currentTabUrl = await getVideoIdFromCurrentTab();
		if (!currentTabUrl) return null;

		setInitialUrl(currentTabUrl);
		return currentTabUrl;
	};

	const broadcastToggleSubtitles = (nextState: boolean) => {
		if (typeof chrome === "undefined" || !chrome.tabs) return;

		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			tabs.forEach((tab) => {
				if (!tab.id) return;
				chrome.tabs.sendMessage(
					tab.id,
					{
						action: MESSAGE_ACTIONS.TOGGLE_SUBTITLES,
						showSubtitles: nextState,
					},
					() => {
						if (chrome.runtime.lastError) {
							// Ignore when the content script isn't present (non-YouTube pages).
						}
					},
				);
			});
		});
	};

	const resolveUrlOrLoadExample = async (
		url: string,
	): Promise<string | null> => {
		const videoUrl = await resolveVideoUrl(url);
		if (videoUrl) return videoUrl;

		toast({
			title: "Loading example",
			description:
				"Not on a YouTube video page and no URL provided. Loading example data.",
		});
		loadExample();
		return null;
	};

	const handleVideoSubmit = async (
		url: string,
		options?: VideoProcessingOptions,
	) => {
		setIsExampleMode(false);

		const videoUrl = await resolveUrlOrLoadExample(url);
		if (!videoUrl) return;

		setLastProcessedUrl(videoUrl);

		// Include current transcript if available to avoid re-fetching
		const currentTranscript = summaryResult?.transcript || scrapedTranscript;
		const processingOptions = {
			...options,
			transcript: options?.transcript || currentTranscript || undefined,
		};

		setLastOptions(processingOptions);

		const result = await processVideo(videoUrl, processingOptions);
		if (!result.success) {
			const error = result.error || {
				message: "Processing failed",
				type: "processing",
			};
			const apiError = handleApiError(error);
			updateState({
				error: apiError,
				currentStage: "❌ Processing failed",
			});

			toast({
				title: "Processing Failed",
				description: apiError.message,
				variant: "destructive",
			});

			console.error(
				"Processing error:",
				apiError.message,
				"Details:",
				apiError.details,
			);
		}
	};

	const handleCaptionSubmit = async (url: string) => {
		setIsExampleMode(false);

		const videoUrl = await resolveUrlOrLoadExample(url);
		if (!videoUrl) return;

		setLastProcessedUrl(videoUrl);

		const videoId = extractVideoId(videoUrl);
		if (videoId) {
			try {
				const storedSubtitles = await getSubtitles(videoId);
				updateState({
					...createTranscriptOnlyState(segmentsToTranscript(storedSubtitles)),
					currentStage: "",
				});
			} catch (error) {
				console.error("Failed to load cached transcript for captions:", error);
			}
		}

		try {
			await triggerCaptionGeneration(videoUrl);
			toast({
				title: "Caption requested",
				description: "Caption generation started for this video.",
			});
		} catch (error) {
			const apiError = handleApiError(error);
			toast({
				title: "Caption failed",
				description: apiError.message,
				variant: "destructive",
			});
		}
	};

	const handleFormSubmit = async (
		url: string,
		options?: VideoProcessingOptions,
		action: "caption" | "summary" = "summary",
	) => {
		if (isDemoMode) {
			toast({
				title: "Demo Mode",
				description: "Demo Mode is enabled. Loading example data.",
			});
			loadExample();
			return;
		}
		if (action === "caption") {
			await handleCaptionSubmit(url);
			return;
		}
		await handleVideoSubmit(url, options);
	};

	const handleRegenerate = async () => {
		if (!lastProcessedUrl) return;
		await handleVideoSubmit(lastProcessedUrl, {
			...(lastOptions || {}),
			forceRegenerate: true,
		});
	};

	const videoInfo = summaryResult?.videoInfo || scrapedVideoInfo;
	const transcript = summaryResult?.transcript || scrapedTranscript;

	return (
		<div className="app-shell pb-10">
			<div className="absolute top-[var(--sidepanel-topbar-offset)] left-0 right-0 z-50">
				<div className="sidepanel-container">
					<div className="flex min-h-[var(--sidepanel-topbar-height)] items-center justify-between w-full">
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								type="button"
								onClick={() => handleToggleSubtitles(!showSubtitles)}
								className={`gap-2 text-xs font-medium transition-colors ${
									showSubtitles
										? "text-primary bg-primary/10 hover:bg-primary/20"
										: "text-muted-foreground hover:text-foreground"
								}`}
								title="Toggle subtitles overlay"
							>
								<Captions className="h-4 w-4" />
								<span>Overlay</span>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								onClick={() => void handleToggleRecommendationFilters()}
								className={`gap-2 text-xs font-medium transition-colors ${
									recommendationFiltersEnabled
										? "text-primary bg-primary/10 hover:bg-primary/20"
										: "text-muted-foreground hover:text-foreground"
								}`}
								title="Toggle recommendation filters"
							>
								<ListFilter className="h-4 w-4" />
								<span>Filters</span>
							</Button>
						</div>
						<Button
							asChild
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-foreground transition-all"
						>
							<a
								aria-label="Open settings"
								href={SIDEPANEL_ROUTE_HREFS.settings}
							>
								<SettingsIcon className="h-6 w-6" />
							</a>
						</Button>
					</div>
				</div>
			</div>

			<HeroSection
				onSubmit={handleFormSubmit}
				isLoading={isLoading}
				initialUrl={initialUrl}
			/>

			<div className="relative" ref={resultsRef}>
				<div className="sidepanel-container relative z-10 pb-12 -mt-10">
					<div className="space-y-4">
						{!isExampleMode && videoInfo && (
							<VideoInfo
								url={videoInfo.url}
								title={videoInfo.title}
								thumbnail={videoInfo.thumbnail}
								author={videoInfo.author}
								duration={videoInfo.duration}
								uploadDate={videoInfo.uploadDate}
								viewCount={videoInfo.viewCount}
								likeCount={videoInfo.likeCount}
							/>
						)}

						{transcript && <TranscriptPanel transcript={transcript} />}

						{summaryResult?.summary && (
							<SummaryPanel
								summary={summaryResult.summary}
								quality={summaryResult.quality}
								videoInfo={summaryResult.videoInfo}
								provider={summaryResult.provider}
								onRegenerate={isExampleMode ? undefined : handleRegenerate}
								isRegenerating={isLoading}
							/>
						)}

						{isLoading && (
							<ProcessingStatus
								currentStage={currentStage}
								currentStep={currentStep}
								progressStates={progressStates}
							/>
						)}

						{error && !isLoading && (
							<ErrorDisplay
								error={error}
								progressStates={progressStates}
								onLoadExample={loadExample}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Index;
