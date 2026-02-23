import { ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-main.jpg";
import ScrollReveal from "./ScrollReveal";

const Hero = () => {
  return (
    <section className="salt-container my-8 grid grid-cols-[1.35fr_0.65fr] gap-4 max-lg:grid-cols-1">
      <ScrollReveal>
        <div
          className="relative isolate min-h-[610px] max-lg:min-h-[400px] rounded-xl border border-salt-line overflow-hidden shadow-deep flex items-end p-8 max-sm:p-5"
          style={{
            background: `linear-gradient(130deg, rgba(15,15,14,0.75), rgba(15,15,14,0.38)), url(${heroImage}) center/cover`,
          }}
        >
          <div className="absolute w-[360px] aspect-square rounded-full -right-[100px] -top-[80px] bg-[radial-gradient(circle,rgba(205,90,50,0.65),rgba(205,90,50,0))] blur-[10px] -z-10" />
          <div>
            <span className="inline-flex items-center gap-2 bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.35)] rounded-full px-3 py-1.5 text-[0.74rem] uppercase tracking-widest text-[#f6eee1] mb-4">
              ✦ Everyday Design Upgrade
            </span>
            <h1 className="font-serif text-[clamp(2.4rem,5.1vw,4.4rem)] leading-[0.95] max-w-[12ch] text-[#fff]">
              Elevated Shopping for the SALT You Already Love
            </h1>
            <p className="text-[#ebe2d6] max-w-[42ch] leading-relaxed mt-4 mb-5">
              Complete frontend enhancement with luxury direction, cleaner hierarchy, stronger product storytelling, and preserved backend logic.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <a href="#products" className="inline-flex items-center justify-center rounded-full px-5 py-2.5 bg-primary border border-primary text-primary-foreground text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-salt-accent-deep hover:shadow-soft">
                Shop New Arrivals <ArrowRight className="w-4 h-4 ml-2" />
              </a>
              <a href="#products" className="inline-flex items-center justify-center rounded-full px-5 py-2.5 border border-[rgba(255,255,255,0.5)] text-[#f6eee1] text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.15)]">
                Browse Everything
              </a>
            </div>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.15}>
        <div className="min-h-[610px] max-lg:min-h-[auto] rounded-xl border border-salt-line bg-gradient-to-b from-[hsl(28_60%_94%)] via-[hsl(26_45%_90%)] to-[hsl(24_40%_87%)] shadow-soft grid grid-rows-[auto_1fr_auto] overflow-hidden">
          <div className="p-4 border-b border-dashed border-foreground/20 flex justify-between items-center gap-3">
            <strong className="text-2xl font-serif">40% OFF</strong>
            <span className="text-sm text-muted-foreground text-right max-w-[18ch]">Featured items refreshed weekly</span>
          </div>
          <div className="p-4 grid gap-2.5 content-center">
            {["Kitchen Essentials", "Candles & Decor", "Women Collection", "Toys & Gifts", "Personal Care"].map((item) => (
              <a key={item} href="#" className="border border-foreground/10 rounded-full bg-[rgba(255,255,255,0.74)] px-3.5 py-2.5 flex justify-between items-center text-sm transition-all duration-200 hover:translate-x-1 hover:border-foreground/25 hover:bg-card">
                {item}
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
          <div className="p-4 border-t border-dashed border-foreground/20 grid grid-cols-3 gap-2.5">
            {[{ val: "1000+", label: "Products" }, { val: "24/7", label: "Storefront" }, { val: "Secure", label: "Checkout" }].map((s) => (
              <div key={s.label} className="bg-[rgba(255,255,255,0.78)] border border-foreground/10 rounded-md p-2.5 text-center">
                <strong className="block text-base">{s.val}</strong>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
};

export default Hero;
