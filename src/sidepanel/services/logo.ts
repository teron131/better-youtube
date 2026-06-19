/** Shared bundled provider-logo resolution helpers for model options. */

const ARTIFICIAL_ANALYSIS_LOGO_URL = "https://artificialanalysis.ai/img/logos";
const BUNDLED_PROVIDER_LOGO_PATH = "provider-logos";

const PROVIDER_LOGO_ASSET_BY_PROVIDER: Record<string, string> = {
	ai2: "ai2.png",
	ai21: "ai21.png",
	alibaba: "alibaba.png",
	anthropic: "anthropic.png",
	"arcee-ai": "arcee-ai.png",
	aws: "aws.png",
	baidu: "baidu.png",
	bytedance: "bytedance.png",
	cohere: "cohere.png",
	deepseek: "deepseek.png",
	google: "google.png",
	ibm: "ibm.png",
	inception: "inception.png",
	inclusionai: "inclusionai.png",
	kimi: "kimi.png",
	"liquid-ai": "liquid-ai.png",
	meituan: "meituan.png",
	meta: "meta.png",
	microsoft: "microsoft.png",
	minimax: "minimax.png",
	mistral: "mistral.png",
	mistralai: "mistralai.png",
	moonshotai: "moonshotai.png",
	nvidia: "nvidia.png",
	openai: "openai.png",
	openrouter: "openrouter.png",
	perplexity: "perplexity.png",
	"prime-intellect": "prime-intellect.png",
	qwen: "qwen.png",
	stepfun: "stepfun.png",
	tencent: "tencent.png",
	upstage: "upstage.png",
	"x-ai": "x-ai.png",
	xiaomi: "xiaomi.png",
	"z-ai": "z-ai.png",
};

const PROVIDER_ALIAS_BY_PROVIDER: Record<string, string> = {
	allenai: "ai2",
	alibabacloud: "alibaba",
	"alibaba-cloud": "alibaba",
	amazon: "aws",
	arcee: "arcee-ai",
	"deep-seek": "deepseek",
	"ibm-granite": "ibm",
	liquid: "liquid-ai",
	"mini-max": "minimax",
	"meta-llama": "meta",
	"microsoft-azure": "microsoft",
	moonshot: "moonshotai",
	"moonshot-ai": "moonshotai",
	"open-ai": "openai",
	"perplexity-ai": "perplexity",
	qwenlm: "qwen",
	tongyi: "qwen",
	xai: "x-ai",
	zai: "z-ai",
};
const BUNDLED_PROVIDER_LOGO_ASSETS = new Set(
	Object.values(PROVIDER_LOGO_ASSET_BY_PROVIDER),
);

function nonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalizedValue = value.trim();
	return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeProvider(provider: string | null | undefined): string | null {
	const providerValue = nonEmptyString(provider);
	if (!providerValue) {
		return null;
	}
	const normalizedProvider = providerValue
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!normalizedProvider) {
		return null;
	}
	return PROVIDER_ALIAS_BY_PROVIDER[normalizedProvider] ?? normalizedProvider;
}

function toBundledProviderLogoUrl(
	asset: string | null | undefined,
): string | null {
	const assetValue = nonEmptyString(asset);
	if (!assetValue) {
		return null;
	}

	const bundledPath = `${BUNDLED_PROVIDER_LOGO_PATH}/${assetValue}`;
	if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
		return chrome.runtime.getURL(bundledPath);
	}

	return `${import.meta.env?.BASE_URL ?? "/"}${bundledPath}`;
}

function bundledLogoAssetFromUrl(
	logoUrl: string | null | undefined,
): string | null {
	const logoValue = nonEmptyString(logoUrl);
	if (!logoValue) {
		return null;
	}

	const [pathWithoutQuery] = logoValue.split(/[?#]/, 1);
	const assetName = pathWithoutQuery?.split("/").pop() ?? logoValue;
	return BUNDLED_PROVIDER_LOGO_ASSETS.has(assetName) ? assetName : null;
}

function toAbsoluteArtificialAnalysisLogoUrl(
	logoUrl: string | null | undefined,
): string | null {
	const logoValue = nonEmptyString(logoUrl);
	if (!logoValue) {
		return null;
	}
	if (logoValue.startsWith("http://") || logoValue.startsWith("https://")) {
		return logoValue;
	}
	if (logoValue.startsWith("/")) {
		return `https://artificialanalysis.ai${logoValue}`;
	}
	if (logoValue.includes("/")) {
		return `https://artificialanalysis.ai/${logoValue}`;
	}
	return `${ARTIFICIAL_ANALYSIS_LOGO_URL}/${logoValue}`;
}

function providerLogoAsset(provider: string | null): string | null {
	if (!provider) {
		return null;
	}
	return PROVIDER_LOGO_ASSET_BY_PROVIDER[provider] ?? null;
}

export function resolveModelLogo(options: {
	provider?: string | null;
	explicitLogo?: string | null;
}): string {
	const provider = normalizeProvider(options.provider);
	const explicitBundledAsset = bundledLogoAssetFromUrl(options.explicitLogo);
	return (
		toBundledProviderLogoUrl(explicitBundledAsset) ??
		toBundledProviderLogoUrl(providerLogoAsset(provider)) ??
		toAbsoluteArtificialAnalysisLogoUrl(options.explicitLogo) ??
		""
	);
}
