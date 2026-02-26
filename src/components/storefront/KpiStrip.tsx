import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";
import { Box, Layers3, PackageCheck, SlidersHorizontal } from "lucide-react";

type KpiStripProps = {
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
};

const KpiStrip = ({ products, collections }: KpiStripProps) => {
  const averageVariants = (
    products.reduce((sum, product) => sum + product.variants.length, 0) / Math.max(products.length, 1)
  ).toFixed(1);
  const inStockCount = products.filter((product) =>
    product.variants.some((variant) => variant.available),
  ).length;

  const metrics = [
    { label: "Live products", value: products.length.toLocaleString(), Icon: Box },
    { label: "Curated collections", value: collections.length.toLocaleString(), Icon: Layers3 },
    { label: "Avg options per item", value: averageVariants, Icon: SlidersHorizontal },
    { label: "In stock now", value: inStockCount.toLocaleString(), Icon: PackageCheck },
  ];

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)]">
      <Reveal>
        <div className="salt-panel-shell grid gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`salt-ambient-card rounded-2xl p-4 ${
                index % 2 === 0 ? "lg:translate-y-2" : ""
              }`}
            >
              <p className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-primary">
                <metric.Icon className="h-4 w-4" />
              </p>
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
              <strong className="mt-2 block font-display text-3xl leading-none text-foreground">{metric.value}</strong>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
};

export default KpiStrip;
