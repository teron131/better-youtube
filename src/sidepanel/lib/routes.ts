/** Normalizes hash-based routes for the extension side panel. */

const ROOT_PATHS = new Set(["", "#", "/", "/sidepanel.html"]);

export const SIDEPANEL_ROUTE_HREFS = {
  home: "#/",
  settings: "#/settings",
} as const;

export function normalizeSidepanelPath(rawPath: string): string {
  if (ROOT_PATHS.has(rawPath)) {
    return "/";
  }

  const withoutHash = rawPath.startsWith("#") ? rawPath.slice(1) : rawPath;
  const [pathname] = withoutHash.split("?");
  const normalizedPath = pathname || "/";

  if (ROOT_PATHS.has(normalizedPath)) {
    return "/";
  }

  if (!normalizedPath.startsWith("/")) {
    return `/${normalizedPath}`;
  }

  return normalizedPath === "/" ? normalizedPath : normalizedPath.replace(/\/+$/, "");
}

export function getCurrentSidepanelPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  if (window.location.hash) {
    return normalizeSidepanelPath(window.location.hash);
  }

  return normalizeSidepanelPath(window.location.pathname);
}
