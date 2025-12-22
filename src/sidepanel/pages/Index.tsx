/**
 * Main page component orchestrating the video processing workflow.
 */

import { AnalysisPanel } from "@ui/components/AnalysisPanel";
import { ErrorDisplay } from "@ui/components/ErrorDisplay";
import { HeroSection } from "@ui/components/HeroSection";
import { ProcessingStatus } from "@ui/components/ProcessingStatus";
import { TranscriptPanel } from "@ui/components/TranscriptPanel";
import { Button } from "@ui/components/ui/button";
import { VideoInfo } from "@ui/components/VideoInfo";
import { useToast } from "@ui/hooks/use-toast";
import { useVideoProcessing, VideoProcessingOptions } from "@ui/hooks/use-video-processing";
import { loadExampleData } from "@ui/lib/example-data-loader";
import { getVideoIdFromCurrentTab } from "@ui/lib/video-utils";
import { handleApiError } from "@ui/services/api";
import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/lib/constants";
import { getStorageValue, setStorageValue } from "@/lib/storage";
import { Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [initialUrl, setInitialUrl] = useState<string>("");
  const [isExampleMode, setIsExampleMode] = useState(false);
  const [lastProcessedUrl, setLastProcessedUrl] = useState<string>("");
  const [lastOptions, setLastOptions] = useState<VideoProcessingOptions>();
  const [showSubtitles, setShowSubtitles] = useState<boolean>(DEFAULTS.SHOW_SUBTITLES);
  const { toast } = useToast();

  // Get current tab URL on mount and when tab changes
  useEffect(() => {
    const loadCurrentTabUrl = async () => {
      const url = await getVideoIdFromCurrentTab();
      setInitialUrl(url);
    };

    // Load initial URL
    loadCurrentTabUrl();

    // Listen for tab updates
    const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.url && tab.active) {
        loadCurrentTabUrl();
      }
    };

    const handleTabActivated = () => {
      loadCurrentTabUrl();
    };

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      chrome.tabs.onActivated.addListener(handleTabActivated);
    }

    // Cleanup listeners on unmount
    return () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      }
    };
  }, []);

  useEffect(() => {
    const loadShowSubtitles = async () => {
      try {
        const stored = await getStorageValue<boolean>(STORAGE_KEYS.SHOW_SUBTITLES);
        if (stored !== null) {
          setShowSubtitles(stored !== false);
        }
      } catch (error) {
        console.error("Failed to load subtitles overlay setting:", error);
      }
    };

    loadShowSubtitles();
  }, []);

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

    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        tabs.forEach((tab) => {
          if (!tab.id) return;
          chrome.tabs.sendMessage(tab.id, {
            action: MESSAGE_ACTIONS.TOGGLE_SUBTITLES,
            showSubtitles: nextState,
          }, () => {
            if (chrome.runtime.lastError) {
              // Ignore when the content script isn't present (non-YouTube pages).
              return;
            }
          });
        });
      });
    }
  };

  const {
    isLoading,
    error,
    currentStep,
    currentStage,
    progressStates,
    analysisResult,
    scrapedVideoInfo,
    scrapedTranscript,
    updateState,
    processVideo,
  } = useVideoProcessing();

  const loadExample = () => {
    setIsExampleMode(false);
    const example = loadExampleData();

    updateState({
      currentStage: "Example ready",
      currentStep: 4,
      progressStates: example.progressStates,
      scrapedVideoInfo: example.videoInfo,
      scrapedTranscript: example.transcript,
      analysisResult: example.analysisResult,
      isLoading: false,
    });
  };

  const handleVideoSubmit = async (url: string, options?: VideoProcessingOptions) => {
    setIsExampleMode(false);

    // If no URL provided, try to get from current tab
    let videoUrl = url.trim();

    if (!videoUrl) {
      const currentTabUrl = await getVideoIdFromCurrentTab();

      if (!currentTabUrl) {
        // Not a YouTube page
        const errorMsg = "Not on a YouTube video page. Please open a YouTube video or enter a URL.";
        updateState({
          error: { message: errorMsg, type: "validation" },
          currentStage: "❌ Not a YouTube page"
        });

        toast({
          title: "Not a YouTube Page",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      videoUrl = currentTabUrl;
      setInitialUrl(currentTabUrl);
    }

    setLastProcessedUrl(videoUrl);
    
    // Include current transcript if available to avoid re-fetching
    const currentTranscript = analysisResult?.transcript || scrapedTranscript;
    const processingOptions = {
      ...options,
      transcript: options?.transcript || currentTranscript || undefined
    };
    
    setLastOptions(processingOptions);

    try {
      await processVideo(videoUrl, processingOptions);
    } catch (error) {
      const apiError = handleApiError(error);
      updateState({ error: apiError, currentStage: "❌ Processing failed" });

      toast({
        title: "Processing Failed",
        description: apiError.message,
        variant: "destructive",
      });

      console.error('Processing error:', apiError.message, 'Details:', apiError.details);
    }
  };

  const handleRegenerate = async () => {
    if (!lastProcessedUrl) return;
    await handleVideoSubmit(lastProcessedUrl, lastOptions);
  };

  const videoInfo = analysisResult?.videoInfo || scrapedVideoInfo;
  const transcript = analysisResult?.transcript || scrapedTranscript;

  return (
    <div className="app-shell pb-10">
      <div className="absolute top-6 left-0 right-0 z-50">
        <div className="container mx-auto px-6 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleSubtitles(!showSubtitles)}
              aria-pressed={showSubtitles}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
                showSubtitles
                  ? "border-primary/40 bg-primary/15 text-primary shadow-[0_0_18px_rgba(239,68,68,0.2)]"
                  : "border-border/60 bg-muted/30 text-muted-foreground"
              }`}
              title="Toggle subtitles overlay on the video player"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  showSubtitles
                    ? "bg-primary shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                    : "bg-muted-foreground/60"
                }`}
              />
              Subtitles Overlay
              <span
                className={`text-[10px] font-bold ${
                  showSubtitles ? "text-primary/80" : "text-muted-foreground/70"
                }`}
              >
                {showSubtitles ? "On" : "Off"}
              </span>
            </button>
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

      <HeroSection
        onSubmit={handleVideoSubmit}
        isLoading={isLoading}
        initialUrl={initialUrl}
      />

      <div className="relative">
        <div className="container relative z-10 mx-auto px-6 sm:px-8 pb-12 -mt-10">
          <div className="max-w-8xl w-full mx-auto space-y-4">
            {!isExampleMode && videoInfo && (
              <VideoInfo
                url={videoInfo.url}
                title={videoInfo.title}
                thumbnail={videoInfo.thumbnail}
                author={videoInfo.author}
                duration={videoInfo.duration}
                upload_date={videoInfo.upload_date}
                view_count={videoInfo.view_count}
                like_count={videoInfo.like_count}
              />
            )}

            {!isExampleMode && transcript && (
              <TranscriptPanel transcript={transcript} />
            )}

            {!isExampleMode && analysisResult?.analysis && (
              <AnalysisPanel
                analysis={analysisResult.analysis}
                quality={analysisResult.quality}
                videoInfo={analysisResult.videoInfo}
                onRegenerate={handleRegenerate}
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
