import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
} as const;

export interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: keyof typeof TONES;
}

export const PageHeader = ({
  icon: Icon,
  title,
  description,
  actions,
  tone = "primary",
}: PageHeaderProps) => (
  <header data-ui="page-header" className="app-page-header">
    <div className="flex min-w-0 items-start gap-3">
      <span className={`app-icon-badge shrink-0 ${TONES[tone]}`}>
        <Icon aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h1 className="app-page-title">{title}</h1>
        {description && <p className="app-page-description">{description}</p>}
      </div>
    </div>
    {actions && <div className="app-page-actions">{actions}</div>}
  </header>
);
