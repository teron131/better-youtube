/**
 * Date and duration formatting utilities
 */

/**
 * Format date string to readable format
 */
export function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  
  // Handle YYYYMMDD format
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    try {
      return new Date(`${year}-${month}-${day}`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  }
  
  // Handle ISO 8601 or other standard date strings
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Format duration string (remove leading zeros)
 */
export function formatDuration(duration?: string | null): string | null {
  if (!duration) return null;
  return duration.replace(/^0{1,2}:/, "");
}

