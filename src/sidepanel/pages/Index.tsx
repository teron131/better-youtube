/**
 * Main page component orchestrating the video processing workflow.
 */

import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/core/constants";
import {
  getStorageValue,
  getSubtitles,
  getSummary,
  getVideoMetadata,
  setStorageValue,
} from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";
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
  VideoProcessingOptions,
} from "@ui/hooks/use-video-processing";
import { loadExampleData } from "@ui/lib/example-data-loader";
import { getVideoIdFromCurrentTab } from "@ui/lib/video-utils";
import { handleApiError } from "@ui/services/api";
import { triggerCaptionGeneration } from "@ui/services/streaming";
import { Captions, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function segmentsToTranscript(
  segments?: Array<{ text: string }> | null,
): string | null {
  if (!segments?.length) return null;
  return segments.map((segment) => segment.text).join(" ");
}

const Index = () => {
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [initialUrl, setInitialUrl] = useState<string>("");
  const [isExampleMode, setIsExampleMode] = useState(false);
  const [lastProcessedUrl, setLastProcessedUrl] = useState<string>("");
  const [lastOptions, setLastOptions] = useState<VideoProcessingOptions>();
  const [showSubtitles, setShowSubtitles] = useState<boolean>(
    DEFAULTS.SHOW_SUBTITLES,
  );
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
      tabId: number,
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
    if (!initialUrl || isLoading || isExampleMode) return;

    const videoId = extractVideoId(initialUrl);
    if (!videoId) return;

    let cancelled = false;

    const loadCachedSummary = async () => {
      try {
        const [storedSummary, storedVideoInfo, storedSubtitles] =
          await Promise.all([
            getSummary(videoId),
            getVideoMetadata(videoId),
            getSubtitles(videoId),
          ]);

        if (cancelled) return;

        const transcript = segmentsToTranscript(storedSubtitles);
        if (!storedSummary && !storedVideoInfo && !transcript) {
          return;
        }

        if (!storedSummary) {
          updateState({
            summaryResult: null,
            scrapedVideoInfo: storedVideoInfo ?? null,
            scrapedTranscript: transcript,
            currentStage: transcript
              ? "Loaded cached transcript"
              : storedVideoInfo
                ? "Loaded cached video info"
                : "",
            currentStep: 0,
            progressStates: [],
            isLoading: false,
            error: null,
          });
          return;
        }

        const provider = storedSummary.modelUsed?.startsWith("gemini::")
          ? "gemini"
          : storedSummary.modelUsed?.startsWith("openrouter::")
            ? "openrouter"
            : undefined;

        setIsExampleMode(false);
        setLastProcessedUrl(initialUrl);

        updateState({
          summaryResult: {
            success: true,
            summary: storedSummary.summary,
            quality: storedSummary.quality,
            videoInfo: storedVideoInfo ?? undefined,
            transcript: transcript ?? undefined,
            provider,
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
        });
      } catch (error) {
        console.error("Failed to load cached summary:", error);
      }
    };

    loadCachedSummary();

    return () => {
      cancelled = true;
    };
  }, [initialUrl, isLoading, isExampleMode, updateState]);

  useEffect(() => {
    const trackedUrl = lastProcessedUrl || initialUrl;
    if (!trackedUrl || isLoading || isExampleMode) return;

    const videoId = extractVideoId(trackedUrl);
    if (!videoId || typeof chrome === "undefined" || !chrome.storage?.onChanged)
      return;

    let cancelled = false;
    const relevantKeys = new Set([
      videoId,
      `video_info_${videoId}`,
      `summary_${videoId}`,
    ]);

    const syncStoredState = async () => {
      try {
        const [storedSummary, storedVideoInfo, storedSubtitles] =
          await Promise.all([
            getSummary(videoId),
            getVideoMetadata(videoId),
            getSubtitles(videoId),
          ]);

        if (cancelled) return;

        const transcript = segmentsToTranscript(storedSubtitles);
        if (!storedSummary && !storedVideoInfo && !transcript) {
          return;
        }

        if (!storedSummary) {
          updateState({
            summaryResult: null,
            scrapedVideoInfo: storedVideoInfo ?? null,
            scrapedTranscript: transcript,
            error: null,
          });
          return;
        }

        const provider = storedSummary.modelUsed?.startsWith("gemini::")
          ? "gemini"
          : storedSummary.modelUsed?.startsWith("openrouter::")
            ? "openrouter"
            : undefined;

        updateState({
          summaryResult: {
            success: true,
            summary: storedSummary.summary,
            quality: storedSummary.quality,
            videoInfo: storedVideoInfo ?? undefined,
            transcript: transcript ?? undefined,
            provider,
            totalTime: "cached",
            iterations: 0,
            chunksProcessed: 0,
          },
          scrapedVideoInfo: storedVideoInfo ?? null,
          scrapedTranscript: transcript ?? null,
          error: null,
        });
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

  const loadExample = () => {
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
  };

  useEffect(() => {
    if (!isDemoMode) return;
    loadExample();
  }, [isDemoMode]);

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
      updateState({ error: apiError, currentStage: "❌ Processing failed" });

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
          summaryResult: null,
          scrapedVideoInfo: null,
          scrapedTranscript: segmentsToTranscript(storedSubtitles),
          error: null,
          currentStage: "",
          currentStep: 0,
          progressStates: [],
          isLoading: false,
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
                onClick={() => handleToggleSubtitles(!showSubtitles)}
                className={`gap-2 text-xs font-medium transition-colors ${showSubtitles
                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                title="Toggle subtitles overlay"
              >
                <Captions className="h-4 w-4" />
                <span>Overlay</span>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              className="text-muted-foreground hover:text-foreground transition-all"
            >
              <SettingsIcon className="h-6 w-6" />
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
