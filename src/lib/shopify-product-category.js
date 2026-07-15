import { normalizePlainText } from "./shopify-seo-batch.js";

const CATEGORY_RULES = [
  [/(?:usb\s*(?:2\.0|3\.0|3\.2)?\s*)?(?:flash drive|pen drive|pendrive|memory stick|u disk)/i, "el-7-9-14-8", "USB Flash Drives"],
  [/(?:mouse feet|mouse skates)/i, "el-7-9-11-4-3", "Mouse Skates"],
  [/(?:mouse\s*pad|mousepad|gaming desk mat)/i, "el-7-8-8", "Mouse Pads"],
  [/(?:car|truck|motorcycle|automotive|vehicle|boat).{0,35}battery charger|battery charger.{0,35}(?:car|truck|motorcycle|automotive|vehicle|boat)/i, "vp-1-5-7-3", "Vehicle Battery Chargers"],
  [/(?:power tool|electric drill|electric wrench|angle grinder).{0,35}charger|charger.{0,35}(?:power tool|electric drill|electric wrench|angle grinder)/i, "ha-14-17", "Power Tool Chargers"],
  [/(?:electric shaver|electric razor|hair clipper).{0,35}charger|charger.{0,35}(?:electric shaver|electric razor|hair clipper)/i, "hb-3-14-3-3", "Electric Razor Chargers & Cables"],
  [/(?:e-?scooter|electric scooter).{0,35}(?:battery )?charger|charger.{0,35}(?:e-?scooter|electric scooter)/i, "sg-4-15-3-1-1", "E-Scooter Battery Chargers"],
  [/wireless charger|wireless charging/i, "el-7-15-5-2", "Wireless Chargers"],
  [/(?:phone )?car charger|car phone charger/i, "el-7-15-5-4", "Car Chargers"],
  [/(?:wall charger|travel charger|charger plug|charging adapter|power adapter)/i, "el-7-15-5", "Power Adapters & Chargers"],
  [/(?:battery charger|rechargeable batteries? charger|charging station for batteries)/i, "el-7-15-2-4", "General Purpose Battery Chargers"],
  [/(?:protein|gym|fitness).{0,25}shaker|shaker bottle/i, "sg-2-29", "Shaker Bottles"],
  [/(?:salt.{0,12}pepper|pepper.{0,12}salt|spice|seasoning).{0,25}shaker/i, "hg-11-10-3-4", "Shaker Sets"],
  [/(?:sports|gym|fitness).{0,25}water bottle|water bottle.{0,25}(?:sports|gym|fitness)/i, "sg-1-13-20", "Sports Water Bottles"],
  [/water bottle/i, "hg-11-3-11", "Water Bottles"],
  [/(?:sex toys?|erotic games?|bdsm)/i, "ma-1-4", "Sex Toys & Erotic Games"],
  [/(?:\b(?:dog|puppy)\b.{0,30}\btoys?\b|\btoys?\b.{0,30}\b(?:dog|puppy)\b)/i, "ap-2-3-7", "Dog Toys"],
  [/(?:\b(?:cat|kitten)\b.{0,30}\btoys?\b|\btoys?\b.{0,30}\b(?:cat|kitten)\b)/i, "ap-2-2-5", "Cat Toys"],
  [/(?:board games?|tic tac toe|five in a row|chess|tabletop games?)/i, "tg-2-5", "Board Games"],
  [/(?:card games?|playing cards?)/i, "tg-2-7", "Card Games"],
  [/(?:jigsaw puzzle|wooden puzzle|peg(?:ged)? puzzle|puzzle board)/i, "tg-4-12", "Wooden & Pegged Puzzles"],
  [/\bpuzzles?\b/i, "tg-4", "Puzzles"],
  [/(?:pretend play|role play toy|play kitchen|kitchen play|doctor kit|tea set toy)/i, "tg-5-16", "Pretend Play"],
  [/(?:sensory toys?|fidget toys?|stress toys?)/i, "tg-5-29", "Sensory Toys"],
  [/(?:bath toys?|baby bath toy)/i, "tg-5-5", "Bath Toys"],
  [/(?:educational toys?|learning toys?|montessori toys?|science experiment toys?)/i, "tg-5-9", "Educational Toys"],
  [/(?:sports toys?|throwing games?|toss and catch|outdoor games?)/i, "tg-5-23", "Sports Toys"],
  [/(?:baby|newborn|infant).{0,35}(?:health|grooming|nail care|care kit)|(?:health|grooming|nail care|care kit).{0,35}(?:baby|newborn|infant)/i, "bt-3-1", "Baby Health & Grooming Kits"],
  [/(?:baby safety|child safety|baby mirror|child monitor|spout cover|corner guards?)/i, "bt-4", "Baby Safety"],
  [/(?:baby bathing|baby bath|shampoo cup|bath brush)/i, "bt-1", "Baby Bathing"],
  [/(?:coloring books?|coloring pads?)/i, "tg-5-2-2", "Coloring Books & Pads"],
  [/(?:\bencyclopedia\b|\bbooks?\b(?!\s*(?:bag|backpack|case|cover|sleeve|stand|holder)))/i, "me-1", "Books"],
  [/(?:baby|toddler|kids?|children).{0,30}(?:athletic shoes|sneakers|sports shoes|running shoes)/i, "aa-8-11-4", "Baby & Children's Athletic Shoes"],
  [/(?:baby|toddler|kids?|children).{0,30}(?:shoes|sandals|slippers|boots)|(?:shoes|sandals|slippers|boots).{0,30}(?:baby|toddler|kids?|children)/i, "aa-8-11", "Baby & Children's Shoes"],
  [/(?:baby|toddler|kids?|children).{0,30}(?:socks|tights)|(?:socks|tights).{0,30}(?:baby|toddler|kids?|children)/i, "aa-1-25-7", "Baby & Children's Socks & Tights"],
  [/(?:toe socks)/i, "aa-1-18-11", "Toe Socks"],
  [/(?:ankle socks|low cut socks|no show socks)/i, "aa-1-18-1", "Ankle Socks"],
  [/\bsocks?\b/i, "aa-1-18", "Socks"],
  [/(?:baby|toddler|kids?|children).{0,30}(?:t-?shirts?|shirts?)/i, "aa-1-25-9-6", "Baby & Children's Shirts"],
  [/(?:baby|toddler|kids?|children|girls?|boys?).{0,45}(?:clothing|clothes|outfits?|costumes?|uniforms?|underwear|vests?|blazers?|dresses?|pants|trousers|shorts|skirts?|jackets?|coats?|hoodies?|sweaters?|pajamas?|swimwear)/i, "aa-1-25", "Baby & Children's Clothing"],
  [/\bt-?shirts?\b/i, "aa-1-13-8", "T-Shirts"],
  [/\bshirts?\b/i, "aa-1-13-7", "Shirts"],
  [/(?:athletic shoes|sneakers|sports shoes|running shoes)/i, "aa-8-1", "Athletic Shoes"],
  [/\b(?:shoes|sandals|slippers|boots)\b/i, "aa-8", "Shoes"],
  [/\btoys?\b/i, "tg-5", "Toys"],
];

