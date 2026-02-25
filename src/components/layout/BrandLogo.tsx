import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const imageSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-11 w-11",
  md: "h-14 w-20",
  lg: "h-[4.1rem] w-[6rem]",
};

const shellSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-14 w-14",
  md: "h-14 w-28",
  lg: "h-[4.1rem] w-[6rem]",
};

const textSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

const BrandLogo = ({ className, withWordmark = false, size = "md" }: BrandLogoProps) => {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#b86a40_0%,#a56a42_48%,#7f7857_100%)] shadow-soft",
          shellSizeMap[size],
        )}
      >
        <img
          src="/brand/salt-logo.png"
          alt="SALT logo"
          className={cn("rounded-full object-cover shadow-[0_3px_10px_rgba(0,0,0,0.18)]", imageSizeMap[size])}
          loading="eager"
        />
      </span>

      {withWordmark ? (
        
        <span className="leading-none">
          <span className={cn("block font-display tracking-[0.08em]", textSizeMap[size])}>SALT</span>
          <span className="block pt-0.5 text-[0.82rem] uppercase tracking-[0.14em] text-muted-foreground">
            Online Store
          </span>
        </span>
      ) : null}
    </span>
  );
};

export default BrandLogo;
