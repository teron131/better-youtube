/** Scrape the four public aggregate quality leaderboards used by extension-owned model scoring. */

import {
  asFiniteNumber,
  asRecord,
  fetchRemoteText,
  firstString,
  type JsonObject,
  parseJsonObject,
} from "../utils.ts";

const ARTIFICIAL_ANALYSIS_URL = "https://artificialanalysis.ai/leaderboards/models";
const VALS_INDEX_URL = "https://www.vals.ai/benchmarks/vals_index";
const EPOCH_CAPABILITIES_INDEX_URL = "https://epoch.ai/data/eci_scores.csv";
const SURGE_INTELLIGENCE_INDEX_URL = "https://surgehq.ai/benchmarks";
const SCRAPE_TIMEOUT_MS = 10_000;
const ARTIFICIAL_ANALYSIS_ROW_KEY = "intelligenceIndex";
const MODEL_SEARCH_BACKTRACK_CHARS = 20_000;
const NEXT_FLIGHT_CHUNK_PATTERN = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
const SURGE_INTELLIGENCE_INDEX_ITEM_PATTERN =
  /<div\b[^>]*\bdata-ii-item(?:\s*=\s*["'][^"']*["'])?[^>]*>[\s\S]*?(?=<div\b[^>]*\bdata-ii-item|<div\b[^>]*\bdata-ii-status|$)/gi;

export type AggregateSources = {
  artificialAnalysis: JsonObject[];
  valsIndex: ValsIndexRow[];
  epochCapabilitiesIndex: EpochCapabilitiesIndexRow[];
  surgeIntelligenceIndex: SurgeIntelligenceIndexRow[];
};

export type ValsIndexRow = {
  modelId: string;
  model: string;
  score: number;
  costPerTest: number | null;
  latency: number | null;
};

type EpochCapabilitiesIndexRow = {
  modelId: string;
  model: string;
  score: number;
};

type SurgeIntelligenceIndexRow = {
  model: string;
  score: number;
};

/** Read all four unstable public sources in parallel and degrade each failed parser to no evidence. */
export async function fetchAggregateSources(): Promise<AggregateSources> {
  const [artificialAnalysisHtml, valsIndexHtml, epochCsv, surgeHtml] = await Promise.all([
    fetchRemoteText(ARTIFICIAL_ANALYSIS_URL, SCRAPE_TIMEOUT_MS),
    fetchRemoteText(VALS_INDEX_URL, SCRAPE_TIMEOUT_MS),
    fetchRemoteText(EPOCH_CAPABILITIES_INDEX_URL, SCRAPE_TIMEOUT_MS),
    fetchRemoteText(SURGE_INTELLIGENCE_INDEX_URL, SCRAPE_TIMEOUT_MS),
  ]);
  return {
    artificialAnalysis: artificialAnalysisHtml
      ? parseArtificialAnalysisRows(artificialAnalysisHtml)
      : [],
    valsIndex: valsIndexHtml ? parseValsIndexRows(valsIndexHtml) : [],
    epochCapabilitiesIndex: epochCsv ? parseEpochCapabilitiesIndexRows(epochCsv) : [],
    surgeIntelligenceIndex: surgeHtml ? parseSurgeIntelligenceIndexRows(surgeHtml) : [],
  };
}

function parseArtificialAnalysisRows(pageHtml: string): JsonObject[] {
  const corpus = extractNextFlightCorpus(pageHtml);
  const rowsById = new Map<string, JsonObject>();
  let cursor = 0;
  while (true) {
    const hitIndex = corpus.indexOf(`"${ARTIFICIAL_ANALYSIS_ROW_KEY}":`, cursor);
    if (hitIndex === -1) break;
    cursor = hitIndex + 1;
    const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
    for (let index = hitIndex; index >= searchStart; index -= 1) {
      if (corpus[index] !== "{") continue;
      const endIndex = findObjectEnd(corpus, index);
      if (endIndex === -1 || endIndex < hitIndex) continue;
      const row = parseJsonObject(corpus.slice(index, endIndex + 1));
      const rowId = firstString(row, ["id", "slug"]);
      if (!rowId || !(ARTIFICIAL_ANALYSIS_ROW_KEY in row)) continue;
      rowsById.set(rowId, row);
      break;
    }
  }
  return [...rowsById.values()];
}

