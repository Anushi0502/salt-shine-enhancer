import { FormEvent, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronRight,
  Clock3,
  PackageSearch,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "@/components/storefront/Reveal";
import { isNativeApp } from "@/lib/mobile";
import { getRuntimeContext } from "@/lib/theme-assets";

const supportTopics = ["Order tracking", "Returns and exchanges", "Product recommendation", "Bulk order request"];
const runtimeContext = getRuntimeContext();
const supportEmail = runtimeContext.supportEmail || "support@saltonlinestore.com";
const contactPolicyHref = runtimeContext.contactPolicyUrl || "/policies/contact-information";

const ContactPage = () => {
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nativeApp = isNativeApp();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const supportCards = [
    {
      title: "Shipping & delivery",
      description: "See shipping and fulfillment terms",
      href: "/shipping-policy",
      icon: Truck,
    },
    {
      title: "Returns & refunds",
      description: "Open the refund policy page",
      href: "/refund-policy",
      icon: RotateCcw,
    },
    {
      title: "Contact support",
      description: "Open the app message form",
      action: scrollToForm,
      icon: PhoneCall,
    },
    {
      title: "Privacy policy",
      description: "View app and store privacy language",
      href: "/policies/privacy-policy",
      icon: ShieldCheck,
    },
  ] as const;

  if (nativeApp) {
    return (
      <section className="mx-auto mt-4 w-[min(1040px,calc(100%-18px))] pb-8">
        <Reveal>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Support</p>
            <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">
              Help that stays inside the app
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Shipping, returns, privacy, and order help live in native cards instead of a website footer maze.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {supportCards.map((card) => {
                const Icon = card.icon;

                if ("href" in card) {
                  return (
                    <Link
                      key={card.title}
                      to={card.href}
                      className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/96 p-3.5 transition hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-[0_12px_26px_-20px_rgba(0,0,0,0.38)]"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0f2742] text-white shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">{card.title}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{card.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </Link>
                  );
                }

                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={card.action}
                    className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/96 p-3.5 text-left transition hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-[0_12px_26px_-20px_rgba(0,0,0,0.38)]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0f2742] text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{card.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {supportTopics.map((topic) => (
                <span
                  key={topic}
                  className="salt-outline-chip h-9 px-3 py-0 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <Reveal delayMs={80}>
            <div className="salt-section-shell rounded-[1.5rem] border border-border/70 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Need a faster answer?</p>
              <h2 className="mt-1 font-display text-[clamp(1.45rem,2.8vw,2.05rem)] leading-[1.02] text-foreground">
                Use the app form or email support directly.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The native support path keeps the store help flow close to shipping, returns, and policy content.
              </p>

              <div className="mt-4 space-y-2">
                <a
                  href={`mailto:${supportEmail}`}
                  className="group flex items-center justify-between rounded-2xl border border-border/70 bg-background px-4 py-3 transition hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Email support</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{supportEmail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </a>

                <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">Response target</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Within 24 business hours for normal requests.</p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">Best for</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="salt-outline-chip h-8 px-2.5 py-0 text-[0.62rem]">Delivery updates</span>
                    <span className="salt-outline-chip h-8 px-2.5 py-0 text-[0.62rem]">Return checks</span>
                    <span className="salt-outline-chip h-8 px-2.5 py-0 text-[0.62rem]">Order help</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={120}>
            <form
              ref={formRef}
              id="support-message"
              onSubmit={onSubmit}
              className="salt-section-shell rounded-[1.5rem] border border-border/70 p-4 sm:p-5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Message us</p>
              <h2 className="mt-1 font-display text-[clamp(1.45rem,2.6vw,2rem)] leading-[1.02] text-foreground">
                Tell us what you need and we’ll route it cleanly.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add an order detail, delivery issue, or product question and we’ll keep the thread focused.
              </p>

              <div className="mt-4 grid gap-3">
                <input required type="text" placeholder="Full name" className="salt-form-control h-12 px-4" />
                <input required type="email" placeholder="Email address" className="salt-form-control h-12 px-4" />
                <textarea
                  required
                  rows={6}
                  placeholder="How can we help?"
                  className="salt-form-control min-h-[150px] rounded-xl px-4 py-3"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {supportTopics.map((topic) => (
                  <span
                    key={topic}
                    className="salt-outline-chip h-9 px-3 py-0 text-[0.66rem] font-semibold uppercase tracking-[0.08em]"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <button
                type="submit"
                className="salt-primary-cta mt-4 h-12 rounded-xl px-6 text-sm font-bold uppercase tracking-[0.08em]"
              >
                Send message
              </button>

              {submitted ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Message received. For urgent requests, email {supportEmail}.
                </p>
              ) : null}
            </form>
          </Reveal>
        </div>
      </section>
    );
  }

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
              <form
                ref={formRef}
                onSubmit={onSubmit}
                className="salt-section-shell grid gap-3 rounded-2xl border border-border/70 p-3.5 sm:p-4"
              >
                <input required type="text" placeholder="Full name" className="salt-form-control h-12 px-4" />
                <input required type="email" placeholder="Email address" className="salt-form-control h-12 px-4" />
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
