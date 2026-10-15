/** Publishes video timing only to connected caption panels and seeks without changing playback state. */

import { YOUTUBE } from "../core/constants.ts";
import { getWatchVideoId } from "../core/utils/url.ts";
import {
  VIDEO_HISTORY_CHANGE_EVENT,
  VIDEO_PLAYBACK_PORT,
  type VideoPlaybackRequest,
  type VideoPlaybackResponse,
} from "../core/videoPlayback.ts";

const VIDEO_EVENTS = [
  "timeupdate",
  "seeked",
  "seeking",
  "durationchange",
  "emptied",
  "play",
  "pause",
] as const;
const PAGE_EVENTS = ["yt-navigate-finish", "yt-page-data-updated"] as const;
const WINDOW_EVENTS = ["popstate", "hashchange", VIDEO_HISTORY_CHANGE_EVENT] as const;

/** Installs the content entry point; video and navigation listeners belong only to live panel ports. */
export function setupVideoPlayback(): void {
  chrome.runtime.onConnect.addListener(attachVideoPlaybackPort);
}

/** Owns one panel subscription; a changed watch identity closes it before another seek can run. */
export function attachVideoPlaybackPort(port: chrome.runtime.Port): void {
  if (port.name !== VIDEO_PLAYBACK_PORT) return;

  let videoId: string | null = null;
  let video: HTMLVideoElement | null = null;
  let closed = false;

  const dispose = (disconnect = false) => {
    if (closed) return;
    closed = true;
    for (const event of VIDEO_EVENTS) video?.removeEventListener(event, publishPosition);
    document.removeEventListener("loadedmetadata", publishPosition, true);
    for (const event of PAGE_EVENTS) document.removeEventListener(event, publishPosition);
    for (const event of WINDOW_EVENTS) window.removeEventListener(event, publishPosition);
    window.removeEventListener("pagehide", onPageHide);
    port.onMessage.removeListener(onMessage);
    port.onDisconnect.removeListener(onDisconnect);
    if (disconnect) port.disconnect();
  };

  const send = (message: VideoPlaybackResponse) => {
    if (closed) return;
    try {
      port.postMessage(message);
    } catch {
      dispose(true);
    }
  };

  const isCurrentVideo = () => {
    if (videoId && getWatchVideoId(window.location.href) === videoId) return true;
    if (videoId) send({ type: "position", videoId, available: false, currentTimeMs: null });
    dispose(true);
    return false;
  };

  const bindCurrentVideo = () => {
    const current = document.querySelector<HTMLVideoElement>(YOUTUBE.SELECTORS.VIDEO_PLAYER);
    if (current === video) return;
    for (const event of VIDEO_EVENTS) video?.removeEventListener(event, publishPosition);
    video = current;
    for (const event of VIDEO_EVENTS) video?.addEventListener(event, publishPosition);
  };

  function publishPosition(): void {
    if (closed || !isCurrentVideo()) return;
    bindCurrentVideo();
    const available = !!video && Number.isFinite(video.currentTime) && video.currentTime >= 0;
    send({
      type: "position",
      videoId: videoId!,
      available,
      currentTimeMs: available ? video!.currentTime * 1000 : null,
    });
  }

  function onMessage(message: VideoPlaybackRequest): void {
    if (closed || !message || typeof message.videoId !== "string") return;
    if (message.type === "subscribe") {
      if (videoId) return;
      videoId = message.videoId;
      if (!isCurrentVideo()) return;
      document.addEventListener("loadedmetadata", publishPosition, true);
      for (const event of PAGE_EVENTS) document.addEventListener(event, publishPosition);
      for (const event of WINDOW_EVENTS) window.addEventListener(event, publishPosition);
      window.addEventListener("pagehide", onPageHide);
      publishPosition();
      return;
    }
    if (message.type !== "seek" || typeof message.requestId !== "string") return;
    if (message.videoId !== videoId || !isCurrentVideo()) {
      send({
        type: "seek-result",
        videoId: message.videoId,
        requestId: message.requestId,
        ok: false,
        error: "The active video changed.",
      });
      return;
    }
    bindCurrentVideo();
    if (!video || !Number.isFinite(message.timeMs) || message.timeMs < 0) {
      send({
        type: "seek-result",
        videoId: videoId!,
        requestId: message.requestId,
        ok: false,
        error: "Video playback is unavailable or the timestamp is invalid.",
      });
      return;
    }
    try {
      const durationMs = Number.isFinite(video.duration)
        ? Math.max(0, video.duration * 1000)
        : Infinity;
      video.currentTime = Math.min(message.timeMs, durationMs) / 1000;
      send({ type: "seek-result", videoId: videoId!, requestId: message.requestId, ok: true });
      publishPosition();
    } catch (error) {
      send({
        type: "seek-result",
        videoId: videoId!,
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Unable to seek this video.",
      });
    }
  }

  function onDisconnect(): void {
    dispose();
  }
  function onPageHide(): void {
    dispose(true);
  }

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);
}
