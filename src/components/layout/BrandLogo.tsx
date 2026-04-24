import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const brandLogoFontFamily = "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
const brandMarkSrc = "/brand/salt-logo.png";

const shellSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-11 w-28 px-2.5 rounded-[1rem]",
  md: "h-12 w-32 px-3 rounded-[1.05rem]",
  lg: "h-14 w-36 px-3.5 rounded-[1.2rem]",
};

const textSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-[1.55rem]",
  md: "text-[2rem]",
  lg: "text-[2.45rem]",
};

const wordmarkSubtextSizeMap: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-[0.72rem] tracking-[0.16em]",
  md: "text-[0.82rem] tracking-[0.18em]",
  lg: "text-[0.95rem] tracking-[0.2em]",
};

const BrandLogo = ({ className, withWordmark = false, size = "md" }: BrandLogoProps) => {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/18 bg-[linear-gradient(145deg,#18345f_0%,#274f90_46%,#1f3c6f_100%)] shadow-[0_18px_42px_-26px_rgba(8,20,42,0.65)] ring-1 ring-black/6",
          shellSizeMap[size],
        )}
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0)_45%)]" />
        <img
          src={brandMarkSrc}
          alt="SALT Online Store"
          className="relative z-[1] h-full w-full object-fill drop-shadow-[0_6px_12px_rgba(0,0,0,0.2)]"
          loading="eager"
          decoding="async"
        />
      </span>

      {withWordmark ? (
        <span className="leading-none">
          <span
            className={cn(
              "block font-display leading-none tracking-[0.06em] text-[hsl(var(--salt-ink))] dark:text-white",
              textSizeMap[size],
            )}
            style={{ fontFamily: brandLogoFontFamily }}
          >
            SALT
          </span>
          <span
            className={cn(
              "block pt-1 uppercase text-[hsl(var(--salt-muted))] dark:text-white/72",
              wordmarkSubtextSizeMap[size],
            )}
            style={{ fontFamily: brandLogoFontFamily }}
          >
            Online Store
          </span>
        </span>
      ) : null}
    </span>
  );
};

export default BrandLogo;
