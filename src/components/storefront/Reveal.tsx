import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type RevealProps = PropsWithChildren<{
  delayMs?: number;
  className?: string;
}>;

const Reveal = ({ children, delayMs = 0, className }: RevealProps) => {
  return (
    <div className={cn("reveal will-change-transform", className)} style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
};

export default Reveal;
