import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";

type KpiStripProps = {
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
};

const KpiStrip = ({ products, collections }: KpiStripProps) => {
  const metrics = [
    { label: "Products mirrored", value: products.length.toLocaleString() },
    { label: "Collections", value: collections.length.toString() },
    {
      label: "Average variants / product",
      value: (
        products.reduce((sum, product) => sum + product.variants.length, 0) / Math.max(products.length, 1)
      ).toFixed(1),
    },
    { label: "Design mode", value: "Light + Dark" },
  ];

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)]">
      <Reveal>
        <div className="grid gap-3 rounded-3xl border border-border/80 bg-card/85 p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`rounded-2xl border border-border/70 bg-background/80 p-4 ${
                index % 2 === 0 ? "lg:translate-y-2" : ""
              }`}
            >
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
              <strong className="mt-2 block font-display text-3xl leading-none">{metric.value}</strong>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
};

export default KpiStrip;
