import { normalizePlainText } from "./shopify-seo-batch.js";
import { classifyCatalogTaxonomy } from "./catalog-taxonomy.js";

const CATEGORY_RULES = [
  // These families were previously falling through to an empty category even
  // though the product evidence identifies a safe Shopify root category.
  [/(?:\bluggage\b|\bsuitcases?\b|\btrolley(?:\s+case)?\b|\bcarry[-\s]?on\b|\btravel\s+(?:case|luggage|storage)\b|\b(?:case|storage)\b.{0,45}\b(?:travel|luggage)\b|\bbusiness\s+case\b)/i, "lb", "Luggage & Bags"],
  [/^(?!(?:.*\b(?:baby|toddler|kids?|children)\b.*\b(?:flats?|ballet|oxfords?|derbys?|loafers?|moccasins?|heels?|pumps?|mules?|slip[-\s]?ons?|shoes?|footwear)\b)).*?(?:\b(?:women|womens|men|mens|girls|boys)\b.{0,50}\b(?:flats?|ballet|oxfords?|derbys?|loafers?|moccasins?|heels?|pumps?|mules?|slip[-\s]?ons?)\b|\b(?:flats?|ballet\s+flats?|oxfords?|derbys?|loafers?|moccasins?|heels?|pumps?|mules?|slip[-\s]?ons?|footwear)\b|\bshoes?(?=[a-z]|\b))/i, "aa-8", "Shoes"],
  [/(?:\bcowboy\b.{0,70}\b(?:jumpsuit|siamese|multi[-\s]?pocket|loose|clothing|wear)\b|\b(?:jumpsuit|siamese)\b)/i, "aa", "Apparel & Accessories"],
  [/(?:\b(?:dog|puppy|cat|kitten)\b.{0,45}\b(?:identity\s+)?tags?\b|\b(?:identity\s+)?tags?\b.{0,45}\b(?:dog|puppy|cat|kitten)\b)/i, "ap", "Animals & Pet Supplies"],
  [/\b(?:brooch|badge)\b/i, "aa", "Apparel & Accessories"],
  [/(?:\begg\b.{0,50}\b(?:cooker|steamer|mold|mould|omelette)\b|\b(?:cooker|steamer|mold|mould|omelette)\b.{0,50}\begg\b|\bcheese\s+cutter\b)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/(?:\bled\s+strip\b|\bstrip\s+led\b|\bled\s+light(?:ing)?\b)/i, "el", "Electronics"],
  [/(?:\begg\s+(?:slicer|cutter|dicer)\b|\b(?:cooking|mixing|beating)\s+basin\b|\bsalad\s+mixing\s+basin\b)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/\bcurtains?\b|\bwindow\s+valance\b|\bcurtain\s+straps?\b/i, "hg", "Home & Garden"],
  [/\b(?:4k\s+)?projector\b|\bhome\s+cinema\s+projector\b/i, "el", "Electronics"],
  [/\b(?:landline|wall|desktop)\s+phone\b|\btelephone\b/i, "el", "Electronics"],
  [/(?:\b(?:door|window)\b.{0,25}\bmagnetic\s+sensor\b|\bmagnetic\s+sensor\b.{0,25}\b(?:door|window)\b|\bsmart\s+door\s+lock\b|\bbiometric\b.{0,25}\bdoor\s+lock\b|\bbiometric\s+electronic\s+lock\b)/i, "el", "Electronics"],
  [/(?:\bhome\s+hardware\s+set\b|\bhammers?\b.{0,35}\b(?:pliers?|repair\s+kit)\b|\b(?:pliers?|repair\s+kit)\b.{0,35}\bhammers?\b)/i, "ha", "Hardware"],
  [/(?:\bfitted\s+sheet\b|\bbedspread\b|\bmattress\s+cover\b)/i, "hg-15", "Linens & Bedding"],
  [/(?:\b(?:ceramic|breakfast|dessert|fruit|vegetable|dinner)\s+plate\b|\bplate\b.{0,45}\b(?:ceramic|breakfast|dessert|fruit|vegetable|dinner)\b)/i, "hg-11-10", "Tableware"],
  [/(?:\bartificial\b.{0,60}\b(?:bonsai|potted\s+plant)\b|\b(?:bonsai|potted\s+plant)\b.{0,60}\bartificial\b)/i, "hg", "Home & Garden"],
  [/(?:\b(?:halloween|cartoon|plush)\b.{0,70}\bspider\b|\bspider\b.{0,70}\b(?:halloween|cartoon|plush)\b)/i, "tg-5", "Toys"],
  [/(?:\bfinger\s+chopsticks?\b|\bchopsticks?\b.{0,45}\b(?:snack|gamer|finger)\b)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/(?:\b(?:boning|butcher|skinning|scimitar)\s+knife\b|\bknife\b.{0,45}\b(?:boning|butcher|skinning|scimitar)\b)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/\btactical\s+helmet\b|\bhelmet\b/i, "sg", "Sporting Goods"],
  [/(?:\bwifi\s+(?:repeater|signal\s+amplifier)\b|\bsignal\s+amplifier\b)/i, "el", "Electronics"],
  [/(?:\bspine\b.{0,45}\bposture\s+corrector\b|\bposture\s+corrector\b.{0,45}\bspine\b)/i, "hb-1-24", "Supports & Braces"],
  [/(?:\b(?:meat|pig|butcher|skinning)\b.{0,45}\b(?:knife|scimitar)\b|\b(?:knife|scimitar)\b.{0,45}\b(?:meat|pig|butcher|skinning)\b)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/\b(?:thermal\s+label\s+printer|label\s+printer)\b/i, "os", "Office Supplies"],
  [/(?:\b(?:magnetic|streamer|data|charging)(?:\s+line)?\s+cable\b|\bcable\b.{0,55}\b(?:iphone|android|type\s*c|apple)\b)/i, "el", "Electronics"],
  [/(?:\b(?:knee|kneecap|kneecaps)\b.{0,55}\b(?:basketball|running|football|badminton|sports?)\b|\b(?:sports?|basketball|running|football|badminton)\b.{0,55}\b(?:knee|kneecap|kneecaps)\b)/i, "sg", "Sporting Goods"],
  [/(?:\bswimsuit\b|\bbikini\b|\bone[-\s]?piece\s+swimsuit\b)/i, "aa", "Apparel & Accessories"],
  [/(?:\bquilted\s+paper\b|\billustration\s+material\b|\bpainting\s+(?:slot|kit)\b)/i, "ae", "Arts & Entertainment"],
  [/(?:\belectric\s+bbq\s+brush\b|\bgrill\s+(?:grate\s+)?brush\b)/i, "hg", "Home & Garden"],
  [/(?:\bdistance\s+measuring\b|\bmeasuring\s+(?:ruler|tape)\b|\btape\s+measure\b)/i, "ha", "Hardware"],
  [/(?:\blumbar\s+support\b.{0,60}\b(?:cushion|seat|chair)\b|\b(?:cushion|seat|chair)\b.{0,60}\blumbar\s+support\b)/i, "hb-1-24", "Supports & Braces"],
  [/(?:\b(?:hanging|personal|portable)\s+neck\s+fan\b|\bneck\s+fan\b)/i, "el", "Electronics"],
  [/(?:\b(?:wrist|thumb|finger)\b.{0,55}\b(?:brace|splint|support|stabilizer|orthosis|sleeve)\b|\b(?:brace|splint|support|stabilizer|orthosis|sleeve)\b.{0,55}\b(?:wrist|thumb|finger)\b)/i, "hb-1-24", "Supports & Braces"],
  [/(?:\b(?:big toe|hallux|toe)\b.{0,55}\b(?:brace|splint|support|straightener|corrector)\b|\b(?:brace|splint|support|straightener|corrector)\b.{0,55}\b(?:big toe|hallux|toe)\b)/i, "hb-1-24", "Supports & Braces"],
  [/(?:\blaptop\b|\bcomputer\b).{0,45}\b(?:stand|riser|cooling pad|cooling tray)\b|\b(?:stand|riser|cooling pad|cooling tray)\b.{0,45}\b(?:laptop|computer)\b/i, "el-7-8-3-4", "Laptop Stands"],
  [/(?:\blaptop\b|\bcomputer\b).{0,45}\b(?:lap desk|bed table|bed tray)\b|\b(?:lap desk|bed table|bed tray)\b.{0,45}\b(?:laptop|computer)\b/i, "os-6", "Lap Desks"],
  [/(?:\bautomatic\b|\bsensor\b|\bfoam\b|\bliquid\b|\bhand\b).{0,35}\bsoap dispenser\b|\bsoap dispenser\b/i, "hg-1-15", "Soap & Lotion Dispensers"],
  [/\bsoap\b.{0,40}\b(?:dish|box|tray|rack|holder)\b|\b(?:dish|box|tray|rack|holder)\b.{0,40}\bsoap\b/i, "hg-1-16", "Soap Dishes & Holders"],
  [/(?:\bsolar\b.{0,40}\b(?:lantern|light|lighting)\b|\b(?:lantern|light|lighting)\b.{0,40}\bsolar\b)/i, "hg", "Home & Garden"],
  [/(?:\bshea butter\b|\bbody butter\b)/i, "hb", "Health & Beauty"],
  [/(?:\b(?:serving|breakfast|dessert)\b.{0,45}\btray\b|\btray\b.{0,45}\b(?:serving|breakfast|dessert)\b)/i, "hg-11-10-7-9", "Serving Trays"],
  [/(?:\bshower(?:head)?\b.{0,55}\bwater?\s*filter\b|\bwater?\s*filter\b.{0,55}\bshower(?:head)?\b)/i, "hg", "Home & Garden"],
  [/(?:\b(?:sewing|stitching)\s+machine\b|\bminiature\s+household\s+multifunctional\s+sewing\b)/i, "ae", "Arts & Entertainment"],
  [/(?:\b(?:portable|mini|usb|rechargeable)\s+blender\b|\bblender\b.{0,45}\b(?:juice|fruit|kitchen|usb|rechargeable)\b)/i, "hg", "Home & Garden"],
  [/out[-\s]of[-\s]stock[-\s]placeholder[-\s]listing|out[-\s]of[-\s]stock(?:[-\s]out[-\s]of[-\s]stock){2,}/i, "pa", "Product Add-Ons"],
  [/(?:order|price)\s+(?:price\s+)?difference|order adjustment/i, "pa", "Product Add-Ons"],
  [/(?:steamer|steaming)\s+rack|rack\s+for\s+(?:dumplings?|fish|steaming)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/(?:garlic\s+(?:mincer|crusher|press|chopper|grinder)|(?:mincer|crusher|press|chopper|grinder).{0,24}garlic)/i, "hg-11-8", "Kitchen Tools & Utensils"],
  [/(?:wireless|bluetooth|open[ -]?ear|in[ -]?ear).{0,35}(?:earbuds?|earphones?|headphones?)|(?:earbuds?|earphones?|headphones?).{0,35}(?:wireless|bluetooth|case|cover)/i, "el", "Electronics"],
  [/(?:earbuds?|earphones?|headsets?|airpods?|eartips?|ear tips?|galaxy buds|realme buds)/i, "el", "Electronics"],
  [/(?:pen|pencil|crayon).{0,25}(?:case|box|pouch|organizer)|(?:case|box|pouch|organizer).{0,25}(?:pen|pencil|crayon)/i, "os-3-16", "Pen & Pencil Cases"],
  [/(?:storage boxes?|organizers?).{0,80}(?:office supplies|pencils?|crayons?|crafts?)/i, "os", "Office Supplies"],
  [/(?:digital|electronic|electric).{0,25}(?:piano|musical keyboard)|(?:piano|musical keyboard).{0,25}(?:digital|electronic|electric)/i, "ae", "Arts & Entertainment"],
  [/(?:pieces?|pcs|set|refill).{0,45}(?:essential|fragrance|aromatherapy)\s+oils?\b|(?:essential|fragrance|aromatherapy)\s+oils?.{0,45}(?:set|refill)/i, "hb-3-21", "Essential Oils"],
  [/(?:essential oil|aroma|fragrance)\s+diffuser|diffuser.{0,30}(?:essential oil|aroma|fragrance)/i, "hb-3-21-3", "Essential Oil Diffusers"],
  [/(?:essential|fragrance|aromatherapy)\s+oils?\b/i, "hb-3-21", "Essential Oils"],
  [/(?:jewelry|jewellery).{0,20}(?:box|case|holder|organizer)/i, "hb-2-3-1", "Jewelry Boxes"],
  [/(?:whiteboard|blackboard|display board|standing sign|billboard)/i, "os", "Office Supplies"],
  [/(?:dried flowers?|craft (?:material|supplies)|soap.{0,20}candle.{0,20}craft)/i, "ae", "Arts & Entertainment"],
  [/(?:humidifier|dehumidifier|air purifier|air filter|aroma diffuser|air diffuser)/i, "hg", "Home & Garden"],
  [/(?:co2|carbon dioxide).{0,25}(?:diffuser|plant)|(?:diffuser|plant).{0,25}(?:co2|carbon dioxide)/i, "hg", "Home & Garden"],
  [/(?:tire|tyre).{0,25}(?:inflator|air pump)|(?:inflator|air pump).{0,25}(?:tire|tyre|car|vehicle|bicycle)/i, "vp", "Vehicles & Parts"],
  [/(?:car|vehicle|automotive).{0,25}(?:key|remote).{0,25}(?:pcb|board)|(?:key|remote).{0,25}(?:pcb|board).{0,25}(?:car|vehicle|automotive)/i, "vp", "Vehicles & Parts"],
  [/(?:car|vehicle).{0,25}(?:air freshener|perfume diffuser)|(?:air freshener|perfume diffuser).{0,25}(?:car|vehicle)/i, "vp", "Vehicles & Parts"],
  [/(?:portable|usb|desktop).{0,20}(?:fan|air cooler)/i, "hg", "Home & Garden"],
  [/(?:watch|smartwatch).{0,25}(?:charger|charging|dock)|(?:charger|charging|dock).{0,25}(?:watch|smartwatch)/i, "el", "Electronics"],
  [/(?:phone|iphone|ipad|smartphone|tablet|radio|baofeng).{0,35}(?:case|cover|charger|charging|adapter)|(?:case|cover|charger|charging|adapter).{0,35}(?:phone|iphone|ipad|smartphone|tablet|radio|baofeng)/i, "el", "Electronics"],
  [/(?:e-?bike|electric bicycle).{0,35}(?:battery )?charger|(?:battery )?charger.{0,35}(?:e-?bike|electric bicycle)/i, "el-7-15-2-4", "General Purpose Battery Chargers"],
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
  [/(?:computer|gaming|mechanical|wired|wireless|programmable|macro|membrane).{0,35}(?:keyboard|keypad|keycaps?|stabilizers?)|(?:keyboard|keypad|keycaps?|stabilizers?).{0,35}(?:computer|gaming|mechanical|wired|wireless|programmable|macro|membrane|stand|storage|cover|pcb|board)/i, "el", "Electronics"],
  [/(?:key\s*boards?|keybaords?)/i, "el", "Electronics"],
  [/(?:charger|charging adapter|charging port)/i, "el", "Electronics"],
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
  [/(?:\b(?:hat|hats|cap|caps|beanie|visor|fedora)\b|bucket hat|sun hat)/i, "aa-2-17", "Hats"],
  [/\btoys?\b/i, "tg-5", "Toys"],
];

