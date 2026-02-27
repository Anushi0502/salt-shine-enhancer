import { cn } from "@/lib/utils";
import { resolveThemeAsset } from "@/lib/theme-assets";

type BrandLogoProps = {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const imageSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-11 w-20",
  md: "h-12 w-20",
  lg: "h-14 w-26",
};

const shellSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-11 w-28",
  md: "h-12 w-28",
  lg: "h-14 w-32",
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
          "inline-flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#bb6d42_0%,#a96c44_52%,#7f7a5a_100%)] shadow-soft",
          shellSizeMap[size],
        )}
      >
        <img
          src={resolveThemeAsset("/brand/salt-logo.png")}
          alt="SALT logo"
          className={cn("rounded-full object-cover", imageSizeMap[size])}
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
