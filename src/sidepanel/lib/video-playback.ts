/** Owns a caption panel's active-tab playback port, seek acknowledgments, and tab/navigation cleanup. */

import { getCurrentTab } from "../../core/utils/chrome.ts";
import { getWatchVideoId } from "../../core/utils/url.ts";
import {
  VIDEO_PLAYBACK_PORT,
  type VideoPlaybackResponse,
  type VideoPlaybackState,
} from "../../core/videoPlayback.ts";

const SEEK_TIMEOUT_MS = 3000;
const UNAVAILABLE: VideoPlaybackState = { currentTimeMs: null, isAvailable: false };

export interface VideoPlaybackConnection {
  seekTo(timeMs: number): Promise<void>;
  disconnect(): void;
}

/** Connects only to the matching active watch tab and follows tab events while the panel is subscribed. */
export function connectVideoPlayback(
  videoId: string,
  onState: (state: VideoPlaybackState) => void,
): VideoPlaybackConnection {
  let disposed = false;
  let revision = 0;
  let nextRequestId = 0;
  let port: chrome.runtime.Port | null = null;
  let tabId: number | null = null;
  let detachPortListeners: (() => void) | null = null;
  const pendingSeeks = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  const closePort = () => {
    const previous = port;
    port = null;
    tabId = null;
    detachPortListeners?.();
    detachPortListeners = null;
    for (const pending of pendingSeeks.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Playback connection closed."));
    }
    pendingSeeks.clear();
    try {
      previous?.disconnect();
    } catch {
      /* An already-disconnected tab has no remaining work. */
    }
    onState(UNAVAILABLE);
  };

  const connectActiveTab = async () => {
    const attempt = ++revision;
    try {
      const active = await getCurrentTab();
      if (disposed || attempt !== revision) return;
      if (!active?.id || getWatchVideoId(active.url) !== videoId) {
        closePort();
        return;
      }
      if (port && tabId === active.id) return;
      closePort();
      const connected = chrome.tabs.connect(active.id, { name: VIDEO_PLAYBACK_PORT });
      port = connected;
      tabId = active.id;
      const onMessage = (message: VideoPlaybackResponse) => {
        if (disposed || port !== connected || !message || message.videoId !== videoId) return;
        if (message.type === "position") {
          const available =
            message.available === true &&
            typeof message.currentTimeMs === "number" &&
            Number.isFinite(message.currentTimeMs) &&
            message.currentTimeMs >= 0;
          onState({
            isAvailable: available,
            currentTimeMs: available ? message.currentTimeMs : null,
          });
        } else if (message.type === "seek-result") {
          const pending = pendingSeeks.get(message.requestId);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingSeeks.delete(message.requestId);
          if (message.ok === true) pending.resolve();
          else pending.reject(new Error(message.error || "Unable to seek this video."));
        }
      };
      const onDisconnect = () => {
        // Reading lastError silences Chrome's warning for a tab that closed or navigated away.
        void chrome.runtime.lastError;
        if (port === connected) closePort();
      };
      connected.onMessage.addListener(onMessage);
      connected.onDisconnect.addListener(onDisconnect);
      detachPortListeners = () => {
        connected.onMessage.removeListener(onMessage);
        connected.onDisconnect.removeListener(onDisconnect);
      };
      connected.postMessage({ type: "subscribe", videoId });
    } catch {
      if (!disposed && attempt === revision) closePort();
    }
  };

  const onActivated = () => {
    void connectActiveTab();
  };
  const onUpdated = (
    updatedTabId: number,
    change: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ) => {
    if (updatedTabId === tabId && change.url && getWatchVideoId(change.url) !== videoId) {
      revision += 1;
      closePort();
    } else if (
      !port &&
      change.status === "complete" &&
      getWatchVideoId(change.url || tab.url) === videoId
    ) {
      void connectActiveTab();
    }
  };
  const onRemoved = (removedTabId: number) => {
    if (removedTabId !== tabId) return;
    revision += 1;
    closePort();
  };
  const hasChrome = typeof chrome !== "undefined" && !!chrome.tabs?.connect;
  onState(UNAVAILABLE);
  if (hasChrome) {
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void connectActiveTab();
  }

  return {
    async seekTo(timeMs) {
      if (disposed || !hasChrome || !Number.isFinite(timeMs) || timeMs < 0)
        throw new Error("Video playback is unavailable or the timestamp is invalid.");
      const connected = port;
      const connectedTabId = tabId;
      if (!connected || connectedTabId === null) throw new Error("Video playback is unavailable.");
      const active = await getCurrentTab();
      if (
        disposed ||
        port !== connected ||
        active?.id !== connectedTabId ||
        getWatchVideoId(active.url) !== videoId
      ) {
        if (!disposed && port === connected) closePort();
        throw new Error("The active video changed before seeking.");
      }
      const requestId = `seek-${++nextRequestId}`;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingSeeks.delete(requestId);
          reject(new Error("The video did not confirm the seek."));
        }, SEEK_TIMEOUT_MS);
        pendingSeeks.set(requestId, { resolve, reject, timer });
        try {
          connected.postMessage({ type: "seek", videoId, requestId, timeMs });
        } catch {
          closePort();
        }
      });
    },
    disconnect() {
      if (disposed) return;
      disposed = true;
      revision += 1;
      if (hasChrome) {
        chrome.tabs.onActivated.removeListener(onActivated);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
      closePort();
    },
  };
}
