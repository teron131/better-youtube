/**
 * Form component for YouTube URL input and video processing options.
 */

import { ExampleUrls } from "@ui/components/ExampleUrls";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { VideoProcessingOptions } from "@ui/components/VideoProcessingOptions";
import { useUserPreferences } from "@ui/hooks/use-config";
import { isFormValid, prepareProcessingOptions, validateYouTubeUrl } from "@ui/lib/form-validation";
import { AlertCircle, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";

interface VideoUrlFormProps {
  onSubmit: (url: string, options?: {
    targetLanguage?: string;
    analysisModel?: string;
    qualityModel?: string;
  }) => void;
  isLoading: boolean;
  initialUrl?: string;
}

export const VideoUrlForm = ({ onSubmit, isLoading, initialUrl }: VideoUrlFormProps) => {
  const [url, setUrl] = useState(initialUrl || "");
  const [validationError, setValidationError] = useState<string>("");
  const [showExamples, setShowExamples] = useState(false);
  const { preferences } = useUserPreferences();

  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    if (validationError) setValidationError("");
    setShowExamples(newUrl.trim().length === 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();

    const options = prepareProcessingOptions(
      preferences.targetLanguage,
      preferences.analysisModel,
      preferences.qualityModel,
      preferences.fastMode,
    );

    if (!trimmedUrl) {
      setValidationError("");
      onSubmit("", options);
      return;
    }

    const validation = validateYouTubeUrl(trimmedUrl);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid URL");
      return;
    }

    setValidationError("");
    onSubmit(trimmedUrl, options);
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setShowExamples(false);
    setValidationError("");
  };

  return (
    <Card className="rounded-[28px] p-0 border-border/50">
      <div className="space-y-8 p-8 sm:p-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <VideoProcessingOptions />

          <div className="space-y-3">
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=dQw4w9WgXcQ"
              value={url}
              onChange={handleUrlChange}
              className={`h-16 rounded-2xl border-2 bg-card/70 px-6 text-lg shadow-inner transition-all duration-300 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-primary ${
                validationError
                  ? "border-destructive focus:ring-destructive"
                  : "border-border/60 hover:border-primary/40"
              }`}
              disabled={isLoading}
            />

            {validationError && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {showExamples && <ExampleUrls onSelect={handleExampleClick} />}
          </div>

          <Button
            type="submit"
            disabled={isLoading || !isFormValid(url)}
            className="group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-primary/80 text-lg font-semibold text-white shadow-2xl transition-transform duration-300 hover:scale-[1.01] hover:bg-primary/60 focus-visible:ring-2 focus-visible:ring-primary/80 disabled:scale-100 disabled:opacity-60"
          >
            <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-20 bg-white/10" />
            {isLoading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin flex-shrink-0" />
                <span className="font-semibold text-sm sm:text-lg break-words">Processing video...</span>
              </>
            ) : (
              <>
                <Play className="w-6 h-6 flex-shrink-0" />
                <span className="font-semibold text-sm sm:text-lg break-words">
                  {url.trim().length === 0 ? "See example" : "Summarize video"}
                </span>
              </>
            )}
          </Button>
        </form>

      </div>
    </Card>
  );
};