function buildProductEvidenceText(product) {
  const tags = Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags || "";
  return normalizePlainText([
    product?.handle,
    product?.title,
    product?.product_type || product?.productType,
    tags,
  ].join(" ")).replace(/[-_]+/g, " ");
}

export function inferShopifyTaxonomyCategory(product) {
  const evidence = buildProductEvidenceText(product);
  if (!evidence) {
    return null;
  }

  for (const [pattern, suffix, name] of CATEGORY_RULES) {
    if (pattern.test(evidence)) {
      return {
        id: `gid://shopify/TaxonomyCategory/${suffix}`,
        name,
        confidence: "high",
        reason: `Explicit product-family match for ${name}`,
      };
    }
  }

  return null;
}

const DISCLOSURE_PATTERNS = [
  ["shopify--disclosure-us-cpsc-choking_balloons", /choking hazard[\s\S]{0,120}balloon|balloon[\s\S]{0,120}choking hazard/i],
  ["shopify--disclosure-us-cpsc-choking_marbles", /choking hazard[\s\S]{0,120}marbles?|marbles?[\s\S]{0,120}choking hazard/i],
  ["shopify--disclosure-us-cpsc-choking_small_balls", /choking hazard[\s\S]{0,120}small balls?|small balls?[\s\S]{0,120}choking hazard/i],
  ["shopify--disclosure-us-cpsc-choking_small_parts", /choking hazard|small parts|not for children under (?:3|three)/i],
  ["shopify--disclosure-us-ca-prop65-cancer_reproductive", /prop(?:osition)?\s*65[\s\S]{0,160}(?:cancer[\s\S]{0,80}reproductive|reproductive[\s\S]{0,80}cancer)/i],
  ["shopify--disclosure-us-ca-prop65-cancer", /prop(?:osition)?\s*65[\s\S]{0,160}cancer/i],
  ["shopify--disclosure-us-ca-prop65-reproductive", /prop(?:osition)?\s*65[\s\S]{0,160}reproductive/i],
];

export function inferApprovedDisclosureReferences(product, options = []) {
  const approvedByType = new Map(
    (Array.isArray(options) ? options : [])
      .filter((option) => option?.id && option?.type)
      .map((option) => [option.type, option.id]),
  );
  if (!approvedByType.size) {
    return [];
  }

  const evidence = normalizePlainText([
    product?.handle,
    product?.title,
    product?.body_html || product?.bodyHtml,
    Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags,
  ].join(" "));

  for (const [type, pattern] of DISCLOSURE_PATTERNS) {
    if (pattern.test(evidence) && approvedByType.has(type)) {
      return [approvedByType.get(type)];
    }
  }

  return [];
}

export { CATEGORY_RULES };
