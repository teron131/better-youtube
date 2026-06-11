/** Browser-safe logo cache helpers for stats metadata. */

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
