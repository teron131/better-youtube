/** Content Script Helper Functions - Messaging Logic */

import { MESSAGE_ACTIONS } from "@/core/constants";
import type { RequestId } from "@/core/requestId";
import type { SubtitleSegment } from "@/core/storage";
import { sendChromeMessage } from "@/core/utils/chrome";

export interface ContentScriptState {
    currentSubtitles: SubtitleSegment[];
    showSubtitlesEnabled: boolean;
    userInteractedWithToggle: boolean;
    currentCaptionRequestId?: RequestId;
}

export function triggerCaptionRefinement(
    videoId: string,
    requestId: RequestId,
    refinerModel: string,
    onError?: (id: string) => void,
): void {
    sendChromeMessage({
        action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
        videoId,
        requestId,
        modelSelection: refinerModel,
    })
        .then((r) =>
            console.log("[Auto-gen] Subtitle refinement triggered:", r),
        )
        .catch((e) => {
            console.error("Error triggering subtitle auto-gen:", e.message);
            onError?.(videoId);
        });
}

export function triggerSummaryGeneration(
    videoId: string,
    requestId: RequestId,
    m: {
        summarizerModel: string;
        qualityModel: string;
        targetLanguage: string;
        summarizerMode: "native" | "validation" | "fast";
    },
): void {
    sendChromeMessage({
        action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
        videoId,
        requestId,
        modelSelection: m.summarizerModel,
        qualityModel: m.qualityModel,
        targetLanguage: m.targetLanguage,
        summarizerMode: m.summarizerMode,
    })
        .then((r) => console.log("[Auto-gen] Summary generation triggered:", r))
        .catch((e) =>
            console.error("Error triggering summary auto-gen:", e.message),
        );
}
