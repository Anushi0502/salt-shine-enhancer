const Footer = () => {
  return (
    <footer className="salt-container mt-10 mb-5 border-t border-salt-line pt-4 flex flex-wrap gap-3 justify-between text-muted-foreground text-sm">
      <span>© 2026 SALT Online Store. Enhanced UI layer with existing backend compatibility.</span>
      <div className="flex gap-4">
        <a href="#" className="hover:text-foreground transition-colors">Contact</a>
        <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
        <a href="#" className="hover:text-foreground transition-colors">Refunds</a>
        <a href="#" className="hover:text-foreground transition-colors">Terms</a>
      </div>
    </footer>
  );
};

export default Footer;
