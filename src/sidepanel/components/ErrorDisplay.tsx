/** Shows a failed summary request with an option to load the example summary. */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { AlertCircle } from "lucide-react";

import type { ApiError } from "@/core/types";

interface ErrorDisplayProps {
  error: ApiError;
  onLoadExample: () => void;
}

export function ErrorDisplay({ error, onLoadExample }: ErrorDisplayProps) {
  return (
    <Card className="p-6 border-destructive/40 shadow-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-destructive mt-1 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-destructive mb-2">{error.message}</h3>

          <div className="flex items-center gap-4 mb-3 text-base">
            {error.type && (
              <span className="px-2 py-1 rounded-full border text-xs font-medium border-border/60 bg-muted/40 text-foreground">
                {error.type.toUpperCase()}
              </span>
            )}
          </div>

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
