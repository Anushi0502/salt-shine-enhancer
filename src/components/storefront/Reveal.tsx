import type { PropsWithChildren } from "react";

type RevealProps = PropsWithChildren<{
  delayMs?: number;
  className?: string;
}>;

const Reveal = ({ children, delayMs = 0, className }: RevealProps) => {
  return (
    <div className={`reveal ${className || ""}`} style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
};

export default Reveal;
