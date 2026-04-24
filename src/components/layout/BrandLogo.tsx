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
      <span
        className={cn(
          "relative inline-flex  items-center justify-center overflow-hidden  ",
          shellSizeMap[size],
        )}
      >
        <img
          src={brandMarkSrc}
          alt="SALT Online Store"
          className="relative z-[1] h-full w-full object-fill "
          loading="eager"
          decoding="async"
        />
      </span>

  );
};

export default BrandLogo;
