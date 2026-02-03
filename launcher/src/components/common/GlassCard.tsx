import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  density?: "normal" | "compact";
}

export function GlassCard({
  children,
  className,
  hover = false,
  density = "normal",
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl transition-all duration-300",
        density === "normal" ? "p-6" : "p-4",
        hover && "glow-hover cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

interface GlassCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function GlassCardHeader({ children, className }: GlassCardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

interface GlassCardTitleProps {
  children: ReactNode;
  className?: string;
}

export function GlassCardTitle({ children, className }: GlassCardTitleProps) {
  return (
    <h3 className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </h3>
  );
}

interface GlassCardContentProps {
  children: ReactNode;
  className?: string;
}

export function GlassCardContent({ children, className }: GlassCardContentProps) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

interface GlassCardFooterProps {
  children: ReactNode;
  className?: string;
}

export function GlassCardFooter({ children, className }: GlassCardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 mt-4 pt-4 border-t border-border/50",
        className
      )}
    >
      {children}
    </div>
  );
}
