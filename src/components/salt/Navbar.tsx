import { Search, User, ShoppingBag, Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { label: "New Arrivals", href: "#" },
  { label: "All Products", href: "#products" },
  { label: "Cookware", href: "#" },
  { label: "Gifts", href: "#" },
  { label: "Apparel", href: "#" },
  { label: "Lifestyle & Care", href: "#" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-[32px] z-[110] backdrop-blur-[14px] bg-background/86 border-b border-salt-olive/20">
      <div className="salt-container grid grid-cols-[auto_1fr_auto] gap-4 items-center py-3.5 max-lg:grid-cols-[auto_1fr_auto]">
        <a href="#" className="font-serif text-[2rem] tracking-[0.12em] leading-none">
          SALT
        </a>

        <nav className="hidden lg:flex justify-center gap-1.5 flex-wrap">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground border border-transparent rounded-full px-3 py-2 text-[0.8rem] font-bold tracking-tight transition-all duration-200 hover:text-foreground hover:border-border hover:bg-card"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex gap-2 items-center justify-end">
          <a href="#" className="hidden sm:inline-flex items-center justify-center rounded-full px-3.5 py-2 border border-foreground text-[0.79rem] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-foreground hover:text-primary-foreground hover:shadow-soft">
            <Search className="w-3.5 h-3.5 mr-1.5" />Search
          </a>
          <a href="#" className="hidden sm:inline-flex items-center justify-center rounded-full px-3.5 py-2 border border-foreground text-[0.79rem] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-foreground hover:text-primary-foreground hover:shadow-soft">
            <User className="w-3.5 h-3.5 mr-1.5" />Login
          </a>
          <a href="#" className="inline-flex items-center justify-center rounded-full px-3.5 py-2 border border-primary bg-primary text-primary-foreground text-[0.79rem] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-salt-accent-deep hover:border-salt-accent-deep hover:shadow-soft">
            <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />Cart
          </a>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden inline-flex items-center justify-center rounded-full p-2 border border-foreground"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden salt-container pb-4 flex flex-wrap gap-2 justify-center">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground border border-border rounded-full px-3 py-2 text-sm font-bold"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
};

export default Navbar;
