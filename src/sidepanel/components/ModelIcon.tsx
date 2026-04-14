/**
 * Model Icon component with fallback logic.
 * Relies on props provided by the caller, which should be enriched by the stats service.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/core/utils/text";

const REMOTE_IMAGE_BLOB_URL_BY_SOURCE = new Map<string, string | null>();
const REMOTE_IMAGE_LOAD_BY_SOURCE = new Map<string, Promise<string | null>>();

function isRemoteImageSource(source: string): boolean {
	return /^https?:\/\//i.test(source);
}

async function loadRemoteImageBlobUrl(source: string): Promise<string | null> {
	if (REMOTE_IMAGE_BLOB_URL_BY_SOURCE.has(source)) {
		return REMOTE_IMAGE_BLOB_URL_BY_SOURCE.get(source) ?? null;
	}

	const existingRequest = REMOTE_IMAGE_LOAD_BY_SOURCE.get(source);
	if (existingRequest) {
		return existingRequest;
	}

	const loadRequest = fetch(source)
		.then(async (response) => {
			if (!response.ok) {
				return null;
			}

			const imageBlob = await response.blob();
			const blobUrl = URL.createObjectURL(imageBlob);
			REMOTE_IMAGE_BLOB_URL_BY_SOURCE.set(source, blobUrl);
			return blobUrl;
		})
		.catch(() => null)
		.finally(() => {
			REMOTE_IMAGE_LOAD_BY_SOURCE.delete(source);
		});

	REMOTE_IMAGE_LOAD_BY_SOURCE.set(source, loadRequest);
	return loadRequest;
}

interface ModelIconProps {
	provider?: string;
	logo?: string;
	fallbackLogo?: string;
	alt?: string;
	className?: string;
}

export function ModelIcon({
	provider,
	logo,
	fallbackLogo,
	alt = "",
	className = "h-4 w-4 object-contain",
}: ModelIconProps) {
	const sources = useMemo(() => {
		const seen = new Set<string>();
		return [logo, fallbackLogo].filter((candidate): candidate is string => {
			if (!candidate || seen.has(candidate)) {
				return false;
			}
			seen.add(candidate);
			return true;
		});
	}, [fallbackLogo, logo]);
	const sourceKey = sources.join("|");
	const [sourceState, setSourceState] = useState({
		key: sourceKey,
		index: 0,
	});
	const sourceIndex = sourceState.key === sourceKey ? sourceState.index : 0;
	const src = sources[sourceIndex] ?? null;
	const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

	const handleError = useCallback(() => {
		if (sourceIndex < sources.length - 1) {
			setSourceState({
				key: sourceKey,
				index: sourceIndex + 1,
			});
			return;
		}
		setSourceState({
			key: sourceKey,
			index: sources.length,
		});
	}, [sourceIndex, sourceKey, sources.length]);

	useEffect(() => {
		if (!src) {
			setResolvedSrc(null);
			return;
		}

		if (!isRemoteImageSource(src)) {
			setResolvedSrc(src);
			return;
		}

		let cancelled = false;
		setResolvedSrc(null);

		void loadRemoteImageBlobUrl(src).then((blobUrl) => {
			if (cancelled) {
				return;
			}
			if (blobUrl) {
				setResolvedSrc(blobUrl);
				return;
			}
			handleError();
		});

		return () => {
			cancelled = true;
		};
	}, [src, handleError]);

	if (!src || !resolvedSrc) {
		const badgeText = (provider || alt)
			.split(/[^a-z0-9]+/i)
			.filter(Boolean)
			.map((part) => part[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();

		if (!badgeText) {
			return null;
		}

		return (
			<span
				title={alt || provider}
				className={cn(
					"inline-flex items-center justify-center rounded-[4px] border border-border/60 bg-muted/60 text-[0.5rem] font-semibold uppercase leading-none text-foreground/80",
					className,
				)}
			>
				{badgeText}
			</span>
		);
	}

	return (
		<img
			src={resolvedSrc}
			alt={alt || provider}
			className={className}
			onError={handleError}
			loading="lazy"
			decoding="async"
		/>
	);
}
