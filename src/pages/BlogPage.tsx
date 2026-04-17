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
  return `${shortened.trimEnd()}...`;
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
                  Salt Blogs
                </p>
                <h1 className="mt-4 font-display text-[clamp(2.2rem,6vw,4rem)] leading-[1.02] tracking-[-0.03em] text-[#1a1a1a]">
                  Blogs unavailable right now.
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
    posts.find((post) => post.id !== currentIssuePost?.id && post.id !== leadStoryPost?.id) ??
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
    { label: "Blogs" },
  ];

  return (
    <section className="mt-3 w-full pb-10 sm:mt-4 sm:pb-14 lg:pb-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 sm:gap-7">
        <Reveal>
          <InnerBreadcrumbs items={breadcrumbItems} />
        </Reveal>

        <Reveal delayMs={40}>
          <section className="grid gap-4 lg:grid-cols-[1.06fr_0.94fr]">
            <div className="relative isolate flex min-h-[25rem] flex-col overflow-hidden rounded-[2rem] bg-[#f8f5f0] p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.22)] sm:min-h-[28rem] sm:p-8 lg:h-full lg:p-10">
              {currentIssuePost?.image ? (
                <>
                  <img
                    src={currentIssuePost.image}
                    alt={currentIssuePost.title}
                    className="absolute inset-y-0 right-0 h-full w-full object-cover opacity-18 sm:w-[76%] lg:w-[62%]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,245,240,0.98)_0%,rgba(248,245,240,0.95)_34%,rgba(248,245,240,0.86)_56%,rgba(248,245,240,0.62)_78%,rgba(248,245,240,0.32)_100%)]" />
                </>
              ) : null}

              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="max-w-[42rem]">
                  <p className="inline-flex items-center gap-2 rounded-full border border-[#ffe4a3] bg-[#fff6db] px-4 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#1f56b2] sm:text-[0.72rem]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Salt Blogs
                  </p>
                  <h1 className="mt-4 font-display text-[clamp(3.2rem,7vw,5rem)] leading-[1.02] tracking-[-0.04em] text-[#1a1a1a]">
                    Stories, guides, and seasonal ideas for everyday living.
                  </h1>
                </div>

                <div className="mt-8">
                  

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    {currentIssuePost ? (
                      <Link
                        to={`/blog/${currentIssuePost.handle}`}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1a1a] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-primary"
                      >
                        Read latest story
                      </Link>
                    ) : null}
                    <Link
                      to="/shop"
                      className="inline-flex h-12 items-center justify-center rounded-full border border-[#1a1a1a] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white"
                    >
                      Shop catalog
                    </Link>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {highlightedAuthors.map((author) => (
                      <span
                        key={author}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#bcd6ff] bg-white/72 px-3.5 py-2 text-[0.68rem] font-semibold text-[#1f4f9b]"
                      >
                        <BookOpenText className="h-3.5 w-3.5" />
                        {author}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {currentIssuePost ? (
                <Reveal delayMs={80} className="h-full">
                  <Link
                    to={`/blog/${currentIssuePost.handle}`}
                    className="salt-story-card group relative block h-full min-h-[18rem] overflow-hidden rounded-[1.75rem] border border-white/10 shadow-[0_26px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)] sm:min-h-[22rem]"
                  >
                    <ResilientImage
                      src={currentIssuePost.image}
                      alt={currentIssuePost.title}
                      loading="lazy"
                      fallback={blogImageFallback}
                      className="absolute inset-0 h-auto w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                    />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,38,0.08),rgba(12,20,38,0.12)_24%,rgba(12,20,38,0.2)_54%,rgba(12,20,38,0.62)_100%)]" />
                    <div className="absolute right-4 top-4 rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(28,39,67,0.82),rgba(18,27,47,0.72))] px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                      Current issue
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <div className="p-1">
                        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white">
                          {formattedDate(currentIssuePost.publishedAt)}
                        </p>
                        <h2 className="mt-2 font-display text-[1.55rem] leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_8px_24px_rgba(15,23,42,0.55)] sm:text-[1.5rem]">
                          {conciseTitle(currentIssuePost.title, 74)}
                        </h2>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white">
                            Open story <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                          <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white">
                            <Clock3 className="h-3.5 w-3.5" />
                            {readingTime(currentIssuePost.contentHtml)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ) : null}

              {journalNotesPost ? (
                <Reveal delayMs={100} className="h-full">
                  <Link
                    to={`/blog/${journalNotesPost.handle}`}
                    className="salt-story-card group relative block h-full min-h-[18rem] overflow-hidden rounded-[1.75rem] border border-white/18 shadow-[0_26px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.36)] sm:min-h-[22rem]"
                  >
                    <ResilientImage
                      src={journalNotesPost.image}
                      alt={journalNotesPost.title}
                      loading="lazy"
                      fallback={blogImageFallback}
                      className="absolute inset-0 h-auto w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                    />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,38,0.08),rgba(12,20,38,0.12)_24%,rgba(12,20,38,0.2)_54%,rgba(12,20,38,0.62)_100%)]" />
                    <div className="absolute right-4 top-4 rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(28,39,67,0.82),rgba(18,27,47,0.72))] px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                      <span className="inline-flex items-center gap-1.5">
                        Cookware guide
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <div className="p-1">
                        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white">
                          {formattedDate(journalNotesPost.publishedAt)}
                        </p>
                        <h2 className="mt-2 font-display text-[1.5rem] leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_8px_24px_rgba(15,23,42,0.55)] sm:text-[1.5rem]">
                          {conciseTitle(journalNotesPost.title, 76)}
                        </h2>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white">
                            Open guide <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                          <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white">
                            <Clock3 className="h-3.5 w-3.5" />
                            {readingTime(journalNotesPost.contentHtml)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ) : null}
            </div>
          </section>
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
                  <article className="mt-5">
                    <Link
                      to={`/blog/${leadStoryPost.handle}`}
                      className="group relative block min-h-[26rem] overflow-hidden rounded-[2rem] shadow-[0_24px_80px_-52px_rgba(15,23,42,0.24)] sm:min-h-[30rem]"
                    >
                      <ResilientImage
                        src={leadStoryPost.image}
                        alt={leadStoryPost.title}
                        loading="lazy"
                        fallback={blogImageFallback}
                        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                      />

                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,28,0.04)_0%,rgba(8,14,28,0.12)_22%,rgba(8,14,28,0.28)_52%,rgba(8,14,28,0.82)_100%)]" />

                      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
                        
                        <h2 className="mt-3 max-w-4xl font-display text-[clamp(2rem,4vw,3.5rem)] leading-[1.02] tracking-[-0.04em] text-white drop-shadow-[0_12px_32px_rgba(15,23,42,0.55)]">
                          {leadStoryPost.title}
                        </h2>

                        <div className="mt-7 flex flex-wrap items-center gap-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white">
                          <span>{formattedDate(leadStoryPost.publishedAt)}</span>
                          <span className="text-white">|</span>
                          <span>{leadStoryPost.author || "SALT"}</span>
                          <span className="text-white">|</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {readingTime(leadStoryPost.contentHtml)}
                          </span>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <span className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1f63d8] px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white transition group-hover:bg-[#1d56be]">
                            Read the full story
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                          <span className="inline-flex h-12 items-center justify-center rounded-full border border-white/34 px-7 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white/90 transition group-hover:border-white/52">
                            Browse collections
                          </span>
                        </div>
                      </div>
                    </Link>
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
                        className="salt-story-card group relative flex min-h-[28rem] overflow-hidden rounded-[1.7rem] border border-white/8 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)]"
                      >
                        <Link
                          to={`/blog/${post.handle}`}
                          className="absolute inset-0 block overflow-hidden bg-[#eef2f8]"
                        >
                          <ResilientImage
                            src={post.image}
                            alt={post.title}
                            loading="lazy"
                            fallback={blogImageFallback}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
                          />
                        </Link>

                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,28,0.08)_0%,rgba(8,14,28,0.14)_24%,rgba(8,14,28,0.34)_58%,rgba(8,14,28,0.84)_100%)]" />

                        <div className="relative z-10 flex h-full w-full flex-col justify-between p-5">
                          <div className="flex items-center justify-between gap-3">
                            
                            <span className="inline-flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-white">
                              <Clock3 className="h-3.5 w-3.5" />
                              {readingTime(post.contentHtml)}
                            </span>
                          </div>

                          <div className="mt-auto">
                            <h3 className="mt-3 font-display text-[1.7rem] leading-[1.1] tracking-[-0.035em] text-white drop-shadow-[0_8px_24px_rgba(15,23,42,0.55)]">
                              <Link to={`/blog/${post.handle}`} className="transition group-hover:text-white">
                                {conciseTitle(post.title, 74)}
                              </Link>
                            </h3>

                           

                            <div className="mt-5 flex items-center justify-between gap-3">
                              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white">
                                <p>{formattedDate(post.publishedAt)}</p>
                                <p className="mt-1">{post.author || "SALT"}</p>
                              </div>

                              <Link
                                to={`/blog/${post.handle}`}
                                className="inline-flex h-10 items-center justify-center rounded-full border border-white/34 px-4 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-white transition hover:border-white hover:text-white"
                              >
                                Read
                              </Link>
                            </div>
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
