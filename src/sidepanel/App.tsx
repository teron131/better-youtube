/**
 * Root application component with routing and global providers.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@ui/components/ui/sonner";
import { Toaster } from "@ui/components/ui/toaster";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { useEffect, useState } from "react";
import { loadSummaryFontSize } from "./lib/font-size";
import { getCurrentSidepanelPath } from "./lib/routes";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

function AppRoutes() {
	const [path, setPath] = useState(getCurrentSidepanelPath);

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

	switch (path) {
		case "/settings":
			return <Settings />;
		case "/":
			return <Index />;
		default:
			return <NotFound path={path} />;
	}
}

const App = () => {
	useEffect(() => {
		loadSummaryFontSize();
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<Toaster />
				<Sonner />
				<AppRoutes />
			</TooltipProvider>
		</QueryClientProvider>
	);
};

export default App;
