/** One frame for the video workspace's Captions, Transcript, and Summary sections, so their headers share one geometry and their bodies one rhythm. */

import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

interface WorkspaceSectionProps {
  icon: LucideIcon;
  title: string;
  /** Controls on the right of the header row. */
  actions?: ReactNode;
  /** Section body; a falsy value, such as a collapsed transcript, leaves only the header. */
  children?: ReactNode;
  bodyId?: string;
}

/** Header buttons beside a section title, kept quieter than the red primary action. */
export const sectionActionClassName =
  "h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground";

export function WorkspaceSection({
  icon: Icon,
  title,
  actions,
  children,
  bodyId,
}: WorkspaceSectionProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 space-y-2 border-t border-border/60 first:border-t-0"
    >
      <div className="flex h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <h2 id={titleId} className="truncate text-sm font-medium text-foreground">
            {title}
          </h2>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children && (
        <div id={bodyId} className="space-y-2 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
