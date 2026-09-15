const NEWSLETTER_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

function normalizeTagValue(value: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Keep the newsletter subscriber's source on the Shopify customer tag without
 * sending the raw URL or any personal data. Forms still work when no UTM
 * parameters are present.
 */
export function getNewsletterTags(search?: string): string {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(query);
  const tags = ["newsletter"];

  for (const key of NEWSLETTER_UTM_KEYS) {
    const value = normalizeTagValue(params.get(key));
    if (value) tags.push(`${key.slice(4)}-${value}`);
  }

  return tags.join(",");
}
