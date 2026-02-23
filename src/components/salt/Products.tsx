import productStand from "@/assets/product-laptop-stand.jpg";
import productPortable from "@/assets/product-portable-stand.jpg";
import productTripod from "@/assets/product-tripod.jpg";
import productDock from "@/assets/product-dock.jpg";
import ScrollReveal from "./ScrollReveal";

const products = [
  {
    flag: "Sale",
    title: "Foldable Laptop Stand Adjustable Portable Notebook Bracket",
    oldPrice: "$18.99",
    newPrice: "$10.99",
    image: productStand,
  },
  {
    flag: "Trending",
    title: "Portable Foldable Aluminum Alloy Laptop Stand",
    oldPrice: "$20.99",
    newPrice: "$13.99",
    image: productPortable,
  },
  {
    flag: "New",
    title: "2025 Flexible Arm Tripod for Phone and Desktop",
    oldPrice: "$28.99",
    newPrice: "$21.99",
    image: productTripod,
  },
  {
    flag: "Best Seller",
    title: "Vertical Laptop Docking Stand - 3 Slot Holder",
    oldPrice: "$26.99",
    newPrice: "$19.99",
    image: productDock,
  },
];

const flagColors: Record<string, string> = {
  Sale: "bg-gradient-to-r from-primary to-salt-accent-deep",
  Trending: "bg-salt-olive",
  New: "bg-salt-gold",
  "Best Seller": "bg-foreground",
};

const Products = () => {
  return (
    <section id="products" className="salt-container my-12">
      <ScrollReveal>
        <div className="flex justify-between items-end gap-4 mb-4">
          <div>
            <h2 className="font-serif text-[clamp(1.7rem,3.5vw,2.5rem)]">Featured Products</h2>
            <p className="text-muted-foreground max-w-[58ch] leading-relaxed mt-1">
              Sample premium cards linked to live product URLs. Replace sample image blocks with Shopify dynamic cards when integrating into the theme.
            </p>
          </div>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {products.map((p, i) => (
          <ScrollReveal key={p.title} delay={i * 0.1}>
            <a href="#" className="group block border border-salt-line rounded-lg bg-card overflow-hidden salt-card-hover">
              <div className="aspect-square overflow-hidden relative bg-gradient-to-br from-salt-warm to-muted">
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <span className={`absolute left-2.5 top-2.5 rounded-full text-[0.68rem] font-extrabold tracking-wider uppercase text-primary-foreground px-2 py-1 ${flagColors[p.flag] || "bg-primary"}`}>
                  {p.flag}
                </span>
              </div>
              <div className="p-3.5 grid gap-2">
                <span className="text-sm leading-snug min-h-[2.5em]">{p.title}</span>
                <div className="flex gap-2 items-baseline text-sm">
                  <s className="text-muted-foreground text-xs">{p.oldPrice}</s>
                  <strong className="text-primary text-[0.92rem]">From {p.newPrice}</strong>
                </div>
                <span className="inline-flex items-center justify-center rounded-full px-4 py-2 border border-foreground text-xs font-bold transition-all duration-200 group-hover:bg-foreground group-hover:text-primary-foreground">
                  View Product
                </span>
              </div>
            </a>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
};

export default Products;
