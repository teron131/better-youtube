/**
 * Component displaying video metadata including thumbnail, title, author, and statistics.
 */

import { Card } from "@ui/components/ui/card";
import { CalendarDays, Clock, Eye, ThumbsUp, User } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { formatDate, trimLeadingZeros } from "@/core/utils/date";
import { s2tw } from "@/core/utils/text";
import { extractVideoId, getThumbnailUrl } from "@/core/utils/url";

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

const BLACK_BAR_THRESHOLD = 20;
const CONTENT_ROW_RATIO = 0.08;
const CONTENT_COL_RATIO = 0.08;

function getFallbackThumbnailUrl(url?: string | null): string | null {
  if (!url) return null;
  const videoId = extractVideoId(url);
  return videoId ? getThumbnailUrl(videoId) : null;
}

function isContentPixel(data: Uint8ClampedArray, index: number): boolean {
  const alpha = data[index + 3] ?? 0;
  if (alpha < 16) return false;

  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  return red > BLACK_BAR_THRESHOLD || green > BLACK_BAR_THRESHOLD || blue > BLACK_BAR_THRESHOLD;
}

function findCropBounds(
  imageData: ImageData,
): { top: number; bottom: number; left: number; right: number } | null {
  const { data, width, height } = imageData;
  const minContentPixelsPerRow = Math.max(1, Math.floor(width * CONTENT_ROW_RATIO));
  const minContentPixelsPerCol = Math.max(1, Math.floor(height * CONTENT_COL_RATIO));

  let top = 0;
  while (top < height) {
    let contentPixels = 0;
    for (let x = 0; x < width; x += 1) {
      if (isContentPixel(data, (top * width + x) * 4)) contentPixels += 1;
    }
    if (contentPixels >= minContentPixelsPerRow) break;
    top += 1;
  }

  let bottom = height - 1;
  while (bottom >= top) {
    let contentPixels = 0;
    for (let x = 0; x < width; x += 1) {
      if (isContentPixel(data, (bottom * width + x) * 4)) contentPixels += 1;
    }
    if (contentPixels >= minContentPixelsPerRow) break;
    bottom -= 1;
  }

  let left = 0;
  while (left < width) {
    let contentPixels = 0;
    for (let y = top; y <= bottom; y += 1) {
      if (isContentPixel(data, (y * width + left) * 4)) contentPixels += 1;
    }
    if (contentPixels >= minContentPixelsPerCol) break;
    left += 1;
  }

  let right = width - 1;
  while (right >= left) {
    let contentPixels = 0;
    for (let y = top; y <= bottom; y += 1) {
      if (isContentPixel(data, (y * width + right) * 4)) contentPixels += 1;
    }
    if (contentPixels >= minContentPixelsPerCol) break;
    right -= 1;
  }

  if (top === 0 && bottom === height - 1 && left === 0 && right === width - 1) {
    return null;
  }

  if (top >= bottom || left >= right) {
    return null;
  }

  return { top, bottom, left, right };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load thumbnail"));
    image.src = src;
  });
}

async function cropThumbnailBars(src: string): Promise<string> {
  const image = await loadImage(src);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return src;

  sourceContext.drawImage(image, 0, 0);
  const cropBounds = findCropBounds(
    sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height),
  );
  if (!cropBounds) return src;

  const cropWidth = cropBounds.right - cropBounds.left + 1;
  const cropHeight = cropBounds.bottom - cropBounds.top + 1;
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedContext = croppedCanvas.getContext("2d");
  if (!croppedContext) return src;

  croppedContext.drawImage(
    sourceCanvas,
    cropBounds.left,
    cropBounds.top,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return croppedCanvas.toDataURL("image/jpeg", 0.92);
}

function useCroppedThumbnail(thumbnail?: string | null, url?: string | null): string | null {
  const baseThumbnail = thumbnail || getFallbackThumbnailUrl(url);
  const [displayThumbnail, setDisplayThumbnail] = useState<string | null>(baseThumbnail);

  useEffect(() => {
    let isCancelled = false;

    if (!baseThumbnail) {
      setDisplayThumbnail(null);
      return;
    }

    setDisplayThumbnail(baseThumbnail);
    void cropThumbnailBars(baseThumbnail)
      .then((croppedThumbnail) => {
        if (!isCancelled) setDisplayThumbnail(croppedThumbnail);
      })
      .catch(() => {
        if (!isCancelled) setDisplayThumbnail(baseThumbnail);
      });

    return () => {
      isCancelled = true;
    };
  }, [baseThumbnail]);

  return displayThumbnail;
}

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
  const displayDuration = trimLeadingZeros(duration || undefined);
  const hasMetrics = viewCount != null || likeCount != null;
  const formattedUploadDate = formatDate(uploadDate);
  const displayThumbnail = useCroppedThumbnail(thumbnail, url);
  const displayTitle = title ? s2tw(title) : title;
  const displayAuthor = author ? s2tw(author) : author;
  const primaryInfoItems = [
    displayAuthor
      ? {
          key: "author",
          icon: <User className="w-4 h-4 text-primary" />,
          value: displayAuthor,
        }
      : null,
    displayDuration
      ? {
          key: "duration",
          icon: <Clock className="w-4 h-4 text-primary" />,
          value: displayDuration,
        }
      : null,
    formattedUploadDate
      ? {
          key: "uploadDate",
          icon: <CalendarDays className="w-4 h-4 text-primary" />,
          value: formattedUploadDate,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; icon: ReactNode; value: string }>;
  const metricItems = [
    viewCount != null
      ? {
          key: "views",
          icon: <Eye className="w-4 h-4 text-primary" />,
          value: viewCount.toLocaleString(),
        }
      : null,
    likeCount != null
      ? {
          key: "likes",
          icon: <ThumbsUp className="w-4 h-4 text-primary" />,
          value: likeCount.toLocaleString(),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; icon: ReactNode; value: string }>;

  if (!title) return null;

  return (
    <Card className="p-6 shadow-md">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0 w-full sm:w-64 md:w-80">
          <div className="relative rounded-xl border border-border/60 shadow-lg overflow-hidden bg-muted/20">
            {displayThumbnail ? (
              <img
                src={displayThumbnail}
                alt={title || "Video thumbnail"}
                className="w-full h-auto object-contain block"
                decoding="async"
              />
            ) : (
              <div className="aspect-video w-full bg-muted/30" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <h3 className="text-2xl font-black tracking-tight text-foreground line-clamp-2 leading-tight">
            {displayTitle || "Title not available"}
          </h3>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground">
            {primaryInfoItems.map((item) => (
              <InfoItem key={item.key} icon={item.icon} value={item.value} />
            ))}

            {hasMetrics && <div className="basis-full" />}

            {metricItems.map((item) => (
              <InfoItem key={item.key} icon={item.icon} value={item.value} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
