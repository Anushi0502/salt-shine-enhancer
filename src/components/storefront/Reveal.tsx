import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";
 
type RevealProps = PropsWithChildren<{
  delayMs?: number;
  className?: string;
}>;

// A home page can render dozens of these wrappers. Keeping it as a normal DOM
// node avoids shipping and running a motion runtime before shoppers can browse.
const Reveal = ({ children, className }: RevealProps) => <div className={cn(className)}>{children}</div>;

export default Reveal;
