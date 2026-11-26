/** Displays, searches, and copies the selected caption track's transcript, and seeks the video from its timestamps. */

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { useToast } from "@ui/hooks/use-toast";
import { useVideoPlayback } from "@ui/hooks/use-video-playback";
import { buildTranscriptWithMetadata, type TranscriptCopyMetadata } from "@ui/lib/transcript-copy";
import { ChevronDown, ChevronUp, ClipboardList, Copy, ScrollText, Search, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SubtitleSegment } from "@/core/storage";

import { TranscriptTimeline } from "./TranscriptTimeline";
import { sectionActionClassName, WorkspaceSection } from "./WorkspaceSection";

interface TranscriptPanelProps {
  transcript: string;
  segments: readonly SubtitleSegment[];
  videoId: string | null;
  metadata?: TranscriptCopyMetadata | null;
  selectedTrackId: string | undefined;
  isCaptionTrackLoading: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const TranscriptPanel = ({
  transcript,
  segments,
  videoId,
  metadata,
  selectedTrackId,
  isCaptionTrackLoading,
  isOpen,
  onOpenChange,
}: TranscriptPanelProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const bodyId = useId();
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

  const copyTranscript = async (withDetails: boolean) => {
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
    <WorkspaceSection
      icon={ScrollText}
      title="Transcript"
      bodyId={bodyId}
      actions={
        <>
          <PopoverPrimitive.Root open={isCopyMenuOpen} onOpenChange={setIsCopyMenuOpen}>
            <PopoverPrimitive.Trigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={sectionActionClassName}
                disabled={isCaptionTrackLoading || !captionText}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
              </Button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              >
                {COPY_CHOICES.map(({ withDetails, label, icon: ChoiceIcon }) => (
                  <button
                    key={label}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                    onClick={() => {
                      setIsCopyMenuOpen(false);
                      void copyTranscript(withDetails);
                    }}
                  >
                    <ChoiceIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
          <Button
            variant="ghost"
            size="sm"
            className={sectionActionClassName}
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!isOpen)}
          >
            {isOpen ? "Hide" : "Show"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </>
      }
    >
      {isOpen && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search transcript"
                aria-label="Search transcript"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 border-border/60 pl-10 pr-24 text-sm focus:border-primary/50"
              />
              {searchQuery && (
                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
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
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {searchQuery && matchCount > 0 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMatches("prev")}
                  aria-label="Previous search match"
                  className="h-9 w-9 shrink-0 border-border/60 text-foreground"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMatches("next")}
                  aria-label="Next search match"
                  className="h-9 w-9 shrink-0 border-border/60 text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {segments.length ? (
            <TranscriptTimeline
              key={selectedTrackId || "captions"}
              segments={segments}
              content={searchResult.content}
              activeMatchIndex={deferredSearchQuery.trim() && matchCount ? currentMatchIndex : null}
              currentTimeMs={currentTimeMs}
              canSeek={isAvailable && !isCaptionTrackLoading}
              onSeek={seekToCaption}
            />
          ) : (
            <div ref={transcriptRef} className="contain-layout max-h-96 overflow-y-auto py-3">
              <div className="select-text whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                {searchResult.content[0]}
              </div>
            </div>
          )}
        </>
      )}
    </WorkspaceSection>
  );
};

const COPY_CHOICES = [
  { withDetails: false, label: "Transcript only", icon: Copy },
  { withDetails: true, label: "With video details", icon: ClipboardList },
] as const;

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
