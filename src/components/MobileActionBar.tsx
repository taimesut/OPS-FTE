import type { ReactNode } from "react";

interface MobileActionBarProps {
  children: ReactNode;
  className?: string;
}

export const MobileActionBar = ({ children, className = "" }: MobileActionBarProps) => (
  <div
    data-ui="mobile-action-bar"
    className={`mobile-action-bar safe-bottom ${className}`}
  >
    {children}
  </div>
);
