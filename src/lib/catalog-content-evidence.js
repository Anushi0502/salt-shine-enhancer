const GENERIC_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "with",
  "product", "products", "item", "items", "new", "best", "sale", "premium", "quality", "fashion", "style", "shop",
  "women", "woman", "men", "man", "kids", "child", "children", "set", "sets", "default", "title", "option",
]);

const PRODUCT_NOUNS = [
  ["lunch box", /\blunch\s*box(?:es)?\b/i],
  ["pencil case", /\bpencil\s*(?:case|pouch|box)\b/i],
  ["perfume", /\b(?:perfume|fragrance|cologne)\b/i],
  ["mascara", /\bmascara\b/i],
  ["eyeshadow palette", /\b(?:eyeshadow|eye\s+shadow)\b/i],
  ["dinner set", /\b(?:dinnerware|dinner\s+set|tableware)\b/i],
  ["tripod", /\btripods?\b/i],
  ["backpack", /\bbackpacks?\b/i],
  ["bottle", /\b(?:water\s+)?bottles?\b/i],
  ["wig", /\bwigs?\b/i],
  ["phone case", /\b(?:phone|iphone|tablet|ipad)\s+(?:case|cover)s?\b/i],
  ["phone holder", /\b(?:phone|smartphone|mobile)\s+(?:holder|mount)s?\b/i],
  ["charger", /\bcharg(?:er|ing)\b/i],
  ["camera tripod", /\bcamera\s+tripods?\b/i],
  ["shirt", /\b(?:t[- ]?shirts?|shirts?|tops?)\b/i],
  ["pants", /\b(?:pants|trousers|jeans|leggings)\b/i],
  ["dress", /\bdresses?\b/i],
  ["shoes", /\b(?:shoes|sneakers?|boots?|sandals?|slippers?)\b/i],
  ["bag", /\b(?:bags?|handbags?|totes?|purses?)\b/i],
  ["hair accessory", /\b(?:hair\s+accessor(?:y|ies)|hair\s+clips?|barrettes?)\b/i],
  ["hair care product", /\b(?:shampoo|conditioner|hair\s+oil|hair\s+mask|hair\s+dye)\b/i],
  ["lip product", /\b(?:lipstick|lip\s*gloss|lip\s*balm|lip\s*plumper)\b/i],
  ["makeup product", /\b(?:mascara|eyeliner|blush|foundation|concealer)\b/i],
  ["lamp", /\blamps?\b/i],
  ["mouse", /\bmice?\b/i],
  ["keyboard", /\bkeyboards?\b/i],
  ["comb", /\bcombs?\b/i],
  ["brush", /\bbrushes?\b/i],
  ["toy", /\btoys?\b/i],
  ["organizer", /\borganizers?\b/i],
  ["tool", /\btools?\b/i],
];

const ATTRIBUTE_PATTERNS = [
  ["Size or capacity", /\b\d+(?:\.\d+)?\s?(?:ml|l|oz|g|kg|cm|mm|inch|inches|pcs?|pieces?|pairs?|pack|keys?|ports?|w|v|mah|gb|tb)\b/gi],
  ["Material", /\b(?:aluminum|bamboo|canvas|ceramic|cotton|glass|leather|silicone|stainless\s+steel|plastic|wood(?:en)?|nylon|polyester|rubber|satin|wool)\b/gi],
  ["Features", /\b(?:adjustable|automatic|bluetooth|foldable|insulated|magnetic|portable|rechargeable|reusable|wireless|waterproof|usb|led|rgb|shockproof|non[- ]?slip|quick[- ]?dry|large\s+capacity|wide\s+brim)\b/gi],
  ["Compatibility", /\b(?:iphone|ipad|android|samsung|galaxy|airpods|laptop|macbook|ps5|dji|usb[- ]?c|type[- ]?c)\b(?:\s*[a-z0-9+ -]{0,16})?/gi],
  ["Audience", /\b(?:women|men|unisex|girls?|boys?|kids?|children|baby|toddler|pet|dog|cat)\b/gi],
  ["Use", /\b(?:travel|school|office|work|gym|fitness|running|cycling|hiking|camping|outdoor|beach|wedding|party|makeup|skin\s+care|hair\s+care|kitchen|gardening|construction|desk|car|vehicle)\b/gi],
];

const UNSUPPORTED_CLAIM_PATTERN = /\b(?:maximum|pain\s+relief|pain\s+support|fast\s+recovery|must[- ]?have|perfect\s+gift|great\s+gift|hot\s+brand|guaranteed|cure)\b/i;
const PROMOTIONAL_OPTION_PATTERN = /\b(?:buy\s*\d+\s*get\s*\d+|free\s+shipping|sale|discount|coupon|deal|offer)\b/i;
const SKU_OPTION_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{2,}$/i;
const LEGACY_GENERIC_SENTENCE_PATTERN = /serves the specific|specific function identified|confirmed product facts|available options help shoppers compare|best for:\s*shoppers looking for|specific makeup, application, nail, lip, eye, or grooming step|specific beauty routine or look|specific product type named|described by the supplied product information|listing identifies this as/i;

