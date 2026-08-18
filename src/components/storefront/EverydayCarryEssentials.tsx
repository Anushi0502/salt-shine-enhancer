import { Link } from "react-router-dom";
import { EVERYDAY_CARRY_FAQS } from "@/lib/aeo-content";

const EverydayCarryEssentials = () => (
  <section
    aria-labelledby="everyday-carry-essentials-heading"
    className="salt-editorial-shell mt-4 rounded-[1.5rem] p-5 sm:mt-5 sm:p-6 lg:p-7"
  >
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
      <div>
        <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-primary">Practical carry guide</p>
        <h2 id="everyday-carry-essentials-heading" className="mt-2 font-display text-[clamp(1.55rem,3vw,2.35rem)] leading-[0.98]">
          Everyday carry essentials
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Build a lighter, more organized routine with bags, organizers, portable gadgets, and compact helpers selected for work, school, commuting, errands, and short trips.
        </p>
        <nav aria-label="Everyday carry categories" className="mt-4 flex flex-wrap gap-2">
          <Link className="salt-outline-chip" to="/collections/travel-organizers">Travel organizers</Link>
          <Link className="salt-outline-chip" to="/collections/portable-gadgets">Portable gadgets</Link>
          <Link className="salt-outline-chip" to="/collections/outdoor-essentials">Outdoor essentials</Link>
        </nav>
      </div>

      <div className="grid gap-3">
        {EVERYDAY_CARRY_FAQS.map((entry) => (
          <details key={entry.question} className="rounded-2xl border border-border/70 bg-background/65 px-4 py-3">
            <summary className="cursor-pointer list-none pr-5 text-sm font-semibold text-foreground marker:hidden">
              {entry.question}
            </summary>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

export default EverydayCarryEssentials;
