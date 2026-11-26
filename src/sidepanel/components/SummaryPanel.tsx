/** The workspace's Summary section: starts a summary with the chat model and Target language, then shows it with copy and regenerate actions, or the failure. */

import { Copy, FileText, Loader2, RefreshCw } from "lucide-react";

import { describeLanguage } from "@/core/language";
import type { ApiError, VideoInfoResponse } from "@/core/types";
import { generateSummaryMarkdown } from "@/core/utils/markdown";
import { s2tw } from "@/core/utils/text";

import { useUserPreferences } from "../hooks/use-config";
import { useToast } from "../hooks/use-toast";
import { ErrorDisplay } from "./ErrorDisplay";
import { Markdown } from "./Markdown";
import { Button } from "./ui/button";
import { sectionActionClassName, WorkspaceSection } from "./WorkspaceSection";

interface SummaryPanelProps {
  summary: string | undefined;
  videoInfo?: VideoInfoResponse;
  isGenerating: boolean;
  /** False while a run can't start, such as before the active video resolves or while chat is answering. */
  canRun: boolean;
  onGenerate: (model: string, language: string) => void;
  /** Unset in the example preview, which has nothing to regenerate. */
  onRegenerate?: () => void;
  error: ApiError | null;
  onLoadExample: () => void;
}

export function SummaryPanel({
  summary,
  videoInfo,
  isGenerating,
  canRun,
  onGenerate,
  onRegenerate,
  error,
  onLoadExample,
}: SummaryPanelProps) {
  const { toast } = useToast();
  const { preferences } = useUserPreferences();
  const language =
    preferences.targetLanguage === "auto"
      ? "the transcript's language"
      : describeLanguage(preferences.targetLanguage);

  async function copy() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(generateSummaryMarkdown(summary, videoInfo));
      toast({ title: "Summary copied" });
    } catch {
      toast({ title: "Could not copy summary", variant: "destructive" });
    }
  }

  const actions = summary ? (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={sectionActionClassName}
        onClick={() => void copy()}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        Copy
      </Button>
      {onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={sectionActionClassName}
          disabled={!canRun}
          onClick={onRegenerate}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Regenerate
        </Button>
      )}
    </>
  ) : (
    <Button
      type="button"
      size="sm"
      className="h-8 gap-1.5"
      aria-busy={isGenerating}
      disabled={!canRun}
      onClick={() => onGenerate(preferences.summaryModel, preferences.targetLanguage)}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileText className="h-4 w-4" aria-hidden="true" />
      )}
      Summarize
    </Button>
  );

  return (
    <WorkspaceSection icon={FileText} title="Summary" actions={actions}>
      {isGenerating && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Preparing your summary…
        </p>
      )}
      {error && !isGenerating && <ErrorDisplay error={error} onLoadExample={onLoadExample} />}
      {summary ? (
        <div className="summary-text min-w-0">
          <Markdown>{s2tw(summary)}</Markdown>
        </div>
      ) : (
        !isGenerating &&
        !error && (
          <p className="text-xs text-muted-foreground">
            Summarizes this video in {language} with the model picked below.
          </p>
        )
      )}
    </WorkspaceSection>
  );
}
