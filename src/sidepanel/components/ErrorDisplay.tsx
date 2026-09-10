/**
 * Component for displaying detailed error information with troubleshooting options.
 */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import type { ApiError } from "@ui/services/types";
import { AlertCircle } from "lucide-react";

interface ErrorDisplayProps {
  error: ApiError;
  onLoadExample: () => void;
}

const getErrorTypeStyle = (type: string) => {
  if (type === "server") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (type === "validation") return "border-primary/30 bg-primary/10 text-primary";
  if (type === "network") return "border-border/60 bg-muted/40 text-foreground";
  return "border-border/60 bg-muted/40 text-foreground";
};

export function ErrorDisplay({ error, onLoadExample }: ErrorDisplayProps) {
  const hasGeminiIssue = error.message.includes("GEMINI_API_KEY");

  return (
    <Card className="p-6 border-destructive/40 shadow-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-destructive mt-1 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-destructive mb-2">{error.message}</h3>

          <div className="flex items-center gap-4 mb-3 text-base">
            {error.type && (
              <span
                className={`px-2 py-1 rounded-full border text-xs font-medium ${getErrorTypeStyle(error.type)}`}
              >
                {error.type.toUpperCase()}
              </span>
            )}
            {error.status && <span className="text-muted-foreground">Status: {error.status}</span>}
          </div>

          {error.details && (
            <div className="bg-muted/30 rounded-lg p-3 mb-3">
              <p className="text-base text-muted-foreground mb-1">Technical Details:</p>
              <p className="text-xs font-mono text-foreground break-all">{error.details}</p>
            </div>
          )}

          {hasGeminiIssue && (
            <div className="mt-3 p-3 bg-muted/30 border border-border/60 rounded-lg">
              <p className="text-base text-foreground">
                <strong>Configuration Issue:</strong> The Gemini API key is not configured on the
                backend server. Please contact the administrator to configure the required API keys.
              </p>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <Button onClick={onLoadExample} className="bg-primary text-white">
              Load example data
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
