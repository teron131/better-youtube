/** Subscribes an open caption panel to its real video and releases browser resources when closed. */

import { useCallback, useEffect, useRef, useState } from "react";

import type { VideoPlaybackState } from "../../core/videoPlayback.ts";
import { connectVideoPlayback, type VideoPlaybackConnection } from "../lib/video-playback.ts";

/** Enables native timing only while open; seek validates the active tab without starting playback. */
export function useVideoPlayback(videoId: string | null, enabled: boolean) {
  const [state, setState] = useState<VideoPlaybackState & { videoId: string | null }>({
    videoId: null,
    currentTimeMs: null,
    isAvailable: false,
  });
  const connectionRef = useRef<{ videoId: string; connection: VideoPlaybackConnection } | null>(
    null,
  );

  useEffect(() => {
    if (!videoId || !enabled) return;
    let active = true;
    const connection = connectVideoPlayback(videoId, (next) => {
      if (active) setState({ videoId, ...next });
    });
    connectionRef.current = { videoId, connection };
    return () => {
      active = false;
      connectionRef.current = null;
      connection.disconnect();
    };
  }, [videoId, enabled]);

  const seekTo = useCallback(
    async (timeMs: number): Promise<void> => {
      const current = connectionRef.current;
      if (!enabled || !videoId || current?.videoId !== videoId)
        throw new Error("Video playback is unavailable.");
      await current.connection.seekTo(timeMs);
    },
    [videoId, enabled],
  );
  const current =
    enabled && state.videoId === videoId && connectionRef.current?.videoId === videoId;
  return {
    currentTimeMs: current ? state.currentTimeMs : null,
    isAvailable: current && state.isAvailable,
    seekTo,
  };
}
