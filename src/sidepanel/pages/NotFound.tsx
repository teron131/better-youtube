/**
 * 404 error page component for handling non-existent routes.
 */

import { Button } from "@ui/components/ui/button";
import { useEffect } from "react";
import { SIDEPANEL_ROUTE_HREFS } from "../lib/routes";

interface NotFoundProps {
	path: string;
}

const NotFound = ({ path }: NotFoundProps) => {
	useEffect(() => {
		console.error(
			"404 Error: User attempted to access non-existent route:",
			path,
		);
	}, [path]);

	return (
		<div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
			<div className="relative text-center px-6 py-12 space-y-6">
				<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
					Page not found
				</div>
				<div className="space-y-3">
					<h1 className="text-4xl sm:text-5xl font-black leading-tight text-foreground">
						Lost in the feed?
						<span className="block bg-gradient-to-r from-primary via-primary/80 to-white bg-clip-text text-transparent">
							404
						</span>
					</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
						We couldn't find the page you're looking for. Double-check the link
						or head back home to continue analyzing videos.
					</p>
				</div>
				<div className="flex justify-center">
					<Button asChild size="lg" className="px-6 h-12">
						<a href={SIDEPANEL_ROUTE_HREFS.home}>Return home</a>
					</Button>
				</div>
			</div>
		</div>
	);
};

export default NotFound;
