/**
 * Model Icon component with fallback logic.
 * Relies on props provided by the caller, which should be enriched by the stats service.
 */

import { useEffect, useState } from "react";

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
    const [src, setSrc] = useState<string | null>(null);
    const [triedFallback, setSrcTriedFallback] = useState(false);

    // Initial source resolution
    useEffect(() => {
        setSrcTriedFallback(false);
        if (logo) {
            setSrc(logo);
        } else {
            setSrc(null);
        }
    }, [logo]);

    const handleError = () => {
        if (!triedFallback && fallbackLogo && fallbackLogo !== src) {
            setSrcTriedFallback(true);
            setSrc(fallbackLogo);
        } else {
            setSrc(null);
        }
    };

    if (!src) return null;

    return (
        <img
            src={src}
            alt={alt || provider}
            className={className}
            onError={handleError}
            loading="lazy"
            decoding="async"
        />
    );
}
