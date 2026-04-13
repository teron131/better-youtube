/**
 * Subscription extraction workflow for the YouTube channels page.
 */

import { STORAGE_KEYS } from "@/core/constants";
import type {
	StoredSubscriptions,
	SubscriptionRecord,
} from "@/core/recommendationFilters";
import { setStorageValue } from "@/core/storage";

type SubscriptionExtractionMessage = {
	tabId?: number;
	[key: string]: unknown;
};

type SubscriptionExtractionResponse = {
	success: boolean;
	count?: number;
	channels?: SubscriptionRecord[];
	error?: string;
};

export async function handleExtractSubscriptions(
	message: SubscriptionExtractionMessage,
	sendResponse: (response: SubscriptionExtractionResponse) => void,
): Promise<void> {
	if (!message.tabId) {
		sendResponse({
			success: false,
			error: "Active tab is required to extract subscriptions.",
		});
		return;
	}

	try {
		const channels = await runPageSubscriptionExtraction(message.tabId);
		const storedSubscriptions = buildStoredSubscriptions(channels);
		await setStorageValue(STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS, storedSubscriptions);

		sendResponse({
			success: true,
			count: storedSubscriptions.count,
			channels: storedSubscriptions.channels,
		});
	} catch (error) {
		console.error("[subscriptions] extraction failed", error);
		sendResponse({
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to extract subscriptions.",
		});
	}
}

function buildStoredSubscriptions(
	channels: SubscriptionRecord[],
	extractedAt = new Date().toISOString(),
): StoredSubscriptions {
	return {
		extracted: extractedAt,
		channels,
		channelNames: channels
			.map((channel) => channel.name)
			.filter((name): name is string => typeof name === "string" && !!name),
		count: channels.length,
	};
}

async function runPageSubscriptionExtraction(
	tabId: number,
): Promise<SubscriptionRecord[]> {
	const results = await chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: extractSubscriptionsInPageContext,
	});

	if (!results.length) {
		throw new Error("No results returned from the subscriptions page.");
	}

	const pageResult = results[0].result;
	if (!pageResult?.channels) {
		throw new Error("No channels were returned from the page.");
	}

	return pageResult.channels as SubscriptionRecord[];
}

