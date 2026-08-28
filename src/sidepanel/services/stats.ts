/** Expose extension-owned aggregate model scores through the small selector metadata contract. */

import type { AvailableModel } from "./config.ts";
import { fetchAggregateStats } from "./model-stats/aggregate.ts";
import { normalizeOpenRouterModelId } from "./model-stats/openrouter.ts";

export type ModelScoreMetadata = Pick<AvailableModel, "intelligenceScore" | "speedMetric">;

export type ModelScoreMetadataIndex = {
  modelsById: Record<string, ModelScoreMetadata>;
};

const MIN_REQUIRED_RELATIVE_SCORE = 10;

/** Build selector metadata from the complete aggregate scoring pipeline and quietly degrade on source failure. */
export async function fetchModelScoreMetadataIndex(
  modelIds: readonly string[],
): Promise<ModelScoreMetadataIndex> {
  try {
    const scoredModels = (await fetchAggregateStats(modelIds)).filter((model) =>
      [model.intelligenceScore, model.speedScore].some(
        (score) => score != null && score >= MIN_REQUIRED_RELATIVE_SCORE,
      ),
    );
    return {
      modelsById: Object.fromEntries(
        scoredModels.map((model) => [
          normalizeOpenRouterModelId(model.id),
          {
            intelligenceScore: model.intelligenceScore ?? null,
            speedMetric: model.speedScore ?? null,
          },
        ]),
      ),
    };
  } catch {
    return { modelsById: {} };
  }
}

export { normalizeOpenRouterModelId };
