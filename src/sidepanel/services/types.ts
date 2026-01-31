/**
 * Sidepanel service types are re-exported from core to keep a single source of truth.
 */

export type {
  ApiError,
  Chapter,
  ConfigurationResponse,
  HealthCheckResponse,
  QualityData,
  QualityRate,
  ScrapRequest,
  ScrapResponse,
  Summary,
  StreamingChunk,
  StreamingProcessingResult,
  StreamingProgressState,
  SummarizeRequest,
  SummarizeResponse,
  VideoInfoResponse,
} from "@/core/types";
