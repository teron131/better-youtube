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
      <div className="relative sidepanel-container pt-20 pb-12 lg:pb-16">
        <div className="flex flex-col items-stretch gap-2">
          <div className="space-y-4 w-full">
            <div className="space-y-3 fade-in-up stagger-1 px-6">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-foreground tracking-tight text-left">
                YouTube Video
                <span className="block bg-gradient-to-r from-primary via-primary/80 to-white bg-clip-text text-transparent animate-glow">
                  Structured Summary
                </span>
              </h1>
            </div>
          </div>

          <div className="relative fade-in-up stagger-3 w-full">
            <div className="absolute inset-0 -z-10 rounded-[30px] bg-gradient-to-br from-primary/20 via-transparent to-foreground/10 blur-3xl" />
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
