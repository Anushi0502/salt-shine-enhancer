import { ShoppingBag, User } from "lucide-react";

const Topbar = () => (
  <header className="sticky top-[32px] z-[110] backdrop-blur-[14px] bg-background/86 border-b border-salt-olive/20">
    <div className="salt-container flex items-center justify-between py-3">
      <div className="pl-12">
        <span className="font-serif text-[2rem] tracking-[0.12em] leading-none">SALT</span>
      </div>
      <div className="flex gap-2 items-center">
        <a href="#" className="hidden sm:inline-flex items-center justify-center rounded-full px-3.5 py-2 border border-foreground text-[0.79rem] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-foreground hover:text-primary-foreground hover:shadow-soft">
          <User className="w-3.5 h-3.5 mr-1.5" />Login
        </a>
        <a href="#" className="inline-flex items-center justify-center rounded-full px-3.5 py-2 border border-primary bg-primary text-primary-foreground text-[0.79rem] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-salt-accent-deep hover:border-salt-accent-deep hover:shadow-soft">
          <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />Cart
        </a>
      </div>
    </div>
  </header>
);

export default Topbar;
