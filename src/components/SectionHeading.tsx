import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
} as const;

interface SectionHeadingProps {
  icon: LucideIcon;
  id?: string;
  title: string;
  description?: ReactNode;
  tone?: keyof typeof TONES;
}

export const SectionHeading = ({
  icon: Icon,
  id,
  title,
  description,
  tone = "primary",
}: SectionHeadingProps) => (
  <div data-ui="section-heading" className="flex min-w-0 items-center gap-3">
    <span className={`app-icon-badge shrink-0 ${TONES[tone]}`}>
      <Icon aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <h2 id={id} className="app-section-title">{title}</h2>
      {description && <p className="app-section-description">{description}</p>}
    </div>
  </div>
);
