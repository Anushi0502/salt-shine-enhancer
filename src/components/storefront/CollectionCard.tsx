import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";

type CollectionCardProps = {
  collection: ShopifyCollection;
};

const CollectionCard = ({ collection }: CollectionCardProps) => {
  const image = collection.image?.src || "/placeholder.svg";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft">
      <div className="relative aspect-[5/4] overflow-hidden">
        <img
          src={image}
          alt={collection.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/25 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-xl font-bold text-primary-foreground">{collection.title}</h3>
        <p className="mt-1 text-sm text-primary-foreground/85">{collection.products_count} products</p>

        <Link
          to={`/shop?collection=${collection.handle}`}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary-foreground/50 bg-primary-foreground/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:bg-primary-foreground hover:text-foreground"
        >
          Explore <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
};

export default CollectionCard;
