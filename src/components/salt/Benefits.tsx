import { Truck, ShieldCheck, Package, Lock } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const benefits = [
  { icon: Truck, title: "Fast US Fulfillment", desc: "Products ship quickly from US-based operations for dependable delivery." },
  { icon: ShieldCheck, title: "No Hidden Tariffs", desc: "Clear and transparent checkout pricing across your existing order flow." },
  { icon: Package, title: "Diverse Product Catalog", desc: "Home, fashion, gifts, and accessories in one unified shopping journey." },
  { icon: Lock, title: "Secure Backend Intact", desc: "Cart, account, checkout, and payment all continue on Shopify as-is." },
];

const Benefits = () => {
  return (
    <ScrollReveal className="salt-container my-12">
      <div className="grid grid-cols-4 gap-3 bg-card border border-salt-line rounded-xl p-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {benefits.map((b) => (
          <div key={b.title} className="border border-muted rounded-md p-4 bg-gradient-to-b from-card to-secondary">
            <b.icon className="w-5 h-5 text-primary mb-2" />
            <strong className="block text-[0.95rem] mb-1">{b.title}</strong>
            <span className="text-sm text-muted-foreground leading-relaxed">{b.desc}</span>
          </div>
        ))}
      </div>
    </ScrollReveal>
  );
};

export default Benefits;
