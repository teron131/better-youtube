import { API_ENDPOINTS, TIMING } from "@/core/constants";
import type {
    ApiTranscriptSegment,
    ScrapeCreatorsResponse,
    SupadataJobResponse,
    SupadataTranscriptItem,
    SupadataTranscriptResponse,
} from "@/core/types";
import { formatTimestamp } from "@/core/utils/date";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import { createEmptyScrapeCreatorsResponse } from "./scrapeCreators";

const SUPADATA_POLL_INTERVAL_MS = 1000;

type SupadataResponse = SupadataTranscriptResponse | SupadataJobResponse;

function isTranscriptItem(value: unknown): value is SupadataTranscriptItem {
    return (
        typeof value === "object" &&
        value !== null &&
        "text" in value &&
        "offset" in value &&
        "duration" in value
    );
}

function hasTranscriptArray(
    content: unknown,
): content is SupadataTranscriptItem[] {
    return Array.isArray(content) && content.every(isTranscriptItem);
}

function isSupadataJobResponse(
    data: SupadataResponse,
): data is SupadataJobResponse {
    return "jobId" in data && typeof data.jobId === "string";
}

function buildSupadataHeaders(apiKey: string): HeadersInit {
    return {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
    };
}

function createSupadataBaseResponse(
    videoId: string,
    lang?: string,
): Omit<ScrapeCreatorsResponse, "transcript"> {
    const baseResponse = createEmptyScrapeCreatorsResponse(videoId);

    return {
        ...baseResponse,
        videoId,
        language: lang,
    };
}

function createTimestampedTranscript(
    items: SupadataTranscriptItem[],
): ApiTranscriptSegment[] {
    return items.map((item) => ({
        text: item.text,
        startMs: item.offset,
        endMs: item.offset + item.duration,
        startTimeText: formatTimestamp(item.offset),
    }));
}

function normalizeSupadataResponse(
    data: SupadataTranscriptResponse,
    videoId: string,
): ScrapeCreatorsResponse | null {
    const baseResponse = createSupadataBaseResponse(videoId, data.lang);

    if (typeof data.content === "string") {
        return {
            ...baseResponse,
            transcript: [],
            transcript_only_text: data.content,
        };
    }

    if (!hasTranscriptArray(data.content)) {
        console.warn("Supadata response missing transcript chunks");
        return null;
    }

    return {
        ...baseResponse,
        transcript: createTimestampedTranscript(data.content),
    };
}

function sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function pollSupadataJob(
    jobId: string,
    apiKey: string,
): Promise<SupadataTranscriptResponse | null> {
    const deadline = Date.now() + TIMING.PROCESSING_TIMEOUT_MS;

    while (Date.now() < deadline) {
        await sleep(SUPADATA_POLL_INTERVAL_MS);

        try {
            const response = await fetch(`${API_ENDPOINTS.SUPADATA}/${jobId}`, {
                headers: buildSupadataHeaders(apiKey),
                cache: "no-store",
            });

            if (!response.ok) {
                console.warn(
                    `Supadata job status error: ${response.status} ${response.statusText}`,
                );
                return null;
            }

            const data: SupadataJobResponse = await response.json();

            if (data.status === "completed") {
                return data;
            }

            if (data.status === "failed") {
                console.warn("Supadata transcript job failed:", data.error);
                return null;
            }
        } catch (error) {
            console.warn("Supadata polling error:", error);
            return null;
        }
    }

    console.warn(`Supadata transcript job timed out for ${jobId}`);
    return null;
}

async function resolveSupadataResponse(
    data: SupadataResponse,
    apiKey: string,
): Promise<SupadataTranscriptResponse | null> {
    if (!isSupadataJobResponse(data)) {
        return data;
    }

    return pollSupadataJob(data.jobId, apiKey);
}

export async function fetchTranscriptFromSupadata(
    videoId: string,
    apiKey: string,
): Promise<ScrapeCreatorsResponse | null> {
    const requestUrl = new URL(API_ENDPOINTS.SUPADATA);
    requestUrl.searchParams.set("url", createYouTubeWatchUrl(videoId));
    requestUrl.searchParams.set("lang", "en");
    requestUrl.searchParams.set("text", "false");

    try {
        const response = await fetch(requestUrl.toString(), {
            headers: buildSupadataHeaders(apiKey),
            cache: "no-store",
        });

        if (response.status === 206) {
            console.warn("Supadata transcript unavailable for this video");
            return null;
        }

        if (!response.ok) {
            console.warn(
                `Supadata API error: ${response.status} ${response.statusText}`,
            );
            return null;
        }

        const data: SupadataResponse = await response.json();
        const resolvedData = await resolveSupadataResponse(data, apiKey);

        if (!resolvedData) {
            return null;
        }

        return normalizeSupadataResponse(resolvedData, videoId);
    } catch (error) {
        console.warn("Supadata fetch error:", error);
        return null;
    }
}
