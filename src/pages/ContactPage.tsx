import { FormEvent, useState } from "react";
import { BadgeCheck, Clock3, Mail, MessageSquareMore, PackageSearch, ShieldCheck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { Link } from "react-router-dom";

const supportTopics = ["Order tracking", "Returns and exchanges", "Product recommendation", "Bulk order request"];

const ContactPage = () => {
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="mx-auto mt-8 w-[min(980px,94vw)] pb-8">
      <Reveal>
        <div className="salt-panel-shell rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Contact</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Need help with your order?</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Send your request and our support team will respond with shipping, returns, or product guidance.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="mailto:support@saltonlinestore.com"
              className="salt-outline-chip h-10 px-4 py-0 text-xs"
            >
              Email support
            </a>
            <Link
              to="/policies/contact-information"
              className="salt-outline-chip h-10 px-4 py-0 text-xs"
            >
              Contact policy
            </Link>
            <Link
              to="/blog"
              className="salt-outline-chip h-10 px-4 py-0 text-xs"
            >
              Help guides
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                {supportTopics.map((topic) => (
                  <span
                    key={topic}
                    className="salt-outline-chip px-3 py-1.5 text-[0.66rem]"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-border/70 bg-background/75 p-4">
                <input
                  required
                  type="text"
                  placeholder="Full name"
                  className="salt-form-control h-12 px-4"
                />
                <input
                  required
                  type="email"
                  placeholder="Email address"
                  className="salt-form-control h-12 px-4"
                />
                <textarea
                  required
                  rows={6}
                  placeholder="How can we help?"
                  className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
                />

                <button
                  type="submit"
                  className="salt-primary-cta h-12 rounded-xl px-6 text-sm font-bold uppercase tracking-[0.08em]"
                >
                  Send message
                </button>

                {submitted ? (
                  <p className="text-sm text-emerald-700">
                    Message received. For urgent requests, email support@saltonlinestore.com.
                  </p>
                ) : null}
              </form>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-salt-olive/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Support quality</p>
                <h2 className="mt-1 font-display text-[clamp(1.2rem,2.2vw,1.8rem)] leading-tight">
                  Fast, clear, and policy-aligned responses
                </h2>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-2">
                    <Clock3 className="h-3.5 w-3.5 text-primary" /> Within 24 business hours
                  </p>
                  <p className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-2">
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Resolution-first handling
                  </p>
                  <p className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-2">
                    <PackageSearch className="h-3.5 w-3.5 text-primary" /> Order tracking support
                  </p>
                  <p className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure verification process
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Before you message us:</p>
                <ul className="mt-2 space-y-1">
                  <li>Include your order number for the fastest support response.</li>
                  <li>Attach product or shipping screenshots when reporting an issue.</li>
                  <li>Use the same email address used at checkout for quicker verification.</li>
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  <p className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <MessageSquareMore className="h-4 w-4 text-primary" /> Response time
                  </p>
                  <p className="mt-1">Within 24 business hours</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  <p className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <PackageSearch className="h-4 w-4 text-primary" /> Order support
                  </p>
                  <p className="mt-1">Tracking and delivery help</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  <p className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <Mail className="h-4 w-4 text-primary" /> Direct email
                  </p>
                  <p className="mt-1">support@saltonlinestore.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default ContactPage;
