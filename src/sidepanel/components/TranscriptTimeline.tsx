/** Displays timed caption rows and keeps transcript browsing independent of the video's playback position. */

import { Play } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SubtitleSegment } from "@/core/storage";
import { formatTimestamp } from "@/core/utils/date";

interface TranscriptTimelineProps {
  segments: readonly SubtitleSegment[];
  content: readonly ReactNode[];
  activeMatchIndex: number | null;
  currentTimeMs: number | null;
  canSeek: boolean;
  onSeek: (timeMs: number) => Promise<void>;
}

/** Playback moves the highlighted row, while explicit browsing and search own the reading position. */
export function TranscriptTimeline({
  segments,
  content,
  activeMatchIndex,
  currentTimeMs,
  canSeek,
  onSeek,
}: TranscriptTimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const programmaticScroll = useRef(false);
  const scrollFrame = useRef(0);
  const positioned = useRef(false);
  const [browseIndex, setBrowseIndex] = useState(0);
  const currentBrowseIndex = Math.min(browseIndex, segments.length - 1);
  const firstTime = segments[0].startTime;
  const lastTime = segments[segments.length - 1].startTime;
  const browsedSegment = segments[currentBrowseIndex];
  const candidateIndex = currentTimeMs === null ? -1 : findCaptionIndex(segments, currentTimeMs);
  const activeIndex =
    currentTimeMs !== null &&
    candidateIndex >= 0 &&
    currentTimeMs >= segments[candidateIndex].startTime &&
    currentTimeMs < segments[candidateIndex].endTime
      ? candidateIndex
      : -1;

  /** Browsing changes only scroll position; seeking is exclusively the timestamp button's action. */
  const scrollToCaption = useCallback((index: number) => {
    const list = listRef.current;
    const row = rowRefs.current[index];
    if (!list || !row) return;
    programmaticScroll.current = true;
    const contextTop = row.offsetTop - list.clientHeight * 0.28;
    let firstVisibleIndex = index;
    while (
      firstVisibleIndex > 0 &&
      (rowRefs.current[firstVisibleIndex - 1]?.offsetTop ?? 0) >= contextTop
    ) {
      firstVisibleIndex--;
    }
    list.scrollTop = rowRefs.current[firstVisibleIndex]?.offsetTop ?? row.offsetTop;
    setBrowseIndex(index);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = requestAnimationFrame(() => {
        programmaticScroll.current = false;
      });
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  // Position once when the live player first responds, then leave reading and dragging in control.
  useEffect(() => {
    if (positioned.current || currentTimeMs === null) return;
    positioned.current = true;
    scrollToCaption(findCaptionIndex(segments, currentTimeMs));
  }, [currentTimeMs, segments, scrollToCaption]);

  useEffect(() => {
    if (activeMatchIndex === null) return;
    const match = listRef.current?.querySelector<HTMLElement>(
      `mark[data-match-index="${activeMatchIndex}"]`,
    );
    const index = Number(match?.closest<HTMLElement>("[data-caption-index]")?.dataset.captionIndex);
    if (match && Number.isInteger(index)) {
      positioned.current = true;
      scrollToCaption(index);
    }
  }, [activeMatchIndex, content, scrollToCaption]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list || programmaticScroll.current) return;
    positioned.current = true;
    if (list.scrollTop <= 0) {
      setBrowseIndex(0);
      return;
    }
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 1) {
      setBrowseIndex(segments.length - 1);
      return;
    }
    const anchor = list.scrollTop + list.clientHeight * 0.28;
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((rowRefs.current[middle]?.offsetTop ?? 0) <= anchor) low = middle;
      else high = middle - 1;
    }
    setBrowseIndex(low);
  };

  const handleTimelineKey = (event: KeyboardEvent<HTMLInputElement>) => {
    let index: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        index = Math.min(segments.length - 1, currentBrowseIndex + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        index = Math.max(0, currentBrowseIndex - 1);
        break;
      case "Home":
        index = 0;
        break;
      case "End":
        index = segments.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    positioned.current = true;
    scrollToCaption(index);
  };

  // Playback ticks update the clock; the long caption list only changes when the active row changes.
  const rows = useMemo(
    () =>
      segments.map((segment, index) => {
        const timestamp = formatTimestamp(segment.startTime);
        return (
          <div
            key={index}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
            data-caption-index={index}
            aria-current={activeIndex === index ? "true" : undefined}
            className="caption-timeline-row relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-3 rounded-md px-2 py-2.5 aria-[current=true]:bg-primary/5"
          >
            <button
              type="button"
              className="caption-timestamp min-h-7 select-none rounded-sm text-left font-mono text-xs leading-6 tabular-nums text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-muted-foreground"
              aria-label={`Seek video to ${timestamp}`}
              title={canSeek ? `Seek to ${timestamp}` : "Open this video to seek"}
              disabled={!canSeek}
              onClick={() => void onSeek(segment.startTime)}
            >
              {timestamp}
            </button>
            <div className="min-w-0 select-text whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
              {content[index]}
            </div>
          </div>
        );
      }),
    [segments, content, activeIndex, canSeek, onSeek],
  );

  return (
    <div className="caption-timeline pt-1">
      <div className="flex h-96 gap-1">
        {lastTime > firstTime && (
          <div className="caption-timeline-gutter flex w-6 shrink-0 justify-center py-3">
            <input
              type="range"
              className="caption-timeline-rail h-full w-6 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Browse captions without seeking video"
              aria-orientation="vertical"
              aria-valuetext={`${formatTimestamp(browsedSegment.startTime)} of ${formatTimestamp(segments[segments.length - 1].endTime)}`}
              title="Drag to browse captions"
              min={firstTime}
              max={lastTime}
              step={1}
              value={browsedSegment.startTime}
              onChange={(event) => {
                positioned.current = true;
                scrollToCaption(findCaptionIndex(segments, Number(event.target.value)));
              }}
              onKeyDown={handleTimelineKey}
            />
          </div>
        )}
        <div
          ref={listRef}
          role="region"
          aria-label="Timestamped captions"
          className="caption-timeline-lines relative min-w-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={handleScroll}
        >
          {rows}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs tabular-nums text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Play className="h-3 w-3" aria-hidden="true" />
          {currentTimeMs === null ? (
            "Video unavailable"
          ) : (
            <>
              Video <span className="text-foreground">{formatTimestamp(currentTimeMs)}</span>
            </>
          )}
        </span>
        <span>
          Browsing{" "}
          <span className="text-foreground">{formatTimestamp(browsedSegment.startTime)}</span>
        </span>
      </div>
    </div>
  );
}

/** Finds the latest started caption without scanning hundreds of rows on every playback tick. */
function findCaptionIndex(segments: readonly SubtitleSegment[], timeMs: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (segments[middle].startTime <= timeMs) low = middle;
    else high = middle - 1;
  }
  return low;
}
