import { useMemo } from "react";
import { BadgeCheck, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "@/components/storefront/Reveal";
import ResilientImage from "@/components/storefront/ResilientImage";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { firstImageSrcFromHtml, readingTime, sanitizeRichHtml, stripHtml } from "@/lib/formatters";
import { useAboutPage } from "@/lib/shopify-data";

const aboutHighlights = [
  { label: "Active catalog", value: "700+ products" },
  { label: "Weekly refresh", value: "New arrivals every week" },
  { label: "Support response", value: "Within 24 business hours" },
];

const aboutPillars = [
  {
    title: "Curated with purpose",
    detail: "The assortment is shaped around products that feel useful, giftable, and easy to choose.",
    Icon: BadgeCheck,
  },
  {
    title: "Clear buying experience",
    detail: "Pricing, support, and checkout cues stay visible so the purchase path feels confident.",
    Icon: ShieldCheck,
  },
  {
    title: "Transparent delivery",
    detail: "Shipping guidance and policy access are kept close to the shopping experience.",
    Icon: Truck,
  },
];

const aboutReasonFallbacks = [
  {
    title: "Free shipping across the USA",
    detail: "Value-forward checkout with no minimum purchase barrier for smaller orders.",
  },
  {
    title: "Unique products with practical value",
    detail: "Items are selected to balance personality, utility, and approachable pricing.",
  },
  {
    title: "Fresh arrivals every week",
    detail: "The catalog stays active so returning shoppers keep finding new reasons to browse.",
  },
];

type AboutDetailCard = {
  title: string;
  detail: string;
  href?: string | null;
};

type ParsedAboutContent = {
  summary: string;
  founderHeading: string;
  founderStory: string;
  founderImage: string | null;
  reasonItems: AboutDetailCard[];
  storyParagraphs: string[];
};

function AboutSectionTitle({ title }: { title: string }) {
  return (
    <div className="grid grid-cols-[minmax(1rem,1fr)_auto_minmax(1rem,1fr)] items-center gap-2.5 sm:gap-4">
      <span className="h-px bg-[#bfd4fb]" />
      <h2 className="font-display text-[clamp(1.05rem,2.3vw,1.45rem)] leading-none text-[#1c4b96]">
        {title}
      </h2>
      <span className="h-px bg-[#bfd4fb]" />
    </div>
  );
}

function cleanPlainText(input: unknown): string {
  return stripHtml(input).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function splitLabelAndDetail(text: string): { title: string; detail: string } {
  const cleaned = cleanPlainText(text);
  const colonIndex = cleaned.indexOf(":");

  if (colonIndex > 0 && colonIndex < 72) {
    return {
      title: cleaned.slice(0, colonIndex).trim(),
      detail: cleaned.slice(colonIndex + 1).trim(),
    };
  }

  return { title: "", detail: cleaned };
}

function collectSectionParagraphs(heading: Element | null): Element[] {
  const items: Element[] = [];
  let cursor = heading?.nextElementSibling ?? null;

  while (cursor) {
    if (/^H[23]$/i.test(cursor.tagName)) {
      break;
    }

    if (cursor.tagName.toLowerCase() === "p" && cleanPlainText(cursor.innerHTML).length > 24) {
      items.push(cursor);
    }

    cursor = cursor.nextElementSibling;
  }

  return items;
}

function parsePlainCard(paragraph: Element, fallbackTitle: string): AboutDetailCard | null {
  const rawText = cleanPlainText(paragraph.innerHTML);
  if (!rawText) {
    return null;
  }

  const emphasizedTitle = cleanPlainText(paragraph.querySelector("strong, b")?.textContent || "");
  const split = splitLabelAndDetail(rawText);
  const title = emphasizedTitle || split.title || fallbackTitle;
  let detail = split.detail || rawText;

  if (detail.toLowerCase().startsWith(title.toLowerCase())) {
    detail = detail.slice(title.length).replace(/^[:\-\s]+/, "").trim();
  }

  return { title, detail };
}

function formatMetaDate(input: string | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function parseAboutContent(rawHtml: string): ParsedAboutContent {
  const fallbackSummary =
    "SALT Online Store brings together home, lifestyle, gifting, and everyday products in a cleaner, more curated shopping environment.";
  const fallbackFounderStory =
    "The store is built around thoughtful curation, practical value, and a shopping experience that stays easy to trust from discovery through checkout.";
  const fallbackImage = firstImageSrcFromHtml(rawHtml);

  if (!rawHtml || typeof DOMParser === "undefined") {
    return {
      summary: fallbackSummary,
      founderHeading: "Meet Courtney R. Jones",
      founderStory: fallbackFounderStory,
      founderImage: fallbackImage,
      reasonItems: aboutReasonFallbacks,
      storyParagraphs: [],
    };
  }

  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const headings = Array.from(doc.querySelectorAll("h2, h3"));
  const textParagraphs = Array.from(doc.querySelectorAll("p")).filter(
    (paragraph) => cleanPlainText(paragraph.innerHTML).length > 24 && !paragraph.querySelector("img"),
  );

  const summaryParagraph =
    textParagraphs.find((paragraph) => cleanPlainText(paragraph.innerHTML).length > 110) || textParagraphs[0];
  const founderHeading =
    cleanPlainText(headings.find((heading) => /courtney/i.test(heading.textContent || ""))?.textContent) ||
    "Meet Courtney R. Jones";
  const founderParagraph =
    textParagraphs.find((paragraph) =>
      /senior and living today|care advocate|courtney/i.test(cleanPlainText(paragraph.innerHTML).toLowerCase()),
    ) ||
    textParagraphs[1] ||
    summaryParagraph;

  const offersHeading = headings.find((heading) =>
    /what we offer/i.test(cleanPlainText(heading.textContent || "").toLowerCase()),
  );
  const reasonsHeading = headings.find((heading) =>
    /why choose us/i.test(cleanPlainText(heading.textContent || "").toLowerCase()),
  );
  const offerParagraphs = collectSectionParagraphs(offersHeading);

  const reasonItems = collectSectionParagraphs(reasonsHeading)
    .map((paragraph, index) => parsePlainCard(paragraph, `Reason ${index + 1}`))
    .filter((item): item is AboutDetailCard => Boolean(item));

  const excludedNodes = new Set(
    [summaryParagraph, founderParagraph, ...offerParagraphs, ...collectSectionParagraphs(reasonsHeading)]
      .filter(Boolean)
      .map((node) => node.outerHTML),
  );

  const storyParagraphs = textParagraphs
    .filter((paragraph) => !excludedNodes.has(paragraph.outerHTML))
    .map((paragraph) => cleanPlainText(paragraph.innerHTML))
    .filter(Boolean);

  return {
    summary: cleanPlainText(summaryParagraph?.innerHTML) || fallbackSummary,
    founderHeading,
    founderStory: cleanPlainText(founderParagraph?.innerHTML) || fallbackFounderStory,
    founderImage: fallbackImage,
    reasonItems: reasonItems.length ? reasonItems : aboutReasonFallbacks,
    storyParagraphs,
  };
}

const AboutPage = () => {
  const { data, isLoading, error, refetch } = useAboutPage();
  const title = data?.page.title || "About SALT";
  const bodyHtml = sanitizeRichHtml(data?.page.bodyHtml || "");
  const updatedLabel = formatMetaDate(data?.page.updatedAt || data?.page.publishedAt);
  const aboutReadTime = readingTime(bodyHtml);
  const parsed = useMemo(() => parseAboutContent(bodyHtml), [bodyHtml]);
  const storyParagraphs = parsed.storyParagraphs.length
    ? parsed.storyParagraphs
    : [parsed.founderStory, "SALT keeps the storefront focused on useful products, clear policies, and easier discovery across the catalog."];

  if (isLoading) {
    return (
      <LoadingState
        title="Loading About"
        subtitle="Fetching the latest About content from Shopify."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="About page unavailable"
        subtitle="Please retry to refresh content from Shopify."
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

  return (
    <section className="mx-auto mt-5 w-[min(1160px,calc(100%-20px))] pb-8 sm:mt-6">
      <div className="overflow-hidden rounded-[1.15rem] border border-[#c5dbff] bg-[#f8fbff] shadow-[0_28px_80px_-56px_rgba(22,77,160,0.24)] sm:rounded-[1.45rem] lg:rounded-[1.65rem]">
        <Reveal>
          <section className="border-b border-[#dce9ff] p-[10px] sm:p-[24px] lg:p-[28px]">
            <div className="relative overflow-hidden rounded-[1.18rem] border border-[#c8dcff] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(232,242,255,0.92)),radial-gradient(circle_at_12%_14%,rgba(252,211,77,0.18),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.17),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.44),rgba(255,255,255,0.02))] p-4 shadow-[0_22px_44px_-38px_rgba(22,77,160,0.42)] sm:p-6 lg:p-8">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-10 top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.18),transparent_66%)] blur-3xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.18),transparent_68%)] blur-3xl"
              />

              <div className="relative z-[1]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-7">
                  <div className="min-w-0 flex flex-col justify-between lg:flex-[1_1_52%]">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#f1ca63] bg-[linear-gradient(140deg,rgba(255,248,226,0.98),rgba(255,255,255,0.92))] px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#1f55aa] shadow-[0_12px_24px_-22px_rgba(146,98,14,0.48)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      About SALT
                    </span>

                    <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(3rem,7vw,5.8rem)] leading-[0.86] tracking-[-0.065em] text-[#0f2d63]">
                      {title}
                    </h1>
                    <p className="mt-4 max-w-[58ch] text-[15px] leading-7 text-[#506a98] sm:text-[1.06rem]">
                      {parsed.summary}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2.5">
                      {updatedLabel ? (
                        <span className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-white/80 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.32)]">
                          Updated {updatedLabel}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-white/80 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.32)]">
                        {aboutReadTime}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#d2e4ff] bg-white/80 px-4 py-2 text-[0.74rem] font-semibold tracking-[0.04em] text-[#1d4f9c] shadow-[0_12px_26px_-22px_rgba(22,77,160,0.32)]">
                        Home, gifting, garden, and kitchen
                      </span>
                    </div>

                    <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                      <Link
                        to="/shop"
                        className="salt-primary-cta h-11 w-full rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] shadow-[0_20px_38px_-24px_rgba(37,99,235,0.52)] sm:w-auto"
                      >
                        Shop the catalog
                      </Link>
                      <Link
                        to="/blog"
                        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] text-[#1d4f9c] shadow-[0_16px_34px_-30px_rgba(22,77,160,0.26)] transition hover:-translate-y-[1px] hover:border-[#9ec1ff] hover:text-[#2563eb] sm:w-auto"
                      >
                        Read the blogs
                      </Link>
                    </div>
                  </div>
                  </div>

                  <div className="w-full lg:flex-[0_0_48%]">
                    <div className="relative overflow-hidden rounded-[1.65rem] border border-[#cae0ff] bg-[#dbe8fb] shadow-[0_24px_48px_-36px_rgba(22,77,160,0.38)]">
                    <ResilientImage
                      src={parsed.founderImage}
                      alt={parsed.founderHeading}
                      className="block h-[360px] w-full object-cover object-top sm:h-[440px]"
                      fallback={<div className="h-[360px] w-full bg-[linear-gradient(140deg,#cfe1ff,#eef5ff)] sm:h-[440px]" />}
                    />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,28,66,0.05)_0%,rgba(12,32,74,0.18)_35%,rgba(8,24,59,0.88)_100%)]" />
                    <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                      <span className="inline-flex items-center rounded-full border border-white/22 bg-[linear-gradient(180deg,rgba(20,34,65,0.55),rgba(10,18,35,0.45))] px-4 py-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-white  ">
                        Founder story
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md">
                        From care to commerce
                      </span>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
                  {aboutHighlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.35rem] border border-[#d3e4ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(240,247,255,0.86))] px-4 py-3 shadow-[0_16px_34px_-30px_rgba(22,77,160,0.28)]"
                    >
                      <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]/90">
                        {item.label}
                      </p>
                      <p className="mt-2 font-display text-[1.05rem] leading-tight text-[#163b7a] sm:text-[1.18rem]">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-[1.4rem] border border-[#d3e4ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(239,246,255,0.88))] p-4 shadow-[0_18px_36px_-30px_rgba(22,77,160,0.22)]">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                    Store thesis
                  </p>
                  <p className="mt-3 font-display text-[1.45rem] leading-[1.02] tracking-[-0.04em] text-[#123467] sm:text-[1.85rem]">
                    A calmer storefront built around practical products and easier choices.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#59719a]">
                    The catalog is designed to feel useful first: clearer discovery, less noise, stronger support cues, and products that still feel personal.
                  </p>
                  </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={80}>
          <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            <AboutSectionTitle title="What Guides the Store" />
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {aboutPillars.map(({ title: pillarTitle, detail, Icon }) => (
                <div
                  key={pillarTitle}
                  className="rounded-[1.55rem] border border-[#d3e4ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(238,245,255,0.86))] p-5 shadow-[0_18px_36px_-30px_rgba(22,77,160,0.24)] sm:p-6"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#cfe0ff] bg-white/92 text-[#2563eb] shadow-[0_12px_24px_-18px_rgba(22,77,160,0.36)]">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="mt-4 font-display text-[1.5rem] leading-[1.02] tracking-[-0.04em] text-[#13386f]">
                    {pillarTitle}
                  </h3>
                  <p className="mt-3 text-[0.98rem] leading-7 text-[#5a739d]">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={120}>
          <section className="border-b border-[#dce9ff] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            <div className="grid gap-5 lg:grid-cols-[0.94fr_1.06fr] lg:gap-6">
              <div>
                <AboutSectionTitle title="Why People Stay" />
                <div className="mt-5 grid gap-3">
                  {parsed.reasonItems.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className="rounded-[1.45rem] border border-[#d3e4ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(238,245,255,0.86))] p-5 shadow-[0_18px_34px_-30px_rgba(22,77,160,0.2)]"
                    >
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]/88">
                        Reason {String(index + 1).padStart(2, "0")}
                      </p>
                      <h3 className="mt-3 font-display text-[1.3rem] leading-[1.04] tracking-[-0.03em] text-[#123569]">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-[0.96rem] leading-7 text-[#59719b]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <AboutSectionTitle title="The Story" />
                <div className="mt-5 rounded-[1.6rem] border border-[#d4e5ff] bg-[linear-gradient(165deg,rgba(255,255,255,0.94),rgba(241,247,255,0.88))] p-5 shadow-[0_18px_40px_-34px_rgba(22,77,160,0.22)] sm:p-6 lg:p-7">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                    From the brand desk
                  </p>
                  <div className="mt-4 space-y-4">
                    {storyParagraphs.slice(0, 4).map((paragraph, index) => (
                      <p key={index} className="text-[1rem] leading-8 text-[#4f678f]">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={220}>
          <section className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <AboutSectionTitle title="Continue Exploring" />
            <div className="mt-5 rounded-[1.5rem] border border-[#cfe1ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(235,244,255,0.88)),radial-gradient(circle_at_left,rgba(252,211,77,0.16),transparent_30%),radial-gradient(circle_at_right,rgba(59,130,246,0.14),transparent_34%)] p-4 shadow-[0_20px_40px_-34px_rgba(22,77,160,0.22)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                    Next stop
                  </p>
                  <h3 className="mt-3 font-display text-[1.9rem] leading-[0.98] tracking-[-0.04em] text-[#123569] sm:text-[2.35rem]">
                    Browse the catalog, read the blogs, or talk to the team directly.
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#59719b]">
                    The storefront, editorial pages, and support flows are designed to feel like one connected experience.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap lg:justify-end">
                  <Link
                    to="/shop"
                    className="salt-primary-cta h-11 w-full rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] shadow-[0_20px_38px_-24px_rgba(37,99,235,0.52)] sm:w-auto"
                  >
                    Shop the catalog
                  </Link>
                  <Link
                    to="/blog"
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] text-[#1d4f9c] shadow-[0_16px_34px_-30px_rgba(22,77,160,0.26)] transition hover:-translate-y-[1px] hover:border-[#9ec1ff] hover:text-[#2563eb] sm:w-auto"
                  >
                    Read the blogs
                  </Link>
                  <Link
                    to="/contact"
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#cfe0ff] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(241,247,255,0.82))] px-5 py-0 text-xs font-bold uppercase tracking-[0.12em] text-[#1d4f9c] shadow-[0_16px_34px_-30px_rgba(22,77,160,0.26)] transition hover:-translate-y-[1px] hover:border-[#9ec1ff] hover:text-[#2563eb] sm:w-auto"
                  >
                    Contact support
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </section>
  );
};

export default AboutPage;