function extractSubscriptionsInPageContext() {
	const CHANNEL_RENDERER_SELECTOR = "ytd-channel-renderer";
	const CHANNEL_LINK_SELECTOR = "a[href^='/@'], a[href^='/channel/']";
	const MAX_SCROLL_PASSES = 45;
	const STABLE_PASSES_NEEDED = 4;
	const SCROLL_WAIT_MS = 900;
	const SCROLL_RESTORE_WAIT_MS = 100;

	type PageSubscriptionRecord = {
		name: string | null;
		channelId: string | null;
		channelPath: string | null;
		channelUrl: string | null;
		handle: string | null;
		description: string | null;
	};

	function sleep(ms: number) {
		return new Promise((resolve) => {
			window.setTimeout(resolve, ms);
		});
	}

	function normalizeText(value: unknown) {
		if (typeof value !== "string") {
			return null;
		}

		const normalized = value.replace(/\s+/g, " ").trim();
		return normalized || null;
	}

	function textFromNode(value: unknown): string | null {
		if (!value) {
			return null;
		}

		if (typeof value === "string") {
			return normalizeText(value);
		}

		if (Array.isArray(value)) {
			return normalizeText(
				value
					.map((item) => textFromNode(item))
					.filter(Boolean)
					.join(" "),
			);
		}

		if (typeof value !== "object") {
			return null;
		}

		const node = value as {
			simpleText?: string;
			content?: string;
			text?: string;
			runs?: unknown[];
		};

		return normalizeText(
			[
				node.simpleText,
				node.content,
				node.text,
				Array.isArray(node.runs)
					? node.runs.map((run) => textFromNode(run)).join(" ")
					: null,
			]
				.filter(Boolean)
				.join(" "),
		);
	}

	function normalizeChannelPath(path: unknown) {
		if (typeof path !== "string" || !path) {
			return null;
		}

		try {
			const url = new URL(path, window.location.origin);
			const normalizedPath = url.pathname.replace(/\/+$/, "");
			if (
				normalizedPath.startsWith("/@") ||
				normalizedPath.startsWith("/channel/")
			) {
				return normalizedPath;
			}
		} catch {
			return null;
		}

		return null;
	}

	function extractHandle(path: string | null) {
		if (!path?.startsWith("/@")) {
			return null;
		}

		return path.slice(2);
	}

	function isPlausibleChannelName(name: string | null) {
		if (!name || name.length > 120) {
			return false;
		}

		return !(
			name.includes("subscribers") ||
			name.includes("Subscribe") ||
			name.includes("Subscribed")
		);
	}

	function chooseBetterName(existingName: string | null, nextName: string | null) {
		if (!isPlausibleChannelName(existingName)) {
			return isPlausibleChannelName(nextName) ? normalizeText(nextName) : null;
		}

		if (!isPlausibleChannelName(nextName)) {
			return normalizeText(existingName);
		}

		const normalizedExisting = normalizeText(existingName);
		const normalizedNext = normalizeText(nextName);
		if (!normalizedExisting) {
			return normalizedNext;
		}
		if (!normalizedNext) {
			return normalizedExisting;
		}

		return normalizedNext.length < normalizedExisting.length
			? normalizedNext
			: normalizedExisting;
	}

	function buildSubscriptionRecord(input: {
		name: string | null;
		channelId: string | null;
		channelPath: string | null;
		description: string | null;
	}): PageSubscriptionRecord | null {
		const normalizedName = isPlausibleChannelName(input.name)
			? normalizeText(input.name)
			: null;
		const normalizedPath = normalizeChannelPath(input.channelPath);
		const finalChannelId =
			typeof input.channelId === "string" && input.channelId.startsWith("UC")
				? input.channelId
				: normalizedPath?.startsWith("/channel/")
					? (normalizedPath.split("/channel/")[1] ?? null)
					: null;

		if (!normalizedName && !finalChannelId && !normalizedPath) {
			return null;
		}

		return {
			name: normalizedName,
			channelId: finalChannelId,
			channelPath: normalizedPath,
			channelUrl: normalizedPath
				? new URL(normalizedPath, window.location.origin).href
				: null,
			handle: extractHandle(normalizedPath),
			description: normalizeText(input.description),
		};
	}

	function mergeChannelRecords(
		existingChannel: PageSubscriptionRecord,
		nextChannel: PageSubscriptionRecord,
	): PageSubscriptionRecord {
		return {
			name: chooseBetterName(existingChannel.name, nextChannel.name),
			channelId: nextChannel.channelId || existingChannel.channelId || null,
			channelPath:
				nextChannel.channelPath || existingChannel.channelPath || null,
			channelUrl: nextChannel.channelUrl || existingChannel.channelUrl || null,
			handle: nextChannel.handle || existingChannel.handle || null,
			description:
				nextChannel.description || existingChannel.description || null,
		};
	}

	function getRendererData(renderer: Element & {
		data?: unknown;
		__data?: { data?: unknown };
		__dataHost?: { data?: unknown };
	}) {
		return renderer.data || renderer.__data?.data || renderer.__dataHost?.data || null;
	}

	function getChannelRecordFromRenderer(renderer: Element): PageSubscriptionRecord | null {
		const data = getRendererData(
			renderer as Element & {
				data?: unknown;
				__data?: { data?: unknown };
				__dataHost?: { data?: unknown };
			},
		) as
			| {
					title?: unknown;
					channelId?: string;
					navigationEndpoint?: {
						browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string };
						commandMetadata?: { webCommandMetadata?: { url?: string } };
					};
					longBylineText?: {
						runs?: Array<{
							navigationEndpoint?: {
								browseEndpoint?: {
									browseId?: string;
									canonicalBaseUrl?: string;
								};
								commandMetadata?: { webCommandMetadata?: { url?: string } };
							};
						}>;
					};
					shortBylineText?: {
						runs?: Array<{
							navigationEndpoint?: {
								browseEndpoint?: {
									browseId?: string;
									canonicalBaseUrl?: string;
								};
								commandMetadata?: { webCommandMetadata?: { url?: string } };
							};
						}>;
					};
					descriptionSnippet?: unknown;
			  }
			| null;

		const endpoint =
			data?.navigationEndpoint ||
			data?.longBylineText?.runs?.[0]?.navigationEndpoint ||
			data?.shortBylineText?.runs?.[0]?.navigationEndpoint ||
			null;

		return buildSubscriptionRecord({
			name:
				textFromNode(data?.title) ||
				normalizeText(
					renderer.querySelector(`#main-link, ${CHANNEL_LINK_SELECTOR}`)?.textContent,
				),
			channelId:
				data?.channelId ||
				endpoint?.browseEndpoint?.browseId ||
				null,
			channelPath:
				endpoint?.browseEndpoint?.canonicalBaseUrl ||
				endpoint?.commandMetadata?.webCommandMetadata?.url ||
				renderer.querySelector(CHANNEL_LINK_SELECTOR)?.getAttribute("href") ||
				null,
			description: textFromNode(data?.descriptionSnippet),
		});
	}

	function getChannelRecordFromDom(renderer: Element): PageSubscriptionRecord | null {
		const channelLink = renderer.querySelector(CHANNEL_LINK_SELECTOR);
		if (!channelLink) {
			return null;
		}

		return buildSubscriptionRecord({
			name:
				normalizeText(channelLink.textContent) ||
				normalizeText(channelLink.getAttribute("title")),
			channelId: null,
			channelPath: channelLink.getAttribute("href"),
			description: normalizeText(
				renderer.querySelector("#description-text, #metadata")?.textContent,
			),
		});
	}

	async function scrollToLoadAllChannels() {
		const originalScrollTop = window.scrollY;
		let previousChannelCount = 0;
		let stablePasses = 0;

		for (let pass = 0; pass < MAX_SCROLL_PASSES; pass += 1) {
			window.scrollTo({ top: document.documentElement.scrollHeight });
			await sleep(SCROLL_WAIT_MS);

			const currentChannelCount =
				document.querySelectorAll(CHANNEL_RENDERER_SELECTOR).length;
			if (currentChannelCount === previousChannelCount) {
				stablePasses += 1;
			} else {
				stablePasses = 0;
				previousChannelCount = currentChannelCount;
			}

			if (stablePasses >= STABLE_PASSES_NEEDED) {
				break;
			}
		}

		window.scrollTo({ top: originalScrollTop });
		await sleep(SCROLL_RESTORE_WAIT_MS);
	}

	async function extractAllSubscriptions() {
		await scrollToLoadAllChannels();

		const channels = new Map<string, PageSubscriptionRecord>();
		const renderers = Array.from(
			document.querySelectorAll(CHANNEL_RENDERER_SELECTOR),
		);

		for (const renderer of renderers) {
			const nextChannel =
				getChannelRecordFromRenderer(renderer) ||
				getChannelRecordFromDom(renderer);

			if (!nextChannel) {
				continue;
			}

			const key =
				nextChannel.channelId ||
				nextChannel.channelPath ||
				nextChannel.handle ||
				nextChannel.name;
			if (!key) {
				continue;
			}

			const existing = channels.get(key);
			channels.set(
				key,
				existing ? mergeChannelRecords(existing, nextChannel) : nextChannel,
			);
		}

		return Array.from(channels.values()).sort((left, right) =>
			(left.name || left.channelPath || "").localeCompare(
				right.name || right.channelPath || "",
			),
		);
	}

	return extractAllSubscriptions().then((channels) => ({ channels }));
}
