import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Reveal from "@/components/storefront/Reveal";
import SectionHeading from "@/components/storefront/SectionHeading";
import type { EditorialPageCopy, EditorialSection } from "@/content/pages/types";
import { cn } from "@/lib/utils";

type EditorialPageTemplateProps = {
  copy: EditorialPageCopy;
};

const actionClassName =
  "inline-flex h-11 items-center justify-center rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] transition";

function renderSectionBody(section: EditorialSection) {
  switch (section.kind) {
    case "rich":
      return (
        <div className="mt-4 space-y-4">
          {section.body.map((paragraph, index) => (
            <p
              key={`${section.id}-${index}`}
              className={cn(
                "text-[0.98rem] leading-7 text-[#51688f] sm:text-[1rem]",
                index === 0 && "text-[#12325f]",
              )}
            >
              {paragraph}
            </p>
          ))}
        </div>
      );

    case "cards":
      return (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {section.items.map((item, index) => (
            <Card
              key={`${section.id}-${item.title}-${index}`}
              className="salt-card-hover border-border/70 bg-[linear-gradient(165deg,rgba(255,255,255,0.97),rgba(240,246,255,0.88))] shadow-[0_20px_38px_-32px_rgba(22,77,160,0.24)]"
            >
              <CardHeader className="p-4 pb-2">
                <CardTitle className="font-display text-[1.18rem] leading-[1.02] tracking-[-0.03em] text-[#12325f]">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-sm leading-6 text-[#556d95]">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      );

    case "faq":
      return (
        <Accordion type="single" collapsible className="mt-4 space-y-2">
          {section.items.map((item, index) => {
            const value = `${section.id}-${index}`;

            return (
              <AccordionItem
                key={`${section.id}-${item.question}-${index}`}
                value={value}
                className="rounded-[1.15rem] border border-border/70 bg-[linear-gradient(165deg,rgba(255,255,255,0.97),rgba(241,247,255,0.88))] px-4 shadow-[0_16px_34px_-30px_rgba(22,77,160,0.22)]"
              >
                <AccordionTrigger className="py-4 text-left font-semibold text-[#12325f] hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-7 text-[#556d95]">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      );
  }
}

const EditorialPageTemplate = ({ copy }: EditorialPageTemplateProps) => {
  return (
    <section className="mx-auto mt-5 w-[min(1160px,calc(100%-20px))] pb-8 sm:mt-6">
      <div className="salt-panel-shell overflow-hidden rounded-[1.65rem] sm:rounded-[1.9rem]">
        <Reveal>
          <header className="border-b border-border/70 p-3 sm:p-5 lg:p-7">
            <div className="relative overflow-hidden rounded-[1.35rem] border border-[#c8dcff] bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(235,244,255,0.92)),radial-gradient(circle_at_12%_14%,rgba(252,211,77,0.16),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.16),transparent_34%)] p-4 shadow-[0_22px_44px_-38px_rgba(22,77,160,0.34)] sm:p-6 lg:p-8">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-10 top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.18),transparent_66%)] blur-3xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_68%)] blur-3xl"
              />

              <div className="relative z-[1] grid gap-5 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch lg:gap-6">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#f1ca63] bg-[linear-gradient(140deg,rgba(255,248,226,0.98),rgba(255,255,255,0.92))] px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#1f55aa] shadow-[0_12px_24px_-22px_rgba(146,98,14,0.48)]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {copy.eyebrow}
                  </span>

                  <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.35rem,5.4vw,4.45rem)] leading-[0.9] tracking-[-0.055em] text-[#0f2d63]">
                    {copy.title}
                  </h1>

                  <p className="mt-4 max-w-[58ch] text-[15px] leading-7 text-[#506a98] sm:text-[1.06rem]">
                    {copy.summary}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {copy.chips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-white/80 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.32)]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                    {copy.actions.map((action) => (
                      <Link
                        key={action.to}
                        to={action.to}
                        className={cn(
                          actionClassName,
                          action.primary
                            ? "salt-primary-cta w-full rounded-full px-5 text-xs text-primary-foreground shadow-[0_20px_38px_-24px_rgba(37,99,235,0.52)] sm:w-auto"
                            : "salt-outline-chip w-full rounded-full border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-5 py-0 text-xs text-[#1d4f9c] shadow-[0_16px_34px_-30px_rgba(22,77,160,0.26)] hover:-translate-y-[1px] hover:border-[#9ec1ff] hover:text-[#2563eb] sm:w-auto",
                        )}
                      >
                        {action.label}
                        {action.primary ? null : <ArrowRight className="ml-2 h-3.5 w-3.5" />}
                      </Link>
                    ))}
                  </div>
                </div>

                <aside className="salt-section-shell rounded-[1.35rem] border border-border/70 p-4 sm:p-5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                    Quick facts
                  </p>
                  <div className="mt-4 grid gap-2">
                    {copy.chips.map((chip) => (
                      <div
                        key={`fact-${chip}`}
                        className="rounded-2xl border border-border/70 bg-background/85 px-3 py-2.5 shadow-[0_12px_24px_-22px_rgba(22,77,160,0.18)]"
                      >
                        <p className="text-sm font-semibold leading-6 text-[#12325f]">{chip}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[#5a739d]">
                    The sections below are organized for quick scanning.
                  </p>
                </aside>
              </div>
            </div>
          </header>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="border-b border-border/70 px-4 py-4 sm:px-6 lg:px-7">
            <div className="flex flex-wrap gap-2">
              {copy.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="salt-outline-chip h-10 px-3.5 py-0 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-7 lg:py-7">
          {copy.sections.map((section, index) => (
            <Reveal key={section.id} delayMs={120 + index * 70}>
              <section
                id={section.id}
                className="scroll-mt-24 rounded-[1.5rem] border border-border/70 bg-[linear-gradient(165deg,rgba(255,255,255,0.98),rgba(241,247,255,0.9))] p-4 shadow-[0_20px_42px_-34px_rgba(22,77,160,0.22)] sm:p-5 lg:p-6"
              >
                <SectionHeading title={section.title} />
                {renderSectionBody(section)}
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EditorialPageTemplate;
