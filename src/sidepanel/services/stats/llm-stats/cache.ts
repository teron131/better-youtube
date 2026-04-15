/** Browser-safe cache helpers for selected LLM stats payloads. */

import {
	isFreshEpochSeconds,
	nowEpochSeconds,
	writeJsonFile,
} from "../../utils";
import type { ModelStatsSelectedPayload } from "./types";

const CACHE_KEY = "better_youtube_llm_stats_cache";
const CACHE_TTL_SECONDS = 60 * 60 * 24;

export const DEFAULT_OUTPUT_PATH = ".cache/llm_stats.json";

export function currentEpochSeconds(): number {
	return nowEpochSeconds();
}

export async function saveModelStatsSelectedToPath(
	payload: ModelStatsSelectedPayload,
	_outputPath = DEFAULT_OUTPUT_PATH,
): Promise<void> {
	try {
		if (typeof globalThis.localStorage !== "undefined") {
			globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
		}
		await writeJsonFile(DEFAULT_OUTPUT_PATH, payload);
	} catch {
		// Keep cache writes non-fatal in the sidepanel bundle.
	}
}

export async function loadModelStatsSelectedFromCache(
	_outputPath: string,
): Promise<ModelStatsSelectedPayload | null> {
	try {
		if (typeof globalThis.localStorage === "undefined") {
			return null;
		}
		const content = globalThis.localStorage.getItem(CACHE_KEY);
		if (!content) {
			return null;
		}
		const payload = JSON.parse(content) as ModelStatsSelectedPayload;
		if (!Array.isArray(payload.models)) {
			return null;
		}
		if (
			!isFreshEpochSeconds(payload.fetched_at_epoch_seconds, CACHE_TTL_SECONDS)
		) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}
