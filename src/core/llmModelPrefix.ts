/** LLM model ID prefix formatting helpers. */

export type LlmModelPrefixMode = "provider" | "none";

function modelWithoutProviderPrefix(model: string): string {
  const trimmedModel = model.trim();
  const slashIndex = trimmedModel.indexOf("/");
  if (slashIndex <= 0 || slashIndex === trimmedModel.length - 1) {
    return trimmedModel;
  }
  return trimmedModel.slice(slashIndex + 1);
}

export function resolveLlmRequestModel(model: string, prefixMode: LlmModelPrefixMode): string {
  const trimmedModel = model.trim();
  if (prefixMode === "provider") return trimmedModel;
  return modelWithoutProviderPrefix(trimmedModel);
}
