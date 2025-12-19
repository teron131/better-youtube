/**
 * Utility for loading example data with realistic progress states.
 */

import { exampleData } from '@ui/services/example-data';
import { StreamingProcessingResult, StreamingProgressState, VideoInfoResponse } from '@ui/services/types';

export interface ExampleDataResult {
  progressStates: StreamingProgressState[];
  videoInfo: VideoInfoResponse | null;
  transcript: string | null;
  analysisResult: StreamingProcessingResult;
}

/**
 * Load example data with realistic progress states
 */
export function loadExampleData(): ExampleDataResult {
  const qualityScore = exampleData.quality?.percentage_score || 100;
  const chapterCount = exampleData.analysis?.chapters?.length || 0;

  const exampleProgressStates: StreamingProgressState[] = [
    {
      step: 'scraping',
      stepName: "Scraping Video",
      status: "completed",
      message: `Video scraped: ${exampleData.videoInfo.title}`,
      processingTime: "0.1s",
    },
    {
      step: 'analysis_generation',
      stepName: "Analysis Generation",
      status: "completed",
      message: `📝 Initial analysis generated with ${chapterCount} chapters`,
      iterationCount: exampleData.iterationCount,
    },
    {
      step: 'quality_check',
      stepName: "Quality Assessment",
      status: "completed",
      message: exampleData.quality?.percentage_score
        ? `🎯 Quality check passed with ${qualityScore}% score - Analysis meets requirements`
        : `🎯 Quality check passed - Analysis meets requirements`,
      qualityScore,
    },
    {
      step: 'complete',
      stepName: "Analysis Complete",
      status: "completed",
      message: exampleData.quality?.percentage_score
        ? `✅ Analysis completed successfully with ${qualityScore}% quality score`
        : `✅ Analysis completed successfully`,
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
    analysisResult: exampleData,
  };
}

