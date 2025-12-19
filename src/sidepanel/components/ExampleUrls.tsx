/**
 * Component displaying clickable example YouTube URLs for quick testing.
 */

import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { EXAMPLE_YOUTUBE_URLS } from "@ui/lib/url-utils";
import { ExternalLink, Youtube } from "lucide-react";

interface ExampleUrlsProps {
  onSelect: (url: string) => void;
}

export function ExampleUrls({ onSelect }: ExampleUrlsProps) {
  return (
    <div className="space-y-3">
      <Alert className="border-primary/50 bg-primary/5">
        <Youtube className="h-4 w-4 text-primary" />
        <AlertDescription className="text-primary">
          Try one of these example URLs to see how it works:
        </AlertDescription>
      </Alert>
      
      <div className="grid gap-2">
        {EXAMPLE_YOUTUBE_URLS.map((exampleUrl, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(exampleUrl)}
            className="text-left p-3 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ExternalLink className="w-3 h-3 text-primary flex-shrink-0" />
              <code className="text-sm text-muted-foreground break-all">
                {exampleUrl}
              </code>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

