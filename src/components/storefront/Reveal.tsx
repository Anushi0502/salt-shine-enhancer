import type { CSSProperties, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";
 
type RevealProps = PropsWithChildren<{
  delayMs?: number;
  className?: string;
}>;

// A home page can render dozens of these wrappers. CSS-only opacity/transform
// motion keeps page entry smooth without a JavaScript animation runtime.
const Reveal = ({ children, className, delayMs = 0 }: RevealProps) => (
  <div
    className={cn("salt-reveal", className)}
    style={{ "--salt-reveal-delay": `${Math.max(0, delayMs)}ms` } as CSSProperties}
  >
    {children}
  </div>
);

export default Reveal;
