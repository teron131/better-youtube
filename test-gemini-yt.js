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
    videoUrl: z
      .string()
      .url()
      .describe("The YouTube URL analyzed for chapter generation."),
    chapters: z
      .array(
        z.object({
          startTime: z
            .string()
            .describe(
              "Chapter start timestamp in the format HH:MM:SS (or HH:MM:SS.mmm) so the section can be referenced precisely.",
            ),
          endTime: z
            .string()
            .describe(
              "Chapter end timestamp matching the same format as startTime.",
            ),
          title: z
            .string()
            .describe(
              "A concise heading summarizing the chapter's main topic.",
            ),
          transcript: z
            .string()
            .describe(
              "Word-level transcript rendered as a single space-delimited string of tokens representing the spoken content.",
            ),
          visualDescription: z
            .string()
            .describe(
              "Only contextually useful visuals (e.g., diagrams, UI steps, code/math on screen, key gestures, scene changes, and any on-screen text). Avoid trivial appearance details like colors or generic descriptions.",
            ),
          summary: z
            .string()
            .describe(
              "A detailed chapter summary capturing key viewpoints, claims, and concrete facts mentioned (include important numbers/names/steps when present). Avoid meta-language like 'the video', 'the author', 'the speaker says'—state the content directly.",
            ),
        }),
      )
      .min(1)
      .describe(
        "Chronological, non-ad chapters that capture the video's core scenes.",
      ),
  })
  .describe(
    "A multimodal summary describing chapter structure, visuals, and transcripts.",
  );

const client = new GoogleGenAI({ apiKey });

const model = "gemini-3-flash-preview";
const videoUrl = "https://www.youtube.com/watch?v=XFdPFyc-xtc";
const prompt = `
Return ONLY valid JSON that matches the provided schema.

Task:
- Analyze the video and output chapters.
- For each chapter:
  - Provide a clear title.
  - Provide a detailed summary that captures viewpoints, arguments, and concrete facts mentioned (include key numbers/names/steps when present).
    - Avoid meta-language like "the video..." / "the author..." / "the speaker..."; summarize in direct statements.
  - Provide visualDescription with only contextually useful visual cues (e.g., diagrams, UI steps, code/math on screen, key gestures, scene changes, and any on-screen text).
    - Avoid trivial appearance details (e.g., colors) and generic filler.
  - Provide word-level transcript tokens as a single space-delimited string.
- STRICT FILTERING:
  - NEVER include sponsor/advertisement/promotion sections as chapters.
  - If a segment contains sponsorship language (e.g., sponsor, ad, promotion, "brought to you by", "thanks to", discount codes, affiliate links, subscribe/like CTAs), OMIT it entirely and stitch the surrounding content together.
  - Do not output chapters with empty or near-empty fields (summary/transcript/visualDescription must be substantive). If needed, merge with adjacent chapters.
  - When unsure whether a segment is sponsored/promotional, exclude it.
- Language: Traditional Chinese if the video is in Chinese, otherwise English.
`;

function getUsdPerMTokensPricing(modelName) {
  const envInput = process.env.GEMINI_INPUT_USD_PER_M_TOKENS;
  const envOutput = process.env.GEMINI_OUTPUT_USD_PER_M_TOKENS;
  if (envInput && envOutput) {
    const input = Number(envInput);
    const output = Number(envOutput);
    if (Number.isFinite(input) && Number.isFinite(output)) {
      return { input, output, source: "env" };
    }
  }

  const defaults = {
    // USD per 1M tokens; output billed tokens generally include thinking tokens.
    "gemini-3-flash-preview": { input: 0.5, output: 3 },
  };

  const hit = defaults[modelName];
  return hit ? { ...hit, source: "defaults" } : undefined;
}

async function analyzeVideoUrl(url) {
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          fileData: {
            fileUri: url,
          },
        },
        { text: prompt },
      ],
      config: {
        httpOptions: {
          timeout: 10 * 60 * 1000,
        },
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(VideoAnalysis),
      },
    });
    const raw = response.text;
    if (!raw) return null;

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }

    const parsedResult = VideoAnalysis.safeParse(json);
    if (!parsedResult.success) return null;
    const parsed = parsedResult.data;

    const usageMetadata = response.usageMetadata;
    if (usageMetadata) console.log("usageMetadata", usageMetadata);

    const pricing = getUsdPerMTokensPricing(model);
    const promptTokens = usageMetadata?.promptTokenCount;
    const totalTokens = usageMetadata?.totalTokenCount;

    const estimatedCost =
      pricing &&
      typeof promptTokens === "number" &&
      typeof totalTokens === "number"
        ? {
            currency: "USD",
            model,
            pricingUsdPerMTokens: {
              input: pricing.input,
              output: pricing.output,
            },
            pricingSource: pricing.source,
            promptTokens,
            outputBilledTokens: Math.max(0, totalTokens - promptTokens),
            estimatedUsd:
              (promptTokens / 1_000_000) * pricing.input +
              (Math.max(0, totalTokens - promptTokens) / 1_000_000) *
                pricing.output,
          }
        : undefined;

    if (estimatedCost) console.log("estimatedCost", estimatedCost);

    return parsed;
  } catch {
    return null;
  }
}

const parsed = await analyzeVideoUrl(videoUrl);
console.log(parsed ? JSON.stringify(parsed, null, 2) : null);
