import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STATS_SERVICE_PATH = new URL(
	"../src/sidepanel/services/stats.ts",
	import.meta.url,
);

test("sidepanel model metadata does not import live model-atlas stages", async () => {
	const source = await readFile(STATS_SERVICE_PATH, "utf8");

	assert.match(source, /model-atlas:core-payload:v1/);
	assert.match(
		source,
		/https:\/\/llm-stats\.vercel\.app\/api\/llm-stats\?view=core/,
	);
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

function installLocalStorage() {
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
	return storedValues;
}

test("sidepanel model metadata reads model-atlas core API payload shape", async () => {
	const storedValues = installLocalStorage();
	const requestedUrls: string[] = [];
	globalThis.fetch = async (input) => {
		requestedUrls.push(String(input));
		return Response.json({
			schema: "model_atlas.core",
			fetched_at_epoch_seconds: Math.floor(Date.now() / 1000),
			score_scale: "percentage",
			methodology: "test",
			columns: [
				"id",
				"provider",
				"overall_score",
				"intelligence_score",
				"speed_score",
			],
			models: [
				{
					id: "openai/gpt-5.4-nano",
					provider: "openai",
					overall_score: 75,
					intelligence_score: 82,
					speed_score: 64,
				},
			],
		});
	};

	const statsModule = await import(
		`${STATS_SERVICE_PATH.href}?case=${Date.now()}`
	);
	const index = await statsModule.fetchLlmStatsModelMetadataIndex();

	assert.deepEqual(requestedUrls, [
		"https://llm-stats.vercel.app/api/llm-stats?view=core",
	]);
	assert.deepEqual(index.modelsById["openai/gpt-5.4-nano"], {
		intelligenceScore: 82,
		speedMetric: 64,
	});
	assert.ok(storedValues.has("model-atlas:core-payload:v1"));
});

test("sidepanel model metadata reads scores but ignores model-atlas logos", async () => {
	const storedValues = installLocalStorage();
	storedValues.set(
		"model-atlas:core-payload:v1",
		JSON.stringify({
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
		}),
	);
	globalThis.fetch = async () =>
		Response.json({
			fetched_at_epoch_seconds: null,
			models: [],
		}) as Promise<Response>;

	const statsModule = await import(
		`${STATS_SERVICE_PATH.href}?case=${Date.now()}`
	);
	const index = await statsModule.fetchLlmStatsModelMetadataIndex();

	assert.deepEqual(index.modelsById["openai/gpt-5.4-nano"], {
		intelligenceScore: 82,
		speedMetric: 64,
	});
});

test("sidepanel model metadata quietly falls back when optional score API fails", async () => {
	installLocalStorage();
	globalThis.fetch = async () => {
		throw new Error("offline");
	};
	const errors: unknown[] = [];
	const originalConsoleError = console.error;
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};

	try {
		const statsModule = await import(
			`${STATS_SERVICE_PATH.href}?case=${Date.now()}`
		);
		const index = await statsModule.fetchLlmStatsModelMetadataIndex();

		assert.deepEqual(index, { modelsById: {} });
		assert.deepEqual(errors, []);
	} finally {
		console.error = originalConsoleError;
	}
});
