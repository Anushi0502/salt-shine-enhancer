import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, Clock3, Sparkles } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { LoadingState } from "@/components/storefront/LoadState";
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
          </div>
        </Reveal>
      </section>
    );
  }

  const posts = data?.posts || [];
  const [featuredPost, ...remainingPosts] = posts;
  const highlightedAuthors = Array.from(
    new Set(posts.map((post) => post.author).filter((author): author is string => Boolean(author))),
  ).slice(0, 4);

  return (
    <section className="mx-auto mt-5 w-[min(1200px,calc(100%-20px))] pb-8 sm:mt-6 sm:w-[min(1200px,calc(100%-20px))]">
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
        <Reveal delayMs={80} className="mt-6">
          <div className="salt-surface rounded-3xl p-8 text-center">
            <h2 className="font-display text-3xl">No blog posts yet</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              New posts from Shopify will appear here automatically.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          {featuredPost ? (
            <Reveal delayMs={60} className="mt-4 sm:mt-5">
              <article className="salt-section-shell overflow-hidden rounded-[2rem] lg:grid lg:grid-cols-[1.1fr_0.9fr]">
                <Link to={`/blog/${featuredPost.handle}`} className="block aspect-[16/10] h-full overflow-hidden bg-muted lg:aspect-auto">
                  <ResilientImage
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    loading="lazy"
                    fallback={blogImageFallback}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </Link>
                <div className="p-6 sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Featured post</p>
                  <h2 className="mt-2 font-display text-[clamp(1.8rem,2.8vw,2.8rem)] leading-[1.02]">
                    <Link to={`/blog/${featuredPost.handle}`} className="hover:text-primary">
                      {featuredPost.title}
                    </Link>
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{featuredPost.excerpt}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                    <span>{formattedDate(featuredPost.publishedAt)}</span>
                    <span className="text-muted-foreground/60">|</span>
                    <span>{featuredPost.author || "SALT"}</span>
                    <span className="text-muted-foreground/60">|</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {readingTime(featuredPost.contentHtml)}
                    </span>
                  </div>
                  <Link
                    to={`/blog/${featuredPost.handle}`}
                    className="salt-primary-cta mt-5 h-11 w-full gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em] sm:w-auto"
                  >
                    Read the story <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ) : null}

          {remainingPosts.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {remainingPosts.map((post, index) => (
                <Reveal key={post.id} delayMs={index * 70}>
                  <article className="salt-story-card salt-card-hover flex h-full flex-col overflow-hidden rounded-2xl border border-border/80">
                    <Link to={`/blog/${post.handle}`} className="block overflow-hidden bg-muted">
                      <ResilientImage
                        src={post.image}
                        alt={post.title}
                        loading="lazy"
                        fallback={<div className="aspect-[16/10] w-full">{blogImageFallback}</div>}
                        className="aspect-[16/10] w-full object-cover transition-transform duration-500 hover:scale-105"
                      />
                    </Link>

                    <div className="flex h-full flex-col p-4">
                      <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                        {formattedDate(post.publishedAt)}
                      </p>
                      <h2 className="mt-2 line-clamp-2 font-display text-2xl leading-tight">
                        <Link to={`/blog/${post.handle}`} className="hover:text-primary">
                          {post.title}
                        </Link>
                      </h2>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{post.author || "SALT"}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" /> {readingTime(post.contentHtml)}
                        </span>
                      </div>
                      <div className="mt-4">
                        <Link
                          to={`/blog/${post.handle}`}
                          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-primary"
                        >
                          Read post <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

export default BlogPage;
