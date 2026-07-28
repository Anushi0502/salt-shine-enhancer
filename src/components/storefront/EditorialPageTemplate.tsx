import { BadgeCheck, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import SectionHeading from "@/components/storefront/SectionHeading";
import { isNativeApp } from "@/lib/mobile";
import type { EditorialPageContent } from "@/lib/editorial-pages";

type EditorialPageTemplateProps = {
  page: EditorialPageContent;
};

const cardShellClass =
  "block h-full rounded-[1.5rem] border border-border/70 bg-background/92 p-5 text-left shadow-[0_18px_36px_-30px_rgba(15,23,42,0.16)]";

const EditorialPageTemplate = ({ page }: EditorialPageTemplateProps) => {
  const nativeApp = isNativeApp();

  return (
    <section
      className={`mx-auto ${nativeApp ? "mt-4 w-[min(1040px,calc(100%_-_18px))]" : "mt-5 w-[min(1160px,calc(100%_-_20px))]"} pb-8`}
    >
      <Reveal>
        <InnerBreadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: page.title },
          ]}
        />
      </Reveal>

      <Reveal>
        <div className="overflow-hidden rounded-[1.65rem] border border-border/70 bg-background/92 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.18)]">
          <div className="border-b border-border/70 p-[10px] sm:p-[24px] lg:p-[28px]">
            <div className="relative overflow-hidden rounded-[1.4rem] border border-border/70 bg-[linear-gradient(145deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92)),radial-gradient(circle_at_12%_14%,hsl(var(--salt-gold)/0.12),transparent_28%),radial-gradient(circle_at_88%_12%,hsl(var(--primary)/0.12),transparent_34%),linear-gradient(180deg,hsl(var(--background)/0.44),hsl(var(--background)/0.02))] p-4 shadow-[0_22px_44px_-38px_rgba(15,23,42,0.24)] sm:p-6 lg:p-8">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-10 top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16),transparent_66%)] blur-3xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_68%)] blur-3xl"
              />

              <div className="relative z-[1] grid gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:gap-7">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/88 px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-primary shadow-[0_12px_24px_-22px_rgba(15,23,42,0.16)]">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {page.kicker}
                  </span>

                  <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.25rem,5.2vw,4.35rem)] leading-[0.92] tracking-[-0.055em] text-foreground">
                    {page.title}
                  </h1>
                  <p className="mt-4 max-w-[58ch] text-[15px] leading-7 text-muted-foreground sm:text-[1.06rem]">
                    {page.summary}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {page.stats.map((item) => (
                      <span
                        key={item.label}
                        className="inline-flex items-center rounded-full border border-border/70 bg-background/82 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-foreground shadow-[0_12px_26px_-22px_rgba(15,23,42,0.16)]"
                      >
                        <span className="mr-2 text-primary">{item.label}</span>
                        {item.value}
                      </span>
                    ))}
                  </div>

                  {page.introParagraphs?.length ? (
                    <div className="mt-6 rounded-[1.45rem] border border-border/70 bg-background/92 p-4 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.16)] sm:p-5">
                      <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-primary">
                        Story
                      </p>
                      <div className="mt-3 space-y-4">
                        {page.introParagraphs.map((paragraph) => (
                          <p key={paragraph} className="text-[0.98rem] leading-8 text-muted-foreground">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-stretch">
                  <div className="flex w-full flex-col justify-between rounded-[1.65rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.96),hsl(var(--card)/0.9))] p-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.18)]">
                    <div>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-background/82 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-foreground">
                        {page.accent.label}
                      </span>
                      <h2 className="mt-4 font-display text-[1.7rem] leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[2.1rem]">
                        {page.accent.title}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">
                        {page.accent.body}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-2.5">
                      {page.accent.bullets.map((bullet) => (
                        <div
                          key={bullet}
                          className="flex items-center gap-2 rounded-[1rem] border border-border/70 bg-background/92 px-3 py-2 text-sm text-foreground"
                        >
                          <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {page.cards?.length ? (
            <Reveal delayMs={80}>
              <section className="border-b border-border/70 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Highlights"
                  title={page.cardsTitle || "Details"}
                  description={page.cardsDescription}
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {page.cards.map((card) => {
                    const cardFooter = card.to ? (
                      <div className="mt-4 inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-primary">
                        Explore
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    ) : null;

                    const content = (
                      <>
                        <h3 className="font-display text-[1.25rem] leading-[1.08] tracking-[-0.03em] text-foreground">
                          {card.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.detail}</p>
                        {cardFooter}
                      </>
                    );

                    return card.to ? (
                      <Link
                        key={card.title}
                        to={card.to}
                        className={`${cardShellClass} transition hover:-translate-y-[1px] hover:border-primary/20 hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.18)]`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={card.title} className={cardShellClass}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </section>
            </Reveal>
          ) : null}

          {page.steps?.length ? (
            <Reveal delayMs={120}>
              <section className="border-b border-border/70 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Process"
                  title={page.stepsTitle || "Next"}
                  description={page.stepsDescription}
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {page.steps.map((step) => (
                    <div key={step.step} className={cardShellClass}>
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary/88">
                        Step {step.step}
                      </p>
                      <h3 className="mt-3 font-display text-[1.25rem] leading-[1.08] tracking-[-0.03em] text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          {page.chips?.length ? (
            <Reveal delayMs={160}>
              <section className="border-b border-border/70 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Key points"
                  title={page.chipsTitle || "Highlights"}
                  description={page.chipsDescription}
                />

                <div className="mt-5 flex flex-wrap gap-2.5">
                  {page.chips.map((chip) => (
                    <span
                      key={chip}
                      className="salt-outline-chip inline-flex items-center rounded-full px-4 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.08em]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          {page.faqs?.length ? (
            <Reveal delayMs={200}>
              <section className="border-b border-border/70 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Answers"
                  title={page.faqsTitle || "FAQ"}
                  description={page.faqsDescription}
                />

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {page.faqs.map((faq) => (
                    <div key={faq.question} className={cardShellClass}>
                      <h3 className="font-display text-[1.14rem] leading-[1.08] tracking-[-0.03em] text-foreground">
                        {faq.question}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          <Reveal delayMs={240}>
            <section className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
              <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(160deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92)),radial-gradient(circle_at_left,hsl(var(--salt-gold)/0.12),transparent_30%),radial-gradient(circle_at_right,hsl(var(--primary)/0.1),transparent_34%)] p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.16)] sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-primary">
                      Next step
                    </p>
                    <h3 className="mt-3 font-display text-[1.9rem] leading-[0.98] tracking-[-0.04em] text-foreground sm:text-[2.35rem]">
                      Keep browsing, read more, or contact the team directly.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      The storefront, editorial pages, and support flows are designed to feel like one connected experience.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap lg:justify-end">
                    {page.actions.map((action) => (
                      action.href ? (
                        <a
                          key={action.label}
                          href={action.href}
                          target="_blank"
                          rel="noreferrer"
                          className={
                            action.primary
                              ? "salt-primary-cta h-11 w-full rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] sm:w-auto"
                              : "salt-outline-chip inline-flex h-11 w-full items-center justify-center rounded-full px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] sm:w-auto"
                          }
                        >
                          {action.label}
                        </a>
                      ) : (
                        <Link
                          key={action.to || action.label}
                          to={action.to || "/"}
                          className={
                            action.primary
                              ? "salt-primary-cta h-11 w-full rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] sm:w-auto"
                              : "salt-outline-chip inline-flex h-11 w-full items-center justify-center rounded-full px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] sm:w-auto"
                          }
                        >
                          {action.label}
                        </Link>
                      )
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </Reveal>
        </div>
      </Reveal>
    </section>
  );
};

export default EditorialPageTemplate;
