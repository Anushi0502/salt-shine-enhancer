import { BadgeCheck, HeartHandshake, Sparkles, Truck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";

const pillars = [
  {
    icon: Sparkles,
    title: "Curation over clutter",
    detail:
      "We focus on practical products with strong quality-to-price value, so shoppers can choose quickly and confidently.",
  },
  {
    icon: Truck,
    title: "Reliable fulfillment",
    detail:
      "Orders are processed with clear delivery communication and tracking so customers always know what to expect.",
  },
  {
    icon: BadgeCheck,
    title: "Transparent trust",
    detail:
      "Clear pricing, secure checkout, and straightforward policies keep every purchase simple and dependable.",
  },
  {
    icon: HeartHandshake,
    title: "Support that responds",
    detail:
      "Need help pre- or post-purchase? Our team is available for product guidance, returns, and order updates.",
  },
];

const AboutPage = () => {
  return (
    <section className="mx-auto mt-8 w-[min(1100px,94vw)] pb-8">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">About SALT</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">
            Curated essentials for everyday living
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            SALT Online Store is built to make shopping feel intentional: fewer distractions, better product context,
            and a smoother path from discovery to checkout.
          </p>
        </div>
      </Reveal>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {pillars.map((pillar, index) => {
          const Icon = pillar.icon;

          return (
            <Reveal key={pillar.title} delayMs={index * 90}>
              <article className="h-full rounded-2xl border border-border/80 bg-card p-5 shadow-soft">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-3 font-display text-2xl leading-tight">{pillar.title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{pillar.detail}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
};

export default AboutPage;
