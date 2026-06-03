/** Browser-safe logo cache helpers for copied llm-stats modules. */

export async function cacheStatsLogo(source: string): Promise<string> {
	return source;
}

export async function cacheStatsLogos<
	TModel extends {
		logo: string;
	},
>(models: TModel[]): Promise<TModel[]> {
	return models;
}
