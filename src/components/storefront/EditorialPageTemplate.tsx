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
  "block h-full rounded-[1.5rem] border border-[#d3e4ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(238,245,255,0.86))] p-5 text-left shadow-[0_18px_36px_-30px_rgba(22,77,160,0.24)]";

const EditorialPageTemplate = ({ page }: EditorialPageTemplateProps) => {
  const nativeApp = isNativeApp();

  return (
    <section
      className={`mx-auto ${nativeApp ? "mt-4 w-[min(1040px,calc(100%-18px))]" : "mt-5 w-[min(1160px,calc(100%-20px))]"} pb-8`}
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
        <div className="overflow-hidden rounded-[1.65rem] border border-[#c5dbff] bg-[#f8fbff] shadow-[0_28px_80px_-56px_rgba(22,77,160,0.24)]">
          <div className="border-b border-[#dce9ff] p-[10px] sm:p-[24px] lg:p-[28px]">
            <div className="relative overflow-hidden rounded-[1.4rem] border border-[#c8dcff] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(232,242,255,0.92)),radial-gradient(circle_at_12%_14%,rgba(252,211,77,0.18),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.17),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.44),rgba(255,255,255,0.02))] p-4 shadow-[0_22px_44px_-38px_rgba(22,77,160,0.42)] sm:p-6 lg:p-8">
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
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#f1ca63] bg-[linear-gradient(140deg,rgba(255,248,226,0.98),rgba(255,255,255,0.92))] px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#1f55aa] shadow-[0_12px_24px_-22px_rgba(146,98,14,0.48)]">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {page.kicker}
                  </span>

                  <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.25rem,5.2vw,4.35rem)] leading-[0.92] tracking-[-0.055em] text-[#0f2d63]">
                    {page.title}
                  </h1>
                  <p className="mt-4 max-w-[58ch] text-[15px] leading-7 text-[#506a98] sm:text-[1.06rem]">
                    {page.summary}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {page.stats.map((item) => (
                      <span
                        key={item.label}
                        className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-white/80 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.32)]"
                      >
                        <span className="mr-2 text-[#6890d9]">{item.label}</span>
                        {item.value}
                      </span>
                    ))}
                  </div>

                  {page.introParagraphs?.length ? (
                    <div className="mt-6 rounded-[1.45rem] border border-[#d4e5ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(241,247,255,0.88))] p-4 shadow-[0_18px_36px_-30px_rgba(22,77,160,0.22)] sm:p-5">
                      <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                        Story
                      </p>
                      <div className="mt-3 space-y-4">
                        {page.introParagraphs.map((paragraph) => (
                          <p key={paragraph} className="text-[0.98rem] leading-8 text-[#4f678f]">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-stretch">
                  <div className="flex w-full flex-col justify-between rounded-[1.65rem] border border-[#cae0ff] bg-[#dbe8fb] p-4 shadow-[0_24px_48px_-36px_rgba(22,77,160,0.38)]">
                    <div>
                      <span className="inline-flex items-center rounded-full border border-white/22 bg-[linear-gradient(180deg,rgba(20,34,65,0.55),rgba(10,18,35,0.45))] px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white">
                        {page.accent.label}
                      </span>
                      <h2 className="mt-4 font-display text-[1.7rem] leading-[1.02] tracking-[-0.04em] text-[#123467] sm:text-[2.1rem]">
                        {page.accent.title}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-[#59719a]">
                        {page.accent.body}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-2.5">
                      {page.accent.bullets.map((bullet) => (
                        <div
                          key={bullet}
                          className="flex items-center gap-2 rounded-[1rem] border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(241,247,255,0.8))] px-3 py-2 text-sm text-[#234d8f]"
                        >
                          <BadgeCheck className="h-4 w-4 shrink-0 text-[#2f6fe0]" />
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
              <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Highlights"
                  title={page.cardsTitle || "Details"}
                  description={page.cardsDescription}
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {page.cards.map((card) => {
                    const cardFooter = card.to ? (
                      <div className="mt-4 inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#1f55aa]">
                        Explore
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    ) : null;

                    const content = (
                      <>
                        <h3 className="font-display text-[1.25rem] leading-[1.08] tracking-[-0.03em] text-[#123569]">
                          {card.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[#59719b]">{card.detail}</p>
                        {cardFooter}
                      </>
                    );

                    return card.to ? (
                      <Link
                        key={card.title}
                        to={card.to}
                        className={`${cardShellClass} transition hover:-translate-y-[1px] hover:border-[#b9d2ff] hover:shadow-[0_24px_50px_-34px_rgba(22,77,160,0.28)]`}
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
              <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Process"
                  title={page.stepsTitle || "Next"}
                  description={page.stepsDescription}
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {page.steps.map((step) => (
                    <div key={step.step} className={cardShellClass}>
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]/88">
                        Step {step.step}
                      </p>
                      <h3 className="mt-3 font-display text-[1.25rem] leading-[1.08] tracking-[-0.03em] text-[#123569]">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[#59719b]">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          {page.chips?.length ? (
            <Reveal delayMs={160}>
              <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Key points"
                  title={page.chipsTitle || "Highlights"}
                  description={page.chipsDescription}
                />

                <div className="mt-5 flex flex-wrap gap-2.5">
                  {page.chips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-4 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.28)]"
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
              <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
                <SectionHeading
                  kicker="Answers"
                  title={page.faqsTitle || "FAQ"}
                  description={page.faqsDescription}
                />

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {page.faqs.map((faq) => (
                    <div key={faq.question} className={cardShellClass}>
                      <h3 className="font-display text-[1.14rem] leading-[1.08] tracking-[-0.03em] text-[#123569]">
                        {faq.question}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[#59719b]">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          <Reveal delayMs={240}>
            <section className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
              <div className="rounded-[1.5rem] border border-[#cfe1ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(235,244,255,0.88)),radial-gradient(circle_at_left,rgba(252,211,77,0.16),transparent_30%),radial-gradient(circle_at_right,rgba(59,130,246,0.14),transparent_34%)] p-4 shadow-[0_20px_40px_-34px_rgba(22,77,160,0.22)] sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                      Next step
                    </p>
                    <h3 className="mt-3 font-display text-[1.9rem] leading-[0.98] tracking-[-0.04em] text-[#123569] sm:text-[2.35rem]">
                      Keep browsing, read more, or contact the team directly.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[#59719b]">
                      The storefront, editorial pages, and support flows are designed to feel like one connected experience.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap lg:justify-end">
                    {page.actions.map((action) => (
                      <Link
                        key={action.to}
                        to={action.to}
                        className={
                          action.primary
                            ? "salt-primary-cta h-11 w-full rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] shadow-[0_20px_38px_-24px_rgba(37,99,235,0.52)] sm:w-auto"
                            : "inline-flex h-11 w-full items-center justify-center rounded-full border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] text-[#1d4f9c] shadow-[0_16px_34px_-30px_rgba(22,77,160,0.26)] transition hover:-translate-y-[1px] hover:border-[#9ec1ff] hover:text-[#2563eb] sm:w-auto"
                        }
                      >
                        {action.label}
                      </Link>
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
