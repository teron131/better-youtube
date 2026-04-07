/**
 * Component displaying structured AI summary with summary, takeaways, chapters, and keywords.
 */

import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { SectionHeader } from "@ui/components/ui/list-items";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { useToast } from "@ui/hooks/use-toast";
import {
    BookOpen,
    ChevronDown,
    ChevronUp,
    Copy,
    ListChecks,
    RefreshCw,
    Search,
    Sparkles,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { QualityData, Summary, VideoInfoResponse } from "@/core/types";
import { generateSummaryMarkdown } from "@/core/utils/markdown";
import { toChineseSummary } from "@/core/utils/text";

interface SummaryPanelProps {
    summary: Summary;
    quality?: QualityData;
    videoInfo?: VideoInfoResponse;
    provider?: "gemini" | "openrouter";
    onRegenerate?: () => void;
    isRegenerating?: boolean;
}

export const SummaryPanel = ({
    summary,
    quality,
    videoInfo,
    provider,
    onRegenerate,
    isRegenerating,
}: SummaryPanelProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [matchCount, setMatchCount] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    if (!summary) return null;

    const convertedSummary = toChineseSummary(summary);

    const copyToClipboard = async () => {
        try {
            const markdown = generateSummaryMarkdown(summary, videoInfo);
            await navigator.clipboard.writeText(markdown);
            toast({
                title: "Copied!",
                description: "Video info and summary copied to clipboard",
            });
        } catch (error) {
            toast({
                title: "Copy failed",
                description: "Unable to copy summary",
                variant: "destructive",
            });
        }
    };

    const handleRegenerate = () => {
        if (onRegenerate) {
            onRegenerate();
            toast({
                title: "Regenerating summary",
                description: "Starting a new summary of the video",
            });
        }
    };

    const highlightText = (text: string) => {
        if (!text) return "";
        if (!searchQuery.trim()) return text;

        const regex = new RegExp(
            `(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi",
        );
        const parts = text.split(regex);

        let matchIndex = -1;
        return parts
            .map((part) => {
                if (regex.test(part)) {
                    matchIndex++;
                    const isCurrent = matchIndex === currentMatchIndex;
                    return `<mark class="${isCurrent ? "bg-primary text-primary-foreground" : "bg-yellow-500/30"}">${part}</mark>`;
                }
                return part;
            })
            .join("");
    };

    const getTextContent = () => {
        let text = convertedSummary.overview || "";
        if (convertedSummary.chapters) {
            convertedSummary.chapters.forEach((chapter) => {
                text +=
                    " " +
                    (chapter.title || "") +
                    " " +
                    (chapter.description || "");
            });
        }
        return text;
    };

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        setCurrentMatchIndex(0);

        if (query.trim()) {
            const text = getTextContent();
            const regex = new RegExp(
                query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "gi",
            );
            const matches = text.match(regex);
            setMatchCount(matches ? matches.length : 0);
        } else {
            setMatchCount(0);
        }
    };

    const navigateMatches = (direction: "next" | "prev") => {
        if (matchCount === 0) return;

        if (direction === "next") {
            setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
        } else {
            setCurrentMatchIndex(
                (prev) => (prev - 1 + matchCount) % matchCount,
            );
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setCurrentMatchIndex(0);
        setMatchCount(0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && matchCount > 0) {
            e.preventDefault();
            navigateMatches("next");
        }
    };

    useEffect(() => {
        if (contentRef.current && searchQuery.trim()) {
            const marks = contentRef.current.querySelectorAll("mark");
            if (marks[currentMatchIndex]) {
                marks[currentMatchIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }
    }, [currentMatchIndex, searchQuery]);

    return (
        <Card className="p-0 shadow-md">
            <div className="relative space-y-6 p-6">
                {/* Main Header */}
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
                                <ListChecks className="h-4 w-4" />
                                AI Summary
                            </div>
                            <h3 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                                Structured Summary
                            </h3>
                            <p className="text-sm md:text-base text-muted-foreground">
                                Detailed breakdown and key takeaways from the
                                video.
                            </p>
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
                                            className="h-8 w-8 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <RefreshCw
                                                className={`w-4 h-4 ${isRegenerating ? "animate-spin" : ""}`}
                                            />
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
                                        className="h-8 w-8 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                                    >
                                        <Copy className="w-4 h-4" />
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
                                className="pl-10 pr-24 h-8 text-sm border-border/60 focus:border-primary/50"
                            />
                            {searchQuery && (
                                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {matchCount > 0
                                            ? `${currentMatchIndex + 1}/${matchCount}`
                                            : "No matches"}
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
                                    onClick={() => navigateMatches("prev")}
                                    className="h-8 w-8 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                                >
                                    <ChevronUp className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigateMatches("next")}
                                    className="h-8 w-8 border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <div ref={contentRef} className="space-y-6 md:space-y-7">
                    {/* Summary Section */}
                    {convertedSummary.overview && (
                        <div className="space-y-2.5">
                            <SectionHeader
                                icon={
                                    <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                                }
                                title="Summary"
                            />
                            <div
                                className="summary-text text-foreground"
                                dangerouslySetInnerHTML={{
                                    __html: highlightText(
                                        convertedSummary.overview,
                                    ),
                                }}
                            />
                        </div>
                    )}

                    {/* Video Chapters Section */}
                    {convertedSummary.chapters &&
                        convertedSummary.chapters.length > 0 && (
                            <div className="space-y-2.5">
                                <SectionHeader
                                    icon={
                                        <BookOpen className="w-4 h-4 md:w-5 md:h-5" />
                                    }
                                    title="Video Chapters"
                                />

                                <div className="space-y-4">
                                    {convertedSummary.chapters.map(
                                        (chapter, index) => (
                                            <div
                                                key={index}
                                                className="space-y-2"
                                            >
                                                <h5 className="summary-subheading text-sm md:text-base font-semibold text-primary">
                                                    <span className="inline-flex items-center justify-center h-5 w-5 md:h-6 md:w-6 rounded-full bg-primary/10 text-primary text-xs md:text-sm mr-2">
                                                        {index + 1}
                                                    </span>
                                                    {provider === "gemini" &&
                                                        (chapter.startTime ||
                                                            chapter.endTime) && (
                                                            <span className="mr-2 text-xs md:text-sm text-muted-foreground font-medium">
                                                                {[
                                                                    chapter.startTime,
                                                                    chapter.endTime,
                                                                ]
                                                                    .filter(
                                                                        Boolean,
                                                                    )
                                                                    .join("-")}
                                                            </span>
                                                        )}
                                                    <span
                                                        dangerouslySetInnerHTML={{
                                                            __html: highlightText(
                                                                chapter.title,
                                                            ),
                                                        }}
                                                    />
                                                </h5>
                                                <div
                                                    className="summary-text text-foreground"
                                                    dangerouslySetInnerHTML={{
                                                        __html: highlightText(
                                                            chapter.description,
                                                        ),
                                                    }}
                                                />
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}
                </div>
            </div>
        </Card>
    );
};