const richCategoryCache = new WeakMap();

function buildProductEvidenceText(product) {
  const tags = Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags || "";
  const variants = Array.isArray(product?.variants)
    ? product.variants.flatMap((variant) => [
        variant?.title,
        variant?.option1,
        variant?.option2,
        variant?.option3,
        variant?.sku,
      ])
    : [];
  const customData = product?.customData && typeof product.customData === "object"
    ? Object.values(product.customData)
    : [];
  return normalizePlainText([
    product?.handle,
    product?.title,
    product?.product_type || product?.productType,
    product?.vendor,
    product?.body_html || product?.bodyHtml,
    product?.category?.fullName,
    product?.category?.name,
    tags,
    ...variants,
    ...customData,
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

// The checked-in rule table supplies stable IDs for the narrow, legacy rules.
// The full taxonomy supplies deterministic category paths; the backfill script
// resolves those paths against Shopify before writing a category ID.
export function inferDeterministicShopifyTaxonomyCategory(product) {
  const explicit = inferShopifyTaxonomyCategory(product);
  if (explicit) return explicit;
  if (!product || typeof product !== "object") return null;

  const cached = richCategoryCache.get(product);
  if (cached !== undefined) return cached;

  const classification = classifyCatalogTaxonomy(product);
  const fullName = normalizePlainText(classification?.shopifyCategory || "");
  const evidence = buildProductEvidenceText(product);
  const reviewSafeApparelFallback = classification?.reviewRequired &&
    /\b(?:apparel|clothing|clothes|denim|dress|dresses|jumpsuit|jeans|pants|trousers|shirt|shirts|skirt|jacket|coat|hoodie|sweater|shorts|wear|fashion)\b/i.test(evidence)
    ? {
        id: "gid://shopify/TaxonomyCategory/aa",
        name: "Apparel & Accessories",
        fullName: "Apparel & Accessories",
        confidence: "review-fallback",
        reason: "Broad apparel category only; semantic taxonomy remains held for review",
        ruleId: classification?.ruleId || "unclassified",
      }
    : null;
  const result = reviewSafeApparelFallback || !fullName
    ? reviewSafeApparelFallback || {
        id: "",
        name: "Other Products",
        fullName: "Other Products",
        confidence: "controlled-fallback",
        reason: "No narrower Shopify taxonomy path was supported by the complete product evidence; resolved through the explicit Shopify fallback category.",
        ruleId: classification?.ruleId || "unclassified",
      }
    : {
        id: "",
        name: fullName.split(/\s*>\s*/).at(-1) || fullName,
        fullName,
        confidence: classification.confidence >= 90 ? "high" : "medium",
        reason: `Deterministic taxonomy rule ${classification.ruleId} resolved to ${fullName}`,
        ruleId: classification.ruleId,
      };
  richCategoryCache.set(product, result);
  return result;
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
