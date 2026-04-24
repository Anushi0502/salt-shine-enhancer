import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, Clock3, Newspaper, Sparkles } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import ResilientImage from "@/components/storefront/ResilientImage";
import { readingTime } from "@/lib/formatters";
import { useBlogPosts } from "@/lib/shopify-data";

const blogImageFallback = (
  <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.2),transparent_46%),radial-gradient(circle_at_72%_78%,hsl(var(--salt-blue)/0.22),transparent_40%),hsl(var(--muted))] px-6 text-center">
    <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      Image unavailable
    </p>
  </div>
);

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
      <ErrorState
        title="Blog unavailable"
        subtitle="Please retry to refresh posts."
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

  const posts = data?.posts || [];
  const [featuredPost, ...remainingPosts] = posts;
  const highlightedAuthors = Array.from(
    new Set(posts.map((post) => post.author).filter((author): author is string => Boolean(author))),
  ).slice(0, 5);
  const latestPosts = remainingPosts.slice(0, 6);

  return (
    <section className="mx-auto mt-8 w-[min(1240px,96vw)] pb-8">
      <Reveal>
        <div className="salt-panel-shell rounded-[2.2rem] p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Editorial</p>
              <h1 className="mt-2 max-w-[10ch] font-display text-[clamp(2.2rem,4.9vw,4.4rem)] leading-[0.9] tracking-[-0.045em] text-foreground">
                Stories that help discovery feel informed, not accidental.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                SALT editorial supports the storefront with practical guidance, seasonal inspiration, and product-led storytelling so shoppers can move from curiosity into confident buying faster.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Live posts</p>
                  <p className="mt-2 font-display text-3xl text-foreground">{posts.length.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Synced from Shopify content</p>
                </div>
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Best format</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Practical short reads</p>
                  <p className="mt-1 text-xs text-muted-foreground">Shopping adjacent, easy to scan</p>
                </div>
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Main outcome</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Trust before purchase</p>
                  <p className="mt-1 text-xs text-muted-foreground">Content that reduces hesitation</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(160deg,hsl(var(--card)/0.98),hsl(var(--card)/0.92))] p-5 shadow-soft">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Editorial role</p>
                    <h2 className="mt-2 font-display text-[clamp(1.45rem,2.6vw,2.1rem)] leading-[0.95] text-foreground">
                      The blog should help shoppers decide faster, not just fill space.
                    </h2>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    <Newspaper className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  These stories are part of the commerce system: they build product confidence, improve category clarity, and create warmer entry points into the catalog.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-4 shadow-soft">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Content mix</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Guides + inspiration</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">Short reads that support buying intent.</p>
                </div>
                <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-4 shadow-soft">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Sync model</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Shopify-connected</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">Live posts surface automatically inside the storefront.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {posts.length === 0 ? (
        <Reveal delayMs={80} className="mt-6">
          <div className="salt-surface rounded-3xl p-10 text-center">
            <h2 className="font-display text-3xl">No blog posts yet</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              New posts from Shopify will appear here automatically.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          {featuredPost ? (
            <Reveal delayMs={60} className="mt-6">
              <article className="salt-section-shell overflow-hidden rounded-[2rem] lg:grid lg:grid-cols-[1.06fr_0.94fr]">
                <Link to={`/blog/${featuredPost.handle}`} className="block h-full overflow-hidden bg-muted">
                  <ResilientImage
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    loading="lazy"
                    fallback={blogImageFallback}
                    className="h-full min-h-[18rem] w-full object-cover transition-transform duration-500 hover:scale-[1.04] lg:min-h-[30rem]"
                  />
                </Link>
                <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-9">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Featured story</p>
                    <h2 className="mt-3 font-display text-[clamp(2rem,3.3vw,3.35rem)] leading-[0.96] tracking-[-0.04em] text-foreground">
                      <Link to={`/blog/${featuredPost.handle}`} className="hover:text-primary">
                        {featuredPost.title}
                      </Link>
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                      {featuredPost.excerpt}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{formattedDate(featuredPost.publishedAt)}</span>
                      <span>•</span>
                      <span>{featuredPost.author || "SALT"}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" /> {readingTime(featuredPost.contentHtml)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link
                      to={`/blog/${featuredPost.handle}`}
                      className="salt-primary-cta h-11 gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em]"
                    >
                      Read featured story <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      to="/shop?sort=newest"
                      className="salt-outline-chip h-11 px-5 py-0 text-xs"
                    >
                      Shop newest products
                    </Link>
                  </div>
                </div>
              </article>
            </Reveal>
          ) : null}

          {latestPosts.length > 0 ? (
            <section className="mt-8">
              <Reveal>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Latest dispatches</p>
                    <h2 className="mt-1 font-display text-[clamp(1.8rem,3vw,2.7rem)] leading-[0.96] text-foreground">
                      Fresh stories from the storefront
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                      Recent posts designed to keep the brand useful, current, and easier to shop with context.
                    </p>
                  </div>
                  <Link
                    to="/shop"
                    className="salt-outline-chip h-11 px-5 py-0 text-xs font-bold uppercase tracking-[0.08em]"
                  >
                    Browse products <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </div>
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestPosts.map((post, index) => (
                  <Reveal key={post.id} delayMs={index * 70}>
                    <article className="salt-card-hover salt-metric-card flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-border/80 bg-[linear-gradient(165deg,hsl(var(--card)/0.98),hsl(var(--card)/0.9))] shadow-soft">
                      <Link to={`/blog/${post.handle}`} className="block overflow-hidden bg-muted">
                        <ResilientImage
                          src={post.image}
                          alt={post.title}
                          loading="lazy"
                          fallback={<div className="aspect-[16/10] w-full">{blogImageFallback}</div>}
                          className="aspect-[16/10] w-full object-cover transition-transform duration-500 hover:scale-[1.05]"
                        />
                      </Link>

                      <div className="flex h-full flex-col p-5">
                        <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          <span>{formattedDate(post.publishedAt)}</span>
                          <span>•</span>
                          <span>{post.author || "SALT"}</span>
                        </div>
                        <h3 className="mt-3 line-clamp-3 font-display text-[1.55rem] leading-[1.02] text-foreground">
                          <Link to={`/blog/${post.handle}`} className="hover:text-primary">
                            {post.title}
                          </Link>
                        </h3>
                        <p className="mt-3 line-clamp-4 text-sm leading-7 text-muted-foreground">{post.excerpt}</p>
                        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" /> {readingTime(post.contentHtml)}
                          </span>
                          <Link
                            to={`/blog/${post.handle}`}
                            className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.1em] text-primary"
                          >
                            Read <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </section>
          ) : null}

          <Reveal delayMs={140}>
            <div className="salt-panel-shell mt-10 rounded-[2rem] p-6 sm:p-8">
              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Commerce + content</p>
                  <h2 className="mt-2 font-display text-[clamp(1.7rem,2.8vw,2.5rem)] leading-[0.96] text-foreground">
                    Editorial should always route back into the catalog cleanly.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                    Good storefront content does not compete with the shop. It strengthens category understanding, creates trust, and gives customers another high-quality path into the products they are most likely to buy.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    to="/shop"
                    className="salt-primary-cta h-11 px-5 text-xs font-bold uppercase tracking-[0.08em]"
                  >
                    Shop all products
                  </Link>
                  <Link
                    to="/collections"
                    className="salt-outline-chip h-11 px-5 py-0 text-xs"
                  >
                    Explore collections
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </>
      )}
    </section>
  );
};

export default BlogPage;
