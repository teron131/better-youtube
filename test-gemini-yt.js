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
              "Narrative of the dominant visuals, scene changes, or onscreen text.",
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
- Describe each chapter with a clear title, vivid visual narration, and word-level transcript tokens.
- Skip ALL ads, promotional segments, and irrelevant garbage content.
- Language: Traditional Chinese if the video is in Chinese, otherwise English.
`;

const contents = [
  {
    fileData: {
      fileUri: videoUrl,
    },
  },
  { text: prompt },
];

let promptTokens;
try {
  const counted = await client.models.countTokens({
    model,
    contents,
  });
  promptTokens = counted.totalTokens;
} catch {
  // ignore
}

const response = await client.models.generateContent({
  model,
  contents,
  config: {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.HIGH,
    },
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(MultimodalSummary),
  },
});

const raw = response.text;
const parsed = MultimodalSummary.parse(JSON.parse(raw));
console.log(JSON.stringify(parsed, null, 2));

if (response.usageMetadata) {
  const u = response.usageMetadata;
  console.log(
    "Token usage:",
    `prompt=${u.promptTokenCount ?? "n/a"} output=${
      u.candidatesTokenCount ?? "n/a"
    } total=${u.totalTokenCount ?? "n/a"}`,
  );
  console.log("Token usage details:", u);
} else {
  let outputTokens;
  try {
    const counted = await client.models.countTokens({
      model,
      contents: raw ?? "",
    });
    outputTokens = counted.totalTokens;
  } catch {
    // ignore
  }

  console.log(
    "Token usage not included in generateContent response; counted via tokens API (https://ai.google.dev/api/tokens):",
    `prompt=${promptTokens ?? "n/a"} output=${outputTokens ?? "n/a"} total=${
      promptTokens != null && outputTokens != null
        ? promptTokens + outputTokens
        : "n/a"
    }`,
  );
}
