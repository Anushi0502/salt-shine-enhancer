import { ArrowRight } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const features = [
  "Sticky enhanced navigation",
  "Collection-first architecture",
  "High-contrast CTA flow",
  "Mobile-optimized spacing",
  "Lightweight animations",
  "Ready for Shopify Liquid wiring",
];

const Spotlight = () => {
  return (
    <ScrollReveal className="salt-container my-12">
      <div className="bg-gradient-to-br from-[hsl(40_5%_11%)] to-[hsl(50_6%_15%)] rounded-xl border border-[hsl(50_6%_20%)] text-[hsl(38_30%_95%)] p-6 grid grid-cols-[1.1fr_0.9fr] gap-4 items-center shadow-soft max-lg:grid-cols-1">
        <div>
          <h2 className="font-serif text-[clamp(1.7rem,3.5vw,2.5rem)]">
            Frontend Reinvented, Backend Preserved
          </h2>
          <p className="text-[hsl(36_12%_80%)] max-w-[52ch] leading-relaxed my-3">
            This version keeps your existing Shopify flow fully intact and focuses on high-impact improvements: stronger visual identity, better readability, improved conversion hierarchy, and richer responsive behavior.
          </p>
          <a href="#products" className="inline-flex items-center justify-center rounded-full px-5 py-2.5 bg-primary border border-primary text-primary-foreground text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft">
            Start Shopping <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {features.map((f) => (
            <div key={f} className="border border-[hsl(50_6%_24%)] rounded-full px-3 py-2.5 text-[0.78rem] text-[hsl(36_12%_82%)] text-center bg-[rgba(255,255,255,0.03)]">
              {f}
            </div>
          ))}
        </div>
      </div>
    </ScrollReveal>
  );
};

export default Spotlight;
