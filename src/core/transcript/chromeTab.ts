/// <reference types="chrome" />

import { ERROR_MESSAGES } from "../constants.ts";
import type { ApiTranscriptSegment, TranscriptResponse } from "../types.ts";
import { formatTimestamp } from "../utils/date.ts";
import { createYouTubeWatchUrl } from "../utils/url.ts";

const LOG_PREFIX = "[transcript:chromeTab]";
const CAPTION_FORMATS = ["json3", "srv3", "srv1", "vtt"] as const;
const CAPTION_POLL_ATTEMPTS = 6;
const CAPTION_POLL_DELAY_MS = 500;

type ChromeCaptionFormat = (typeof CAPTION_FORMATS)[number];

type ChromeTabCaptionTrack = {
	baseUrl: string;
	languageCode: string;
	kind: string | null;
	name: string;
	isTranslatable: boolean;
	vssId?: string;
	trackName?: string;
};

type ChromeTabCaptionAttempt = {
	fmt: ChromeCaptionFormat;
	ok: boolean;
	status: number;
	contentType: string | null;
	length: number;
	error?: string;
};

type ChromeTabMainWorldResult = {
	ok: boolean;
	pageUrl: string;
	activeVideoId: string | null;
	title: string;
	description: string;
	language?: string;
	source?: string;
	captionTracks: ChromeTabCaptionTrack[];
	selectedTrack?: ChromeTabCaptionTrack;
	payload?: {
		fmt: ChromeCaptionFormat;
		text: string;
	};
	attempts: ChromeTabCaptionAttempt[];
	error?: string;
};

type ChromeTabCaptionState = {
	sourceName: string;
	response: any;
	captionTracks: ChromeTabCaptionTrack[];
};

type ChromeTabSuccessfulExtraction = ChromeTabMainWorldResult & {
	ok: true;
	payload: { fmt: ChromeCaptionFormat; text: string };
	selectedTrack: ChromeTabCaptionTrack;
};

function decodeHtmlEntities(input: string): string {
	return input
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (_match, num) =>
			String.fromCodePoint(Number.parseInt(String(num), 10)),
		)
		.replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
			String.fromCodePoint(Number.parseInt(String(hex), 16)),
		);
}

function normalizeCaptionText(input: string): string {
	return decodeHtmlEntities(input)
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function createTranscriptSegment(
	text: string,
	startMs: number,
	endMs: number,
): ApiTranscriptSegment | null {
	const normalizedText = normalizeCaptionText(text);
	if (!normalizedText) return null;

	return {
		text: normalizedText,
		startMs,
		endMs: Math.max(endMs, startMs),
		startTimeText: formatTimestamp(startMs),
	};
}

export function parseJson3Captions(payload: string): ApiTranscriptSegment[] {
	const data = JSON.parse(payload) as {
		events?: Array<{
			tStartMs?: number;
			dDurationMs?: number;
			segs?: Array<{ utf8?: string }>;
		}>;
	};
	const events = Array.isArray(data.events) ? data.events : [];

	return events
		.map((event) => {
			const text = Array.isArray(event.segs)
				? event.segs
						.map((segment) =>
							typeof segment?.utf8 === "string" ? segment.utf8 : "",
						)
						.join("")
				: "";
			const startMs = Number(event.tStartMs ?? 0);
			const durationMs = Number(event.dDurationMs ?? 0);
			return createTranscriptSegment(text, startMs, startMs + durationMs);
		})
		.filter((segment): segment is ApiTranscriptSegment => Boolean(segment));
}

export function parseSrvCaptions(payload: string): ApiTranscriptSegment[] {
	const matches = [...payload.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)];
	const rawSegments = matches
		.map((match) => {
			const attrs = match[1] ?? "";
			const text = match[2] ?? "";
			const startSeconds = Number(attrs.match(/\bstart="([^"]+)"/)?.[1] ?? "0");
			const durationSeconds = Number(
				attrs.match(/\bdur="([^"]+)"/)?.[1] ?? "0",
			);
			return {
				text,
				startMs: Math.round(startSeconds * 1000),
				endMs: Math.round((startSeconds + durationSeconds) * 1000),
			};
		})
		.filter((segment) => Number.isFinite(segment.startMs));

	return rawSegments
		.map((segment, idx) => {
			const nextStartMs = rawSegments[idx + 1]?.startMs;
			const endMs =
				segment.endMs > segment.startMs
					? segment.endMs
					: (nextStartMs ?? segment.startMs);
			return createTranscriptSegment(segment.text, segment.startMs, endMs);
		})
		.filter((segment): segment is ApiTranscriptSegment => Boolean(segment));
}

