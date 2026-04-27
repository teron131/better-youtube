/**
 * Caption Refiner using LangChain
 * Refines YouTube transcript segments using LLM batch processing
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DEFAULTS, REFINER_CONFIG } from "@/core/constants";
import { createLlmClient } from "@/core/llmClients";
import type { SubtitleSegment } from "@/core/storage";
import {
	chunkSegmentsByCount,
	parseRefinedSegments,
} from "@/core/transcript/segmentParser";
import { formatTimestamp } from "@/core/utils/date";

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_PROMPT = `Correct the segments of a YouTube video transcript. These segments could be from anywhere in the video (beginning, middle, or end). Use the video title and description for context.

CRITICAL CONSTRAINTS:
- Only fix typos and grammar. Do NOT change meaning or structure.
- PRESERVE ALL NEWLINES: each line is a distinct transcript segment.
- Do NOT add, remove, or merge lines. Keep the same number of lines.
- MAINTAIN SIMILAR LINE LENGTHS: Each output line should be approximately the same character count as its corresponding input line (±10% tolerance). Do NOT expand short lines into long paragraphs. Do NOT condense long lines significantly. Keep each line concise.
- If a sentence is broken across lines, keep it broken the same way.
- PRESERVE THE ORIGINAL LANGUAGE: output must be in the same language as the input transcript.
- Focus on minimal corrections: fix typos, correct grammar errors, but keep expansions/additions to an absolute minimum.

EXAMPLES OF CORRECT BEHAVIOR:
up to 900. From 900 up to 1,100. -> up to $900. From $900 up to $1,100.
If you sold at the reasonable -> If you sold at the reasonable
valuations, when the gains that already -> valuations, when the gains that already
been had, you missed out big time. I -> had been had, you missed out big time. I`;

const RefinedTranscriptSchema = z.object({
	transcript: z
		.string()
		.describe(
			"Corrected transcript lines as one newline-delimited string. No commentary or labels.",
		),
});

type RefinedTranscriptResponse = z.infer<typeof RefinedTranscriptSchema>;

const MAX_BATCH_RETRIES = 3;
const TRANSCRIPT_LABEL_PATTERN =
	/^(?:here(?:'| i)?s(?: the)?|(?:corrected|refined)\s+)?transcript:?$/i;

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeSegmentText(text: string): string {
	return (text || "").split(/\s+/).join(" ");
}

function formatTranscriptSegments(segments: SubtitleSegment[]): string {
	return segments
		.map((seg) => {
			const normalizedText = normalizeSegmentText(seg.text);
			const timestamp = seg.startTimeText || formatTimestamp(seg.startTime);
			return `[${timestamp}] ${normalizedText}`;
		})
		.join("\n");
}

function buildUserPreamble(
	title: string,
	description: string,
	lineCount: number,
): string {
	return [
		`Video Title: ${title || ""}`,
		`Video Description: ${description || ""}`,
		"",
		`Required transcript line count: ${lineCount}`,
		"Return only the JSON object.",
		"The transcript string must have exactly this many non-empty newline-separated lines.",
		"",
		"Transcript Chunk:",
	].join("\n");
}

function extractResponseText(response: unknown): string {
	const transcript = (response as Partial<RefinedTranscriptResponse> | null)
		?.transcript;
	if (typeof transcript === "string") return transcript;

	const content = (response as any)?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part === "string" ? part : part?.text || ""))
			.join("");
	}
	return content != null ? String(content) : "";
}

function normalizeRefinedOutputLines(text: string): string[] {
	return text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith("```"))
		.filter((line) => !TRANSCRIPT_LABEL_PATTERN.test(line));
}

function isTransientBatchError(error: unknown): boolean {
	const message = String(error);
	return message.includes("401") || message.includes("429");
}

/**
 * Custom concurrency handler for batch processing with retries
 */
async function runConcurrentBatch<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
	onEachComplete?: (
		result: R | null,
		index: number,
		allResults: (R | null)[],
	) => void,
): Promise<(R | null)[]> {
	const results: (R | null)[] = new Array(items.length).fill(null);
	const queue = items.map((item, index) => ({ item, index }));

	const workers = Array.from({
		length: Math.min(concurrency, items.length),
	}).map(async () => {
		while (queue.length > 0) {
			const { item, index } = queue.shift()!;
			let lastError: unknown = null;
			let success = false;

			for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
				try {
					const result = await fn(item, index);
					results[index] = result;
					onEachComplete?.(result, index, results);
					success = true;
					break;
				} catch (error) {
					lastError = error;
					if (isTransientBatchError(error) && attempt < MAX_BATCH_RETRIES - 1) {
						await new Promise((resolve) =>
							setTimeout(resolve, 1000 * (attempt + 1)),
						);
					}
				}
			}

			if (!success) {
				console.error(
					`Failed to process batch item ${index} after ${MAX_BATCH_RETRIES} attempts:`,
					lastError,
				);
				onEachComplete?.(null, index, results);
			}
		}
	});

	await Promise.all(workers);
	return results;
}

// ============================================================================
// Main Refinement Logic
// ============================================================================

interface PriorityWindow {
	splitIndex: number;
	priorityRangeCount: number;
}

