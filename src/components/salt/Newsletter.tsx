import ScrollReveal from "./ScrollReveal";

const Newsletter = () => {
  return (
    <ScrollReveal className="salt-container my-12">
      <div className="rounded-xl border border-salt-line bg-[linear-gradient(125deg,rgba(197,154,69,0.13),rgba(205,90,50,0.11)),hsl(var(--salt-paper))] p-6 grid grid-cols-[1.05fr_0.95fr] gap-4 items-center max-lg:grid-cols-1">
        <div>
          <h2 className="font-serif text-[clamp(1.7rem,3.5vw,2.5rem)]">Get SALT Drop Alerts</h2>
          <p className="text-muted-foreground max-w-[46ch] mt-2.5">
            Collect emails through your existing marketing flow and announce new releases, discounts, and limited collections with stronger conversion intent.
          </p>
        </div>
        <form
          action="/contact#contact_form"
          method="post"
          acceptCharset="UTF-8"
          className="flex gap-2.5 flex-wrap justify-end max-lg:justify-start"
        >
          <input type="hidden" name="form_type" value="customer" />
          <input type="hidden" name="utf8" value="✓" />
          <input type="hidden" name="contact[tags]" value="newsletter" />
          <input
            type="email"
            name="contact[email]"
            placeholder="your@email.com"
            autoComplete="email"
            required
            className="border border-salt-line bg-card rounded-full px-4 py-3 min-w-[240px] max-sm:min-w-full font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full px-5 py-3 bg-primary border border-primary text-primary-foreground text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:bg-salt-accent-deep hover:shadow-soft"
          >
            Subscribe
          </button>
        </form>
      </div>
    </ScrollReveal>
  );
};

export default Newsletter;
