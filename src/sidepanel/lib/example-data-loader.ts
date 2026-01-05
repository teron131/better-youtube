/**
 * Utility for loading example data with realistic progress states.
 */

import { exampleData } from '@ui/services/example-data';
import { StreamingProcessingResult, StreamingProgressState, VideoInfoResponse } from '@ui/services/types';

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
  const qualityScore = exampleData.quality?.percentage_score || 100;
  const chapterCount = exampleData.summary?.chapters?.length || 0;

  const exampleProgressStates: StreamingProgressState[] = [
    {
      step: 'scraping',
      stepName: "Scraping Video",
      status: "completed",
      message: `Video scraped: ${exampleData.videoInfo.title}`,
      processingTime: "0.1s",
    },
    {
      step: 'summary_generation',
      stepName: "Summary Generation",
      status: "completed",
      message: `📝 Initial summary generated with ${chapterCount} chapters`,
      iterationCount: exampleData.iterationCount,
    },
    {
      step: 'quality_check',
      stepName: "Quality Assessment",
      status: "completed",
      message: exampleData.quality?.percentage_score
        ? `🎯 Quality check passed with ${qualityScore}% score - Summary meets requirements`
        : `🎯 Quality check passed - Summary meets requirements`,
      qualityScore,
    },
    {
      step: 'complete',
      stepName: "Summary Complete",
      status: "completed",
      message: exampleData.quality?.percentage_score
        ? `✅ Summary completed successfully with ${qualityScore}% quality score`
        : `✅ Summary completed successfully`,
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

