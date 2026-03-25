import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const emblemSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-11 w-28 px-2.5",
  md: "h-12 w-32 px-3",
  lg: "h-14 w-36 px-3.5",
};

const textSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

const markSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-[1.35rem]",
  md: "text-[1.55rem]",
  lg: "text-[1.82rem]",
};

const microLabelSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-[0.42rem]",
  md: "text-[0.45rem]",
  lg: "text-[0.5rem]",
};

const wordmarkSubtextSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-[0.7rem]",
  md: "text-[0.82rem]",
  lg: "text-[0.92rem]",
};

const BrandLogo = ({ className, withWordmark = false, size = "md" }: BrandLogoProps) => {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative inline-flex items-center overflow-hidden rounded-full border border-border/70 bg-[linear-gradient(135deg,#1e3a6e_0%,#2b508a_45%,#3b64b4_100%)] shadow-soft",
          emblemSizeMap[size],
        )}
      >
        <span className="absolute inset-[1px] rounded-full bg-[linear-gradient(126deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_38%,rgba(0,0,0,0.15)_100%)]" />
        <span className="pointer-events-none absolute left-3 top-[0.34rem] h-[2px] w-[38%] rounded-full bg-white/75" />
        <span className="pointer-events-none absolute left-3 bottom-[0.34rem] h-[2px] w-[31%] rounded-full bg-[#f0d249]/90" />
        <span className="pointer-events-none absolute right-3 top-[0.34rem] h-[2px] w-[34%] rounded-full bg-[#f0d249]/90" />
        <span className="pointer-events-none absolute right-3 bottom-[0.34rem] h-[2px] w-[28%] rounded-full bg-[#f0d249]/70" />
        <span className="relative z-[1] flex w-full items-center justify-between">
          <span
            className={cn(
              "font-black leading-none tracking-[0.17em] text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.42)]",
              markSizeMap[size],
            )}
          >
            SALT
          </span>
        </span>
      </span>

      {withWordmark ? (
        <span className="leading-none">
          <span className={cn("block font-display tracking-[0.08em]", textSizeMap[size])}>SALT</span>
          <span
            className={cn(
              "block pt-0.5 uppercase tracking-[0.14em] text-muted-foreground",
              wordmarkSubtextSizeMap[size],
            )}
          >
            Online Store
          </span>
        </span>
      ) : null}
    </span>
  );
};

export default BrandLogo;