function parseVttTimestamp(value: string): number | null {
	const parts = value.trim().split(":");
	if (parts.length < 2 || parts.length > 3) return null;
	const [hoursText, minutesText, secondsText] =
		parts.length === 3 ? parts : ["0", parts[0], parts[1]];
	const hours = Number(hoursText);
	const minutes = Number(minutesText);
	const seconds = Number(secondsText.replace(",", "."));
	if (![hours, minutes, seconds].every(Number.isFinite)) return null;
	return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function parseVttCaptions(payload: string): ApiTranscriptSegment[] {
	const blocks = payload
		.replace(/^\uFEFF?WEBVTT[^\n]*\n+/i, "")
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter(Boolean);

	const segments: ApiTranscriptSegment[] = [];
	for (const block of blocks) {
		const lines = block.split(/\r?\n/).filter(Boolean);
		const timingLine = lines.find((line) => line.includes("-->"));
		if (!timingLine) continue;

		const [startText, endText] = timingLine.split("-->");
		const startMs = parseVttTimestamp(startText);
		const endToken = endText.trim().split(/\s+/)[0] ?? "";
		const endMs = parseVttTimestamp(endToken);
		if (startMs == null || endMs == null) continue;

		const textLines = lines.slice(lines.indexOf(timingLine) + 1);
		const segment = createTranscriptSegment(
			textLines.join(" "),
			startMs,
			endMs,
		);
		if (segment) segments.push(segment);
	}

	return segments;
}

export function parseChromeTabCaptionPayload(
	fmt: ChromeCaptionFormat,
	payload: string,
): ApiTranscriptSegment[] {
	switch (fmt) {
		case "json3":
			return parseJson3Captions(payload);
		case "srv1":
		case "srv3":
			return parseSrvCaptions(payload);
		case "vtt":
			return parseVttCaptions(payload);
		default:
			return [];
	}
}

export function getChromeTabTrackPriority(track: {
	languageCode?: string | null;
	kind?: string | null;
}): number {
	const languageCode = String(track.languageCode ?? "").toLowerCase();
	const isEnglish = languageCode === "en" || languageCode.startsWith("en-");
	const isAutoGenerated = track.kind === "asr";

	if (isEnglish && !isAutoGenerated) return 0;
	if (isEnglish && isAutoGenerated) return 1;
	if (!isAutoGenerated) return 2;
	return 3;
}

export function getChromeTabTrackType(track: {
	kind?: string | null;
}): "manual" | "auto" {
	return track.kind === "asr" ? "auto" : "manual";
}

function segmentsToText(segments: ApiTranscriptSegment[]): string {
	return segments
		.map((segment) => segment.text)
		.join(" ")
		.trim();
}

async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
	return new Promise((resolve, reject) => {
		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve(tab);
		});
	});
}

function isWatchPage(url: string | undefined): boolean {
	return Boolean(url?.includes("youtube.com/watch"));
}

function createFailure(videoId: string, tabId: number, message: string): Error {
	return new Error(
		`${ERROR_MESSAGES.CHROME_TAB_REQUIRES_TAB} ${message} (videoId=${videoId}, tabId=${tabId})`,
	);
}

function isNoCaptionExtraction(extraction: ChromeTabMainWorldResult): boolean {
	return (
		extraction.error === "No caption tracks found in YouTube player data." ||
		extraction.error === "No usable caption track found."
	);
}

function assertSuccessfulExtraction(
	extraction: ChromeTabMainWorldResult,
	videoId: string,
	tabId: number,
): ChromeTabSuccessfulExtraction {
	if (!extraction.ok || !extraction.payload || !extraction.selectedTrack) {
		throw createFailure(
			videoId,
			tabId,
			extraction.error ?? "Chrome-tab caption extraction failed.",
		);
	}

	return extraction as ChromeTabSuccessfulExtraction;
}

