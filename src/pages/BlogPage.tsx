import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, Clock3, Sparkles } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { readingTime } from "@/lib/formatters";
import { normalizeShopifyAssetUrl, resolveThemeAsset } from "@/lib/theme-assets";
import { useBlogPosts } from "@/lib/shopify-data";

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
  ).slice(0, 4);

  return (
    <section className="mx-auto mt-8 w-[min(1200px,96vw)] pb-8">
      <Reveal>
        <div className="salt-panel-shell rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Blog</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">
            Insights and Stories
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Posts synced from Shopify to keep home, garden, style, and product education current.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <p className="rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Live posts</span>
              <span>{posts.length.toLocaleString()} synced articles</span>
            </p>
            <p className="rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Reading format</span>
              <span>Short actionable guides and trend roundups</span>
            </p>
            <p className="rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">Goal</span>
              <span>Move inspiration to confident purchases</span>
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
              <article className="salt-section-shell overflow-hidden rounded-[2rem] lg:grid lg:grid-cols-[1.1fr_0.9fr]">
                <Link to={`/blog/${featuredPost.handle}`} className="block h-full overflow-hidden bg-muted">
                  <img
                    src={normalizeShopifyAssetUrl(featuredPost.image) || resolveThemeAsset("/placeholder.svg")}
                    alt={featuredPost.title}
                    loading="lazy"
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
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{featuredPost.excerpt}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{formattedDate(featuredPost.publishedAt)}</span>
                    <span>•</span>
                    <span>{featuredPost.author || "SALT"}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {readingTime(featuredPost.contentHtml)}
                    </span>
                  </div>
                  <Link
                    to={`/blog/${featuredPost.handle}`}
                    className="salt-primary-cta mt-5 h-11 gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em]"
                  >
                    Read featured story <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ) : null}

          {remainingPosts.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {remainingPosts.map((post, index) => (
                <Reveal key={post.id} delayMs={index * 70}>
                  <article className="salt-card-hover flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-[linear-gradient(165deg,hsl(var(--card)/0.98),hsl(var(--card)/0.9))] shadow-soft">
                    <Link to={`/blog/${post.handle}`} className="block overflow-hidden bg-muted">
                      <img
                        src={normalizeShopifyAssetUrl(post.image) || resolveThemeAsset("/placeholder.svg")}
                        alt={post.title}
                        loading="lazy"
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
                      <p className="mt-3 line-clamp-4 text-sm leading-7 text-muted-foreground">{post.excerpt}</p>
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