interface SegmentChunk {
	segments: SubtitleSegment[];
}

/**
 * Calculate the priority window for early subtitle delivery
 * Returns the index where priority ends and how many chunks it spans
 */
function calculatePriorityWindow(
	segments: SubtitleSegment[],
	maxSegmentsPerChunk: number,
): PriorityWindow {
	const durationMs = segments[segments.length - 1].endTime;
	const PRIORITY_DURATION_MS = Math.min(5 * 60 * 1000, 0.5 * durationMs);

	let splitIndex = segments.findIndex((s) => s.endTime > PRIORITY_DURATION_MS);
	if (splitIndex === -1) splitIndex = segments.length;

	const priorityRangeCount = Math.ceil(splitIndex / maxSegmentsPerChunk);
	return { splitIndex, priorityRangeCount };
}

/**
 * Validate and extract refined text from response with line count checking
 */
function validateAndExtractChunk(
	response: unknown,
	chunkIndex: number,
	originalChunk: SubtitleSegment[],
): string {
	const text = extractResponseText(response).trim();
	const normalizedLines = normalizeRefinedOutputLines(text);

	if (!normalizedLines.length) {
		console.warn(
			`Chunk ${chunkIndex + 1} returned no usable refined lines. Falling back to the original chunk.`,
		);
		return formatTranscriptSegments(originalChunk);
	}

	if (normalizedLines.length !== originalChunk.length) {
		console.warn(
			`Line count mismatch in chunk ${chunkIndex + 1}: expected ${originalChunk.length}, got ${normalizedLines.length}. Using segment alignment fallback.`,
		);
	}

	return normalizedLines.join("\n");
}

function parseChunkResponses(
	chunks: SegmentChunk[],
	responses: (unknown | null)[],
	segments: SubtitleSegment[],
): SubtitleSegment[] {
	const refinedText = responses
		.map((response, chunkIdx) =>
			validateAndExtractChunk(response, chunkIdx, chunks[chunkIdx].segments),
		)
		.join(`\n${REFINER_CONFIG.CHUNK_SENTINEL}\n`);

	return parseRefinedSegments(
		refinedText,
		segments,
		REFINER_CONFIG.CHUNK_SENTINEL,
		REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK,
	);
}

/**
 * Create a handler for priority chunk completion
 * Calls the callback once all priority chunks are processed
 */
function createPriorityHandler(
	priorityRangeCount: number,
	splitIndex: number,
	chunks: SegmentChunk[],
	onPriorityComplete?: (segments: SubtitleSegment[]) => void,
): (result: unknown, index: number, allResults: (unknown | null)[]) => void {
	let completedPriorityChunks = 0;
	let priorityReported = false;

	return (_result, index, allResults) => {
		if (index < priorityRangeCount) completedPriorityChunks++;

		if (
			!onPriorityComplete ||
			priorityReported ||
			completedPriorityChunks !== priorityRangeCount
		) {
			return;
		}

		priorityReported = true;
		const priorityChunks = chunks.slice(0, priorityRangeCount);
		const prioritySegments = priorityChunks.flatMap((chunk) => chunk.segments);

		onPriorityComplete(
			parseChunkResponses(
				priorityChunks,
				allResults.slice(0, priorityRangeCount),
				prioritySegments,
			).slice(0, splitIndex),
		);
	};
}

/**
 * Refine video transcript using LLM inference
 */
export async function refineTranscriptWithLLM(
	segments: SubtitleSegment[],
	title: string,
	description: string,
	onProgress?: (chunkIdx: number, totalChunks: number) => void,
	model: string = DEFAULTS.MODEL_REFINER,
	onPriorityComplete?: (prioritySegments: SubtitleSegment[]) => void,
): Promise<SubtitleSegment[]> {
	if (!segments.length) return [];

	const llm = await createLlmClient(model, "Better YouTube - Refiner");
	const structuredLlm = llm.withStructuredOutput(RefinedTranscriptSchema, {
		method: "jsonMode",
	});
	const { splitIndex, priorityRangeCount } = calculatePriorityWindow(
		segments,
		REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK,
	);

	const chunks = chunkSegmentsByCount(
		segments,
		REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK,
	).map((range) => ({
		segments: segments.slice(range[0], range[1]),
	}));
	const batchMessages = chunks.map((chunk) => [
		new SystemMessage({ content: SYSTEM_PROMPT }),
		new HumanMessage({
			content: [
				buildUserPreamble(title, description, chunk.segments.length),
				formatTranscriptSegments(chunk.segments),
			].join("\n"),
		}),
	]);

	onProgress?.(0, batchMessages.length);

	const priorityHandler = createPriorityHandler(
		priorityRangeCount,
		splitIndex,
		chunks,
		onPriorityComplete,
	);

	const responses = await runConcurrentBatch(
		batchMessages,
		REFINER_CONFIG.CONCURRENCY_LIMIT,
		async (messages) => {
			return await structuredLlm.invoke(messages);
		},
		(result, idx, allResults) => {
			onProgress?.(idx + 1, batchMessages.length);
			priorityHandler(result, idx, allResults);
		},
	);

	return parseChunkResponses(chunks, responses, segments);
}
