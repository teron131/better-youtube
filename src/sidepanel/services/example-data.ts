/**
 * Example video summary data for demonstration and fallback purposes.
 */

import type { StreamingProcessingResult } from "@/core/types";

import { exampleSummaryGemini } from "./example-data-gemini";

export const exampleData: StreamingProcessingResult = {
	success: true,
	totalTime: "cached",
	videoInfo: {
		url: "https://youtu.be/MiUHjLxm3V0",
		title: "ASML and EUV Lithography",
		thumbnail: "https://img.youtube.com/vi/MiUHjLxm3V0/maxresdefault.jpg",
		author: "",
		duration: "",
		uploadDate: "",
		viewCount: 0,
		likeCount: 0,
	},
	transcript: null,
	summary: exampleSummaryGemini,
	quality: null,
	summaryText: null,
	qualityScore: 0,
	iterations: 1,
	chunksProcessed: 0,
};
