/**
 * Fast summary path (agent-based) for LLM.
 */

import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DEFAULTS } from "@/core/constants";
import {
	createAgent,
	createMiddleware,
	toolStrategy,
} from "@/core/langgraph-web-shim";
import { createLlmClient } from "@/core/llmClients";
import { fetchTranscript, getTranscriptText } from "@/core/transcript";
import {
	filterContent,
	GarbageIdentificationSchema,
	tagContent,
	untagContent,
} from "@/core/transcript/lineTag";
import { extractVideoId } from "@/core/utils/url";
import { PromptBuilder } from "./promptBuilder";
import { SUMMARY_CONFIG } from "./qualityUtils";
import type { SummarizerOutput, Summary } from "./schemas";
import { SummarySchemaNoTimestamps } from "./schemas";
import type { SummarizationInput } from "./summarizer";

const isYoutubeUrl = (input: string) =>
	input.includes("youtube.com/watch") || input.includes("youtu.be/");

function summaryToMarkdown(summary: Summary): string {
	const parts: string[] = [];
	if (summary.overview) {
		parts.push("## Summary\n\n", summary.overview, "\n");
	}

	if (summary.chapters && summary.chapters.length > 0) {
		parts.push("## Chapters\n\n");
		summary.chapters.forEach((chapter, index) => {
			parts.push(`### ${index + 1}. ${chapter.title}\n\n`);
			parts.push(`${chapter.description}\n\n`);
		});
	}

	return parts.join("");
}

/**
 * Functional scrape_youtube_tool factory
 */
function createScrapeYoutubeTool(input: SummarizationInput) {
	return tool(
		async ({ youtube_url }) => {
			const { transcript_or_url, videoId } = input;

			if (
				!isYoutubeUrl(transcript_or_url) &&
				(!videoId || youtube_url.includes(videoId))
			) {
				return transcript_or_url;
			}

			const resolvedVideoId = videoId ?? extractVideoId(youtube_url);
			if (!resolvedVideoId) return "Error: Could not extract video id.";

			const data = await fetchTranscript(resolvedVideoId);
			if (!data) return "Error: No transcript available for this video.";

			const transcriptOnlyText =
				typeof data.transcript_only_text === "string"
					? data.transcript_only_text
					: "";
			const transcript =
				transcriptOnlyText || getTranscriptText(data.transcript ?? []);

			return transcript.trim() || "Error: No transcript found for this video.";
		},
		{
			name: "scrape_youtube_tool",
			description: "Scrape a YouTube video and return the transcript.",
			schema: z.object({
				youtube_url: z.string().describe("The YouTube video URL to scrape"),
			}),
		},
	);
}

const GARBAGE_FILTER_PROMPT =
	"Identify and remove garbage sections such as promotional and meaningless content like cliche intros, outros, filler, sponsorships, and other irrelevant segments. The transcript has line tags like [L1], [L2], etc. Return the ranges of tags that should be removed.";

function createGarbageFilterMiddleware(model: string) {
	return createMiddleware({
		name: "garbageFilterMiddleware",
		wrapToolCall: async (request, handler) => {
			if (
				(request.tool?.name ?? request.toolCall.name) !== "scrape_youtube_tool"
			)
				return handler(request);

			const result = await handler(request);
			if (!ToolMessage.isInstance(result) || result.status === "error")
				return result;

			const transcript =
				typeof result.content === "string" ? result.content : "";
			if (!transcript.trim() || transcript.startsWith("Error")) return result;

			try {
				const taggedTranscript = tagContent(transcript);
				const garbage = await (
					await createLlmClient(model, "Better YouTube - Filter")
				)
					.withStructuredOutput(GarbageIdentificationSchema, {
						method: "jsonMode",
					})
					.invoke([
						["system", GARBAGE_FILTER_PROMPT],
						["human", taggedTranscript],
					]);

				if (garbage.garbage_ranges?.length) {
					result.content = untagContent(
						filterContent(taggedTranscript, garbage.garbage_ranges),
					);
					console.log(
						`Middleware removed ${garbage.garbage_ranges.length} garbage sections.`,
					);
				}
			} catch (error) {
				console.warn(
					"Garbage filter middleware failed, using raw transcript.",
					error,
				);
			}

			return result;
		},
	});
}

export async function summarizeFast(
	input: SummarizationInput,
	onProgress?: (message: string) => void,
): Promise<SummarizerOutput> {
	const isUrl = isYoutubeUrl(input.transcript_or_url);
	onProgress?.(
		`Generating summary in Fast Mode (Agent) from ${isUrl ? "URL" : "Transcript"}.`,
	);

	const model = input.summaryModel ?? SUMMARY_CONFIG.MODEL;
	const targetLanguage = input.targetLanguage ?? "auto";

	const agent = createAgent({
		model: await createLlmClient(model, "Better YouTube - Summarizer"),
		tools: isUrl ? [createScrapeYoutubeTool(input)] : [],
		systemPrompt: PromptBuilder.getLlmSummaryPrompt(
			targetLanguage,
			input.title,
			input.description,
		),
		responseFormat: toolStrategy(SummarySchemaNoTimestamps),
		middleware: isUrl
			? [
					createGarbageFilterMiddleware(
						input.refinerModel ?? DEFAULTS.MODEL_REFINER,
					),
				]
			: [],
	});

	const response = await agent.invoke({
		messages: [
			new HumanMessage(
				isUrl
					? `Summarize the video at: ${input.transcript_or_url}`
					: `Summarize this transcript:\n\n${input.transcript_or_url}`,
			),
		],
	});

	if (!response.structuredResponse)
		throw new Error("Agent did not return structured response");

	const summary = response.structuredResponse as Summary;
	onProgress?.("Fast summary completed");

	return {
		summary,
		quality: null,
		iterations: 1,
		qualityScore: 0,
		summaryText: summaryToMarkdown(summary),
	};
}