function extractNextFlightCorpus(pageHtml: string): string {
  return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_PATTERN)]
    .map((match) => decodeFlightChunk(match[1] ?? ""))
    .join("\n");
}

function decodeFlightChunk(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function findObjectEnd(value: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaping) escaping = false;
      else if (character === "\\") escaping = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseValsIndexRows(pageHtml: string): ValsIndexRow[] {
  const island = pageHtml.match(
    /<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkView[^"]*")[^>]*>/,
  )?.[0];
  const props = island ? htmlAttribute(island, "props") : null;
  if (!props) return [];
  try {
    const revived = asRecord(reviveAstroValue(JSON.parse(props)));
    const benchmarkView = asRecord(revived.benchmarkView);
    const view = asRecord(benchmarkView.default);
    const overallRows = asRecord(asRecord(view.tasks).overall);
    return Object.entries(overallRows).flatMap(([modelId, value]) => {
      const row = asRecord(value);
      const score = asFiniteNumber(row.accuracy);
      return score != null && score >= 0 && score <= 100
        ? [
            {
              modelId,
              model: modelId.slice(modelId.indexOf("/") + 1),
              score: score / 100,
              costPerTest: asFiniteNumber(row.cost_per_test),
              latency: asFiniteNumber(row.latency),
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
}

function reviveAstroValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") {
    if (value[0] === 0) return reviveAstroValue(value[1]);
    if (value[0] === 1) return Array.isArray(value[1]) ? value[1].map(reviveAstroValue) : [];
  }
  if (Array.isArray(value)) return value.map(reviveAstroValue);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reviveAstroValue(item)]),
    );
  }
  return value;
}

function htmlAttribute(html: string, name: string): string | null {
  const match = html.match(new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  return match ? decodeHtmlEntities(match[2] ?? "").trim() : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseEpochCapabilitiesIndexRows(csv: string): EpochCapabilitiesIndexRow[] {
  return parseCsvRecords(csv).flatMap((row) => {
    const score = asFiniteNumber(row.eci);
    const model = row["Display name"] || row.Model || "";
    return score != null && model ? [{ modelId: row.Model || model, model, score }] : [];
  });
}

function parseSurgeIntelligenceIndexRows(pageHtml: string): SurgeIntelligenceIndexRow[] {
  const articleStart = pageHtml.search(/<article\b[^>]*\bid\s*=\s*["']intelligence-index["']/i);
  if (articleStart === -1) return [];
  const articleEnd = pageHtml.indexOf("</article>", articleStart);
  const segment = pageHtml.slice(articleStart, articleEnd === -1 ? undefined : articleEnd);
  return [...segment.matchAll(SURGE_INTELLIGENCE_INDEX_ITEM_PATTERN)].flatMap((match) => {
    const rowHtml = match[0] ?? "";
    const model = attributeElementText(rowHtml, "data-ii-model-bound");
    const score = asFiniteNumber(attributeElementText(rowHtml, "data-ii-score-paragraph"));
    return model && score != null ? [{ model, score }] : [];
  });
}

function attributeElementText(html: string, attributeName: string): string | null {
  const match = html.match(
    new RegExp(
      `<[^>]*\\b${attributeName}(?:\\s*=\\s*["'][^"']*["'])?[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ),
  );
  const value = match ? stripHtmlTags(match[1] ?? "") : "";
  return value || null;
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvRecords(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index] ?? "";
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return headers
    ? body
        .filter((values) => values.some(Boolean))
        .map((values) =>
          Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
        )
    : [];
}
