import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import "dotenv/config";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Set GOOGLE_API_KEY or GEMINI_API_KEY (or put it in .env)");
    process.exit(1);
}

const VideoAnalysis = z
    .object({
        chapters: z
            .array(
                z.object({
                    startTime: z
                        .string()
                        .describe(
                            "Chapter start timestamp in the format MM:SS so the section can be referenced precisely.",
                        )
                        .optional(),
                    endTime: z
                        .string()
                        .describe(
                            "Chapter end timestamp matching the same format as startTime.",
                        )
                        .optional(),
                    title: z
                        .string()
                        .describe(
                            "A concise heading summarizing the chapter's main topic.",
                        ),
                    description: z
                        .string()
                        .describe(
                            "A detailed chapter description capturing key viewpoints, claims, and concrete facts mentioned (include important numbers/names/steps when present). Avoid meta-language like 'the video', 'the author', 'the speaker says'—state the content directly.",
                        ),
                }),
            )
            .min(1)
            .describe(
                "Chronological, non-ad chapters that capture the video's core scenes.",
            ),
        overallSummary: z
            .string()
            .describe(
                "An overall summary covering the full video end-to-end, written without meta-language and capturing the main thesis and arc.",
            ),
    })
    .describe(
        "A multimodal summary describing chapter structure, visuals, and transcripts.",
    );

const client = new GoogleGenAI({ apiKey });

const model = "gemini-3-flash-preview";
const videoUrl = "https://youtu.be/MiUHjLxm3V0";
const prompt = `
1) Watch/analyze the video in chronological order.
2) Build the chapter list in the same chronological order (merge adjacent segments when needed).
3) Write overallSummary AFTER chapters, based on the chapter sequence (end-to-end arc + main thesis).

Requirements:
- Output fields:
  - chapters
  - overallSummary
- Chapters:
  - Must be chronological and non-overlapping.
  - Each chapter must have a clear title and a substantive description with key viewpoints/arguments and concrete facts (numbers/names/steps when present).
  - If unsure about timestamps, you may omit startTime/endTime.
- Overall summary:
  - Summarize the whole video end-to-end using direct statements.
  - Avoid meta-language like "the video..." / "the author..." / "the speaker...".

STRICT FILTERING:
- NEVER include sponsor/advertisement/promotion sections as chapters.
- If a segment contains sponsorship language (e.g., sponsor, ad, promotion, "brought to you by", "thanks to", discount codes, affiliate links, subscribe/like CTAs), OMIT it entirely and stitch the surrounding content together.
- Do not output chapters with empty or near-empty titles/descriptions; merge with adjacent chapters instead.
- When unsure whether a segment is sponsored/promotional, exclude it.

Language: Traditional Chinese if the video is in Chinese, otherwise English.
`;

const USD_PER_M_TOKENS_BY_MODEL = {
    "gemini-3-flash-preview": { input: 0.5, output: 3 },
    "gemini-3-pro-preview": { input: 2, output: 12 },
};

function getUsdPerMTokensPricing(modelName) {
    return USD_PER_M_TOKENS_BY_MODEL[modelName] ?? null;
}

const usdPerMTokens = getUsdPerMTokensPricing(model);

async function analyzeVideoUrl(url) {
    try {
        const response = await client.models.generateContent({
            model,
            contents: [{ fileData: { fileUri: url } }, { text: prompt }],
            config: {
                httpOptions: { timeout: 10 * 60 * 1000 },
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                responseMimeType: "application/json",
                responseJsonSchema: zodToJsonSchema(VideoAnalysis),
            },
        });

        const raw = response.text;
        if (!raw) return null;

        const parsed = VideoAnalysis.parse(JSON.parse(raw));

        const usageMetadata = response.usageMetadata;
        if (usageMetadata) {
            console.log("usageMetadata", usageMetadata);

            const promptTokens = usageMetadata.promptTokenCount;
            const totalTokens = usageMetadata.totalTokenCount;

            if (
                usdPerMTokens &&
                typeof promptTokens === "number" &&
                typeof totalTokens === "number"
            ) {
                const outputBilledTokens = Math.max(
                    0,
                    totalTokens - promptTokens,
                );
                const estimatedUsd =
                    (promptTokens / 1_000_000) * usdPerMTokens.input +
                    (outputBilledTokens / 1_000_000) * usdPerMTokens.output;

                console.log("estimatedCost", {
                    currency: "USD",
                    model,
                    pricingUsdPerMTokens: usdPerMTokens,
                    promptTokens,
                    outputBilledTokens,
                    estimatedUsd,
                });
            }
        }

        return parsed;
    } catch {
        return null;
    }
}

const parsed = await analyzeVideoUrl(videoUrl);
console.log(parsed ? JSON.stringify(parsed, null, 2) : null);