function normalizeVariantFact(value) {
  let candidate = text(value);
  if (!candidate || /^(?:default title|default|option|style|set)$/i.test(candidate)) return "";

  // Supplier SKUs are often embedded in the visible variant label, for
  // example `B153 / For AirPods 4` or `14:1254#B153;5:361386#For AirPods 4`.
  // Keep the human-facing option and discard transport identifiers.
  if (candidate.includes("#")) {
    candidate = candidate
      .split(";")
      .map((part) => part.split("#").pop())
      .filter(Boolean)
      .join(" / ");
  }
  candidate = candidate.replace(/^[A-Z]\d{2,}\s*\/\s*/i, "").trim();
  return candidate;
}

function text(value) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|nbsp|quot|apos|lt|gt);/gi, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function tokens(value) {
  return text(value).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token && !GENERIC_WORDS.has(token));
}

function html(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEvidenceCorpus(signals = {}) {
  const rows = Array.isArray(signals.sourceRows) ? signals.sourceRows : [];
  const rowValues = rows.flatMap((row) => Object.values(row || {}));
  const options = Array.isArray(signals.variantOptionValues)
    ? signals.variantOptionValues
    : rows.flatMap((row) => [row?.["Option1 Value"], row?.["Option2 Value"], row?.["Option3 Value"], row?.["Variant Title"], row?.["Variant SKU"]]);
  return text([
    signals.handle,
    signals.sourceTitle,
    signals.catalogTitle,
    signals.sourceProductType,
    signals.catalogProductType,
    signals.sourceVendor,
    signals.catalogVendor,
    signals.categoryQuery,
    signals.catalogCategory,
    signals.sourceBodyHtml,
    signals.catalogBodyHtml,
    signals.catalogSubtitle,
    ...(signals.catalogHighlights || []),
    ...(signals.catalogSearchBoosts || []),
    ...(signals.sourceTags || []),
    ...(signals.catalogTags || []),
    ...options,
    ...rowValues,
  ].join(" "));
}

export function isEarbudsCaseEvidence(signals = {}) {
  const corpus = buildEvidenceCorpus(signals)
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  const hasDevice = /\b(?:airpods?|earbuds?|earphones?|buds|headphones?)\b/i.test(corpus);
  const hasCaseLanguage = /\b(?:case|cover|sleeve|shell|bumper|protective)\b/i.test(corpus);
  const nonCaseAccessory = /\b(?:charging\s+(?:case|box)|case\s+cleaner|clean(?:er|ing\s+(?:tool|pen|brush|kit))|ear\s*tips?|eartips?|ear\s*pads?|earpads?|ear\s*hooks?|keychain)\b/i.test(corpus);
  const explicitProtection = /\b(?:protective|tpu|silicone|shockproof|dustproof|anti[- ]?scratch|anti[- ]?fall|cover|shell|sleeve|bumper)\b/i.test(corpus);
  const productTypeCase = /\b(?:case|cover|sleeve|shell|bumper)\b/i.test(
    text(signals.sourceProductType || signals.catalogProductType),
  );

  return hasDevice && hasCaseLanguage && !nonCaseAccessory && (explicitProtection || productTypeCase);
}

export function extractEvidenceFacts(signals = {}) {
  const corpus = buildEvidenceCorpus(signals);
  const facts = [];
  for (const [label, pattern] of ATTRIBUTE_PATTERNS) {
    const values = unique([...corpus.matchAll(pattern)].map((match) => match[0])).slice(0, 5);
    if (values.length) facts.push({ label, value: values.join(", ") });
  }
  const options = unique((signals.variantOptionValues || [])
    .map(normalizeVariantFact)
    .filter(Boolean))
    .filter((value) =>
      !PROMOTIONAL_OPTION_PATTERN.test(value) &&
      !(SKU_OPTION_PATTERN.test(value.replace(/\s+/g, "")) && !/[a-z]{3,}\s+[a-z]{3,}/i.test(value)) &&
      value.length >= 2,
    )
    .slice(0, 8);
  if (options.length) facts.push({ label: "Variant options", value: options.join(", ") });
  return facts;
}

export function deriveProductNoun(signals = {}) {
  if (isEarbudsCaseEvidence(signals)) return "earbuds case";
  const corpus = buildEvidenceCorpus(signals);
  const match = PRODUCT_NOUNS.find(([, pattern]) => pattern.test(corpus));
  if (match) return match[0];
  const candidate = text(signals.sourceProductType || signals.catalogProductType || signals.handlePhrase);
  const meaningful = [...new Set(tokens(candidate))]
    .filter((token) => !UNSUPPORTED_CLAIM_PATTERN.test(token))
    .filter((token) => !/^(?:maximum|pain|support|fast|recovery|relief|guaranteed|cure)$/i.test(token))
    .filter((token) => !/^(?:for|from|with|men|women|kids|child|children|adult|new|best)$/i.test(token))
    .slice(0, 3);
  return meaningful.length ? meaningful.join(" ") : "product";
}

export function deriveProductType(signals = {}) {
  const noun = deriveProductNoun(signals);
  if (/^earbuds case$/i.test(noun)) return "Earbuds Case";
  const nounTokens = new Set(tokens(noun));
  const candidates = unique([signals.sourceProductType, signals.catalogProductType, signals.handlePhrase]);
  const aligned = candidates
    .map((candidate) => ({ candidate, overlap: tokens(candidate).filter((token) => nounTokens.has(token)).length }))
    .filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.candidate.length - right.candidate.length);
  return aligned[0]?.candidate || noun;
}

