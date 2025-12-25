import { performance } from "node:perf_hooks";

const VIDEO_URL = "https://www.youtube.com/watch?v=KaWQ2Ua9CW8";
const SCRAPE_API_URL = "https://api.scrapecreators.com/v1/youtube/video";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_SEGMENTS_PER_CHUNK = Number(process.env.TEST_CHUNK_SIZE) || 30;
const CONCURRENCY_LIMIT = Number(process.env.TEST_CONCURRENCY) || 8;

const SYSTEM_PROMPT = `You are correcting segments of a YouTube video transcript. These segments could be from anywhere in the video (beginning, middle, or end). Use the video title and description for context.

CRITICAL CONSTRAINTS:
- Only fix typos and grammar. Do NOT change meaning or structure.
- PRESERVE ALL NEWLINES: each line is a distinct transcript segment.
- Do NOT add, remove, or merge lines. Keep the same number of lines.
- Keep the timestamp tag and text on the same line. Do NOT move the [timestamp] to its own line.
- MAINTAIN SIMILAR LINE LENGTHS: Each output line should be approximately the same character count as its corresponding input line (±10% tolerance). Do NOT expand short lines into long paragraphs. Do NOT condense long lines significantly. Keep each line concise.
- If a sentence is broken across lines, keep it broken the same way.
- PRESERVE THE ORIGINAL LANGUAGE: output must be in the same language as the input transcript.
- Focus on minimal corrections: fix typos, correct grammar errors, but keep expansions/additions to an absolute minimum.

EXAMPLES OF CORRECT BEHAVIOR:

Input:
up to 900. From 900 up to 1,100.
If you sold at the reasonable
valuations, when the gains that already
been had, you missed out big time. I 

Output:
up to $900. From $900 up to $1,100.
If you sold at the reasonable
valuations, when the gains that already
had been had, you missed out big time. I`;

function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeSegmentText(text) {
  return (text || "").split(/\s+/).join(" ");
}

function formatTranscriptSegments(segments) {
  return segments
    .map((seg) => {
      const normalizedText = normalizeSegmentText(seg.text);
      const timestamp = seg.startTimeText || formatTimestamp(seg.startTime);
      return `[${timestamp}] ${normalizedText}`;
    })
    .join("\n");
}

