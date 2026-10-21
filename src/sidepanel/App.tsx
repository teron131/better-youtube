/**
 * Side-panel root: hash routing between the video workspace and Settings, plus the global tooltip and toast providers.
 */

import { Toaster } from "@ui/components/ui/toaster";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { useEffect, useState } from "react";

import { loadSummaryFontSize } from "./lib/font-size";
import { getCurrentSidepanelPath } from "./lib/routes";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";

function AppRoutes() {
  const [path, setPath] = useState(getCurrentSidepanelPath);
  const [visitedHome, setVisitedHome] = useState(() => path === "/");

  useEffect(() => {
    if (path === "/") setVisitedHome(true);
  }, [path]);

  useEffect(() => {
    const updatePath = () => {
      setPath(getCurrentSidepanelPath());
    };

    window.addEventListener("hashchange", updatePath);
    window.addEventListener("popstate", updatePath);

    return () => {
      window.removeEventListener("hashchange", updatePath);
      window.removeEventListener("popstate", updatePath);
    };
  }, []);

  // The workspace stays mounted once visited, so opening Settings hides it without cancelling its work; only video navigation or closing the panel cancels.
  return (
    <>
      {(visitedHome || path === "/") && (
        <div hidden={path !== "/"}>
          <Index />
        </div>
      )}
      {path === "/settings" && <Settings />}
      {path !== "/" && path !== "/settings" && <NotFound path={path} />}
    </>
  );
}

const App = () => {
  useEffect(() => {
    loadSummaryFontSize();
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <AppRoutes />
    </TooltipProvider>
  );
};

export default App;
