/** Shows a failed summary request with an option to load the example summary. */

import { Button } from "@ui/components/ui/button";
import { AlertCircle } from "lucide-react";

import type { ApiError } from "@/core/types";

interface ErrorDisplayProps {
  error: ApiError;
  onLoadExample: () => void;
}

export function ErrorDisplay({ error, onLoadExample }: ErrorDisplayProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/40 p-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Couldn't generate the summary</p>
          <p className="break-words text-sm text-muted-foreground">{error.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onLoadExample}>
          Load example summary
        </Button>
      </div>
    </div>
  );
}
