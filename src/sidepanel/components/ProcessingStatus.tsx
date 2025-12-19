/**
 * Component showing real-time video processing status with progress indicator.
 */

import { Card } from "@ui/components/ui/card";
import { getStageText } from "@ui/lib/video-utils";
import { StreamingProgressState } from "@ui/services/types";
import { Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  currentStage: string;
  currentStep: number;
  progressStates: StreamingProgressState[];
}

const STEP_TO_ANCHOR = [-1, 0, 1, 2, 3, 2, 4];
const TOTAL_ANCHORS = 4;

export function ProcessingStatus({ currentStage, currentStep, progressStates }: ProcessingStatusProps) {
  const finished = progressStates.some(s => s.step === 'complete');

  const mapCurrentToAnchor = (stepIdx: number) =>
    STEP_TO_ANCHOR[Math.max(0, Math.min(stepIdx + 1, STEP_TO_ANCHOR.length - 1))];

  const activeAnchor = finished
    ? TOTAL_ANCHORS
    : progressStates.length === 0
      ? 0
      : mapCurrentToAnchor(currentStep);

  const progressPercent = (activeAnchor / TOTAL_ANCHORS) * 100;
  const stageText = getStageText(activeAnchor);

  return (
    <Card className="p-8">
      <div className="space-y-8">
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
            <div className="absolute inset-0 w-20 h-20 bg-primary/30 rounded-full animate-ping" />
          </div>
        </div>

        <div className="text-center space-y-4">
          <h3 className="text-2xl font-bold text-foreground">Processing Video</h3>
          <p className="text-lg text-muted-foreground">{currentStage}</p>

          <div className="space-y-3 mt-8">
            <div className="relative h-2 rounded-full timeline-track">
              <div
                className="timeline-fill transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Now: <span className="text-foreground font-semibold">{stageText}</span></span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
