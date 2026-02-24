import { FormEvent, useState } from "react";
import { Mail, MessageSquareMore, PackageSearch } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";

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
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Contact</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Need help with your order?</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Send your request and our support team will respond with shipping, returns, or product guidance.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
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

          <div className="mt-5 flex flex-wrap gap-2">
            {supportTopics.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {topic}
              </span>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 grid gap-3">
            <input
              required
              type="text"
              placeholder="Full name"
              className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/60"
            />
            <input
              required
              type="email"
              placeholder="Email address"
              className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/60"
            />
            <textarea
              required
              rows={6}
              placeholder="How can we help?"
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/60"
            />

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
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
      </Reveal>
    </section>
  );
};

export default ContactPage;
