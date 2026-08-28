/** Content Script Helper Functions - Messaging Logic */

import { MESSAGE_ACTIONS } from "@/core/constants";
import type { RequestId } from "@/core/requestId";
import type { SubtitleSegment } from "@/core/storage";
import { sendChromeMessage } from "@/core/utils/chrome";

export interface ContentScriptState {
  currentSubtitles: SubtitleSegment[];
  showSubtitlesEnabled: boolean;
  userInteractedWithToggle: boolean;
  currentVideoId?: string;
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
    .then((r) => console.log("[Auto-gen] Subtitle refinement triggered:", r))
    .catch((e) => {
      console.error("Error triggering subtitle auto-gen:", e.message);
      onError?.(videoId);
    });
}
