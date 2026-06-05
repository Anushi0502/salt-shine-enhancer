import { FormEvent, useState } from "react";
import { BadgeCheck, Clock3, PackageSearch, ShieldCheck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { Link } from "react-router-dom";
import { getRuntimeContext } from "@/lib/theme-assets";

const supportTopics = ["Order tracking", "Returns and exchanges", "Product recommendation", "Bulk order request"];
const runtimeContext = getRuntimeContext();
const supportEmail = runtimeContext.supportEmail || "support@saltonlinestore.com";
const contactPolicyHref = runtimeContext.contactPolicyUrl || "/policies/contact-information";

const ContactPage = () => {
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="mx-auto mt-5 w-[min(980px,calc(100%-20px))] pb-8 sm:mt-6">
      <Reveal>
        <div className="salt-panel-shell rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Contact</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Need help with your order?</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Reach the SALT support team for delivery questions, product advice, or returns.
          </p>
          
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
            <div>

              <form onSubmit={onSubmit} className="salt-section-shell grid gap-3 rounded-2xl border border-border/70 p-3.5 sm:p-4">
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
                  className="salt-form-control min-h-[140px] rounded-xl px-4 py-3"
                />

                <button
                  type="submit"
                  className="salt-primary-cta h-12 rounded-xl px-6 text-sm font-bold uppercase tracking-[0.08em]"
                >
                  Send message
                </button>

                {submitted ? (
                  <p className="text-sm text-emerald-700">
                    Message received. For urgent requests, email {supportEmail}.
                  </p>
                ) : null}
              </form>
            </div>

            <div className="space-y-3">
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={`mailto:${supportEmail}`}
              className="salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs sm:w-auto"
            >
              Email support
            </a>
            <a
              href={contactPolicyHref}
              className="salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs sm:w-auto"
            >
              Contact policy
            </a>
            <Link
              to="/shipping-policy"
              className="salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs sm:w-auto"
            >
              Shipping policy
            </Link>
          </div>

              <div className="salt-section-shell rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-salt-blue/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Support quality</p>
                <h2 className="mt-1 font-display text-[clamp(1.2rem,2.2vw,1.8rem)] leading-tight">
                  Fast, clear, and helpful responses
                </h2>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="salt-kpi-card inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2">
                    <Clock3 className="h-3.5 w-3.5 text-primary" /> Within 24 business hours
                  </p>
                  <p className="salt-kpi-card inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2">
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Resolution-first handling
                  </p>
                  <p className="salt-kpi-card inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2">
                    <PackageSearch className="h-3.5 w-3.5 text-primary" /> Order tracking support
                  </p>
                  <p className="salt-kpi-card inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure verification process
                  </p>
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
