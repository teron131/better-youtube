/**
 * Component displaying video metadata including thumbnail, title, author, and statistics.
 */

import { Card } from "@ui/components/ui/card";
import { CalendarDays, Clock, Eye, ThumbsUp, User } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, trimLeadingZeros } from "@/core/utils/date";
import { s2tw } from "@/core/utils/text";
import { cleanVideoUrl } from "@/core/utils/url";

interface InfoItemProps {
    icon: ReactNode;
    value: string;
}

const InfoItem = ({ icon, value }: InfoItemProps) => (
    <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
            {icon}
        </div>
        <span className="font-medium">{value}</span>
    </div>
);

interface VideoInfoProps {
    url?: string | null;
    title?: string | null;
    thumbnail?: string | null;
    author?: string | null;
    duration?: string | null;
    viewCount?: number | null;
    likeCount?: number | null;
    uploadDate?: string | null;
}

export const VideoInfo = ({
    title,
    thumbnail,
    author,
    duration,
    viewCount,
    likeCount,
    uploadDate,
    url,
}: VideoInfoProps) => {
    if (!title) return null;

    const displayDuration = trimLeadingZeros(duration || undefined);
    const hasMetrics = viewCount != null || likeCount != null;

    const convertedInfo = {
        title: title ? s2tw(title) : title,
        author: author ? s2tw(author) : author,
    };

    const cleanedUrl = cleanVideoUrl(url);

    return (
        <Card className="p-6 shadow-md">
            <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-shrink-0 w-full sm:w-64 md:w-80">
                    <div className="relative rounded-xl border border-border/60 shadow-lg overflow-hidden">
                        <img
                            src={thumbnail || "/placeholder.svg"}
                            alt={title || "Video thumbnail"}
                            className="w-full h-auto object-contain block"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    </div>
                </div>

                <div className="flex-1 space-y-4">
                    <h3 className="text-2xl font-black tracking-tight text-foreground line-clamp-2 leading-tight">
                        {convertedInfo.title || "Title not available"}
                    </h3>
                    {cleanedUrl && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline break-all"
                        >
                            {cleanedUrl}
                        </a>
                    )}

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground">
                        <InfoItem
                            icon={<User className="w-4 h-4 text-primary" />}
                            value={
                                convertedInfo.author || "Author not available"
                            }
                        />

                        {displayDuration && (
                            <InfoItem
                                icon={
                                    <Clock className="w-4 h-4 text-primary" />
                                }
                                value={displayDuration}
                            />
                        )}

                        {uploadDate && (
                            <InfoItem
                                icon={
                                    <CalendarDays className="w-4 h-4 text-primary" />
                                }
                                value={formatDate(uploadDate)!}
                            />
                        )}

                        {hasMetrics && <div className="basis-full" />}

                        {viewCount != null && (
                            <InfoItem
                                icon={<Eye className="w-4 h-4 text-primary" />}
                                value={viewCount.toLocaleString()}
                            />
                        )}

                        {likeCount != null && (
                            <InfoItem
                                icon={
                                    <ThumbsUp className="w-4 h-4 text-primary" />
                                }
                                value={likeCount.toLocaleString()}
                            />
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};
