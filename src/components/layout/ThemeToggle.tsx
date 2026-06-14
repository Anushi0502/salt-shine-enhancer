import { type HTMLAttributes } from "react";
import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeToggleProps = HTMLAttributes<HTMLButtonElement>;

const ThemeToggle = ({ className, ...props }: ThemeToggleProps) => {
  return (
    <button
      type="button"
      disabled
      className={cn(
        "group relative inline-flex h-10 w-auto items-center gap-2 rounded-full border border-border/80 bg-card/92 px-4 shadow-[0_14px_24px_-22px_rgba(0,0,0,0.35)] transition",
        className,
      )}
      aria-label="Light mode only"
      title="Light mode only"
      {...props}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
        <Sun className="h-4 w-4" />
      </span>
      <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-foreground">
        Light only
      </span>
    </button>
  );
};

export default ThemeToggle;
