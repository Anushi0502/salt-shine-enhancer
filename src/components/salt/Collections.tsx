import cookwareImg from "@/assets/collection-cookware.jpg";
import decorImg from "@/assets/collection-decor.jpg";
import apparelImg from "@/assets/collection-apparel.jpg";
import giftsImg from "@/assets/collection-gifts.jpg";
import ScrollReveal from "./ScrollReveal";

const collections = [
  { name: "New Arrivals", subtitle: "Freshly dropped essentials", img: cookwareImg },
  { name: "Cookware", subtitle: "Everyday kitchen upgrades", img: decorImg },
  { name: "Apparel", subtitle: "Clean, casual styling", img: apparelImg },
  { name: "Gifts", subtitle: "Thoughtful picks", img: giftsImg },
];

const Collections = () => {
  return (
    <section className="salt-container my-12">
      <ScrollReveal>
        <div className="flex justify-between items-end gap-4 mb-4">
          <div>
            <h2 className="font-serif text-[clamp(1.7rem,3.5vw,2.5rem)]">Collections Reimagined</h2>
            <p className="text-muted-foreground max-w-[58ch] leading-relaxed mt-1">
              Each card points to your existing Shopify collection. Visual and UX are upgraded, while backend data and inventory stay untouched.
            </p>
          </div>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {collections.map((c, i) => (
          <ScrollReveal key={c.name} delay={i * 0.08}>
            <a href="#" className="group relative rounded-lg min-h-[210px] border border-salt-line overflow-hidden shadow-soft flex items-end p-4 isolate">
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.65)] to-[rgba(0,0,0,0.2)] z-[-1]" />
              <img src={c.img} alt={c.name} className="absolute inset-0 w-full h-full object-cover z-[-2] transition-transform duration-500 group-hover:scale-[1.08]" loading="lazy" />
              <div>
                <strong className="text-[#fff] block text-lg mb-0.5">{c.name}</strong>
                <span className="text-[#ddd2c0] text-sm">{c.subtitle}</span>
              </div>
            </a>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
};

export default Collections;
