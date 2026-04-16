import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpenText, Clock3, Sparkles, Star } from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import { LoadingState } from "@/components/storefront/LoadState";
import ResilientImage from "@/components/storefront/ResilientImage";
import { conciseTitle, readingTime } from "@/lib/formatters";
import { useBlogPosts } from "@/lib/shopify-data";

const blogImageFallback = (
  <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.18),transparent_46%),radial-gradient(circle_at_72%_78%,hsl(var(--salt-blue)/0.18),transparent_40%),#f3eee4] px-6 text-center">
    <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[#4c5d7e]">
      Image unavailable
    </p>
  </div>
);

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="grid grid-cols-[minmax(1rem,1fr)_auto_minmax(1rem,1fr)] items-center gap-2.5 sm:gap-4">
      <span className="h-px bg-[#bfd4fb]" />
      <h2 className="font-display text-[clamp(1.12rem,3.15vw,1.65rem)] leading-none text-[#1c4b96]">
        {title}
      </h2>
      <span className="h-px bg-[#bfd4fb]" />
    </div>
  );
}

function formattedDate(value: string): string {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readingMinutes(input: string): number {
  const match = readingTime(input).match(/\d+/);
  return Number(match?.[0] || 0);
}

function compactExcerpt(input: string, maxChars = 168): string {
  const cleaned = String(input || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  const slice = cleaned.slice(0, maxChars - 1);
  const boundary = slice.lastIndexOf(" ");
  const shortened = boundary > 24 ? slice.slice(0, boundary) : slice;
  return `${shortened.trimEnd()}…`;
}

function matchesPinnedPost(
  post: { handle?: string | null; title?: string | null },
  needles: string[],
): boolean {
  const haystack = `${post.handle || ""} ${post.title || ""}`.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

const BlogPage = () => {
  const { data, isLoading, error, refetch } = useBlogPosts();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading blog posts"
        subtitle="Syncing the latest stories from Shopify."
      />
    );
  }

  if (error) {
    return (
      <section className="mt-3 w-full pb-10 sm:mt-4 sm:pb-14 lg:pb-20">
        <div className="mx-auto w-full max-w-[1200px] px-4">
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#f8f5f0] p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.22)] sm:p-8">
              <div className="relative z-10 max-w-2xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-[#ffe4a3] bg-[#fff6db] px-4 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#1f56b2]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Salt Journal
                </p>
                <h1 className="mt-4 font-display text-[clamp(2.2rem,6vw,4rem)] leading-[1.02] tracking-[-0.03em] text-[#1a1a1a]">
                  Journal unavailable right now.
                </h1>
                <p className="mt-4 max-w-xl text-[clamp(1rem,2vw,1.15rem)] leading-relaxed text-[#4a453e]/90">
                  The Shopify article sync did not return cleanly. Retry the feed or jump back into the catalog.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1a1a] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-primary"
                  >
                    Retry feed
                  </button>
                  <Link
                    to="/shop"
                    className="inline-flex h-12 items-center justify-center rounded-full border border-[#1a1a1a] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white"
                  >
                    Shop catalog
                  </Link>
                </div>
      <section className="mx-auto mt-5 w-[min(1200px,calc(100%-20px))] pb-8 sm:mt-6 sm:w-[min(1200px,calc(100%-20px))]">
        <Reveal>
          <div className="salt-panel-shell rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6">
            <p className="salt-kicker">Journal</p>
            <div className="salt-section-shell mt-4 rounded-[1.75rem] px-5 py-8 text-center sm:px-7 sm:py-10">
              <h1 className="font-display text-[clamp(2.1rem,4vw,3.5rem)] leading-[0.94] text-foreground">
                Blog unavailable
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Please retry to refresh posts.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="salt-primary-cta h-11 px-5 text-sm font-bold"
                >
                  Retry
                </button>
                <Link to="/shop?sort=newest" className="salt-outline-chip h-11 px-5 py-0 text-sm">
                  Shop newest
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  const posts = data?.posts || [];
  const currentIssuePost = posts[0] ?? null;
  const leadStoryPost =
    posts.find((post) =>
      matchesPinnedPost(post, [
        "know-how-to-use-specific-gardening-tools-for-your-lawn-and-home-yards-care",
        "know how to use specific gardening tools for your lawn & yards care",
      ]),
    ) ?? currentIssuePost;
  const journalNotesPost =
    posts.find((post) =>
      matchesPinnedPost(post, [
        "7-essential-cookware-categories-that-people-ask-for-their-maintenance-tips",
        "7 essential cookware categories that people ask for & their maintenance tips",
      ]),
    ) ??
    posts.find(
      (post) => post.id !== currentIssuePost?.id && post.id !== leadStoryPost?.id,
    ) ??
    null;
  const pinnedPostIds = new Set(
    [currentIssuePost?.id, leadStoryPost?.id, journalNotesPost?.id].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const latestPosts = posts.filter((post) => !pinnedPostIds.has(post.id)).slice(0, 5);
  const highlightedAuthors = Array.from(
    new Set(posts.map((post) => post.author).filter((author): author is string => Boolean(author))),
  ).slice(0, 4);
  const averageReadMinutes = posts.length
    ? Math.max(1, Math.round(posts.reduce((sum, post) => sum + readingMinutes(post.contentHtml), 0) / posts.length))
    : 0;
  const breadcrumbItems = [
    { label: "Home", to: "/" },
    { label: "Journal" },
  ];

  return (
    <section className="mx-auto mt-5 w-[min(1200px,94vw)] pb-8 sm:mt-6 sm:w-[min(1200px,96vw)]">
      <Reveal>
        <div className="salt-panel-shell relative overflow-hidden rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6">
          <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/65" />
          <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-primary/12 blur-2xl" />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Blog</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">
            Stories, guides, and seasonal ideas
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Editorial pieces from SALT covering everyday living, gifting, and seasonal inspiration.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/shop" className="salt-primary-cta h-10 px-4 text-[0.66rem] font-bold uppercase tracking-[0.1em]">
              Shop catalog
            </Link>
            <Link to="/collections" className="salt-outline-chip h-10 px-4 py-0 text-[0.66rem] font-bold uppercase tracking-[0.1em]">
              View collections
            </Link>
          </div>
          <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            <p className="salt-kpi-card salt-metric-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Live posts</span>
              <span>{posts.length.toLocaleString()} synced articles</span>
            </p>
            <p className="salt-kpi-card salt-metric-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Reading format</span>
              <span>Short, useful reads</span>
            </p>
            <p className="salt-kpi-card salt-metric-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Goal</span>
              <span>Easier shopping decisions</span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {highlightedAuthors.map((author) => (
              <span key={author} className="salt-outline-chip text-[0.62rem]">
                <BookOpenText className="mr-1.5 h-3 w-3" />
                {author}
              </span>
            ))}
            <Link
              to="/shop?sort=newest"
              className="salt-outline-chip text-[0.62rem]"
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              Shop newest arrivals
            </Link>
          </div>
        </div>
      </Reveal>

        {posts.length === 0 ? (
          <Reveal delayMs={100}>
            <div className="overflow-hidden rounded-[1.8rem] border border-[#cadeff] bg-[linear-gradient(155deg,#f9fcff_0%,#edf5ff_45%,#f4f8ff_100%)] p-8 text-center shadow-[0_20px_60px_-44px_rgba(22,77,160,0.3)]">
              <h2 className="font-display text-[clamp(1.8rem,4vw,2.7rem)] leading-[1.02] text-[#1a4d9a]">
                No blog posts yet
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#355a96]">
                New Shopify articles will appear here automatically when the feed updates.
              </p>
            </div>
          </Reveal>
        ) : (
          <>
            {leadStoryPost ? (
              <Reveal delayMs={90}>
                <section>
                  <SectionTitle title="Featured Story" />
                  <article className="mt-5 overflow-hidden rounded-[2rem] border border-[#dce9ff] bg-[#fbfdff] shadow-[0_24px_80px_-52px_rgba(15,23,42,0.18)] lg:grid lg:grid-cols-[0.98fr_1.02fr]">
                    <Link to={`/blog/${leadStoryPost.handle}`} className="block min-h-[18rem] bg-[#f2f5fb]">
                      <ResilientImage
                        src={leadStoryPost.image}
                        alt={leadStoryPost.title}
                        loading="lazy"
                        fallback={blogImageFallback}
                        className="h-full w-full object-cover"
                      />
                    </Link>

                    <div className="flex flex-col justify-between p-6 sm:p-8">
                      <div>
                        <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#1f56b2]">
                          Lead story
                        </p>
                        <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.35rem)] leading-[1.02] tracking-[-0.04em] text-[#172032]">
                          {leadStoryPost.title}
                        </h2>
                        <p className="mt-4 max-w-2xl text-[0.98rem] leading-7 text-[#47566f]">
                          {compactExcerpt(leadStoryPost.excerpt, 220)}
                        </p>
                      </div>

                      <div className="mt-7">
                        <div className="flex flex-wrap items-center gap-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#5d6f90]">
                          <span>{formattedDate(leadStoryPost.publishedAt)}</span>
                          <span className="text-[#9bb6e6]">|</span>
                          <span>{leadStoryPost.author || "SALT"}</span>
                          <span className="text-[#9bb6e6]">|</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {readingTime(leadStoryPost.contentHtml)}
                          </span>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Link
                            to={`/blog/${leadStoryPost.handle}`}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1f63d8] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#1d56be]"
                          >
                            Read the full story
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          <Link
                            to="/collections"
                            className="inline-flex h-12 items-center justify-center rounded-full border border-[#bcd6ff] bg-white px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[#1a4fa5] transition hover:border-[#90b8ff] hover:text-[#133d83]"
                          >
                            Browse collections
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                </section>
              </Reveal>
            ) : null}

            {latestPosts.length > 0 ? (
              <Reveal delayMs={120}>
                <section>
                  <SectionTitle title="Latest Dispatches" />
                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {latestPosts.map((post, index) => (
                      <article
                        key={post.id}
                        className="salt-story-card group flex h-full flex-col overflow-hidden rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0.48))] shadow-[0_24px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)]"
                      >
                        <Link to={`/blog/${post.handle}`} className="block overflow-hidden bg-[#eef2f8]">
                          <ResilientImage
                            src={post.image}
                            alt={post.title}
                            loading="lazy"
                            fallback={<div className="aspect-[4/3] w-full">{blogImageFallback}</div>}
                            className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-[1.05]"
                          />
                        </Link>

                        <div className="flex h-full flex-col p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[#5d6f90]">
                              Dispatch {String(index + 1).padStart(2, "0")}
                            </p>
                            <span className="inline-flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#5d6f90]">
                              <Clock3 className="h-3.5 w-3.5" />
                              {readingTime(post.contentHtml)}
                            </span>
                          </div>

                          <h3 className="mt-3 font-display text-[1.7rem] leading-[1.1] tracking-[-0.035em] text-[#172032]">
                            <Link to={`/blog/${post.handle}`} className="transition group-hover:text-[#1f63d8]">
                              {conciseTitle(post.title, 74)}
                            </Link>
                          </h3>

                          <p className="mt-3 flex-1 text-sm leading-6 text-[#47566f]">
                            {compactExcerpt(post.excerpt, 148)}
                          </p>

                          <div className="mt-5 flex items-center justify-between gap-3">
                            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#5d6f90]">
                              <p>{formattedDate(post.publishedAt)}</p>
                              <p className="mt-1">{post.author || "SALT"}</p>
                            </div>

                            <Link
                              to={`/blog/${post.handle}`}
                              className="inline-flex h-10 items-center justify-center rounded-full border border-[#bcd6ff] bg-white px-4 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#1f56b2] transition group-hover:border-[#8cb4ff] group-hover:text-[#143f86]"
                            >
                              Read
                            </Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </Reveal>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default BlogPage;
