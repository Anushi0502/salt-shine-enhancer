import { ArrowRight, Gift } from "lucide-react";
import { Link } from "react-router-dom";

import beautifulGiftsBanner from "@/assets/beautiful-gifts-banner.jpg";
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
        <div className="relative h-[9.25rem] overflow-hidden sm:h-[11rem] lg:h-[12.5rem]">
          <img
            src={resolveThemeAsset(beautifulGiftsBanner)}
            alt="Beautiful gifts banner with wrapped presents and a shop now call to action"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(252,247,239,0.84)_0%,rgba(252,247,239,0.56)_32%,rgba(252,247,239,0.12)_62%,rgba(252,247,239,0.02)_100%)]" />

          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/60 bg-white/75 px-2.5 py-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-[#9d7b4a] backdrop-blur-sm sm:left-5 sm:top-5">
            <Gift className="h-3 w-3" />
            Beautiful gifts
          </div>

          <div className="absolute bottom-3 left-4 sm:bottom-4 sm:left-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d9c39c]/80 bg-white/85 px-3 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[#8c6a3e] shadow-sm">
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
