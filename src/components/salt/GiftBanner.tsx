import { ArrowRight, Gift } from "lucide-react";
import { Link } from "react-router-dom";

import beautifulGiftsBanner from "@/assets/gift-beautiful-banner-v2.jpg";
import { resolveThemeAsset } from "@/lib/theme-assets";
import { cn } from "@/lib/utils";

type GiftBannerProps = {
  className?: string;
};

const GiftBanner = ({ className }: GiftBannerProps) => {
  return (
    <Link
      to="/collections/gifts"
      aria-label="Shop the gift collection"
      className={cn("group block w-full", className)}
    >
      <div className="overflow-hidden rounded-[1.4rem] border border-[#ead7bc] bg-[#fbf4ea] shadow-[0_18px_42px_-34px_rgba(127,89,45,0.34)]">
        <div className="relative h-[10.5rem] overflow-hidden sm:h-[12rem] lg:h-[13.5rem]">
          <img
            src={resolveThemeAsset(beautifulGiftsBanner)}
            alt="Beautiful gifts banner with wrapped presents and a shop now call to action"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(251,247,239,0.98)_0%,rgba(251,247,239,0.91)_25%,rgba(251,247,239,0.36)_49%,rgba(251,247,239,0.02)_68%)]" />

          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/60 bg-white/75 px-2.5 py-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-[#9d7b4a] backdrop-blur-sm sm:left-5 sm:top-5">
            <Gift className="h-3 w-3" />
            Beautiful gifts
          </div>

          <div className="absolute bottom-4 left-4 max-w-[58%] sm:bottom-5 sm:left-5 lg:bottom-6 lg:left-7">
            <h2 className="font-display text-[1.45rem] leading-[0.95] text-[#183d72] sm:text-[2rem] lg:text-[2.45rem]">
              Beautiful Gifts
            </h2>
            <p className="mt-1.5 hidden max-w-[28rem] text-[0.72rem] leading-relaxed text-[#6f604d] sm:block sm:text-[0.86rem]">
              Thoughtful finds, beautifully chosen for every celebration.
            </p>
            <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-[#cdae7a] bg-[#173d72] px-3.5 py-1.5 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-white shadow-[0_10px_24px_-14px_rgba(23,61,114,0.7)] transition group-hover:bg-[#0f2f5b] sm:mt-3 sm:px-4 sm:py-2 sm:text-[0.62rem]">
              Shop the gift collection
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default GiftBanner;
