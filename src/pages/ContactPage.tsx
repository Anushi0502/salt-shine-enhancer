import { FormEvent, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronRight,
  Clock3,
  LifeBuoy,
  PackageSearch,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import Reveal from "@/components/storefront/Reveal";
import SupportRouteCard from "@/components/support/SupportRouteCard";
import { useDocumentMetadata } from "@/components/support/useDocumentMetadata";
import { isNativeApp } from "@/lib/mobile";
import { useEditorialPage } from "@/lib/shopify-data";
import { getRuntimeContext } from "@/lib/theme-assets";

const supportTopics = ["Order tracking", "Returns and exchanges", "Product recommendation", "Bulk order request"];
const runtimeContext = getRuntimeContext();
const supportEmail = runtimeContext.supportEmail || "support@saltonlinestore.com";
const supportPhone = "+1 888-835-7211";
const contactPolicyHref = "/pages/contact-information";

const contactRoutes = [
  {
    title: "FAQ",
    description: "Short answers for ordering, shipping, and returns.",
    badge: "Fast answers",
    icon: LifeBuoy,
    to: "/pages/faq",
  },
  {
    title: "Track order",
    description: "Open the secure order portal for live status and history.",
    badge: "Orders",
    icon: PackageSearch,
    to: "/track-order",
  },
  {
    title: "Shipping policy",
    description: "Review delivery windows and fulfillment notes.",
    badge: "Shipping",
    icon: Truck,
    to: "/shipping-policy",
  },
  {
    title: "Refund policy",
    description: "See how returns and refunds are handled.",
    badge: "Returns",
    icon: RotateCcw,
    to: "/refund-policy",
  },
] as const;

const actionBaseClass =
  "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] transition hover:-translate-y-[1px]";

function renderAction(action: { label: string; to?: string; href?: string; primary?: boolean; onClick?: () => void }) {
  const actionClass = action.primary
    ? `${actionBaseClass} salt-primary-cta border-transparent text-white shadow-[0_18px_30px_-24px_rgba(37,99,235,0.5)]`
    : `${actionBaseClass} salt-outline-chip border-border text-foreground hover:text-primary`;

  if (action.onClick) {
    return (
      <button key={action.label} type="button" onClick={action.onClick} className={actionClass}>
        {action.label}
      </button>
    );
  }

  if (action.href) {
    const external = /^https?:\/\//i.test(action.href);

    return (
      <a
        key={action.label}
        href={action.href}
        className={actionClass}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {action.label}
      </a>
    );
  }

  return (
    <Link key={action.label} to={action.to || "/"} className={actionClass}>
      {action.label}
    </Link>
  );
}

const ContactPage = () => {
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nativeApp = isNativeApp();
  const { data, isLoading, error, refetch } = useEditorialPage("contact");
  const page = data?.page;

  useDocumentMetadata(
    page?.seoTitle || "Contact Support | SALT Online Store",
    page?.metaDescription || page?.summary || "Reach the SALT support team for delivery questions, product advice, returns, or order help.",
    { canonicalPath: "/pages/contact-us" },
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (nativeApp) {
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

    return (
      <section className="mx-auto mt-4 w-[min(1040px,calc(100%_-_18px))] pb-8">
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
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
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
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Full name</span>
                  <input required type="text" className="salt-form-control h-12 px-4" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Email address</span>
                  <input required type="email" className="salt-form-control h-12 px-4" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-foreground sm:col-span-2">
                  <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">How can we help?</span>
                  <textarea
                    required
                    rows={7}
                    className="salt-form-control min-h-[180px] rounded-xl px-4 py-3"
                  />
                </label>
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

  if (isLoading) {
    return <LoadingState title="Loading Contact" subtitle="Preparing the support page and message routes." />;
  }

  if (error || !page) {
    return (
      <ErrorState
        title="Contact page unavailable"
        subtitle="Please retry to refresh the support page."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="salt-primary-cta h-11 rounded-xl px-5 text-sm font-bold"
          >
            Retry
          </button>
        }
      />
    );
  }

  const contactChips = page.chips?.length ? page.chips : supportTopics;

  return (
    <section className="mx-auto w-[min(1240px,calc(100%_-_20px))] pb-16 pt-4 sm:pb-18 sm:pt-5">
      <InnerBreadcrumbs items={[{ label: "Home", to: "/" }, { label: "Contact" }]} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
        <Reveal>
          <div className="salt-editorial-shell rounded-[2rem] p-3 sm:p-4">
            <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-6 lg:p-7">
              <div className="max-w-4xl">
                <p className="salt-kicker">{page.kicker}</p>
                <h1 className="mt-3 font-display text-[clamp(2.45rem,5.8vw,4.7rem)] leading-[0.9] tracking-[-0.06em] text-foreground">
                  {page.title}
                </h1>
                <p className="mt-4 max-w-3xl text-[0.98rem] leading-7 text-muted-foreground sm:text-base">
                  {page.summary}
                </p>

                {page.stats?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {page.stats.map((stat) => (
                      <div
                        key={`${stat.label}-${stat.value}`}
                        className="salt-editorial-meta inline-flex items-baseline gap-2 px-3 py-1 text-xs"
                      >
                        <span className="font-semibold text-muted-foreground">{stat.label}</span>
                        <span className="font-semibold text-foreground">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {contactChips.map((topic) => (
                    <span
                      key={topic}
                      className="salt-outline-chip h-9 px-3 py-0 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                    >
                      {topic}
                  </span>
                ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">{page.actions.map(renderAction)}</div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <aside className="salt-section-shell rounded-[1.7rem] p-4 sm:p-5 lg:sticky lg:top-24">
            <p className="salt-kicker">{page.accent.label}</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,2.7vw,2.15rem)] leading-[1.02] text-foreground">
              {page.accent.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{page.accent.body}</p>

            <div className="mt-4 space-y-3">
              <a
                href={`mailto:${supportEmail}`}
                className="group flex items-center justify-between rounded-[1.05rem] border border-border/65 bg-background px-4 py-3 transition hover:border-primary/20 hover:text-primary"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Email support</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{supportEmail}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </a>

              <div className="rounded-[1.05rem] border border-border/65 bg-background px-4 py-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Response target</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Within 24 business hours</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Normal requests are routed in the order they arrive.
                </p>
              </div>

              <div className="rounded-[1.05rem] border border-border/65 bg-background px-4 py-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Direct line</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{supportPhone}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Best for urgent order or delivery follow-up.
                </p>
              </div>

              <div className="rounded-[1.05rem] border border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] px-4 py-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Best for</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {page.accent.bullets.map((bullet) => (
                    <span key={bullet} className="salt-outline-chip h-8 px-2.5 py-0 text-[0.62rem]">
                      {bullet}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </Reveal>
      </div>

      <section className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="salt-kicker">{page.cardsTitle}</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-[0.96] text-foreground">
              What can we help you with?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {page.cardsDescription}
            </p>
          </div>

          <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
            {contactRoutes.length} shortcuts
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {contactRoutes.map((route) => (
            <SupportRouteCard
              key={route.title}
              title={route.title}
              description={route.description}
              badge={route.badge}
              icon={route.icon}
              to={route.to}
            />
          ))}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
        <Reveal>
          <form
            ref={formRef}
            id="support-message"
            onSubmit={onSubmit}
            className="salt-section-shell rounded-[1.8rem] p-4 sm:p-5 lg:p-6"
          >
            <p className="salt-kicker">Message us</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,2.7vw,2.1rem)] leading-[1.02] text-foreground">
              Tell us what you need and we’ll route it cleanly.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Add an order detail, delivery issue, or product question and we’ll keep the thread focused.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Full name</span>
                <input required type="text" className="salt-form-control h-12 px-4" />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Email address</span>
                <input required type="email" className="salt-form-control h-12 px-4" />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground sm:col-span-2">
                <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">How can we help?</span>
                <textarea
                  required
                  rows={7}
                  className="salt-form-control min-h-[180px] rounded-xl px-4 py-3"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {contactChips.map((topic) => (
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

        <Reveal delayMs={120}>
          <div className="space-y-4">
            <div className="salt-section-shell rounded-[1.8rem] p-4 sm:p-5">
              <p className="salt-kicker">Support quality</p>
              <h2 className="mt-2 font-display text-[clamp(1.35rem,2.4vw,1.9rem)] leading-[1.02] text-foreground">
                Fast, clear, and helpful responses
              </h2>
              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-2 rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Within 24 business hours
                </div>
                <div className="flex items-center gap-2 rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  Resolution-first handling
                </div>
                <div className="flex items-center gap-2 rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                  <PackageSearch className="h-4 w-4 text-primary" />
                  Order tracking support
                </div>
                <div className="flex items-center gap-2 rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Secure verification process
                </div>
              </div>
            </div>

            <div className="salt-section-shell rounded-[1.8rem] p-4 sm:p-5">
              <p className="salt-kicker">Need a shortcut?</p>
              <div className="mt-3 space-y-2">
                <a
                  href={`mailto:${supportEmail}`}
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span>Email support</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </a>
                <Link
                  to="/pages/faq"
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span>Browse FAQ</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
                <Link
                  to="/track-order"
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span>Track order</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
                <Link
                  to={contactPolicyHref}
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span>Contact policy</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </section>
  );
};

export default ContactPage;
