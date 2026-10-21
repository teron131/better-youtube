/** Sizes a caption job for workload logs before any model call, using the refiner's own chunk size. */

import { REFINER_CONFIG } from "../constants.ts";
import type { SubtitleSegment } from "../storage.ts";

export interface RefinerWorkloadStats {
  segmentCount: number;
  chunkCount: number;
}

export function getRefinerWorkloadStats(segments: SubtitleSegment[]): RefinerWorkloadStats {
  return {
    segmentCount: segments.length,
    chunkCount: Math.ceil(segments.length / REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK),
  };
}
