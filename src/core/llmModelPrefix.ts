/** LLM model ID prefix formatting helpers. */

export type LlmModelPrefixMode = "provider" | "none" | "custom";

function modelWithoutProviderPrefix(model: string): string {
	const trimmedModel = model.trim();
	const slashIndex = trimmedModel.indexOf("/");
	if (slashIndex <= 0 || slashIndex === trimmedModel.length - 1) {
		return trimmedModel;
	}
	return trimmedModel.slice(slashIndex + 1);
}

function normalizeModelPrefix(prefix: string | null): string | null {
	const trimmedPrefix = prefix?.trim().replace(/^\/+|\/+$/g, "");
	return trimmedPrefix || null;
}

export function resolveLlmRequestModel(
	model: string,
	prefixMode: LlmModelPrefixMode,
	customPrefix: string | null,
): string {
	const trimmedModel = model.trim();
	if (prefixMode === "provider") return trimmedModel;

	const unprefixedModel = modelWithoutProviderPrefix(trimmedModel);
	if (prefixMode === "none") return unprefixedModel;

	const prefix = normalizeModelPrefix(customPrefix);
	return prefix ? `${prefix}/${unprefixedModel}` : unprefixedModel;
}
