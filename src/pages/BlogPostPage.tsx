import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Clock3, Sparkles } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import ResilientImage from "@/components/storefront/ResilientImage";
import { readingTime, sanitizeRichHtml } from "@/lib/formatters";
import { useBlogPosts } from "@/lib/shopify-data";

const articleImageFallback = (
  <div className="grid h-[280px] w-full place-items-center rounded-2xl border border-border bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.2),transparent_46%),radial-gradient(circle_at_72%_78%,hsl(var(--salt-blue)/0.22),transparent_40%),hsl(var(--muted))] px-6 text-center">
    <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      Article image unavailable
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

const BlogPostPage = () => {
  const { handle } = useParams();
  const { data, isLoading, error, refetch } = useBlogPosts();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading post"
        subtitle="Fetching the article from Shopify sync."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Blog post unavailable"
        subtitle="Please retry and try again."
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

  const post = (data?.posts || []).find((entry) => entry.handle === handle);

  if (!post) {
    return (
      <ErrorState
        title="Post not found"
        subtitle="The requested blog post handle is unavailable."
        action={
          <Link
            to="/blog"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Browse posts
          </Link>
        }
      />
    );
  }

  const sanitizedHtml = sanitizeRichHtml(post.contentHtml);
  const relatedPosts = (data?.posts || [])
    .filter((entry) => entry.handle !== post.handle)
    .slice(0, 3);

  return (
    <section className="mx-auto mt-6 w-[min(1000px,calc(100%-20px))] pb-10">
      <Reveal>
        <Link
          to="/blog"
          className="salt-outline-chip h-10 gap-2 px-4 py-0 text-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Back to blog
        </Link>
      </Reveal>

      <Reveal delayMs={40}>
        <article className="salt-panel-shell relative mt-4 overflow-hidden rounded-[1.9rem] p-5 sm:p-6">
          <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/65" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/12 blur-2xl" />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Blog Post</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">{post.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
            <span>{formattedDate(post.publishedAt)}</span>
            <span className="text-muted-foreground/60">|</span>
            <span>{post.author || "SALT"}</span>
            <span className="text-muted-foreground/60">|</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" /> {readingTime(post.contentHtml)}
            </span>
            <span className="text-muted-foreground/60">|</span>
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              View on Shopify <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {readingTime(post.contentHtml)} read
            </span>
            <Link
              to="/shop?sort=discount"
              className="salt-outline-chip h-7 px-3 py-0 text-[0.62rem]"
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              Shop best savings
            </Link>
          </div>

          <ResilientImage
            src={post.image}
            alt={post.title}
            fallback={articleImageFallback}
            className="mt-5 w-full rounded-2xl border border-border bg-muted object-cover"
          />

          <article
            className="prose prose-sm mt-5 max-w-none leading-[1.72] text-foreground dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-foreground prose-img:rounded-xl prose-img:border prose-img:border-border"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          <div className="salt-section-shell mt-6 flex flex-col gap-2 rounded-2xl border border-border/70 p-4 sm:flex-row sm:flex-wrap">
            <Link
              to="/shop"
              className="salt-primary-cta h-10 w-full px-4 text-[0.72rem] font-bold uppercase tracking-[0.08em] sm:w-auto"
            >
              Shop the catalog
            </Link>
            <Link
              to="/collections"
              className="salt-outline-chip h-10 w-full px-4 py-0 text-[0.72rem] sm:w-auto"
            >
              Browse collections
            </Link>
            <Link
              to="/contact"
              className="salt-outline-chip h-10 w-full px-4 py-0 text-[0.72rem] sm:w-auto"
            >
              Contact support
            </Link>
          </div>
        </article>
      </Reveal>

      {relatedPosts.length > 0 ? (
        <Reveal delayMs={80}>
          <section className="salt-panel-shell mt-5 rounded-[1.9rem] p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Related posts</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {relatedPosts.map((entry) => (
                <Link
                  key={entry.id}
                  to={`/blog/${entry.handle}`}
                  className="salt-kpi-card salt-metric-card rounded-xl p-3 transition hover:border-primary/50"
                >
                  <p className="line-clamp-2 text-sm font-semibold">{entry.title}</p>
                  <p className="mt-1 text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {formattedDate(entry.publishedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
      ) : null}
    </section>
  );
};

export default BlogPostPage;
