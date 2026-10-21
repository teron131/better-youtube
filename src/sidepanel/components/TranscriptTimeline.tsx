/** Displays timed caption rows that follow playback until the reader scrolls, drags, or searches. */

import { LocateFixed } from "lucide-react";
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

import { Button } from "./ui/button";

interface TranscriptTimelineProps {
  segments: readonly SubtitleSegment[];
  content: readonly ReactNode[];
  activeMatchIndex: number | null;
  currentTimeMs: number | null;
  canSeek: boolean;
  onSeek: (timeMs: number) => Promise<void>;
}

/**
 * Playback scrolls the list to the current caption while following; any reader-driven scroll, rail drag, keyboard browse, or search match takes over until the reader syncs back or seeks.
 * Requires at least one segment.
 */
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
  const followedIndex = useRef(-1);
  const [following, setFollowing] = useState(true);
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
  const scrollToCaption = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
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
    const top = rowRefs.current[firstVisibleIndex]?.offsetTop ?? row.offsetTop;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top, behavior: reduceMotion ? "auto" : behavior });
    setBrowseIndex(index);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = requestAnimationFrame(() => {
        programmaticScroll.current = false;
      });
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  const stopFollowing = useCallback(() => {
    followedIndex.current = -1;
    setFollowing(false);
  }, []);

  // The first follow jumps into place; later caption changes glide so reading stays oriented.
  useEffect(() => {
    if (!following || currentTimeMs === null) return;
    const index = findCaptionIndex(segments, currentTimeMs);
    if (index === followedIndex.current) return;
    const behavior = followedIndex.current === -1 ? "auto" : "smooth";
    followedIndex.current = index;
    scrollToCaption(index, behavior);
  }, [following, currentTimeMs, segments, scrollToCaption]);

  useEffect(() => {
    if (activeMatchIndex === null) return;
    const match = listRef.current?.querySelector<HTMLElement>(
      `mark[data-match-index="${activeMatchIndex}"]`,
    );
    const index = Number(match?.closest<HTMLElement>("[data-caption-index]")?.dataset.captionIndex);
    if (match && Number.isInteger(index)) {
      stopFollowing();
      scrollToCaption(index);
    }
  }, [activeMatchIndex, content, scrollToCaption, stopFollowing]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list || programmaticScroll.current || following) return;
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
    stopFollowing();
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
            className="caption-timeline-row relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-2 rounded-md px-1 py-1.5 aria-[current=true]:bg-primary/5"
          >
            <button
              type="button"
              className="caption-timestamp min-h-6 select-none rounded-sm text-left font-mono text-xs leading-6 tabular-nums text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-muted-foreground"
              aria-label={`Seek video to ${timestamp}`}
              title={canSeek ? `Seek to ${timestamp}` : "Open this video to seek"}
              disabled={!canSeek}
              onClick={() => {
                setFollowing(true);
                void onSeek(segment.startTime);
              }}
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
    <div className="caption-timeline flex h-[min(24rem,55dvh)] flex-col">
      {/* The sync action has its own row within the bounded timeline, so it cannot cover captions or move the composer. */}
      {!following && currentTimeMs !== null && (
        <div className="flex shrink-0 justify-end pb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setFollowing(true)}
          >
            <LocateFixed aria-hidden="true" />
            Sync to video · <span className="tabular-nums">{formatTimestamp(currentTimeMs)}</span>
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-1">
        {lastTime > firstTime && (
          <div className="caption-timeline-gutter flex w-6 shrink-0 justify-center py-1.5">
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
                stopFollowing();
                scrollToCaption(findCaptionIndex(segments, Number(event.target.value)));
              }}
              onKeyDown={handleTimelineKey}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            ref={listRef}
            role="region"
            aria-label="Timestamped captions"
            className="caption-timeline-lines relative h-full overflow-y-auto overscroll-contain"
            onScroll={handleScroll}
            onWheel={stopFollowing}
            onTouchMove={stopFollowing}
            onPointerDown={stopFollowing}
          >
            {rows}
          </div>
        </div>
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
