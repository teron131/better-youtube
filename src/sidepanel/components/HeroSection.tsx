/**
 * Hero section component with branding, features, and main video input form.
 */

import { VideoUrlForm } from "@ui/components/VideoUrlForm";

interface HeroSectionProps {
	onSubmit: (
		url: string,
		options?: {
			targetLanguage?: string;
			summaryModel?: string;
			qualityModel?: string;
		},
		action?: "caption" | "summary",
	) => void;
	isLoading: boolean;
	initialUrl?: string;
}

export function HeroSection({
	onSubmit,
	isLoading,
	initialUrl,
}: HeroSectionProps) {
	return (
		<section className="relative overflow-hidden bg-transparent">
			<div className="relative sidepanel-container pt-[calc(var(--sidepanel-topbar-offset)+var(--sidepanel-topbar-height)+1rem)] pb-12 lg:pb-16">
				<div className="flex flex-col items-stretch gap-6 sm:gap-8">
					<div className="space-y-4 w-full">
						<div className="space-y-3 fade-in-up stagger-1 px-6">
							<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-foreground tracking-tight text-left">
								YouTube Video
								<span className="block text-[hsl(0,100%,40%)]">
									Structured Summary
								</span>
							</h1>
						</div>
					</div>

					<div className="relative fade-in-up stagger-3 w-full">
						<VideoUrlForm
							onSubmit={onSubmit}
							isLoading={isLoading}
							initialUrl={initialUrl}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
