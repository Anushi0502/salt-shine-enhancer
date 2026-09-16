import type { BlogPost, ShopifyShop } from "@/types/shopify";

type StructuredData = Record<string, unknown>;

type FaqEntry = {
  question: string;
  answer: string;
};

const ORGANIZATION_SAME_AS = [
  "https://instagram.com/saltonlinestore",
  "https://www.facebook.com/profile.php?id=61573199456052",
  "https://youtube.com/@saltonlinestore",
];

export function buildOrganizationStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: shop?.name || "SALT",
    url: origin,
    logo: `${origin}/brand/salt-logo.png`,
    description: "Curated practical, giftable finds across cookware, home, beauty, apparel, gadgets, and everyday essentials.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "help@saltonlinestore.com",
      telephone: "+1 888-835-7211",
      availableLanguage: ["English"],
    },
    inLanguage: "en-US",
    sameAs: ORGANIZATION_SAME_AS,
  };
}

export function buildWebsiteStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: shop?.name || "SALT",
    url: origin,
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function cleanStructuredText(value: string | null | undefined, maxLength = 500): string {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function absoluteStructuredUrl(value: string | null | undefined, origin: string): string | undefined {
  if (!value || !origin) {
    return undefined;
  }

  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

export function buildBlogStructuredData(
  posts: BlogPost[],
  origin: string,
  blogPath = "/pages/blog",
): StructuredData {
  const blogUrl = `${origin}${blogPath}`;

  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${blogUrl}#blog`,
    name: "SALT Journal",
    url: blogUrl,
    blogPost: posts.slice(0, 12).map((post) => ({
      "@type": "BlogPosting",
      headline: cleanStructuredText(post.title, 110),
      url: absoluteStructuredUrl(`/blogs/posts/${post.handle}`, origin),
      datePublished: post.publishedAt || undefined,
      dateModified: post.updatedAt || post.publishedAt || undefined,
    })),
  };
}

export function buildArticleStructuredData(post: BlogPost, origin: string): StructuredData {
  const articleUrl =
    absoluteStructuredUrl(`/blogs/posts/${post.handle}`, origin) || `${origin}/blogs/posts/${post.handle}`;
  const imageUrl = absoluteStructuredUrl(post.image, origin);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${articleUrl}#article`,
    mainEntityOfPage: articleUrl,
    headline: cleanStructuredText(post.title, 110),
    description: cleanStructuredText(post.excerpt || post.contentHtml, 500),
    image: imageUrl ? [imageUrl] : undefined,
    author: {
      "@type": "Person",
      name: cleanStructuredText(post.author, 80) || "SALT",
    },
    publisher: {
      "@type": "Organization",
      name: "SALT Online Store",
      logo: {
        "@type": "ImageObject",
        url: `${origin}/brand/salt-logo.png`,
      },
    },
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || post.publishedAt || undefined,
  };
}

export function buildFaqStructuredData(
  faqs: FaqEntry[] | null | undefined,
  origin: string,
  pagePath = "/pages/faq",
): StructuredData | null {
  const questions = (faqs || [])
    .map((faq) => ({
      question: String(faq.question || "").trim(),
      answer: String(faq.answer || "").trim(),
    }))
    .filter((faq) => faq.question && faq.answer)
    .map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    }));

  if (!questions.length || !origin) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: absoluteStructuredUrl(pagePath, origin) || `${origin}/pages/faq`,
    mainEntity: questions,
  };
}

export function buildWebPageStructuredData(
  title: string,
  description: string,
  pagePath: string,
  origin: string,
): StructuredData | null {
  const url = absoluteStructuredUrl(pagePath, origin);
  if (!url) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: cleanStructuredText(title, 150),
    description: cleanStructuredText(description, 500),
    inLanguage: "en-US",
    isPartOf: { "@id": `${origin}/#website` },
    about: { "@id": `${origin}/#organization` },
  };
}

type BreadcrumbEntry = {
  label: string;
  to?: string;
};

export function buildEditorialBreadcrumbStructuredData(
  items: BreadcrumbEntry[] | null | undefined,
  currentPath: string,
  origin: string,
): StructuredData | null {
  const cleanItems = (items || [])
    .map((item, index, allItems) => ({
      name: cleanStructuredText(item?.label, 120),
      url: absoluteStructuredUrl(item?.to || (index === allItems.length - 1 ? currentPath : "/"), origin),
    }))
    .filter((item): item is { name: string; url: string } => Boolean(item.name && item.url));

  if (!cleanItems.length) {
    return null;
  }

  const pageUrl = cleanItems[cleanItems.length - 1]?.url || `${origin}${currentPath}`;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: cleanItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
