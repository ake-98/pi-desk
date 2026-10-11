import { forwardRef, type ButtonHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "icon";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent/60 disabled:pointer-events-none disabled:opacity-50",
        {
          default: "bg-accent text-accent-foreground hover:bg-accent/90",
          ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
          outline: "border border-border text-foreground hover:bg-muted",
          danger: "border border-red-900/60 text-red-400 hover:bg-red-950/40",
        }[variant],
        {
          sm: "h-7 px-2.5",
          md: "h-8 px-3",
          icon: "h-7 w-7",
        }[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Badge({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
