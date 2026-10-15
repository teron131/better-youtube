/**
 * Displays, searches, and copies the selected caption track, with explicit confirmation before refinement.
 */

import { Button } from "@ui/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@ui/components/ui/collapsible";
import { Input } from "@ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/components/ui/tooltip";
import { useToast } from "@ui/hooks/use-toast";
import { useVideoPlayback } from "@ui/hooks/use-video-playback";
import { buildTranscriptWithMetadata, type TranscriptCopyMetadata } from "@ui/lib/transcript-copy";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FileText,
  Languages,
  Loader2,
  Search,
  WandSparkles,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CaptionState, SubtitleSegment } from "@/core/storage";
import type { CaptionTrack } from "@/core/types";

import { TranscriptTimeline } from "./TranscriptTimeline";

interface TranscriptPanelProps {
  transcript: string;
  segments: readonly SubtitleSegment[];
  videoId: string | null;
  metadata?: TranscriptCopyMetadata | null;
  captionState: CaptionState | null;
  onCaptionTrackChange: (trackId: string) => Promise<void>;
  onRefineCaptions: () => Promise<void>;
  isCaptionTrackLoading: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const TranscriptPanel = ({
  transcript,
  segments,
  videoId,
  metadata,
  captionState,
  onCaptionTrackChange,
  onRefineCaptions,
  isCaptionTrackLoading,
  isOpen,
  onOpenChange,
}: TranscriptPanelProps) => {
  const [isConfirmingRefinement, setIsConfirmingRefinement] = useState(false);
  const selectedCaptionTrackId = captionState?.selectedTrackId;
  const selectedTrack = captionState?.tracks.find((track) => track.id === selectedCaptionTrackId);
  const isRefining = captionState?.status === "refining";
  const isTranslation = captionState?.translationRequired === true;
  const translationPending = isTranslation && captionState?.status !== "refined";
  const isBusy = isCaptionTrackLoading || isRefining;
  const selectedTrackLabel = selectedTrack ? captionTrackLabel(selectedTrack) : "Selected captions";
  const captionActionLabel = isCaptionTrackLoading
    ? "Loading captions"
    : isRefining
      ? isTranslation
        ? "Translating captions"
        : "Refining captions"
      : isConfirmingRefinement
        ? `Confirm ${isTranslation ? "translation" : "refinement"} of ${selectedTrackLabel}`
        : isTranslation
          ? "Translate selected captions into English"
          : "Refine selected captions";
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { currentTimeMs, isAvailable, seekTo } = useVideoPlayback(
    videoId,
    isOpen && segments.length > 0,
  );
  const searchResult = useMemo(
    () =>
      highlightTranscriptLines(
        segments.length ? segments.map((segment) => segment.text) : [transcript],
        deferredSearchQuery,
        currentMatchIndex,
      ),
    [segments, transcript, deferredSearchQuery, currentMatchIndex],
  );
  const { text: captionText, matchCount } = searchResult;

  useEffect(() => {
    setIsConfirmingRefinement(false);
  }, [selectedCaptionTrackId]);

  const changeCaptionTrack = async (trackId: string) => {
    setIsConfirmingRefinement(false);
    try {
      await onCaptionTrackChange(trackId);
    } catch (error) {
      toast({
        title: "Unable to load caption track",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  /** Refinement starts only after the user confirms the currently selected source. */
  const confirmRefinement = async () => {
    setIsConfirmingRefinement(false);
    try {
      await onRefineCaptions();
    } catch {
      toast({
        title: isTranslation ? "Caption translation failed" : "Caption refinement failed",
        variant: "destructive",
      });
    }
  };

  const copyTranscript = async (withDetails = false) => {
    try {
      await navigator.clipboard.writeText(
        withDetails ? buildTranscriptWithMetadata(captionText, metadata) : captionText,
      );
      toast({
        title: "Copied!",
        description: withDetails
          ? "Transcript and video details copied to clipboard"
          : "Transcript copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: withDetails
          ? "Unable to copy transcript details"
          : "Unable to copy transcript",
        variant: "destructive",
      });
    }
  };

  const seekToCaption = useCallback(
    async (timeMs: number) => {
      try {
        await seekTo(timeMs);
      } catch (error) {
        toast({
          title: "Unable to seek video",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [seekTo, toast],
  );

  useEffect(() => {
    setCurrentMatchIndex((index) => Math.min(index, Math.max(0, matchCount - 1)));
  }, [matchCount]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);
  }, []);

  const navigateMatches = useCallback(
    (direction: "next" | "prev") => {
      if (matchCount === 0) return;

      if (direction === "next") {
        setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
      } else {
        setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
      }
    },
    [matchCount],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && matchCount > 0) {
        e.preventDefault();
        navigateMatches("next");
      }
    },
    [matchCount, navigateMatches],
  );

  useEffect(() => {
    if (!segments.length && transcriptRef.current && deferredSearchQuery.trim()) {
      const marks = transcriptRef.current.querySelectorAll("mark");
      if (marks[currentMatchIndex]) {
        marks[currentMatchIndex].scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentMatchIndex, deferredSearchQuery, segments.length]);

  return (
    <section className="contain-layout">
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full px-0 py-3 h-auto justify-between hover:bg-transparent"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center text-muted-foreground">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium text-foreground block">Transcript</span>
              </div>
              {captionState?.status === "refined" && (
                <span className="text-xs text-muted-foreground">
                  {isTranslation ? "Translated" : "Refined"}
                </span>
              )}
            </div>
            <ChevronDown
              className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pb-4">
          <div className="space-y-3">
            {!!captionState?.tracks.length && (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={selectedCaptionTrackId}
                    onValueChange={(trackId) => void changeCaptionTrack(trackId)}
                    disabled={isBusy}
                  >
                    <SelectTrigger
                      aria-label="Caption track"
                      title={selectedTrackLabel}
                      className="h-9 min-w-0 text-sm"
                    >
                      <SelectValue placeholder="Choose captions" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {captionState.tracks.map((track) => (
                        <SelectItem key={track.id} value={track.id}>
                          {captionTrackLabel(track)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isConfirmingRefinement ? "default" : "outline"}
                      size={isConfirmingRefinement ? "sm" : "icon"}
                      className={`h-9 shrink-0 ${isConfirmingRefinement ? "" : "w-9 border-border/60"}`}
                      disabled={isBusy || !selectedTrack || (!captionText && !translationPending)}
                      aria-label={captionActionLabel}
                      aria-busy={isBusy}
                      onClick={() =>
                        isConfirmingRefinement
                          ? void confirmRefinement()
                          : setIsConfirmingRefinement(true)
                      }
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : isConfirmingRefinement ? (
                        "Confirm"
                      ) : isTranslation ? (
                        <Languages className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <WandSparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{captionActionLabel}</TooltipContent>
                </Tooltip>
                <span role="status" className="sr-only">
                  {isBusy ? captionActionLabel : ""}
                </span>
                {isConfirmingRefinement && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label={isTranslation ? "Cancel translation" : "Cancel refinement"}
                    title={isTranslation ? "Cancel translation" : "Cancel refinement"}
                    onClick={() => setIsConfirmingRefinement(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {captionState?.error && (
              <p role="alert" className="text-xs text-destructive break-words">
                {captionState.error}
              </p>
            )}
            {translationPending && (
              <p role="status" className="text-xs text-muted-foreground">
                {isRefining
                  ? "Translating captions into English…"
                  : "YouTube translation is unavailable. Use the translate icon to translate with AI."}
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative min-w-[10rem] flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search"
                  aria-label="Search transcript"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10 pr-24 h-9 text-sm border-border/60 focus:border-primary/50"
                />
                {searchQuery && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : "No matches"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSearch}
                      aria-label="Clear search"
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {searchQuery && matchCount > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateMatches("prev")}
                    aria-label="Previous search match"
                    className="h-9 w-9 border-border/60 text-foreground"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateMatches("next")}
                    aria-label="Next search match"
                    className="h-9 w-9 border-border/60 text-foreground"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy transcript"
                    onClick={() => void copyTranscript()}
                    disabled={isCaptionTrackLoading || !captionText}
                    className="h-9 w-9 border-border/60 text-foreground"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy transcript</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy transcript with video details"
                    onClick={() => void copyTranscript(true)}
                    disabled={isCaptionTrackLoading || !captionText}
                    className="h-9 w-9 border-border/60 text-foreground"
                  >
                    <ClipboardList className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy with details</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {segments.length ? (
              <TranscriptTimeline
                key={selectedCaptionTrackId || "captions"}
                segments={segments}
                content={searchResult.content}
                activeMatchIndex={
                  deferredSearchQuery.trim() && matchCount ? currentMatchIndex : null
                }
                currentTimeMs={currentTimeMs}
                canSeek={isAvailable && !isCaptionTrackLoading}
                onSeek={seekToCaption}
              />
            ) : (
              <div ref={transcriptRef} className="py-3 max-h-96 overflow-y-auto contain-layout">
                <div className="select-text text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                  {searchResult.content[0]}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};

function captionTrackLabel(track: CaptionTrack): string {
  if (track.kind === "translated") return "English · Translation";
  const name = track.name.replace(/\s*\(auto-generated\)\s*$/i, "") || track.languageCode;
  return `${name} · ${track.kind === "manual" ? "Manual" : "Auto"}`;
}

/** Keeps search matches continuous across caption boundaries while rendering timestamps separately. */
function highlightTranscriptLines(lines: string[], query: string, activeMatchIndex: number) {
  const text = lines.join(" ");
  const matches = query.trim()
    ? Array.from(text.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")))
    : [];
  let lineStart = 0;
  let firstMatch = 0;
  const content = lines.map((line) => {
    const lineEnd = lineStart + line.length;
    while (
      firstMatch < matches.length &&
      matches[firstMatch].index + matches[firstMatch][0].length <= lineStart
    ) {
      firstMatch++;
    }
    const nodes: ReactNode[] = [];
    let cursor = 0;
    for (
      let index = firstMatch;
      index < matches.length && matches[index].index < lineEnd;
      index++
    ) {
      const match = matches[index];
      const start = Math.max(0, match.index - lineStart);
      const end = Math.min(line.length, match.index + match[0].length - lineStart);
      if (start > cursor) nodes.push(line.slice(cursor, start));
      nodes.push(
        <mark
          key={index}
          data-match-index={index}
          className={
            index === activeMatchIndex ? "bg-primary text-primary-foreground" : "bg-yellow-500/30"
          }
        >
          {line.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < line.length) nodes.push(line.slice(cursor));
    lineStart = lineEnd + 1;
    return nodes;
  });
  return { text, matchCount: matches.length, content };
}
