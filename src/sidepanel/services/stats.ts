/**
 * Model Statistics and Logo Service
 * Fetches model metadata and logos from remote sources
 */

const MODELS_DEV_URL = "https://models.dev/api.json";

export interface ModelStat {
    id: string;
    name: string;
    provider: string;
    logo: string;
    fallbackLogo: string;
}

export async function fetchModelStats(): Promise<Record<string, ModelStat>> {
    try {
        const response = await fetch(MODELS_DEV_URL);
        if (!response.ok) throw new Error("Failed to fetch model stats");

        const data = await response.json();
        const stats: Record<string, ModelStat> = {};

        for (const [providerId, provider] of Object.entries(data)) {
            const p = provider as any;
            const models = p.models || {};

            // Derive IDs for logo construction
            const cleanProviderId = providerId.toLowerCase();
            const aaId = cleanProviderId.replace(/[^a-z0-9]/g, ""); // x-ai -> xai

            for (const [modelId, model] of Object.entries(models)) {
                const m = model as any;
                const fullId = `${providerId}/${m.id || modelId}`;

                // Use logos from the API if available, otherwise construct them
                // The stats API should cater for these, but we provide robust fallbacks
                const primaryLogo =
                    m.logo ||
                    m.artificial_analysis?.model_creator?.logo_small_url ||
                    `https://artificialanalysis.ai/img/logos/${aaId}_small.svg`;

                const fallbackLogo =
                    m.fallback_logo ||
                    `https://models.dev/logos/${cleanProviderId}.svg`;

                stats[fullId] = {
                    id: fullId,
                    name: m.name || modelId,
                    provider: providerId,
                    logo: primaryLogo,
                    fallbackLogo: fallbackLogo,
                };
            }
        }

        return stats;
    } catch (error) {
        console.error("Error fetching model stats:", error);
        return {};
    }
}
