import {
  isFormValid,
  prepareProcessingOptions,
  validateYouTubeUrl,
} from "@/core/utils/validation";
import { ExampleUrls } from "@ui/components/ExampleUrls";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { useUserPreferences } from "@ui/hooks/use-config";
import { AlertCircle, Captions, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface VideoUrlFormProps {
  onSubmit: (
    url: string,
    options?: {
      targetLanguage?: string;
      summaryModel?: string;
      qualityModel?: string;
      fastMode?: boolean;
    },
    action?: "caption" | "summary",
  ) => void;
  isLoading: boolean;
  initialUrl?: string;
}

export const VideoUrlForm = ({
  onSubmit,
  isLoading,
  initialUrl,
}: VideoUrlFormProps) => {
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

  const handleSubmit = async (
    e: React.SyntheticEvent,
    action: "caption" | "summary" = "summary",
  ) => {
    e.preventDefault();
    const trimmedUrl = url.trim();

    const options = prepareProcessingOptions(
      preferences.targetLanguage,
      preferences.summaryModel,
      preferences.qualityModel,
      preferences.fastMode,
    );

    if (!trimmedUrl) {
      setValidationError("");
      onSubmit("", options, action);
      return;
    }

    const validation = validateYouTubeUrl(trimmedUrl);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid URL");
      return;
    }

    setValidationError("");
    onSubmit(trimmedUrl, options, action);
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setShowExamples(false);
    setValidationError("");
  };

  return (
    <Card className="w-full rounded-[24px] p-0 border-border/50 hover:border-primary/20 transition-all duration-500">
      <div className="space-y-5 p-6">
        <form
          onSubmit={(event) => handleSubmit(event, "summary")}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={handleUrlChange}
              className={`h-12 rounded-xl border-input bg-background text-sm shadow-sm transition-all duration-300 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-1 focus:ring-primary ${
                validationError
                  ? "border-destructive focus:ring-destructive"
                  : "hover:border-primary/40"
              }`}
              disabled={isLoading}
            />

            {validationError && (
              <Alert
                variant="destructive"
                className="border-destructive/50 bg-destructive/10"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {showExamples && <ExampleUrls onSelect={handleExampleClick} />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              disabled={isLoading || !isFormValid(url)}
              onClick={(event) => handleSubmit(event, "caption")}
              variant="outline"
              size="sm"
              className="h-9 w-full gap-2 rounded-lg border-primary/20 bg-transparent text-xs font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition-all"
            >
              <Captions className="w-3.5 h-3.5" />
              <span>Caption</span>
            </Button>

            <Button
              type="submit"
              disabled={isLoading || !isFormValid(url)}
              variant="outline"
              size="sm"
              className="h-9 w-full gap-2 rounded-lg border-primary/20 bg-transparent text-xs font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Summary</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
};
