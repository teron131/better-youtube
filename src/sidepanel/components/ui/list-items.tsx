/**
 * Reusable list item components
 */

import { CheckCircle2 } from "lucide-react";
import { ReactNode } from "react";

interface BadgeListProps {
  items: string[];
  className?: string;
}

export function BadgeList({ items, className = "" }: BadgeListProps) {
  if (!items.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item, index) => (
        <span
          key={index}
          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

interface ChecklistProps {
  items: string[];
  className?: string;
}

export function Checklist({ items, className = "" }: ChecklistProps) {
  if (!items.length) return null;

  return (
    <ul className={`space-y-2 md:space-y-2.5 ${className}`}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <span className="text-foreground leading-7 md:leading-8 text-sm md:text-base">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface BulletListProps {
  items: string[];
  className?: string;
}

export function BulletList({ items, className = "" }: BulletListProps) {
  if (!items.length) return null;

  return (
    <ul className={`pl-2 space-y-1 ${className}`}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2 text-sm md:text-base text-foreground leading-7">
          <span className="text-primary font-bold mt-0.5">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  className?: string;
}

export function SectionHeader({ icon, title, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
        {icon}
      </div>
      <h4 className="text-sm md:text-base font-bold uppercase tracking-wide text-primary">
        {title}
      </h4>
    </div>
  );
}
