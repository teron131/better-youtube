/**
 * Model Icon component with fallback logic.
 * Relies on props provided by the caller, which should be enriched by the stats service.
 */

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/core/utils/text";

function imageSources(logo?: string, fallbackLogo?: string): string[] {
	const seen = new Set<string>();
	return [logo, fallbackLogo].filter((candidate): candidate is string => {
		if (!candidate || seen.has(candidate)) {
			return false;
		}
		seen.add(candidate);
		return true;
	});
}

function modelBadgeText(provider?: string, alt?: string): string {
	return (provider || alt || "")
		.split(/[^a-z0-9]+/i)
		.filter(Boolean)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
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
	const sources = useMemo(
		() => imageSources(logo, fallbackLogo),
		[fallbackLogo, logo],
	);
	const sourceKey = sources.join("|");
	const [sourceState, setSourceState] = useState({
		key: sourceKey,
		index: 0,
	});
	const sourceIndex = sourceState.key === sourceKey ? sourceState.index : 0;
	const src = sources[sourceIndex] ?? null;

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

	if (!src) {
		const badgeText = modelBadgeText(provider, alt);

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
			src={src}
			alt={alt || provider}
			className={className}
			onError={handleError}
			loading="lazy"
			decoding="async"
			referrerPolicy="no-referrer"
		/>
	);
}