async function executeChromeTabExtraction(
	requestedVideoId: string,
	captionFormats: readonly ChromeCaptionFormat[],
	pollAttempts: number,
	pollDelayMs: number,
): Promise<ChromeTabMainWorldResult> {
	const sleep = (ms: number) =>
		new Promise((resolve) => window.setTimeout(resolve, ms));

	const extractVideoId = (url: string): string | null => {
		try {
			const parsed = new URL(url);
			return parsed.searchParams.get("v");
		} catch {
			return null;
		}
	};

	const getTrackName = (track: {
		name?: { simpleText?: string; runs?: Array<{ text?: string }> };
	}): string => {
		if (track.name?.simpleText) return track.name.simpleText;
		if (!Array.isArray(track.name?.runs)) return "";
		return track.name.runs
			.map((run) => run.text ?? "")
			.join("")
			.trim();
	};

	const mapCaptionTrack = (track: any): ChromeTabCaptionTrack | null => {
		if (typeof track?.baseUrl !== "string") {
			return null;
		}

		return {
			baseUrl: track.baseUrl,
			languageCode: String(track.languageCode ?? ""),
			kind: typeof track.kind === "string" ? track.kind : null,
			name: getTrackName(track),
			isTranslatable: track.isTranslatable === true,
			vssId: typeof track.vssId === "string" ? track.vssId : undefined,
			trackName:
				typeof track.trackName === "string" ? track.trackName : undefined,
		};
	};

	const readCaptionTracks = (response: any): ChromeTabCaptionTrack[] => {
		const tracklist = response?.captions?.playerCaptionsTracklistRenderer;
		if (!Array.isArray(tracklist?.captionTracks)) {
			return [];
		}

		return tracklist.captionTracks
			.map(mapCaptionTrack)
			.filter((track): track is ChromeTabCaptionTrack => Boolean(track));
	};

	const getCaptionSources = () => {
		const player = document.getElementById("movie_player") as
			| (HTMLElement & {
					getPlayerResponse?: () => any;
			  })
			| null;

		return [
			{
				name: "window.ytInitialPlayerResponse",
				response: (window as any).ytInitialPlayerResponse,
			},
			{
				name: "window.ytplayer.bootstrapPlayerResponse",
				response: (window as any).ytplayer?.bootstrapPlayerResponse,
			},
			{
				name: "window.ytplayer.config.args.raw_player_response",
				response: (window as any).ytplayer?.config?.args?.raw_player_response,
			},
			{
				name: "movie_player.getPlayerResponse()",
				response:
					player && typeof player.getPlayerResponse === "function"
						? player.getPlayerResponse()
						: null,
			},
		];
	};

	const getCaptionState = (): ChromeTabCaptionState | null => {
		for (const source of getCaptionSources()) {
			const captionTracks = readCaptionTracks(source.response);
			if (!captionTracks.length) {
				continue;
			}

			return {
				sourceName: source.name,
				response: source.response,
				captionTracks,
			};
		}

		return null;
	};

	const selectCaptionTrack = (
		captionTracks: ChromeTabCaptionTrack[],
	): ChromeTabCaptionTrack | undefined => {
		const getTrackPriority = (track: ChromeTabCaptionTrack): number => {
			const languageCode = String(track.languageCode ?? "").toLowerCase();
			const isEnglish = languageCode === "en" || languageCode.startsWith("en-");
			const isAutoGenerated = track.kind === "asr";

			if (isEnglish && !isAutoGenerated) return 0;
			if (isEnglish && isAutoGenerated) return 1;
			if (!isAutoGenerated) return 2;
			return 3;
		};

		return captionTracks
			.slice()
			.sort(
				(leftTrack, rightTrack) =>
					getTrackPriority(leftTrack) - getTrackPriority(rightTrack),
			)[0];
	};

	const fetchCaptionAttempt = async (
		baseUrl: string,
		fmt: ChromeCaptionFormat,
	): Promise<{
		attempt: ChromeTabCaptionAttempt;
		payloadText?: string;
	}> => {
		const url = new URL(baseUrl);
		url.searchParams.set("fmt", fmt);
		url.searchParams.delete("xosf");

		try {
			const response = await fetch(url.toString(), {
				credentials: "include",
			});
			const payloadText = (await response.text()).trim();
			return {
				attempt: {
					fmt,
					ok: response.ok,
					status: response.status,
					contentType: response.headers.get("content-type"),
					length: payloadText.length,
				},
				payloadText: response.ok && payloadText ? payloadText : undefined,
			};
		} catch (error) {
			return {
				attempt: {
					fmt,
					ok: false,
					status: 0,
					contentType: null,
					length: 0,
					error: error instanceof Error ? error.message : String(error),
				},
			};
		}
	};

	const pageUrl = window.location.href;
	const activeVideoId = extractVideoId(pageUrl);
	const createResult = (
		overrides: Partial<ChromeTabMainWorldResult>,
	): ChromeTabMainWorldResult => ({
		ok: false,
		pageUrl,
		activeVideoId,
		title: document.title,
		description: "",
		captionTracks: [],
		attempts: [],
		...overrides,
	});

	if (!pageUrl.includes("youtube.com/watch")) {
		return createResult({
			error: "Target tab is not a YouTube watch page.",
		});
	}

	if (activeVideoId !== requestedVideoId) {
		return createResult({
			error: `Active tab video ${activeVideoId ?? "unknown"} does not match requested video ${requestedVideoId}.`,
		});
	}

	let captionState = getCaptionState();
	for (let attempt = 0; attempt < pollAttempts && !captionState; attempt += 1) {
		await sleep(pollDelayMs);
		captionState = getCaptionState();
	}

	const playerResponse = captionState?.response ?? null;
	const videoDetails = playerResponse?.videoDetails ?? {};
	const title = String(videoDetails.title ?? document.title);
	const description = String(videoDetails.shortDescription ?? "");
	const captionTracks = captionState?.captionTracks ?? [];
	const baseResult = createResult({
		title,
		description,
		source: captionState?.sourceName,
		captionTracks,
	});

	if (!captionTracks.length) {
		return {
			...baseResult,
			error: "No caption tracks found in YouTube player data.",
		};
	}

	const selectedTrack = selectCaptionTrack(captionTracks);
	if (!selectedTrack) {
		return {
			...baseResult,
			error: "No usable caption track found.",
		};
	}

	const attempts: ChromeTabCaptionAttempt[] = [];
	for (const fmt of captionFormats) {
		const { attempt, payloadText } = await fetchCaptionAttempt(
			selectedTrack.baseUrl,
			fmt,
		);
		attempts.push(attempt);

		if (!payloadText) {
			continue;
		}

		return {
			...baseResult,
			ok: true,
			language: selectedTrack.languageCode,
			selectedTrack,
			payload: {
				fmt,
				text: payloadText,
			},
			attempts,
		};
	}

	return {
		...baseResult,
		language: selectedTrack.languageCode,
		selectedTrack,
		attempts,
		error: "All caption fetch attempts returned empty or invalid responses.",
	};
}

