import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useEditorialPage } from "@/lib/shopify-data";

type EditorialPageByHandleProps = {
  handle: string;
  loadingTitle: string;
  loadingSubtitle: string;
  errorTitle: string;
  errorSubtitle: string;
};

const EditorialPageByHandle = ({
  handle,
  loadingTitle,
  loadingSubtitle,
  errorTitle,
  errorSubtitle,
}: EditorialPageByHandleProps) => {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const { data, isLoading, error, refetch } = useEditorialPage(normalizedHandle);

  if (isLoading) {
    return <LoadingState title={loadingTitle} subtitle={loadingSubtitle} />;
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title={errorTitle}
        subtitle={errorSubtitle}
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const page = data.page;
  const pageSummary = page.summary || "A clear page for shoppers who want a direct route through the store.";
  const heroActions = page.actions.map((action) => ({
    label: action.label,
    to: action.to,
    href: action.href,
    primary: action.primary,
  }));

  const heroMeta = page.stats.length ? (
    <div className="flex flex-wrap gap-2">
      {page.stats.map((stat) => (
        <div
          key={`${stat.label}-${stat.value}`}
          className="inline-flex items-baseline gap-2 rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs text-[#102A43]"
        >
          <span className="font-semibold text-[#5C748F]">{stat.label}</span>
          <span className="font-semibold text-[#102A43]">{stat.value}</span>
        </div>
      ))}
    </div>
  ) : null;

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">{page.accent.label}</p>
        <h2 className="mt-2 font-display text-[1.35rem] leading-[1.02] text-foreground">{page.accent.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{page.accent.body}</p>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">Snapshot</p>
        <div className="mt-3 space-y-3">
          {page.stats.map((stat) => (
            <div key={stat.label} className="border-t border-[#d8e6f5] pt-3">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#8a99aa]">{stat.label}</p>
              <p className="mt-0.5 font-display text-[1.2rem] leading-none text-[#102A43]">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {page.accent.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-sm leading-6 text-[#102A43]">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#f2b600]" />
            <span className="text-[#5C748F]">{bullet}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <OpenContentPageShell
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: page.kicker || "Page" },
      ]}
      kicker={page.kicker}
      title={page.title}
      summary={pageSummary}
      meta={heroMeta}
      aside={heroAside}
      actions={heroActions}
    >
      {page.introParagraphs?.length ? (
        <div className="max-w-3xl space-y-4 text-base leading-7 text-[#314861]">
          {page.introParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {page.cards?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.cardsTitle || "Related pages"}
          </p>
          {page.cardsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.cardsDescription}</p>
          ) : null}
          <div className="mt-4 grid gap-0">
            {page.cards.map((card) =>
              card.to ? (
                <Link
                  key={card.title}
                  to={card.to}
                  className="group flex items-center justify-between gap-4 border-t border-[#d8e6f5] py-4 pr-2 transition hover:border-[#bcd4ef]"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-[#102A43] transition group-hover:text-primary">
                      {card.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#5C748F]">{card.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#8a99aa] transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ) : (
                <div key={card.title} className="border-t border-[#d8e6f5] py-4 pr-2">
                  <p className="text-base font-semibold text-[#102A43]">{card.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[#5C748F]">{card.detail}</p>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      {page.steps?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.stepsTitle || "How it works"}
          </p>
          {page.stepsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.stepsDescription}</p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {page.steps.map((step) => (
              <div key={step.step} className="grid gap-2 border-t border-[#d8e6f5] py-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4">
                <p className="font-display text-[1.15rem] leading-none text-primary">{step.step}</p>
                <div>
                  <p className="text-base font-semibold text-[#102A43]">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[#5C748F]">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {page.chips?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.chipsTitle || "Browse cues"}
          </p>
          {page.chipsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.chipsDescription}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {page.chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#31538c]"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {page.faqs?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.faqsTitle || "Frequently asked"}
          </p>
          {page.faqsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.faqsDescription}</p>
          ) : null}
          <div className="mt-4 divide-y divide-[#d8e6f5] border-t border-[#d8e6f5]">
            {page.faqs.map((faq) => (
              <details key={faq.question} className="group py-4">
                <summary className="cursor-pointer list-none text-base font-semibold text-[#102A43] transition group-open:text-primary">
                  {faq.question}
                </summary>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C748F]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </OpenContentPageShell>
  );
};

export default EditorialPageByHandle;
