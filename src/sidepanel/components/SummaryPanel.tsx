/** Displays the saved Markdown summary like an assistant message, with copy and regeneration actions. */

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
    } catch {
      toast({ title: "Could not copy summary", variant: "destructive" });
    }
  }
  return (
    <article aria-label="Video summary" className="min-w-0 py-2">
      <div className="summary-text">
        <Markdown>{s2tw(summary)}</Markdown>
      </div>
      <div className="mt-3 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          aria-label="Copy summary"
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
            disabled={isRegenerating}
            onClick={onRegenerate}
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
    </article>
  );
}
