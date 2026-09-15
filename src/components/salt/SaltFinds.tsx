import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { SALT_FIND_GUIDES } from "@/lib/salt-finds";

export function SaltFinds() {
  return (
    <section
      aria-labelledby="salt-finds-title"
      className="salt-section-shell rounded-[1.75rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            SALT Finds
          </p>
          <h2
            id="salt-finds-title"
            className="mt-2 font-display text-[clamp(1.45rem,3vw,2.15rem)] leading-[0.96] tracking-[-0.035em] text-foreground"
          >
            Useful guides for the things you are trying to find
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[0.96rem]">
            Start with a focused buying question, then move from the guide to a live collection or product.
          </p>
        </div>
        <Link
          to="/shop?resource=hub"
          className="salt-outline-chip h-10 px-4 py-0 text-[0.66rem] font-bold uppercase tracking-[0.14em]"
        >
          Open Resource Hub
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SALT_FIND_GUIDES.map((guide) => (
          <Link
            key={guide.href}
            to={guide.href}
            className="group flex min-h-[9.5rem] flex-col justify-between rounded-[1.25rem] border border-border/70 bg-background/75 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_36px_-28px_rgba(22,77,160,0.35)]"
          >
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-primary/80">{guide.eyebrow}</p>
              <h3 className="mt-2 text-[0.98rem] font-semibold leading-5 tracking-[-0.015em] text-foreground">
                {guide.title}
              </h3>
              <p className="mt-2 text-[0.78rem] leading-5 text-muted-foreground">{guide.description}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-primary">
              Read guide
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
