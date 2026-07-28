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
      <div className="salt-panel-shell overflow-hidden rounded-[1.75rem] shadow-[0_24px_50px_-38px_rgba(66,92,137,0.24)]">
        <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col justify-between gap-6 p-5 sm:p-6 lg:p-8">
            <div className="max-w-xl">
              <div className="salt-editorial-pill inline-flex items-center gap-1.5 px-3 py-1 text-[0.55rem]">
                <Gift className="h-3 w-3" />
                Beautiful gifts
              </div>
              <h2 className="mt-4 font-display text-[clamp(1.8rem,3.8vw,3rem)] leading-[0.94] tracking-[-0.04em] text-foreground">
                Beautiful gifts, chosen with intention.
              </h2>
              <p className="mt-3 max-w-[32rem] text-sm leading-7 text-muted-foreground sm:text-[0.92rem]">
                Thoughtful finds, beautifully chosen for birthdays, thank-yous, and the moments when the wrapping matters as much as the gift.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="salt-primary-cta inline-flex items-center gap-2 px-4 py-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                Shop the gift collection
                <ArrowRight className="h-3 w-3" />
              </span>
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Curated for easy gifting
              </span>
            </div>
          </div>

          <div className="relative min-h-[14rem] overflow-hidden sm:min-h-[16rem] lg:min-h-full">
            <img
              src={resolveThemeAsset(beautifulGiftsBanner)}
              alt="Beautiful gifts banner with wrapped presents and a shop now call to action"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(246,250,255,0.02)_0%,rgba(246,250,255,0.08)_35%,rgba(246,250,255,0.18)_68%,rgba(246,250,255,0.28)_100%)]" />
          </div>
        </div>
      </div>
    </Link>
  );
};

export default GiftBanner;
