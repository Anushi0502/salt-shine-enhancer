import { Home, ShoppingBag, UtensilsCrossed, Gift, Shirt, Heart, Search, User, X, Menu } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { label: "Home", icon: Home, href: "#" },
  { label: "All Products", icon: ShoppingBag, href: "#products" },
  { label: "Cookware", icon: UtensilsCrossed, href: "#" },
  { label: "Gifts", icon: Gift, href: "#" },
  { label: "Apparel", icon: Shirt, href: "#" },
  { label: "Lifestyle", icon: Heart, href: "#" },
];

const SaltSidebar = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-[52px] left-4 z-[200] w-10 h-10 rounded-full bg-foreground text-primary-foreground flex items-center justify-center shadow-soft transition-transform duration-200 hover:scale-110"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[210] bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 w-[280px] z-[220] bg-card border-r border-salt-line shadow-deep flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-salt-line">
              <span className="font-serif text-2xl tracking-[0.12em]">SALT</span>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full border border-salt-line flex items-center justify-center transition-colors hover:bg-muted"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Bottom actions */}
            <div className="p-4 border-t border-salt-line space-y-2">
              <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Search className="w-4 h-4" /> Search
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <User className="w-4 h-4" /> Login
              </a>
              <a href="#" className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold transition-all duration-200 hover:bg-salt-accent-deep">
                <ShoppingBag className="w-4 h-4" /> Cart
              </a>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export default SaltSidebar;
