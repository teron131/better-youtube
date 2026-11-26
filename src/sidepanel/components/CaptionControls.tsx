/**
 * Always-visible caption controls: the source track, a refine-or-translate rewrite that runs in one click, its progress or result, and the overlay on the video.
 * Choosing another track while a run is refining cancels that run in the background.
 */

import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Switch } from "@ui/components/ui/switch";
import { useUserPreferences } from "@ui/hooks/use-config";
import { useToast } from "@ui/hooks/use-toast";
import { Captions, Languages, Loader2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { describeLanguage, isSameLanguage, preferredRewriteLanguage } from "@/core/language";
import type { CaptionState } from "@/core/storage";
import type { CaptionTrack } from "@/core/types";

import { WorkspaceSection } from "./WorkspaceSection";

interface CaptionControlsProps {
  captionState: CaptionState;
  isTrackLoading: boolean;
  /** False while the selected track has no caption text yet, which blocks a refine but not a required translation. */
  hasTranscript: boolean;
  showOnVideo: boolean;
  onShowOnVideoChange: (show: boolean) => void;
  onTrackChange: (trackId: string) => Promise<void>;
  /** `rewriteLanguage` is the language to translate into, or null to refine in the captions' own language. */
  onRewrite: (rewriteLanguage: string | null) => Promise<void>;
}

export function CaptionControls({
  captionState,
  isTrackLoading,
  hasTranscript,
  showOnVideo,
  onShowOnVideoChange,
  onTrackChange,
  onRewrite,
}: CaptionControlsProps) {
  const { preferences } = useUserPreferences();
  const { toast } = useToast();
  const [rewriteChoice, setRewriteChoice] = useState<RewriteChoice>("refine");
  const [customLanguage, setCustomLanguage] = useState("");
  const selectedTrack = captionState.tracks.find(
    (track) => track.id === captionState.selectedTrackId,
  );
  const isRefining = captionState.status === "refining";
  const translationRequired = captionState.translationRequired === true;
  const translationPending = translationRequired && captionState.status !== "refined";
  const rewriteChoices: RewriteChoice[] = translationRequired
    ? ["english"]
    : selectedTrack && isSameLanguage("en", selectedTrack.languageCode)
      ? ["refine", "custom"]
      : ["refine", "english", "custom"];
  const rewriteLanguage =
    rewriteChoice === "refine" ? null : rewriteChoice === "english" ? "en" : customLanguage.trim();
  const preferredLanguage = selectedTrack
    ? preferredRewriteLanguage(
        selectedTrack.languageCode,
        translationRequired,
        preferences.targetLanguage,
      )
    : null;
  const isBusy = isTrackLoading || isRefining;
  const progress = captionState.progress;
  const progressPercent = progress
    ? Math.round((progress.completedBatches / progress.totalBatches) * 100)
    : null;
  const resultLanguage = captionState.translatedInto || (translationRequired ? "en" : null);
  const runningLabel = captionState.translatedInto
    ? `Translating into ${describeLanguage(captionState.translatedInto)}`
    : "Refining captions";
  const actionLabel = rewriteLanguage
    ? `Translate into ${describeLanguage(rewriteLanguage)}`
    : rewriteChoice === "custom"
      ? "Type a language to translate into"
      : "Refine in the same language";

  // Each track starts from the rewrite the Target language setting implies, so a choice made for another track, such as English for a Chinese one, never carries over.
  useEffect(() => {
    setRewriteChoice(
      preferredLanguage === null ? "refine" : preferredLanguage === "en" ? "english" : "custom",
    );
    if (preferredLanguage && preferredLanguage !== "en") {
      setCustomLanguage(describeLanguage(preferredLanguage));
    }
  }, [preferredLanguage, captionState.selectedTrackId]);

  const changeTrack = async (trackId: string) => {
    try {
      await onTrackChange(trackId);
    } catch (error) {
      toast({
        title: "Unable to load caption track",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const rewrite = async () => {
    try {
      await onRewrite(rewriteLanguage);
    } catch (error) {
      toast({
        title: rewriteLanguage ? "Caption translation failed" : "Caption refinement failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <WorkspaceSection
      icon={Captions}
      title="Captions"
      actions={
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          Show on video
          <Switch checked={showOnVideo} onCheckedChange={onShowOnVideoChange} />
        </label>
      }
    >
      <Select
        value={captionState.selectedTrackId}
        onValueChange={(trackId) => void changeTrack(trackId)}
        disabled={isTrackLoading}
      >
        <SelectTrigger
          aria-label="Caption track"
          title={selectedTrack ? captionTrackLabel(selectedTrack) : undefined}
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

      <div className="flex items-center gap-2">
        <Select
          value={rewriteChoice}
          onValueChange={(choice) => setRewriteChoice(choice as RewriteChoice)}
          disabled={isBusy || rewriteChoices.length < 2}
        >
          <SelectTrigger aria-label="Rewrite" className="h-9 min-w-0 flex-1 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]">
            {rewriteChoices.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {REWRITE_CHOICE_LABELS[choice]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          title={actionLabel}
          aria-label={actionLabel}
          aria-busy={isBusy}
          disabled={
            isBusy ||
            !selectedTrack ||
            (!hasTranscript && !translationPending) ||
            rewriteLanguage === ""
          }
          onClick={() => void rewrite()}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : rewriteLanguage === null ? (
            <WandSparkles className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Languages className="h-4 w-4" aria-hidden="true" />
          )}
          {rewriteChoice === "refine" ? "Refine" : "Translate"}
        </Button>
      </div>

      {rewriteChoice === "custom" && (
        <Input
          type="text"
          placeholder="Language, such as Japanese"
          aria-label="Translation language"
          value={customLanguage}
          disabled={isBusy}
          onChange={(event) => setCustomLanguage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && rewriteLanguage && !isBusy) void rewrite();
          }}
          className="h-9 border-border/60 text-sm"
        />
      )}

      {isRefining ? (
        <div className="space-y-1.5 pt-1">
          <div
            className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground"
            title={
              progress
                ? `${progress.completedBatches} of ${progress.totalBatches} batches done`
                : undefined
            }
          >
            <span role="status" className="min-w-0 truncate">
              {progress ? runningLabel : `${runningLabel}…`}
            </span>
            {progressPercent !== null && (
              <span className="shrink-0 font-mono tabular-nums text-foreground">
                {progressPercent}%
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={runningLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent ?? undefined}
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progressPercent ?? 0}%` }}
            />
          </div>
        </div>
      ) : captionState.error ? (
        <p role="alert" className="break-words text-xs text-destructive">
          {captionState.error}
        </p>
      ) : translationPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          YouTube has no English version of this track. Translate it to read the captions.
        </p>
      ) : captionState.status === "refined" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {resultLanguage
            ? `Showing captions translated into ${describeLanguage(resultLanguage)}`
            : "Showing refined captions"}
        </p>
      ) : null}
    </WorkspaceSection>
  );
}

// "custom" translates into the language typed beside the option, passed to the model as written.
type RewriteChoice = "refine" | "english" | "custom";

const REWRITE_CHOICE_LABELS: Record<RewriteChoice, string> = {
  refine: "Refine in the same language",
  english: "Translate to English",
  custom: "Translate to another language",
};

function captionTrackLabel(track: CaptionTrack): string {
  if (track.kind === "translated") return "English · Translation";
  const name = track.name.replace(/\s*\(auto-generated\)\s*$/i, "") || track.languageCode;
  return `${name} · ${track.kind === "manual" ? "Manual" : "Auto"}`;
}
