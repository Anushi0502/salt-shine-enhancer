import Reveal from "@/components/storefront/Reveal";

const pillars = [
  {
    title: "Design with intent",
    detail:
      "We combined v1 warmth and v2 editorial precision to create a storefront that feels premium and reads quickly.",
  },
  {
    title: "Keep Shopify as the source of truth",
    detail:
      "Catalog, pricing, and product structure align with saltonlinestore.com while preserving graceful fallback behavior.",
  },
  {
    title: "Ship-ready performance",
    detail:
      "Mobile-first layout, clear conversion hierarchy, and production-safe routes replace placeholder sections and dead links.",
  },
];

const AboutPage = () => {
  return (
    <section className="mx-auto mt-8 w-[min(1100px,94vw)] pb-8">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">About SALT</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">
            A production-ready storefront refresh
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            SALT Online Store now runs with a consolidated experience across homepage, category navigation,
            product detail, and cart flow while preserving core Shopify infrastructure.
          </p>
        </div>
      </Reveal>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {pillars.map((pillar, index) => (
          <Reveal key={pillar.title} delayMs={index * 90}>
            <article className="h-full rounded-2xl border border-border/80 bg-card p-5 shadow-soft">
              <h2 className="font-display text-2xl leading-tight">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{pillar.detail}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default AboutPage;
