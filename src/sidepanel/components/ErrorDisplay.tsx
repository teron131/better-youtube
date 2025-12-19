/**
 * Component for displaying detailed error information with troubleshooting options.
 */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { ApiError, StreamingProgressState } from "@ui/services/types";
import { AlertCircle } from "lucide-react";

interface ErrorDisplayProps {
  error: ApiError;
  progressStates: StreamingProgressState[];
  onLoadExample: () => void;
}

const getErrorTypeStyle = (type: string) => {
  if (type === 'server') return 'bg-red-100 text-red-800';
  if (type === 'validation') return 'bg-yellow-100 text-yellow-800';
  if (type === 'network') return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-800';
};

const getStatusColor = (status: string) => {
  if (status === 'completed') return 'bg-green-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-yellow-500';
};

export function ErrorDisplay({ error, progressStates, onLoadExample }: ErrorDisplayProps) {
  const hasScrapeCretorsIssue = error.message.includes('SCRAPECREATORS_API_KEY');
  const hasGeminiIssue = error.message.includes('GEMINI_API_KEY');

  return (
    <Card className="p-6 border-destructive/40 shadow-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-destructive mt-1 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-destructive mb-2">{error.message}</h3>

          <div className="flex items-center gap-4 mb-3 text-base">
            {error.type && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getErrorTypeStyle(error.type)}`}>
                {error.type.toUpperCase()}
              </span>
            )}
            {error.status && (
              <span className="text-muted-foreground">Status: {error.status}</span>
            )}
          </div>

          {error.details && (
            <div className="bg-muted/30 rounded-lg p-3 mb-3">
              <p className="text-base text-muted-foreground mb-1">Technical Details:</p>
              <p className="text-xs font-mono text-foreground break-all">{error.details}</p>
            </div>
          )}

          {progressStates.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold text-base">Progress Details:</h4>
              <div className="bg-muted/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                {progressStates.map((state, index) => (
                  <div key={index} className="text-base text-foreground font-mono mb-2">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusColor(state.status)}`} />
                    Step {state.step}: {state.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasScrapeCretorsIssue && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-base text-blue-800">
                <strong>Configuration Issue:</strong> The Scrape Creators API key is not configured on the backend server.
                Please contact the administrator to configure the required API keys.
              </p>
            </div>
          )}

          {hasGeminiIssue && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-base text-blue-800">
                <strong>Configuration Issue:</strong> The Gemini API key is not configured on the backend server.
                Please contact the administrator to configure the required API keys.
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