function chunkSegmentsByCount(segments, maxPerChunk) {
  const ranges = [];
  let start = 0;
  while (start < segments.length) {
    const end = Math.min(start + maxPerChunk, segments.length);
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

function buildUserPreamble(title, description) {
  return [
    `Video Title: ${title || ""}`,
    `Video Description: ${description || ""}`,
    "",
    "Transcript Chunk:",
  ].join("\n");
}

async function fetchTranscript(videoUrl, apiKey) {
  const requestUrl = new URL(SCRAPE_API_URL);
  requestUrl.searchParams.set("url", videoUrl);
  requestUrl.searchParams.set("get_transcript", "true");

  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Scrape API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.transcript?.length) {
    throw new Error("No transcript available in Scrape API response.");
  }

  const segments = data.transcript.map((seg) => ({
    text: seg.text || "",
    startTime: seg.startMs,
    endTime: seg.endMs,
    startTimeText: seg.startTimeText || null,
  }));

  // duration is usually in seconds in API response
  const durationMs = (data.duration || 0) * 1000 || (segments.length > 0 ? segments[segments.length - 1].endTime : 0);

  return {
    title: data.title || "",
    description: data.description || "",
    durationMs,
    segments,
  };
}

async function refineChunk(openRouterKey, model, preambleText, chunkText) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Better YouTube",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${preambleText}\n${chunkText}` },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function main() {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const startTime = performance.now();
  const scrapeKey = process.env.SCRAPE_CREATORS_API_KEY || process.env.SCRAPECREATORS_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.REFINER_MODEL || "google/gemini-2.5-flash-lite-preview-09-2025";

  if (!scrapeKey || !openRouterKey) {
    console.error("Missing SCRAPE_CREATORS_API_KEY or OPENROUTER_API_KEY.");
    process.exit(1);
  }

  const { title, description, segments, durationMs } = await fetchTranscript(VIDEO_URL, scrapeKey);
  const preambleText = buildUserPreamble(title, description);

  const maxSegmentsPerChunk = Number(
    process.env.REFINE_MAX_SEGMENTS_PER_CHUNK || MAX_SEGMENTS_PER_CHUNK
  );

  // --- Priority Split Logic ---
  const PRIORITY_DURATION_MS = Math.min(5 * 60 * 1000, 0.5 * durationMs);
  let splitIndex = segments.length;
  
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].endTime > PRIORITY_DURATION_MS) {
      splitIndex = i + 1; // Include this segment in the first batch
      break;
    }
  }

  const prioritySegments = segments.slice(0, splitIndex);
  const standardSegments = segments.slice(splitIndex);

  const priorityRanges = chunkSegmentsByCount(prioritySegments, maxSegmentsPerChunk);
  // standardRanges need to be offset by splitIndex for correct global indexing
  const standardRangesLocal = chunkSegmentsByCount(standardSegments, maxSegmentsPerChunk);
  const standardRanges = standardRangesLocal.map(([start, end]) => [start + splitIndex, end + splitIndex]);

  const allRanges = [...priorityRanges, ...standardRanges];
  const priorityRangeCount = priorityRanges.length;

  console.log(`Video Duration: ${Math.floor(durationMs / 1000)}s`);
  console.log(`Priority Window: First ${Math.floor(PRIORITY_DURATION_MS / 1000)}s (${prioritySegments.length} segments)`);
  console.log(`Processing ${segments.length} segments in ${allRanges.length} chunks (Priority: ${priorityRangeCount}, Standard: ${standardRanges.length})...`);
  console.log(`Config: ChunkSize=${maxSegmentsPerChunk}, Concurrency=${CONCURRENCY_LIMIT}`);
  console.log(`\nStarting refinement...`);

  const refinedChunks = new Array(allRanges.length);
  
  // Single Queue (Unified Pool)
  // Ensures zero idle workers: extra workers start on standard chunks immediately.
  const queue = allRanges.map((range, idx) => ({ range, idx }));
  let completedPriorityChunks = 0;
  let priorityReported = false;

  async function worker() {
      while (queue.length > 0) {
          const task = queue.shift();
          if (!task) break;

          const { range, idx } = task;
          const [startIdx, endIdx] = range;
          const chunkSegments = segments.slice(startIdx, endIdx);
          const chunkTextOnly = formatTranscriptSegments(chunkSegments);
          
          const isPriority = idx < priorityRangeCount;
          const label = isPriority ? "[PRIORITY]" : "[STANDARD]";

          try {
            const refinedText = await refineChunk(openRouterKey, model, preambleText, chunkTextOnly);
            refinedChunks[idx] = refinedText.trim();
            
            if (isPriority) {
              completedPriorityChunks++;
            }

            console.log(`${label} Refined chunk ${idx + 1}/${allRanges.length} (${chunkSegments.length} lines)`);

            // Dynamically detect priority completion in the unified flow
            if (!priorityReported && completedPriorityChunks === priorityRangeCount) {
                 priorityReported = true;
                 const priorityTime = performance.now();
                 console.log(">>> \x1b[32mPRIORITY SEGMENTS COMPLETED & DISPLAYED\x1b[0m <<<");
                 console.log(`    (Priority Latency: ${((priorityTime - startTime) / 1000).toFixed(2)}s)`);
                 
                 const priorityOutput = {
                    videoUrl: VIDEO_URL,
                    status: "partial_priority",
                    prioritySegmentsCount: prioritySegments.length,
                    refinedText: refinedChunks.slice(0, priorityRangeCount).join("\n")
                  };
                 const partialPath = `.tmp/refine-${new URL(VIDEO_URL).searchParams.get("v") || "video"}-priority.json`;
                 await writeFile(partialPath, JSON.stringify(priorityOutput, null, 2));
                 console.log(`    (Saved priority preview to ${partialPath})`);
            }

          } catch (err) {
            console.error(`${label} Error chunk ${idx + 1}:`, err.message);
            refinedChunks[idx] = chunkTextOnly;
          }
      }
  }

  // Start workers
  console.log(`\n--- Starting Unified Worker Pool (${CONCURRENCY_LIMIT} workers) ---`);
  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, allRanges.length) }, () => worker());
  await Promise.all(workers);

  const output = {
    videoUrl: VIDEO_URL,
    model,
    originalLineCount: segments.length,
    refinedLineCount: refinedChunks
      .map((chunk) => chunk.split("\n").filter((line) => line.trim().length > 0).length)
      .reduce((a, b) => a + b, 0),
    refinedText: refinedChunks.join("\n"),
  };

  await mkdir(".tmp", { recursive: true });
  const videoId = new URL(VIDEO_URL).searchParams.get("v") || "video";
  const outPath = `.tmp/refine-${videoId}.json`;
  await writeFile(outPath, JSON.stringify(output, null, 2));
  
  const endTime = performance.now();
  console.log(`Saved refined output to ${outPath}`);
  console.log(`\nTotal Execution Time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});