/** Video workspace top bar: page-level toggles on the left, conversation and panel actions on the right. */

import { Button } from "@ui/components/ui/button";
import { Captions, ListFilter, RefreshCw, Settings, SquarePen } from "lucide-react";

import { SIDEPANEL_ROUTE_HREFS } from "../../lib/routes";

interface WorkspaceHeaderProps {
  showSubtitles: boolean;
  onToggleSubtitles: () => void;
  recommendationFiltersEnabled: boolean;
  onToggleRecommendationFilters: () => void;
  /** Unset while there is no idle conversation to discard, which disables New chat. */
  onNewChat?: () => void;
  isRefreshingVideo: boolean;
  onRefreshVideo: () => void;
}

// Active toggles carry state through the red icon and tint; labels stay readable foreground text.
const toggleClassName = (active: boolean) =>
  `h-9 gap-2 px-2.5 text-[13px] font-medium ${
    active
      ? "bg-primary/15 text-foreground hover:bg-primary/25 [&_svg]:text-primary"
      : "text-muted-foreground hover:text-foreground"
  }`;

export function WorkspaceHeader({
  showSubtitles,
  onToggleSubtitles,
  recommendationFiltersEnabled,
  onToggleRecommendationFilters,
  onNewChat,
  isRefreshingVideo,
  onRefreshVideo,
}: WorkspaceHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border/50">
      <div className="sidepanel-container">
        <div className="flex h-14 w-full items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onToggleSubtitles}
              aria-pressed={showSubtitles}
              className={toggleClassName(showSubtitles)}
              title="Toggle subtitles overlay"
            >
              <Captions />
              <span>Overlay</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onToggleRecommendationFilters}
              aria-pressed={recommendationFiltersEnabled}
              className={toggleClassName(recommendationFiltersEnabled)}
              title="Toggle recommendation filters"
            >
              <ListFilter />
              <span>Filters</span>
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onNewChat}
              disabled={!onNewChat}
              aria-label="New chat"
              title="New chat"
              className="h-9 gap-2 px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              <SquarePen />
              <span className="hidden min-[400px]:inline">New chat</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={onRefreshVideo}
              disabled={isRefreshingVideo}
              aria-label="Refresh active video"
              title="Refresh active video"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={isRefreshingVideo ? "animate-spin" : undefined} />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <a aria-label="Open settings" title="Settings" href={SIDEPANEL_ROUTE_HREFS.settings}>
                <Settings />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