export function buildProductSpecificDescription({ title, signals = {} } = {}) {
  const titleText = text(title || signals.sourceTitle || signals.catalogTitle || signals.handle);
  const noun = deriveProductNoun(signals);
  const facts = extractEvidenceFacts(signals);
  const sourceBody = text(signals.sourceBodyHtml || signals.catalogBodyHtml);
  const sourceSentences = sourceBody
    .split(/[.!?]+/)
    .map((sentence) => text(sentence))
    .filter((sentence) => sentence.length >= 35)
    .filter((sentence) => !/product overview|key features|why customers|faqs|straightforward way|easy to compare/i.test(sentence))
    .filter((sentence) => !/about\s+|key details|use\s*&\s*care|faqs|\b(?:q|a):/i.test(sentence))
    .filter((sentence) => !LEGACY_GENERIC_SENTENCE_PATTERN.test(sentence))
    .filter((sentence) => !/\beveryday\s+(?:product|item|essential)\b/i.test(sentence))
    .filter((sentence) => !isEarbudsCaseEvidence(signals) || !/\b(?:is|are)\s+(?:a|an)\s+(?:phone|wireless|bluetooth|earbuds?|earphones?|headphones?)/i.test(sentence))
    .filter((sentence) => !UNSUPPORTED_CLAIM_PATTERN.test(sentence))
    .slice(0, 3);
  const reviewDetail = signals.reviewSummary && Number(signals.reviewSummary.ratingCount) > 0
    ? `Listed reviews: ${Number(signals.reviewSummary.rating).toFixed(1)} stars from ${Number(signals.reviewSummary.ratingCount)} trusted reviews.`
    : "";
  const conflictingAccessoryDetail = isEarbudsCaseEvidence(signals)
    ? /\b(?:phone|iphone|tablet|ipad)\s+(?:case|cover)\b/i
    : null;
  const details = unique([
    ...sourceSentences,
    ...facts.map((fact) => `${fact.label}: ${fact.value}`),
    ...(signals.catalogHighlights || []),
    reviewDetail,
  ]).filter((detail) => !UNSUPPORTED_CLAIM_PATTERN.test(detail))
    .filter((detail) => !conflictingAccessoryDetail || !conflictingAccessoryDetail.test(detail))
    .slice(0, 8);
  const optionText = facts.find((fact) => fact.label === "Variant options")?.value;
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  const purpose = optionText
    ? `${titleText} is ${article} ${noun} with the listed options ${optionText}.`
    : `${titleText} is ${article} ${noun} identified by the product title and supplied listing details.`;
  const use = facts.find((fact) => fact.label === "Use")?.value;
  const care = use
    ? `Use it for the listed ${use} context and follow the supplied setup, handling, cleaning, storage, and safety instructions.`
    : "Use it only for the stated product purpose and follow the supplied setup, handling, cleaning, storage, and safety instructions.";
  const list = details.length
    ? `<ul>${details.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`
    : `<p>${html(purpose)}</p>`;
  const factAnswer = details.slice(0, 3).join(" ") || purpose;
  return [
    `<h2>About ${html(titleText)}</h2>`,
    `<p>${html(purpose)}${signals.reviewSummary ? ` Listed reviews record ${Number(signals.reviewSummary.rating).toFixed(1)} stars from ${Number(signals.reviewSummary.ratingCount)} reviews.` : ""}</p>`,
    "<h3>Key Details</h3>",
    list,
    "<h3>Use &amp; Care</h3>",
    `<p>${html(care)}</p>`,
    "<h3>FAQs</h3>",
    `<p><strong>Q: What is ${html(titleText)}?</strong></p><p>A: ${html(purpose)}</p>`,
    `<p><strong>Q: What should I check before ordering?</strong></p><p>A: ${html(factAnswer)}</p>`,
  ].join("\n");
}

export function isGenericProductContent(value) {
  const normalized = text(value).toLowerCase();
  return !normalized || /serves the specific|specific function identified|specific everyday task identified|best for: shoppers looking for the specific|described by the supplied product information|listing identifies this as|product overview|without extra guesswork|straightforward way/i.test(normalized);
}

export { PRODUCT_NOUNS };
