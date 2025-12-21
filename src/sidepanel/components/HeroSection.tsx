/**
 * Hero section component with branding, features, and main video input form.
 */

import { VideoUrlForm } from "@ui/components/VideoUrlForm";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

interface HeroSectionProps {
  onSubmit: (url: string, options?: {
    targetLanguage?: string;
    analysisModel?: string;
    qualityModel?: string;
  }) => void;
  isLoading: boolean;
  initialUrl?: string;
}

const FEATURES = [
  { icon: <Zap className="h-4 w-4" />, label: "Fast Processing", value: "< 1 min completion" },
  { icon: <ShieldCheck className="h-4 w-4" />, label: "Structured Analysis", value: "Save time on long videos" },
  { icon: <Sparkles className="h-4 w-4" />, label: "Model Neutral", value: "OpenRouter models" },
];

export function HeroSection({ onSubmit, isLoading, initialUrl }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-transparent">
      <div className="relative container mx-auto px-6 sm:px-8 pt-24 pb-16 lg:pb-20">
        <div className="flex flex-col items-center gap-8">
          <div className="space-y-6 w-full max-w-8xl">
            <div className="space-y-3 fade-in-up stagger-1">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-foreground tracking-tight">
                YouTube Video
                <span className="block bg-gradient-to-r from-primary via-primary/80 to-white bg-clip-text text-transparent animate-glow">
                  Structured Analysis
                </span>
              </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 fade-in-up stagger-2">
              {FEATURES.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/50 bg-background/60 px-6 py-4 shadow-lg hover:border-primary/30 transition-colors duration-300"
                >
                  <div className="flex items-center gap-2 text-primary">
                    {item.icon}
                    <span className="text-xs uppercase tracking-wide">{item.label}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative fade-in-up stagger-3 w-full max-w-8xl">
            <div className="absolute inset-0 -z-10 rounded-[30px] bg-gradient-to-br from-primary/20 via-transparent to-foreground/10 blur-3xl" />
            <VideoUrlForm onSubmit={onSubmit} isLoading={isLoading} initialUrl={initialUrl} />
          </div>
        </div>
      </div>
    </section>
  );
}