async function runChromeTabExtractor(
	tabId: number,
	videoId: string,
): Promise<ChromeTabMainWorldResult> {
	const [{ result }] = await chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: executeChromeTabExtraction,
		args: [
			videoId,
			[...CAPTION_FORMATS],
			CAPTION_POLL_ATTEMPTS,
			CAPTION_POLL_DELAY_MS,
		],
	});

	return result as ChromeTabMainWorldResult;
}

function toChromeTabResponse(args: {
	videoId: string;
	tabTitle?: string;
	extraction: Pick<
		ChromeTabMainWorldResult,
		"title" | "description" | "language" | "captionTracks"
	> & {
		selectedTrack?: ChromeTabCaptionTrack;
	};
	transcript: ApiTranscriptSegment[];
}): TranscriptResponse {
	const { videoId, tabTitle, extraction, transcript } = args;
	return {
		success: true,
		credits_remaining: 0,
		type: "video",
		url: createYouTubeWatchUrl(videoId),
		videoId,
		transcript,
		transcript_only_text: segmentsToText(transcript),
		title: extraction.title || tabTitle || "",
		description: extraction.description || "",
		language:
			extraction.language || extraction.selectedTrack?.languageCode || "",
		captionTracks: extraction.captionTracks,
		channel: {
			id: "",
			url: "",
			handle: "",
			title: "",
		},
		durationFormatted: "",
		publishDate: "",
		viewCountInt: 0,
		likeCountInt: 0,
		keywords: [],
	};
}

export async function fetchTranscriptFromChromeTab(
	videoId: string,
	tabId: number,
): Promise<TranscriptResponse> {
	if (!chrome?.scripting?.executeScript) {
		throw new Error(
			"Chrome scripting API is unavailable for the Chrome Tab transcript provider.",
		);
	}

	const tab = await getTab(tabId);
	if (!isWatchPage(tab.url)) {
		throw createFailure(
			videoId,
			tabId,
			"Target tab is not a YouTube watch page.",
		);
	}

	const extraction = await runChromeTabExtractor(tabId, videoId);
	if (isNoCaptionExtraction(extraction)) {
		return toChromeTabResponse({
			videoId,
			tabTitle: tab.title,
			extraction,
			transcript: [],
		});
	}

	const successfulExtraction = assertSuccessfulExtraction(
		extraction,
		videoId,
		tabId,
	);

	const transcript = parseChromeTabCaptionPayload(
		successfulExtraction.payload.fmt,
		successfulExtraction.payload.text,
	);
	if (!transcript.length) {
		throw createFailure(
			videoId,
			tabId,
			`Caption payload was fetched but parsed into zero transcript segments (${successfulExtraction.payload.fmt}).`,
		);
	}

	console.log(`${LOG_PREFIX} success`, {
		videoId,
		source: successfulExtraction.source,
		format: successfulExtraction.payload.fmt,
		language:
			successfulExtraction.language ||
			successfulExtraction.selectedTrack.languageCode,
		trackType: getChromeTabTrackType(successfulExtraction.selectedTrack),
		trackName: successfulExtraction.selectedTrack.name,
		segmentCount: transcript.length,
	});

	return toChromeTabResponse({
		videoId,
		tabTitle: tab.title,
		extraction: successfulExtraction,
		transcript,
	});
}
