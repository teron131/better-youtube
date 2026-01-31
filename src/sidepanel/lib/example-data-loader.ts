/**
 * Utility for loading example data with realistic progress states.
 */

import { exampleData } from "@ui/services/example-data";
import {
  StreamingProcessingResult,
  StreamingProgressState,
  VideoInfoResponse,
} from "@/core/types";

export interface ExampleDataResult {
  progressStates: StreamingProgressState[];
  videoInfo: VideoInfoResponse | null;
  transcript: string | null;
  summaryResult: StreamingProcessingResult;
}

/**
 * Load example data with realistic progress states
 */
export function loadExampleData(): ExampleDataResult {
  const qualityScore = exampleData.qualityScore || 0;
  const chapterCount = exampleData.summary?.chapters?.length || 0;

  const exampleProgressStates: StreamingProgressState[] = [
    {
      step: "scraping",
      stepName: "Scraping Video",
      status: "completed",
      message: `Video scraped: ${exampleData.videoInfo.title}`,
      processingTime: "0.1s",
    },
    {
      step: "summary_generation",
      stepName: "Summary Generation",
      status: "completed",
      message: `📝 Initial summary generated with ${chapterCount} chapters`,
      iterationCount: exampleData.iterationCount,
    },
    {
      step: "quality_check",
      stepName: "Quality Assessment",
      status: "completed",
      message: "🎯 Quality check skipped (Gemini-native example)",
      qualityScore,
    },
    {
      step: "complete",
      stepName: "Summary Complete",
      status: "completed",
      message: `✅ Summary completed successfully`,
      processingTime: exampleData.totalTime,
      chunkCount: exampleData.chunksProcessed,
      iterationCount: exampleData.iterationCount,
      qualityScore,
    },
  ];

  return {
    progressStates: exampleProgressStates,
    videoInfo: exampleData.videoInfo || null,
    transcript: exampleData.transcript || null,
    summaryResult: exampleData,
  };
}
