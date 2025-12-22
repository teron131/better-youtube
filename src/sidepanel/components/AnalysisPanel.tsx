/**
 * Component displaying structured AI analysis with summary, takeaways, chapters, and keywords.
 */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { SectionHeader } from "@ui/components/ui/list-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/components/ui/tooltip";
import { useToast } from "@ui/hooks/use-toast";
import { generateAnalysisMarkdown } from "@ui/lib/markdown-utils";
import { convertAnalysisChinese } from "@ui/lib/utils";
import { AnalysisData, QualityData, VideoInfoResponse } from "@ui/services/types";
import { BookOpen, ChevronDown, ChevronUp, Copy, Lightbulb, ListChecks, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AnalysisPanelProps {
  analysis: AnalysisData;
  quality?: QualityData;
  videoInfo?: VideoInfoResponse;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export const AnalysisPanel = ({ analysis, quality, videoInfo, onRegenerate, isRegenerating }: AnalysisPanelProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  if (!analysis) return null;

  const convertedAnalysis = convertAnalysisChinese(analysis);

  const copyToClipboard = async () => {
    try {
      const markdown = generateAnalysisMarkdown(analysis, videoInfo);
      await navigator.clipboard.writeText(markdown);
      toast({
        title: "Copied!",
        description: "Video info and analysis copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy analysis",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
      toast({
        title: "Regenerating analysis",
        description: "Starting a new analysis of the video",
      });
    }
  };

  const highlightText = (text: string) => {
    if (!text) return "";
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    let matchIndex = -1;
    return parts.map((part) => {
      if (regex.test(part)) {
        matchIndex++;
        const isCurrent = matchIndex === currentMatchIndex;
        return `<mark class="${isCurrent ? 'bg-primary text-primary-foreground' : 'bg-yellow-500/30'}">${part}</mark>`;
      }
      return part;
    }).join('');
  };

  const getTextContent = () => {
    let text = convertedAnalysis.summary || '';
    if (convertedAnalysis.takeaways) {
      text += ' ' + convertedAnalysis.takeaways.join(' ');
    }
    if (convertedAnalysis.chapters) {
      convertedAnalysis.chapters.forEach(chapter => {
        text += ' ' + chapter.header + ' ' + chapter.summary;
        if (chapter.key_points) {
          text += ' ' + chapter.key_points.join(' ');
        }
      });
    }
    if (convertedAnalysis.keywords) {
      text += ' ' + convertedAnalysis.keywords.join(' ');
    }
    return text;
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);

    if (query.trim()) {
      const text = getTextContent();
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = text.match(regex);
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
    if (contentRef.current && searchQuery.trim()) {
      const marks = contentRef.current.querySelectorAll('mark');
      if (marks[currentMatchIndex]) {
        marks[currentMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, searchQuery]);

  return (
    <Card className="p-0 shadow-md">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/5 via-transparent to-transparent" />

      <div className="relative space-y-6 p-6 md:p-7">
        {/* Main Header */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
                <ListChecks className="h-4 w-4" />
                AI Analysis
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">Structured Analysis</h3>
              <p className="text-sm md:text-base text-muted-foreground">Detailed breakdown and key takeaways from the video.</p>
            </div>

            <div className="flex gap-2">
              {onRegenerate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="h-10 w-10 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Rerun</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                    className="h-10 w-10 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                  >
                    <Copy className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10 pr-24 h-10 border-border/60 focus:border-primary/50"
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
                  size="icon"
                  onClick={() => navigateMatches('prev')}
                  className="h-10 w-10 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                >
                  <ChevronUp className="w-5 h-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMatches('next')}
                  className="h-10 w-10 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                >
                  <ChevronDown className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div ref={contentRef} className="space-y-6 md:space-y-7">
          {/* Summary Section */}
          {convertedAnalysis.summary && (
            <div className="space-y-2.5">
              <SectionHeader icon={<Sparkles className="w-4 h-4 md:w-5 md:h-5" />} title="Summary" />
              <div
                className="summary-text text-foreground"
                dangerouslySetInnerHTML={{ __html: highlightText(convertedAnalysis.summary) }}
              />
            </div>
          )}

          {/* Key Takeaways Section */}
          {convertedAnalysis.takeaways && convertedAnalysis.takeaways.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader icon={<Lightbulb className="w-4 h-4 md:w-5 md:h-5" />} title="Key Takeaways" />
              <ul className="space-y-2.5">
                {convertedAnalysis.takeaways.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 md:gap-3">
                    <div className="mt-1.5 flex h-4 w-4 md:h-5 md:w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5 md:h-3 md:w-3">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span
                      className="summary-text text-foreground"
                      dangerouslySetInnerHTML={{ __html: highlightText(item) }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Video Chapters Section */}
          {convertedAnalysis.chapters && convertedAnalysis.chapters.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader icon={<BookOpen className="w-4 h-4 md:w-5 md:h-5" />} title="Video Chapters" />

              <div className="space-y-4">
                {convertedAnalysis.chapters.map((chapter, index) => (
                  <div key={index} className="space-y-2">
                    <h5 className="summary-subheading text-sm md:text-base font-semibold text-primary">
                      <span className="inline-flex items-center justify-center h-5 w-5 md:h-6 md:w-6 rounded-full bg-primary/10 text-primary text-xs md:text-sm mr-2">
                        {index + 1}
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: highlightText(chapter.header) }} />
                    </h5>
                    <div
                      className="summary-text text-foreground"
                      dangerouslySetInnerHTML={{ __html: highlightText(chapter.summary) }}
                    />

                    {chapter.key_points && chapter.key_points.length > 0 && (
                      <ul className="mt-2.5 space-y-2">
                        {chapter.key_points.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 md:gap-2 text-foreground/90 summary-text">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                            <span dangerouslySetInnerHTML={{ __html: highlightText(point) }} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keywords Section */}
          {convertedAnalysis.keywords && convertedAnalysis.keywords.length > 0 && (
            <div className="space-y-2.5">
              <SectionHeader icon={<span className="text-sm md:text-base font-bold text-primary">#</span>} title="Keywords" />
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {convertedAnalysis.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    dangerouslySetInnerHTML={{ __html: highlightText(keyword) }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
