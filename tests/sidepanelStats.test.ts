import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STATS_SERVICE_PATH = new URL(
	"../src/sidepanel/services/stats.ts",
	import.meta.url,
);

test("sidepanel model metadata does not import live model-atlas stages", async () => {
	const source = await readFile(STATS_SERVICE_PATH, "utf8");

	assert.match(source, /model-atlas:selected-payload:v1/);
	assert.match(source, /https:\/\/llm-stats\.vercel\.app\/api\/llm-stats/);
	assert.doesNotMatch(source, /from "\.\/stats\//);
	assert.doesNotMatch(
		source,
		new RegExp(["get", "ModelStatsSelected"].join("")),
	);
	assert.doesNotMatch(
		source,
		new RegExp(["better", "youtube", "llm", "stats", "cache"].join("_")),
	);
});

test("sidepanel model metadata reads model-atlas API payload shape", async () => {
	const storedValues = new Map<string, string>();
	globalThis.localStorage = {
		getItem: (key: string) => storedValues.get(key) ?? null,
		setItem: (key: string, value: string) => {
			storedValues.set(key, value);
		},
		removeItem: (key: string) => {
			storedValues.delete(key);
		},
		clear: () => {
			storedValues.clear();
		},
		key: (index: number) => [...storedValues.keys()][index] ?? null,
		get length() {
			return storedValues.size;
		},
	} as Storage;
	globalThis.fetch = async () =>
		Response.json({
			fetched_at_epoch_seconds: Math.floor(Date.now() / 1000),
			models: [
				{
					id: "openai/gpt-5.4-nano",
					logo: "https://example.test/openai.png",
					relative_scores: {
						overall_score: 75,
						intelligence_score: 82,
						speed_score: 64,
					},
				},
			],
		}) as Promise<Response>;

	const statsModule = await import(
		`${STATS_SERVICE_PATH.href}?case=${Date.now()}`
	);
	const index = await statsModule.fetchLlmStatsModelMetadataIndex();

	assert.deepEqual(index.modelsById["openai/gpt-5.4-nano"], {
		intelligenceScore: 82,
		speedMetric: 64,
		logo: "https://example.test/openai.png",
		fallbackLogo: "https://example.test/openai.png",
	});
	assert.ok(storedValues.has("model-atlas:selected-payload:v1"));
});
