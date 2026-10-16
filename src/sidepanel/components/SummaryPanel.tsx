/** Presents the saved Markdown summary as a reading section with discoverable copy and regeneration actions. */

import { Copy, RefreshCw } from "lucide-react";

import type { VideoInfoResponse } from "@/core/types";
import { generateSummaryMarkdown } from "@/core/utils/markdown";
import { s2tw } from "@/core/utils/text";

import { useToast } from "../hooks/use-toast";
import { Markdown } from "./Markdown";
import { Button } from "./ui/button";

interface SummaryPanelProps {
  summary: string;
  videoInfo?: VideoInfoResponse;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function SummaryPanel({
  summary,
  videoInfo,
  onRegenerate,
  isRegenerating,
}: SummaryPanelProps) {
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(generateSummaryMarkdown(summary, videoInfo));
      toast({ title: "Summary copied" });
    } catch {
      toast({ title: "Could not copy summary", variant: "destructive" });
    }
  }
  return (
    <article aria-label="Video summary" className="min-w-0 pb-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Summary</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Copy summary"
            title="Copy summary"
            onClick={() => void copy()}
          >
            <Copy className="h-4 w-4" />
          </Button>
          {onRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Regenerate summary"
              title="Regenerate summary"
              disabled={isRegenerating}
              onClick={onRegenerate}
            >
              <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </div>
      <div className="summary-text">
        <Markdown>{s2tw(summary)}</Markdown>
      </div>
    </article>
  );
}
