/**
 * Collapsible panel component for displaying and copying video transcript.
 */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@ui/components/ui/collapsible";
import { Input } from "@ui/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/components/ui/tooltip";
import { useToast } from "@ui/hooks/use-toast";
import { ChevronDown, ChevronUp, Copy, FileText, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TranscriptPanelProps {
  transcript: string;
}

export const TranscriptPanel = ({ transcript }: TranscriptPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      toast({
        title: "Copied!",
        description: "Transcript copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy transcript",
        variant: "destructive",
      });
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!text) return "";
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    let matchIndex = -1;
    return parts.map((part, i) => {
      if (regex.test(part)) {
        matchIndex++;
        const isCurrent = matchIndex === currentMatchIndex;
        return `<mark class="${isCurrent ? 'bg-primary text-primary-foreground' : 'bg-yellow-500/30'}">${part}</mark>`;
      }
      return part;
    }).join('');
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);

    if (query.trim()) {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = transcript.match(regex);
      setMatchCount(matches ? matches.length : 0);
    } else {
      setMatchCount(0);
    }
  };

  const navigateMatches = (direction: 'next' | 'prev') => {
    if (matchCount === 0) return;

    if (direction === 'next') {
      setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
    } else {
      setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
    setMatchCount(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && matchCount > 0) {
      e.preventDefault();
      navigateMatches('next');
    }
  };

  useEffect(() => {
    if (transcriptRef.current && searchQuery.trim()) {
      const marks = transcriptRef.current.querySelectorAll('mark');
      if (marks[currentMatchIndex]) {
        marks[currentMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, searchQuery]);

  return (
    <Card className="p-0">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full p-6 h-auto justify-between hover:bg-transparent transition-all duration-300"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-left">
                <span className="text-2xl font-black tracking-tight text-foreground block">Transcript</span>
                <span className="text-muted-foreground text-sm">Complete video transcription</span>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-6 w-6 text-primary" />
            ) : (
              <ChevronDown className="h-6 w-6 text-primary" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="px-6 pb-6">
          <div className="space-y-6">
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10 pr-24 h-12 border-border/60 focus:border-primary/50"
                />
                {searchQuery && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : 'No matches'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSearch}
                      className="h-6 w-6 p-0 hover:bg-primary/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {searchQuery && matchCount > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigateMatches('prev')}
                    className="gap-3 h-12 px-4 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigateMatches('next')}
                    className="gap-3 h-12 px-4 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </Button>
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={copyToClipboard}
                    className="gap-3 h-12 px-4 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                  >
                    <Copy className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div
              ref={transcriptRef}
              className="glass-effect rounded-2xl p-6 max-h-96 overflow-y-auto border border-primary/10"
            >
              <div
                className="text-foreground leading-relaxed whitespace-pre-wrap font-mono summary-text"
                dangerouslySetInnerHTML={{ __html: highlightText(transcript, searchQuery) }}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
