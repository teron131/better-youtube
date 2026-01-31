import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import "dotenv/config";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey)
  throw new Error("Set GOOGLE_API_KEY or GEMINI_API_KEY (or put it in .env)");

const MultimodalSummary = z
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
const videoUrl = "https://www.youtube.com/watch?v=bUycTrxNas0";
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
- Skip ALL ads, promotional segments, and irrelevant garbage content.
- Language: Traditional Chinese if the video is in Chinese, otherwise English.
`;

function logTokenUsage({
  label,
  promptTokens,
  outputTokens,
  totalTokens,
  details,
}) {
  console.log(
    `${label}:`,
    `prompt=${promptTokens ?? "n/a"} output=${outputTokens ?? "n/a"} total=${
      totalTokens ??
      (promptTokens != null && outputTokens != null
        ? promptTokens + outputTokens
        : "n/a")
    }`,
  );
  if (details) console.log(`${label} details:`, details);
}

const response = await client.models.generateContent({
  model,
  contents: [
    {
      fileData: {
        fileUri: videoUrl,
      },
    },
    { text: prompt },
  ],
  config: {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.HIGH,
    },
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(MultimodalSummary),
  },
});

const raw = response.text;
if (!raw) throw new Error("Model returned no text.");

const parsed = MultimodalSummary.parse(JSON.parse(raw));
console.log(JSON.stringify(parsed, null, 2));

const usage = response.usageMetadata;
if (usage)
  logTokenUsage({
    label: "Token usage",
    promptTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    details: usage,
  });
