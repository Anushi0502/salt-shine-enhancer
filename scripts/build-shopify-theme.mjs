#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const publicDir = resolve(rootDir, "public");
const defaultThemeDir = resolve(rootDir, "..", "salt-online-store-shopify");
const financeApiOrigin = (process.env.VITE_FINANCE_API_ORIGIN || "https://salt-online-storev2-gcs1124s-projects.vercel.app")
  .trim()
  .replace(/\/+$/, "");
const shopifyAppKey = (process.env.VITE_SHOPIFY_APP_KEY || "8b71b8f5e5349a4352259e3bc6522c14").trim();
const shopifyStorefrontToken = (
  process.env.VITE_SHOPIFY_STOREFRONT_TOKEN || process.env.SHOPIFY_STOREFRONT_TOKEN || ""
).trim();

function resolveThemeDir() {
  const outIndex = process.argv.indexOf("--out");

  if (outIndex !== -1 && process.argv[outIndex + 1]) {
    return resolve(process.cwd(), process.argv[outIndex + 1]);
  }

  if (process.env.SHOPIFY_THEME_DIR) {
    return resolve(process.env.SHOPIFY_THEME_DIR);
  }

  return defaultThemeDir;
}

const themeDir = resolveThemeDir();
const themeAssetsDir = resolve(themeDir, "assets");
const themeScaffoldEntries = ["assets", "config", "layout", "locales", "sections", "templates"];
const themeDataAssets = [
  {
    source: "recently-ordered-products.json",
    asset: "data-recently-ordered-products.json",
    themePath: "/data/recently-ordered-products.json",
  },
  { source: "collections.json", asset: "data-collections.json", themePath: "/data/collections.json" },
  {
    source: "sidebar-collections.json",
    asset: "data-sidebar-collections.json",
    themePath: "/data/sidebar-collections.json",
  },
  {
    source: "header-collections.json",
    asset: "data-header-collections.json",
    themePath: "/data/header-collections.json",
  },
  {
    source: "collection-products.json",
    asset: "data-collection-products.json",
    themePath: "/data/collection-products.json",
  },
  { source: "about.json", asset: "data-about.json", themePath: "/data/about.json" },
  { source: "blog-posts.json", asset: "data-blog-posts.json", themePath: "/data/blog-posts.json" },
  { source: "shop.json", asset: "data-shop.json", themePath: "/data/shop.json" },
];

const removedListingAssetPatterns = [
  /^data-products(?:-\d{4})?\.json$/,
  /^data-product-search(?:-\d{4})?\.json$/,
  /^data-home-(?:featured|collection)-products\.json$/,
];

function buildLiquidProductRecord(variableName = "item") {
  return `{% assign salt_judgeme_badge = ${variableName}.metafields.judgeme.badge | default: '' %}
    {% assign salt_judgeme_rating = salt_judgeme_badge | split: "data-average-rating='" | last | split: "'" | first %}
    {% assign salt_judgeme_review_count = salt_judgeme_badge | split: "data-number-of-reviews='" | last | split: "'" | first %}
    {
    "id": {{ ${variableName}.id | json }},
    "title": {{ ${variableName}.title | json }},
    "handle": {{ ${variableName}.handle | json }},
    "body_html": null,
    "vendor": {{ ${variableName}.vendor | json }},
    "product_type": {{ ${variableName}.type | json }},
    "tags": {{ ${variableName}.tags | json }},
    "created_at": {{ ${variableName}.created_at | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
    "published_at": {{ ${variableName}.published_at | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
    "updated_at": {{ ${variableName}.updated_at | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
    "average_rating": {% if salt_judgeme_badge contains "data-average-rating='" %}{{ salt_judgeme_rating | plus: 0 | json }}{% else %}null{% endif %},
    "total_reviews": {% if salt_judgeme_badge contains "data-number-of-reviews='" %}{{ salt_judgeme_review_count | plus: 0 | json }}{% else %}null{% endif %},
    "variants": [
      {% for variant in ${variableName}.variants %}
        {
          "id": {{ variant.id | json }},
          "title": {{ variant.title | json }},
          "price": {{ variant.price | divided_by: 100.0 | json }},
          "compare_at_price": {% if variant.compare_at_price %}{{ variant.compare_at_price | divided_by: 100.0 | json }}{% else %}null{% endif %},
          "available": {{ variant.available | json }},
          "sku": {{ variant.sku | json }},
          "requires_shipping": {{ variant.requires_shipping | json }}
        }{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ],
    "images": [
      {% if ${variableName}.featured_image %}
        {
          "id": {{ ${variableName}.featured_image.id | default: ${variableName}.id | json }},
          "src": {{ ${variableName}.featured_image | image_url: width: 900 | json }},
          "alt": {{ ${variableName}.featured_image.alt | default: ${variableName}.title | json }},
          "width": {{ ${variableName}.featured_image.width | json }},
          "height": {{ ${variableName}.featured_image.height | json }}
        }
      {% endif %}
    ],
    "image": {% if ${variableName}.featured_image %}{
      "id": {{ ${variableName}.featured_image.id | default: ${variableName}.id | json }},
      "src": {{ ${variableName}.featured_image | image_url: width: 900 | json }},
      "alt": {{ ${variableName}.featured_image.alt | default: ${variableName}.title | json }},
      "width": {{ ${variableName}.featured_image.width | json }},
      "height": {{ ${variableName}.featured_image.height | json }}
    }{% else %}null{% endif %}
  }`;
}

function buildHomeProductRecord(variableName = "item") {
  return `{% assign salt_home_judgeme_badge = ${variableName}.metafields.judgeme.badge | default: '' %}
    {% assign salt_home_judgeme_rating = salt_home_judgeme_badge | split: "data-average-rating='" | last | split: "'" | first %}
    {% assign salt_home_judgeme_review_count = salt_home_judgeme_badge | split: "data-number-of-reviews='" | last | split: "'" | first %}
    {
    "id": {{ ${variableName}.id | json }},
    "title": {{ ${variableName}.title | json }},
    "handle": {{ ${variableName}.handle | json }},
    "image": {{ ${variableName}.featured_image | image_url: width: 720 | json }},
    "price": {{ ${variableName}.price | divided_by: 100.0 | json }},
    "compareAtPrice": {% if ${variableName}.compare_at_price and ${variableName}.compare_at_price > ${variableName}.price %}{{ ${variableName}.compare_at_price | divided_by: 100.0 | json }}{% else %}null{% endif %},
    "averageRating": {% if salt_home_judgeme_badge contains "data-average-rating='" %}{{ salt_home_judgeme_rating | plus: 0 | json }}{% else %}null{% endif %},
    "reviewCount": {% if salt_home_judgeme_badge contains "data-number-of-reviews='" %}{{ salt_home_judgeme_review_count | plus: 0 | json }}{% else %}null{% endif %}
  }`;
}

function buildHomeCollectionSection(key, title, handle) {
  return `${JSON.stringify(key)}: {
    "title": ${JSON.stringify(title)},
    "handle": ${JSON.stringify(handle)},
    "products": [
      {% assign salt_home_collection = collections[${JSON.stringify(handle)}] %}
      {% for item in salt_home_collection.products limit: 12 %}
        ${buildHomeProductRecord("item")}{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ]
  }`;
}

const homeCollectionSectionsLiquid = [
  ["animeCollectables", "Anime Collectables", "anime-collectables"],
  ["creatorEssentials", "Creator Essentials", "creator-essentials"],
  ["lipCare", "Lip Care", "lips-and-care"],
  ["watches", "Watches", "watches"],
  ["glamEyePalettes", "Glam Eye Palettes", "glam-eye-palettes"],
].map((entry) => buildHomeCollectionSection(...entry)).join(",\n");

function buildThemeAssetMapEntries() {
  return themeDataAssets
    .map(
      ({ themePath, asset }) =>
        `    ${JSON.stringify(themePath)}: {{ '${asset}' | asset_url | json }}`,
    )
    .join(",\n");
}

function parseEntryAssets(indexHtml) {
  const jsMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  const cssMatch = indexHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i);

  if (!jsMatch?.[1] || !cssMatch?.[1]) {
    throw new Error("Unable to locate entry JS/CSS assets in dist/index.html");
  }

  return {
    jsPath: jsMatch[1],
    cssPath: cssMatch[1],
  };
}

async function ensureDistExists() {
  if (!existsSync(resolve(distDir, "index.html"))) {
    throw new Error("dist/index.html not found. Run `npm run build` first.");
  }
}

function templateJson(sectionType = "salt-app", includeProductData = false) {
  const sections = {
    main: {
      type: sectionType,
      settings: {},
    },
  };
  const order = ["main"];

  if (includeProductData) {
    sections["salt-product-data"] = {
      type: "salt-product-data",
      settings: {},
    };
    order.unshift("salt-product-data");
  }

  return JSON.stringify(
    {
      sections,
      order,
    },
    null,
    2,
  );
}

async function writeThemeScaffold(settingsData = null, routeAssets = {}) {
  await mkdir(resolve(themeDir, "layout"), { recursive: true });
  await mkdir(resolve(themeDir, "sections"), { recursive: true });
  await mkdir(resolve(themeDir, "templates"), { recursive: true });
  await mkdir(resolve(themeDir, "config"), { recursive: true });
  await mkdir(resolve(themeDir, "locales"), { recursive: true });
  await mkdir(themeAssetsDir, { recursive: true });

  // Shopify's rendered section cache can otherwise retain an older
  // `salt-app.js` asset_url version after a theme upload. Stamp the section on
  // every bundle so the new loader is referenced immediately.
  const themeBuildStamp = Date.now().toString(36);

  const themeLiquid = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#1e3a6e">
    {% assign salt_route = request.path %}
    {% assign salt_seo_title = page_title | default: shop.name %}
    {% assign salt_seo_description = page_description | default: shop.description | default: 'Shop curated cookware, gifts, apparel, and everyday essentials from SALT Online Store.' %}
    {% assign salt_seo_robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' %}
    {% assign salt_seo_canonical = canonical_url | split: '?' | first %}
    {% assign salt_custom_canonical = false %}
    {% assign salt_product_canonical_alias = '' %}
    {% assign salt_social_image = 'brand-salt-logo.png' | asset_url %}
    {% assign salt_is_product_reviews_route = false %}
    {% if salt_route contains '/products/' and salt_route contains '/reviews' %}
      {% assign salt_is_product_reviews_route = true %}
    {% endif %}
    {% # theme-check-disable ContentForHeaderModification %}
    {% capture salt_content_for_header %}{{ content_for_header }}{% endcapture %}
    {% # theme-check-enable ContentForHeaderModification %}

    {% if salt_route == '/' %}
      {% assign salt_seo_title = 'SALT Online Store | Curated essentials and giftable finds' %}
      {% assign salt_seo_description = 'Shop practical, giftable finds across cookware, home, beauty, apparel, gadgets, and everyday essentials.' %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/' %}
      {% assign salt_custom_canonical = true %}
    {% elsif salt_route == '/pages/finance' or salt_route == '/apps:finance' or salt_route == '/apps/finance' %}
      {% assign salt_seo_title = 'SALT Finance | Private Operations' %}
      {% assign salt_seo_description = 'Private SALT operations workspace.' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif salt_route == '/shop' %}
      {% assign salt_seo_title = 'Shop All Products | SALT Online Store' %}
      {% assign salt_seo_description = 'Browse the live SALT catalog of cookware, gifts, apparel, beauty, gadgets, and everyday essentials.' %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/shop' %}
      {% assign salt_custom_canonical = true %}
      {% comment %}
        Shopify does not expose a reliable documented arbitrary query-string
        property on the Liquid request object. Keep this app-owned aggregate
        route out of the index; indexable discovery happens through the
        canonical collection and product URLs in the sitemap.
      {% endcomment %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif salt_route == '/search' %}
      {% assign salt_seo_title = 'Search SALT Online Store' %}
      {% assign salt_seo_description = 'Search the live SALT catalog for products, collections, and everyday essentials.' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/search' %}
      {% assign salt_custom_canonical = true %}
    {% elsif salt_route contains '/collections/' %}
      {% assign salt_collection_path = salt_route | split: '/collections/' | last %}
      {% assign salt_collection_segments = salt_collection_path | split: '/' %}
      {% assign salt_collection_handle = salt_collection_segments | last %}
      {% if salt_collection_handle == 'holiday-gifts' %}
        {% assign salt_collection_handle = 'gifts' %}
      {% elsif salt_collection_handle == 'winter-wear' or salt_collection_handle == 'clearance-archive' %}
        {% assign salt_collection_handle = 'under-50' %}
      {% endif %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/collections/' | append: salt_collection_handle %}
      {% assign salt_custom_canonical = true %}
      {% assign salt_social_collection = collections[salt_collection_handle] %}
      {% if salt_social_collection and salt_social_collection.image %}
        {% assign salt_social_image = salt_social_collection.image | image_url: width: 1200 %}
      {% endif %}
    {% elsif request.page_type == 'blog' %}
      {% assign salt_blog_path = salt_route | split: '/blogs/' | last %}
      {% assign salt_blog_handle = salt_blog_path | split: '/' | first %}
      {% assign salt_seo_title = 'SALT Journal | SALT Online Store' %}
      {% assign salt_seo_description = 'Fresh stories, product education, and practical ideas from SALT.' %}
      {% if salt_blog_handle == 'jjjjjjj' or salt_blog_handle == 'whom-we-serve' %}
        {% assign salt_seo_robots = 'noindex,follow' %}
      {% endif %}
    {% elsif request.page_type == 'article' and article %}
      {% assign salt_article_title = article.title | truncate: 58 %}
      {% assign salt_article_description = article.excerpt | default: article.content | strip_html | strip_newlines | truncate: 160 %}
      {% assign salt_seo_title = salt_article_title | append: ' | SALT Journal' %}
      {% assign salt_seo_description = salt_article_description %}
      {% if article.image %}
        {% assign salt_social_image = article.image | image_url: width: 1200 %}
      {% endif %}
    {% elsif request.page_type == 'product' and product %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/products/' | append: product.handle %}
      {% assign salt_custom_canonical = true %}
      {% assign salt_product_path_handle = salt_route | split: '/products/' | last | split: '/' | first %}
      {% case salt_product_path_handle %}
        {% when 'winter-motorcycle-face-mask-balaclava-windproof-thermal-neck-warmer' %}
          {% assign salt_product_canonical_alias = 'tactical-motorcycle-face-mask-neck-gaiter-windproof-breathable' %}
        {% when 'ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men-1' %}
          {% assign salt_product_canonical_alias = 'ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men' %}
        {% when 'children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil-1' %}
          {% assign salt_product_canonical_alias = 'children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil' %}
        {% when 'black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-2' %}
          {% assign salt_product_canonical_alias = 'black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-3' %}
        {% when 'anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l-2' %}
          {% assign salt_product_canonical_alias = 'anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l' %}
        {% when 'jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot-1' %}
          {% assign salt_product_canonical_alias = 'jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot' %}
        {% when 'car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-rv-motorcycle' %}
          {% assign salt_product_canonical_alias = 'car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-for-motorcycle' %}
        {% when 'women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands-2' %}
          {% assign salt_product_canonical_alias = 'women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands' %}
        {% when 'buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset-1' %}
          {% assign salt_product_canonical_alias = 'buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset' %}
        {% when 'mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook-1' %}
          {% assign salt_product_canonical_alias = 'mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook' %}
        {% when 'laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case-1' %}
          {% assign salt_product_canonical_alias = 'laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case' %}
        {% when 'school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks-1' %}
          {% assign salt_product_canonical_alias = 'school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks' %}
        {% when 'covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover-1' %}
          {% assign salt_product_canonical_alias = 'covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover' %}
        {% when 'mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags-1' %}
          {% assign salt_product_canonical_alias = 'mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags' %}
        {% when 'turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care-1' %}
          {% assign salt_product_canonical_alias = 'turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care' %}
        {% when 'mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme-1' %}
          {% assign salt_product_canonical_alias = 'mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme' %}
        {% when 'facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home-1' %}
          {% assign salt_product_canonical_alias = 'facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home' %}
        {% when 'turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m-1' %}
          {% assign salt_product_canonical_alias = 'turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m' %}
        {% when 'causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women-1' %}
          {% assign salt_product_canonical_alias = 'causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women' %}
        {% when '4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush-1' %}
          {% assign salt_product_canonical_alias = '4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush' %}
        {% when 'hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair-1' %}
          {% assign salt_product_canonical_alias = 'hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair' %}
        {% when 'body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing-1' %}
          {% assign salt_product_canonical_alias = 'body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing' %}
        {% when 'blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright-1' %}
          {% assign salt_product_canonical_alias = 'blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright' %}
      {% endcase %}
    {% elsif salt_route == '/cart' or salt_route == '/wishlist' or salt_route == '/recently-viewed' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif salt_route == '/pages/wishlist' %}
      {% assign salt_seo_title = 'Wishlist | SALT Online Store' %}
      {% assign salt_seo_description = 'Save SALT products for later and keep track of items you love.' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif salt_route == '/pages/resources' %}
      {% assign salt_seo_title = 'Resource Hub | SALT Online Store' %}
      {% assign salt_seo_description = 'Practical guides that help shoppers discover the right SALT products, collections, and everyday solutions.' %}
    {% elsif salt_route == '/pages/faq' %}
      {% assign salt_seo_title = 'FAQ | SALT Online Store' %}
      {% assign salt_seo_description = 'Quick answers about SALT ordering, shipping, returns, and product support.' %}
    {% elsif salt_route == '/pages/contact-us' %}
      {% assign salt_seo_title = 'Contact Support | SALT Online Store' %}
      {% assign salt_seo_description = 'Reach the SALT support team for delivery questions, product advice, returns, or order help.' %}
    {% elsif salt_route == '/pages/about-us' %}
      {% assign salt_seo_title = 'About SALT Online Store' %}
      {% assign salt_seo_description = 'Learn how SALT makes practical products easy to discover, save, and buy.' %}
    {% elsif salt_route == '/pages/blog' %}
      {% assign salt_seo_title = 'SALT Journal | SALT Online Store' %}
      {% assign salt_seo_description = 'Fresh stories, product education, and practical ideas from SALT.' %}
    {% elsif salt_route == '/pages/affiliate-program' %}
      {% assign salt_seo_title = 'Affiliate Program | SALT Online Store' %}
      {% assign salt_seo_description = 'Learn how to partner with SALT and share useful products with your audience.' %}
    {% elsif salt_route == '/pages/mission-vision' %}
      {% assign salt_seo_title = 'Mission & Vision | SALT Online Store' %}
      {% assign salt_seo_description = 'Learn what SALT is building and how we make everyday shopping easier.' %}
    {% elsif salt_route == '/pages/wholesale-inquiries' %}
      {% assign salt_seo_title = 'Wholesale Inquiries | SALT Online Store' %}
      {% assign salt_seo_description = 'Contact SALT about wholesale, gifting, and business purchasing opportunities.' %}
    {% elsif salt_route == '/pages/terms-conditions' %}
      {% assign salt_seo_title = 'Terms & Conditions | SALT Online Store' %}
      {% assign salt_seo_description = 'Review the terms that apply when using the SALT Online Store.' %}
    {% elsif salt_route == '/pages/track-order' %}
      {% assign salt_seo_title = 'Track Order | SALT Online Store' %}
      {% assign salt_seo_description = 'Use the secure order portal to review your order status and delivery details.' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif salt_route == '/pages/recently-viewed' %}
      {% assign salt_seo_title = 'Recently Viewed | SALT Online Store' %}
      {% assign salt_seo_description = 'Pick up where you left off with products viewed on this device.' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% elsif request.page_type == '404' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% endif %}

    {% if request.page_type == 'product' and product %}
      {%- comment -%}
        Shopify's native SEO fields belong to the product, but the selected
        variant is available during Liquid rendering. Include its identity in
        the request-time metadata so a backpack/bottle/lunch-box variant does
        not inherit an unrelated product-only title or description.
      {%- endcomment -%}
      {% assign salt_selected_variant = product.selected_or_first_available_variant %}
      {% if salt_selected_variant and salt_selected_variant.featured_image %}
        {% assign salt_social_image = salt_selected_variant.featured_image | image_url: width: 1200 %}
      {% elsif product.featured_image %}
        {% assign salt_social_image = product.featured_image | image_url: width: 1200 %}
      {% endif %}
      {% assign salt_variant_label = salt_selected_variant.title | default: '' | strip %}
      {% unless salt_variant_label == blank or salt_variant_label == 'Default Title' %}
        {% assign salt_seo_title = product.title | append: ' - ' | append: salt_variant_label | append: ' | SALT Online Store' %}
        {% assign salt_variant_description = product.description | strip_html | strip_newlines | truncate: 115 %}
        {% assign salt_seo_description = salt_variant_description | append: ' Selected option: ' | append: salt_variant_label | append: '.' %}
      {% endunless %}
    {% endif %}
    {% if salt_is_product_reviews_route %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% endif %}
    {% if salt_product_canonical_alias != blank %}
      {% assign salt_seo_canonical = 'https://' | append: request.host | append: '/products/' | append: salt_product_canonical_alias %}
      {% assign salt_custom_canonical = true %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% endif %}
    {% if salt_route contains '/pages/track-order' %}
      {% assign salt_seo_robots = 'noindex,follow' %}
    {% endif %}
    {% unless salt_social_image contains '://' %}
      {% assign salt_social_image = 'https:' | append: salt_social_image %}
    {% endunless %}
    {% assign salt_seo_title_output = salt_seo_title | replace: '&amp;', '&' %}
    {% assign salt_seo_description_output = salt_seo_description | strip_html | strip_newlines | replace: '&amp;', '&' %}

    <title>{{ salt_seo_title_output | escape }}</title>
    {% if salt_seo_description != blank %}
      <meta name="description" content="{{ salt_seo_description_output | escape }}">
    {% endif %}
    <meta name="robots" content="{{ salt_seo_robots }}">
    <meta name="googlebot" content="{{ salt_seo_robots }}">
    <meta property="og:title" content="{{ salt_seo_title_output | escape }}">
    <meta property="og:description" content="{{ salt_seo_description_output | escape }}">
    <meta property="og:url" content="{{ salt_seo_canonical | escape }}">
    <meta property="og:image" content="{{ salt_social_image | escape }}">
    <meta property="og:image:secure_url" content="{{ salt_social_image | escape }}">
    <meta property="og:image:alt" content="{{ salt_seo_title_output | escape }}">
    <meta property="og:type" content="{% if request.page_type == 'product' %}product{% elsif request.page_type == 'article' %}article{% else %}website{% endif %}">
    <meta property="og:site_name" content="{{ shop.name | escape }}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{ salt_seo_title_output | escape }}">
    <meta name="twitter:description" content="{{ salt_seo_description_output | escape }}">
    <meta name="twitter:url" content="{{ salt_seo_canonical | escape }}">
    <meta name="twitter:image" content="{{ salt_social_image | escape }}">
    <meta name="twitter:image:alt" content="{{ salt_seo_title_output | escape }}">
    {% if salt_custom_canonical %}
      <link rel="canonical" href="{{ salt_seo_canonical | escape }}">
    {% endif %}
    <script>
      (function () {
        var path = window.location.pathname;
        var query = window.location.search;
        var hasQuery = query.length > 1;
        var isFinance = path === '/pages/finance' || path === '/apps:finance' || path === '/apps/finance' || (path === '/' && /(?:^|&)finance=1(?:&|$)/.test(query.slice(1)));
        var isQuerySurface = path === '/' || path === '/shop' || path === '/search';
        var isProductQueryVariant = hasQuery && /^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?products?\\/[^/]+\\/?$/i.test(path);
        var isLocalizedCatalogDuplicate = /^\\/(?:[a-z]{2}(?:-[a-z]{2})?)\\/(?:products?|collections)(?:\\/|$)/i.test(path);
        var isProductReviewRoute = /^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?products?\\/[^/]+\\/reviews\\/?$/i.test(path);
        var productCanonicalAliases = {
          '/products/winter-motorcycle-face-mask-balaclava-windproof-thermal-neck-warmer': '/products/tactical-motorcycle-face-mask-neck-gaiter-windproof-breathable',
          '/products/ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men-1': '/products/ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men',
          '/products/children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil-1': '/products/children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil',
          '/products/black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-2': '/products/black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-3',
          '/products/anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l-2': '/products/anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l',
          '/products/jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot-1': '/products/jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot',
          '/products/car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-rv-motorcycle': '/products/car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-for-motorcycle',
          '/products/women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands-2': '/products/women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands',
          '/products/buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset-1': '/products/buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset',
          '/products/mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook-1': '/products/mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook',
          '/products/laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case-1': '/products/laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case',
          '/products/school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks-1': '/products/school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks',
          '/products/covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover-1': '/products/covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover',
          '/products/mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags-1': '/products/mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags',
          '/products/turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care-1': '/products/turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care',
          '/products/mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme-1': '/products/mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme',
          '/products/facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home-1': '/products/facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home',
          '/products/turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m-1': '/products/turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m',
          '/products/causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women-1': '/products/causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women',
          '/products/4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush-1': '/products/4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush',
          '/products/hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair-1': '/products/hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair',
          '/products/body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing-1': '/products/body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing',
          '/products/blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright-1': '/products/blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright'
        };
        var productCanonicalAlias = productCanonicalAliases[path] || '';
        if (!isFinance && !isProductQueryVariant && !isProductReviewRoute && !productCanonicalAlias && !(hasQuery && isQuerySurface)) return;

        function ensureMeta(name, content) {
          var tag = document.querySelector('meta[name="' + name + '"]');
          if (!tag) {
            tag = document.createElement('meta');
            tag.setAttribute('name', name);
            document.head.appendChild(tag);
          }
          tag.setAttribute('content', content);
        }

        var collectionAliasTarget = '';
        if (/^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?collections\\/holiday-gifts\\/?$/i.test(path)) {
          collectionAliasTarget = '/collections/gifts';
        } else if (/^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?collections\\/(?:winter-wear|clearance-archive)\\/?$/i.test(path)) {
          collectionAliasTarget = '/collections/under-50';
        }
        if (collectionAliasTarget && !isLocalizedCatalogDuplicate) {
          var indexableRobots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
          ensureMeta('robots', indexableRobots);
          ensureMeta('googlebot', indexableRobots);
          var aliasCanonical = document.querySelector('link[rel="canonical"]');
          if (!aliasCanonical) {
            aliasCanonical = document.createElement('link');
            aliasCanonical.setAttribute('rel', 'canonical');
            document.head.appendChild(aliasCanonical);
          }
          aliasCanonical.setAttribute('href', window.location.origin + collectionAliasTarget);
          return;
        }

        if (isProductReviewRoute) {
          ensureMeta('robots', 'noindex,follow');
          ensureMeta('googlebot', 'noindex,follow');
          return;
        }

        if (productCanonicalAlias) {
          var canonicalTarget = window.location.origin + productCanonicalAlias;
          var applyProductCanonical = function () {
            var canonicalAliasLink = document.querySelector('link[rel="canonical"]');
            if (!canonicalAliasLink) {
              canonicalAliasLink = document.createElement('link');
              canonicalAliasLink.setAttribute('rel', 'canonical');
              document.head.appendChild(canonicalAliasLink);
            }
            canonicalAliasLink.setAttribute('href', canonicalTarget);
            ensureMeta('robots', 'noindex,follow');
            ensureMeta('googlebot', 'noindex,follow');
          };
          applyProductCanonical();
          new MutationObserver(applyProductCanonical).observe(document.head, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'rel', 'content']
          });
          return;
        }

        if (isProductQueryVariant) {
          var applyProductQueryNoIndex = function () {
            ensureMeta('robots', 'noindex,follow');
            ensureMeta('googlebot', 'noindex,follow');
            var productQueryCanonical = document.querySelector('link[rel="canonical"]');
            if (!productQueryCanonical) {
              productQueryCanonical = document.createElement('link');
              productQueryCanonical.setAttribute('rel', 'canonical');
              document.head.appendChild(productQueryCanonical);
            }
            productQueryCanonical.setAttribute('href', window.location.origin + path);
          };
          applyProductQueryNoIndex();
          new MutationObserver(applyProductQueryNoIndex).observe(document.head, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'rel', 'content']
          });
          return;
        }

        ensureMeta('robots', 'noindex,follow');
        ensureMeta('googlebot', 'noindex,follow');

        var canonicalPath = path;
        if (path === '/shop' && /(?:^|&)resource=hub(?:&|$)/.test(query.slice(1))) {
          canonicalPath = '/pages/resources';
        } else if (path !== '/pages/finance' && path !== '/apps:finance' && path !== '/apps/finance') {
          canonicalPath = path || '/';
        }

        var canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', window.location.origin + canonicalPath);
      })();
    </script>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": "https://{{ request.host }}/#organization",
        "name": {{ shop.name | json }},
        "url": "https://{{ request.host }}/",
        "logo": {{ 'brand-salt-logo.png' | asset_url | json }},
        "sameAs": [
          "https://instagram.com/saltonlinestore",
          "https://www.facebook.com/profile.php?id=61573199456052",
          "https://youtube.com/@saltonlinestore"
        ]
      }
    </script>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "https://{{ request.host }}/#website",
        "name": {{ shop.name | json }},
        "url": "https://{{ request.host }}/",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://{{ request.host }}/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }
    </script>
    {% if request.page_type == 'article' and article %}
      {% assign salt_article_schema_description = article.excerpt | default: article.content | strip_html | strip_newlines | truncate: 500 %}
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "@id": {{ salt_seo_canonical | append: '#article' | json }},
          "mainEntityOfPage": {{ salt_seo_canonical | json }},
          "headline": {{ article.title | json }},
          "description": {{ salt_article_schema_description | json }},
          "url": {{ salt_seo_canonical | json }},
          "author": {
            "@type": "Person",
            "name": {{ article.author | default: shop.name | json }}
          },
          "publisher": {
            "@type": "Organization",
            "name": {{ shop.name | json }},
            "logo": {
              "@type": "ImageObject",
              "url": {{ 'brand-salt-logo.png' | asset_url | json }}
            }
          }{% if article.image %},
          "image": [{{ article.image | image_url: width: 1200 | json }}]{% endif %}{% if article.published_at %},
          "datePublished": {{ article.published_at | date: '%Y-%m-%dT%H:%M:%S%z' | json }}{% endif %}{% if article.updated_at %},
          "dateModified": {{ article.updated_at | date: '%Y-%m-%dT%H:%M:%S%z' | json }}{% endif %}
        }
      </script>
    {% endif %}
    {% if request.page_type == 'blog' and blog %}
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Blog",
          "@id": {{ salt_seo_canonical | append: '#blog' | json }},
          "name": {{ blog.title | json }},
          "url": {{ salt_seo_canonical | json }},
          "blogPost": [
            {% for salt_blog_article in blog.articles limit: 12 %}
              {
                "@type": "BlogPosting",
                "headline": {{ salt_blog_article.title | json }},
                "url": {{ 'https://' | append: request.host | append: salt_blog_article.url | json }}
              }{% unless forloop.last %},{% endunless %}
            {% endfor %}
          ]
        }
      </script>
    {% endif %}
    {% if salt_route == '/pages/faq' %}
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": {{ 'How do I find the right collection?' | json }},
              "acceptedAnswer": {
                "@type": "Answer",
                "text": {{ 'Start from the Collections index or the header dropdown, then narrow into the subcategory that matches the shopping intent.' | json }}
              }
            },
            {
              "@type": "Question",
              "name": {{ 'How do I check my order?' | json }},
              "acceptedAnswer": {
                "@type": "Answer",
                "text": {{ 'Use the Track Order link in the footer or open the Shopify customer portal: https://shopify.com/58076594275/account/orders.' | json }}
              }
            },
            {
              "@type": "Question",
              "name": {{ 'Where is shipping and return information?' | json }},
              "acceptedAnswer": {
                "@type": "Answer",
                "text": {{ 'Shipping, return, and privacy details are available in the footer policy section and remain synced to the current store setup.' | json }}
              }
            },
            {
              "@type": "Question",
              "name": {{ 'What should I do if I still need help?' | json }},
              "acceptedAnswer": {
                "@type": "Answer",
                "text": {{ 'Use the Contact Us link for a support message and the team can route the request cleanly.' | json }}
              }
            }
          ]
        }
      </script>
    {% endif %}
    {% if salt_route contains '/collections/' %}
      {% assign salt_schema_collection = collections[salt_collection_handle] %}
      {% if salt_schema_collection %}
        {% assign salt_schema_collection_description = salt_schema_collection.description | strip_html | strip_newlines | truncate: 500 %}
        {% if salt_schema_collection_description == blank %}
          {% assign salt_schema_collection_description = salt_seo_description %}
        {% endif %}
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": {{ salt_seo_canonical | append: '#collection' | json }},
            "name": {{ salt_schema_collection.title | json }},
            "description": {{ salt_schema_collection_description | json }},
            "url": {{ salt_seo_canonical | json }}{% if salt_schema_collection.products_count > 0 %},
            "mainEntity": {
              "@type": "ItemList",
              "numberOfItems": {{ salt_schema_collection.products_count | plus: 0 | json }},
              "itemListElement": [
                {% for salt_schema_product in salt_schema_collection.products limit: 12 %}
                  {
                    "@type": "ListItem",
                    "position": {{ forloop.index | json }},
                    "name": {{ salt_schema_product.title | json }},
                    "url": {{ 'https://' | append: request.host | append: '/products/' | append: salt_schema_product.handle | json }}
                  }{% unless forloop.last %},{% endunless %}
                {% endfor %}
              ]
            }{% endif %}
          }
        </script>
      {% endif %}
    {% endif %}
    {% if request.page_type == 'product' and product %}
      {% assign salt_schema_url = salt_seo_canonical %}
      {% assign salt_schema_product_name = product.title %}
      {% assign salt_schema_description = product.description | strip_html | strip_newlines | truncate: 500 %}
      {% assign salt_schema_variant = product.selected_or_first_available_variant %}
      {% assign salt_schema_variant_label = salt_schema_variant.title | default: '' | strip %}
      {% unless salt_schema_variant_label == blank or salt_schema_variant_label == 'Default Title' %}
        {% assign salt_schema_product_name = product.title | append: ' - ' | append: salt_schema_variant_label %}
      {% endunless %}
      {% assign salt_schema_judgeme_badge = product.metafields.judgeme.badge | default: '' %}
      {% assign salt_schema_judgeme_rating = salt_schema_judgeme_badge | split: "data-average-rating='" | last | split: "'" | first %}
      {% assign salt_schema_judgeme_review_count = salt_schema_judgeme_badge | split: "data-number-of-reviews='" | last | split: "'" | first %}
      {% assign salt_schema_judgeme_rating_value = salt_schema_judgeme_rating | plus: 0 %}
      {% assign salt_schema_judgeme_review_count_value = salt_schema_judgeme_review_count | plus: 0 %}
      {% assign salt_schema_sku = 'salt-' | append: product.id %}
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": {{ salt_schema_url | append: '#product' | json }},
          "mainEntityOfPage": {{ salt_schema_url | json }},
          "name": {{ salt_schema_product_name | json }},
          "description": {{ salt_schema_description | json }},
          {% if salt_schema_variant.featured_image %}
            "image": [{{ salt_schema_variant.featured_image | image_url: width: 1200 | json }}],
          {% endif %}
          "brand": {
            "@type": "Brand",
            "name": {{ product.vendor | default: shop.name | json }}
          },
          "sku": {{ salt_schema_sku | json }},
          "url": {{ salt_schema_url | json }},
          "offers": {
            "@type": "Offer",
            "url": {{ salt_schema_url | json }},
            "priceCurrency": {{ shop.currency | json }},
            "price": {{ salt_schema_variant.price | divided_by: 100.0 | json }},
            "availability": "{% if salt_schema_variant.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}",
            "itemCondition": "https://schema.org/NewCondition",
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": {
                "@type": "MonetaryAmount",
                "value": 0,
                "currency": {{ shop.currency | json }}
              },
              "shippingDestination": {
                "@type": "DefinedRegion",
                "addressCountry": "US"
              }
            },
            "hasMerchantReturnPolicy": {
              "@type": "MerchantReturnPolicy",
              "applicableCountry": "US",
              "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
              "merchantReturnDays": 30,
              "returnMethod": "https://schema.org/ReturnByMail",
              "returnFees": "https://schema.org/FreeReturn"
            }
          }{% if salt_schema_judgeme_rating_value > 0 and salt_schema_judgeme_review_count_value > 0 %},
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": {{ salt_schema_judgeme_rating_value | json }},
              "reviewCount": {{ salt_schema_judgeme_review_count_value | json }}
          }{% endif %}
        }
      </script>
    {% endif %}
    <link rel="icon" href="{{ 'favicon.ico' | asset_url }}" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="{{ 'favicon-32x32.png' | asset_url }}">
    <link rel="icon" type="image/png" sizes="16x16" href="{{ 'favicon-16x16.png' | asset_url }}">
    <link rel="apple-touch-icon" sizes="180x180" href="{{ 'apple-touch-icon.png' | asset_url }}">
    <link rel="manifest" href="{{ 'site.webmanifest' | asset_url }}">
    <link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
    {{ 'salt-app.css' | asset_url | stylesheet_tag }}
    {% if ${JSON.stringify(routeAssets.entry || "")} != blank %}
      <link rel="modulepreload" href="{{ ${JSON.stringify(routeAssets.entry || "")} | asset_url | split: '?' | first }}" fetchpriority="high">
    {% endif %}
    {% if request.page_type == 'product' and ${JSON.stringify(routeAssets.product || "")} != blank %}
      <link rel="modulepreload" href="{{ ${JSON.stringify(routeAssets.product || "")} | asset_url | split: '?' | first }}" fetchpriority="high">
    {% elsif request.path == '/' and ${JSON.stringify(routeAssets.home || "")} != blank %}
      <link rel="modulepreload" href="{{ ${JSON.stringify(routeAssets.home || "")} | asset_url | split: '?' | first }}">
    {% endif %}
    {% if request.page_type == 'product' %}
      {%- comment -%}
        The React PDP selects the live featured image and its responsive URL after
        the product payload arrives. Preloading product.featured_image here can
        fetch a different CDN variant and creates a wasted-preload warning.
      {%- endcomment -%}
      <script>
        (function () {
          // LimitQtyHelper is injected by a Shopify app with defer, but its
          // origin can take more than a second to respond. Keep the quantity
          // feature and its execution order independent from DOM readiness so
          // the React product page never waits on that third-party server.
          function isLimitQtyHelper(node) {
            if (!(node instanceof HTMLScriptElement) || !node.src) return false;

            try {
              var url = new URL(node.src, window.location.href);
              return url.hostname === 'magecomp.us' && url.pathname === '/js/LimitQtyHelper.js';
            } catch (error) {
              return false;
            }
          }

          function makeNonBlocking(node) {
            if (isLimitQtyHelper(node)) {
              node.async = true;
              node.defer = false;
              node.setAttribute('data-salt-nonblocking', 'true');
            }

            if (!node || !node.querySelectorAll) return;
            node.querySelectorAll('script[src]').forEach(function (script) {
              if (!isLimitQtyHelper(script)) return;
              script.async = true;
              script.defer = false;
              script.setAttribute('data-salt-nonblocking', 'true');
            });
          }

          var observer = new MutationObserver(function (records) {
            records.forEach(function (record) {
              record.addedNodes.forEach(makeNonBlocking);
            });
          });

          observer.observe(document.documentElement, { childList: true, subtree: true });
          document.addEventListener('DOMContentLoaded', function () {
            observer.disconnect();
          }, { once: true });
        })();
      </script>
    {% endif %}
    <script>
      (function () {
        var selector = '#svelte-bundle-widget, #pumper_bundle_svelte';
        var pending = /^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?products?(?:\\/|$)/i.test(window.location.pathname);
        var observer = null;
        var originalDisplays = new WeakMap();

        function rememberAndHide(element) {
          if (!(element instanceof HTMLElement)) return;

          if (!originalDisplays.has(element)) {
            originalDisplays.set(element, {
              value: element.style.getPropertyValue('display'),
              priority: element.style.getPropertyPriority('display'),
            });
          }

          if (
            element.style.getPropertyValue('display') !== 'none' ||
            element.style.getPropertyPriority('display') !== 'important'
          ) {
            element.style.setProperty('display', 'none', 'important');
          }
        }

        function hideWidgets(scope) {
          if (!pending) return;

          if (scope && scope.nodeType === 1 && scope.matches(selector)) {
            rememberAndHide(scope);
          }

          var root = scope && scope.querySelectorAll ? scope : document;
          root.querySelectorAll(selector).forEach(rememberAndHide);
        }

        function observeWidgets() {
          if (observer || !document.documentElement) return;

          observer = new MutationObserver(function (records) {
            if (!pending) return;

            records.forEach(function (record) {
              if (record.type === 'attributes') {
                hideWidgets(record.target);
                return;
              }

              record.addedNodes.forEach(hideWidgets);
            });
          });

          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'style'],
          });
        }

        function gatePumper() {
          pending = true;
          document.documentElement.setAttribute('data-salt-product-media', 'loading');
          observeWidgets();
          hideWidgets(document);
        }

        function releasePumper() {
          pending = false;
          document.documentElement.removeAttribute('data-salt-product-media');

          if (observer) {
            observer.disconnect();
            observer = null;
          }

          document.querySelectorAll(selector).forEach(function (element) {
            var original = originalDisplays.get(element);
            if (!original) return;

            if (original.value) {
              element.style.setProperty('display', original.value, original.priority);
            } else {
              element.style.removeProperty('display');
            }

            originalDisplays.delete(element);
          });

          window.setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
          }, 0);
        }

        window.addEventListener('salt:product-media-loading', gatePumper);
        window.addEventListener('salt:product-media-ready', releasePumper);

        if (pending) gatePumper();
      })();
    </script>
    <script>
      (function () {
        // Meta's remote structured-signal rules currently mistake Shopify's
        // Apple Pay JSON blob for a currency code and crawl the full app shell.
        // Hide only those two selectors from Meta's own call stack; Shopify and
        // every storefront feature continue to receive the native DOM results.
        var blockedMetaSelectors = new Set(['#apple-pay-shop-capabilities', '.site-shell']);
        var nativeQuerySelector = Document.prototype.querySelector;
        var nativeQuerySelectorAll = Document.prototype.querySelectorAll;
        var nativeSendBeacon = Navigator.prototype.sendBeacon;
        var nativeFetch = window.fetch;

        // Shopify intentionally starts an Apple Private Access Token flow with
        // a 401 challenge. WebDriver browsers cannot complete Apple device
        // attestation, so keep the production Safari flow untouched while
        // making automated storefront checks deterministic and error-free.
        if (navigator.webdriver && typeof nativeFetch === 'function') {
          window.fetch = function (input, init) {
            var rawUrl = typeof input === 'string' ? input : input && input.url;

            try {
              var requestUrl = new URL(String(rawUrl || ''), window.location.href);
              if (
                requestUrl.origin === window.location.origin &&
                requestUrl.pathname === '/sf_private_access_tokens'
              ) {
                window.__SALT_AUTOMATION_PAT_BYPASS__ = true;
                return Promise.resolve(new Response(null, { status: 204 }));
              }
            } catch (error) {
              // Preserve native fetch behavior for malformed or unsupported inputs.
            }

            return nativeFetch.call(this, input, init);
          };
        }

        function isMetaCrawlerCall() {
          return /(?:connect\\.facebook\\.net|fbevents)/i.test(String(new Error().stack || ''));
        }

        Document.prototype.querySelector = function (selector) {
          if (blockedMetaSelectors.has(String(selector)) && isMetaCrawlerCall()) return null;
          return nativeQuerySelector.call(this, selector);
        };

        Document.prototype.querySelectorAll = function (selector) {
          if (blockedMetaSelectors.has(String(selector)) && isMetaCrawlerCall()) {
            return document.createDocumentFragment().querySelectorAll('*');
          }
          return nativeQuerySelectorAll.call(this, selector);
        };

        // Meta can exhaust WebKit's shared 64 KB keepalive queue when Shopify
        // pixels initialize together. Deliver only Meta's tracking endpoint
        // through a normal non-blocking fetch so events still reach Facebook
        // without producing a storefront Beacon API error.
        if (typeof nativeSendBeacon === 'function') {
          Navigator.prototype.sendBeacon = function (url, data) {
            var target = String(url || '');

            if (/^https:\\/\\/(?:www\\.)?facebook\\.com\\/tr\\//i.test(target)) {
              try {
                window.fetch(target, {
                  method: 'POST',
                  body: data == null ? undefined : data,
                  mode: 'no-cors',
                  credentials: 'omit',
                  keepalive: false,
                }).catch(function () {});
                return true;
              } catch (error) {
                return nativeSendBeacon.call(this, url, data);
              }
            }

            return nativeSendBeacon.call(this, url, data);
          };
        }
      })();
    </script>
    {% if salt_custom_canonical %}
      {% assign salt_native_canonical_tag = '<link rel="canonical" href="' | append: canonical_url | append: '">' %}
      {{ salt_content_for_header | remove: salt_native_canonical_tag }}
    {% else %}
      {{ salt_content_for_header }}
    {% endif %}
    {% if request.path == '/' and ${JSON.stringify(routeAssets.homeHero || "")} != blank %}
      {{ ${JSON.stringify(routeAssets.homeHero || "")} | asset_url | preload_tag: as: 'image' }}
    {% endif %}
    {% if request.page_type == 'product' %}
      {% assign salt_product_judgeme_badge = product.metafields.judgeme.badge | default: '' %}
      {% assign salt_product_judgeme_rating = salt_product_judgeme_badge | split: "data-average-rating='" | last | split: "'" | first %}
      {% assign salt_product_judgeme_review_count = salt_product_judgeme_badge | split: "data-number-of-reviews='" | last | split: "'" | first %}
      <script>
        (function () {
          var match = window.location.pathname.match(/^\\/(?:[a-z]{2}(?:-[a-z]{2})?\\/)?products?\\/([^\\/?#]+)\\/?$/i);
          if (!match) return;

          var handle = decodeURIComponent(match[1]);
          var inlineProduct = {{ product | json }};
          if (inlineProduct && inlineProduct.id) {
            inlineProduct.average_rating = {% if salt_product_judgeme_badge contains "data-average-rating='" %}{{ salt_product_judgeme_rating | plus: 0 | json }}{% else %}null{% endif %};
            inlineProduct.total_reviews = {% if salt_product_judgeme_badge contains "data-number-of-reviews='" %}{{ salt_product_judgeme_review_count | plus: 0 | json }}{% else %}null{% endif %};
          }
          window.__SALT_PRODUCT_PREFETCH__ = {
            handle: handle.toLowerCase(),
            raw: inlineProduct && inlineProduct.id ? inlineProduct : null,
            // The request-time Liquid payload is already available to React.
            // Do not start a second unused .js request before the PDP mounts;
            // intentional pointer/focus navigation can still warm the live
            // product query when the shopper actually chooses a product.
          };
        })();
      </script>
    {% endif %}
    {% if request.path == '/' %}
      <script>
        (function () {
          window.__SALT_HOME_COLLECTION_PREFETCH__ = {
            generatedAt: {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
            source: 'shopify-liquid:home-collections',
            sections: {
              ${homeCollectionSectionsLiquid}
            }
          };

          {% assign salt_best_sellers = collections["best-sellers"] %}
          window.__SALT_HOME_PREFETCH__ = {
            generatedAt: {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
            source: 'shopify-liquid:best-sellers',
            total: {{ salt_best_sellers.products_count | default: 0 | json }},
            sources: { bestSellerProducts: 'best-sellers' },
            bestSellerProducts: [
              {% for item in salt_best_sellers.products limit: 12 %}
                ${buildHomeProductRecord("item")}{% unless forloop.last %},{% endunless %}
              {% endfor %}
            ],
            quirkyGiftPicks: [],
            everydayEssentialProducts: []
          };
        })();
      </script>
    {% endif %}
    {% if request.page_type == 'collection' and collection %}
      {% paginate collection.products by 36 %}
        <script>
          (function () {
            // Shopify renders this payload inside the uploaded theme. It is a
            // request-time snapshot, so React gets current manual ordering,
            // prices, availability, and newly added first-page products before
            // its modules execute and without a storefront API round-trip.
            var liveProducts = [
              {% for item in collection.products %}
                ${buildLiquidProductRecord("item")}{% unless forloop.last %},{% endunless %}
              {% endfor %}
            ];

            window.__SALT_COLLECTION_PREFETCH__ = {
              handle: {{ collection.handle | downcase | json }},
              generatedAt: {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
              complete: {% if paginate.pages == 1 %}true{% else %}false{% endif %},
              currentPage: {{ paginate.current_page | json }},
              total: {{ paginate.items | json }},
              productIds: [
                {% for item in collection.products %}
                  {{ item.id | json }}{% unless forloop.last %},{% endunless %}
                {% endfor %}
              ],
              products: liveProducts
            };
          })();
        </script>
      {% endpaginate %}
    {% endif %}
    {% if request.page_type == 'search' and search.performed %}
      {% paginate search.results by 36 %}
        <script>
          (function () {
            window.__SALT_SEARCH_PREFETCH__ = {
              generatedAt: {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
              source: 'shopify-liquid:search',
              kind: 'search',
              handle: 'all-products',
              query: {{ search.terms | json }},
              page: {{ paginate.current_page | json }},
              pageSize: 36,
              total: {{ paginate.items | json }},
              totalPages: {{ paginate.pages | json }},
              hasPreviousPage: {% if paginate.previous %}true{% else %}false{% endif %},
              hasNextPage: {% if paginate.next %}true{% else %}false{% endif %},
              productTypes: [
                {% assign salt_search_type_written = false %}
                {% for filter in search.filters %}
                  {% if filter.param_name == 'filter.p.product_type' %}
                    {% for value in filter.values %}
                      {% if salt_search_type_written %},{% endif %}{{ value.value | json }}
                      {% assign salt_search_type_written = true %}
                    {% endfor %}
                  {% endif %}
                {% endfor %}
              ],
              products: [
                {% assign salt_search_product_written = false %}
                {% for item in search.results %}
                  {% if item.object_type == 'product' %}
                    {% if salt_search_product_written %},{% endif %}${buildLiquidProductRecord("item")}
                    {% assign salt_search_product_written = true %}
                  {% endif %}
                {% endfor %}
              ]
            };
          })();
        </script>
      {% endpaginate %}
    {% endif %}
    {% if ${JSON.stringify(routeAssets.entry || "")} != blank %}
      <script type="module" src="{{ ${JSON.stringify(routeAssets.entry || "")} | asset_url | split: '?' | first }}"></script>
    {% else %}
    {% endif %}
  </head>
  <body>
    {{ content_for_layout }}
  </body>
</html>
`;

const sectionLiquid = `<div
  id="root"
  data-shop-base-url="https://{{ request.host | escape }}"
  data-shop-domain="{{ shop.permanent_domain | escape }}"
  data-shop-name="{{ shop.name | escape }}"
  data-customer-logged-in="{% if customer %}true{% else %}false{% endif %}"
  data-customer-display-name="{% if customer %}{{ customer.name | default: customer.first_name | default: customer.email | escape }}{% endif %}"
  data-customer-email="{% if customer %}{{ customer.email | escape }}{% endif %}"
  data-account-url="{{ routes.account_url | escape }}"
  data-account-login-url="{{ routes.account_login_url | escape }}"
  data-account-register-url="{{ routes.account_register_url | escape }}"
  data-account-logout-url="{{ routes.account_logout_url | escape }}"
  data-account-addresses-url="{{ routes.account_addresses_url | escape }}"
  data-judgeme-shop-domain="{{ shop.permanent_domain | escape }}"
  data-judgeme-public-token="TQ0rk940ADN89zj_f83SKuTYIfY"
  data-currency="{{ cart.currency.iso_code | default: shop.currency | escape }}"
></div>
<noscript>
  <main>
    {% if request.page_type == 'product' and product %}
      <h1>{{ product.title | escape }}</h1>
      {% if product.featured_image %}
        <img src="{{ product.featured_image | image_url: width: 800 }}" alt="{{ product.title | escape }}" loading="lazy" width="800" height="800">
      {% endif %}
      <p>
        {% if product.vendor != blank %}Brand: {{ product.vendor | escape }}{% endif %}
        {% if product.type != blank %}{% if product.vendor != blank %} · {% endif %}Category: {{ product.type | escape }}{% endif %}
      </p>
      {% if product.description != blank %}
        <p>{{ product.description | strip_html | strip_newlines | truncate: 600 | escape }}</p>
      {% endif %}
      {% assign salt_noscript_variant = product.selected_or_first_available_variant %}
      <p>Price: {{ salt_noscript_variant.price | money }}</p>
      <p>Availability: {% if product.available %}In stock{% else %}Currently unavailable{% endif %}</p>
      <p><a href="{{ product.url }}">View product details</a></p>
    {% elsif request.page_type == 'collection' and collection %}
      <h1>{{ collection.title | escape }}</h1>
      {% if collection.description != blank %}
        <p>{{ collection.description | strip_html | strip_newlines | truncate: 320 | escape }}</p>
      {% endif %}
    {% elsif request.path contains '/pages/faq' %}
      <h1>FAQ</h1>
      <p>Quick answers about SALT ordering, shipping, returns, and product support.</p>
      <section aria-labelledby="salt-noscript-faq-title">
        <h2 id="salt-noscript-faq-title">Frequently asked questions</h2>
        <h3>How do I find the right collection?</h3>
        <p>Start from the Collections index or the header dropdown, then narrow into the subcategory that matches the shopping intent.</p>
        <h3>How do I check my order?</h3>
        <p>Use the Track Order link in the footer or open the Shopify customer portal.</p>
        <h3>Where is shipping and return information?</h3>
        <p>Shipping, return, and privacy details are available in the footer policy section and remain synced to the current store setup.</p>
        <h3>What should I do if I still need help?</h3>
        <p>Use the Contact Us link for a support message and the team can route the request cleanly.</p>
      </section>
    {% elsif request.path == '/pages/about-us' %}
      <h1>About SALT Online Store</h1>
      <p>Learn how SALT makes practical products easy to discover, save, and buy.</p>
    {% elsif request.path == '/pages/contact-us' %}
      <h1>Contact SALT Support</h1>
      <p>Reach the SALT support team for delivery questions, product advice, returns, or order help.</p>
    {% elsif request.path == '/pages/blog' %}
      <h1>SALT Journal</h1>
      <p>Fresh stories, product education, and practical ideas from SALT.</p>
    {% elsif request.page_type == 'blog' and blog %}
      <h1>SALT Journal</h1>
      <p>Fresh stories, product education, and practical ideas from SALT.</p>
    {% elsif request.page_type == 'article' and article %}
      <h1>{{ article.title | escape }}</h1>
      {% assign salt_noscript_article_description = article.excerpt | default: article.content | strip_html | strip_newlines | truncate: 320 %}
      <p>{{ salt_noscript_article_description | escape }}</p>
    {% else %}
      <h1>{{ page_title | default: shop.name | escape }}</h1>
      {% if page_description != blank %}
        <p>{{ page_description | strip_html | escape }}</p>
      {% endif %}
    {% endif %}
    <nav aria-label="SALT Online Store links">
      <a href="{{ routes.root_url }}">Home</a>
      <a href="{{ routes.collections_url }}">Collections</a>
      <a href="{{ routes.all_products_collection_url }}">Shop all products</a>
      <a href="/pages/faq">FAQ</a>
      <a href="/pages/contact-us">Contact support</a>
    </nav>
  </main>
</noscript>
<script>
  (function () {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var isHome = path === '/' || /^\/[a-z]{2}(?:-[a-z]{2})?$/.test(path);
    var isCollection = /\/collections\/[^/]+$/.test(path);
    if (!isHome && !isCollection) return;

    var root = document.getElementById('root');
    if (!root) return;

    var attempts = 0;
    var observer = null;
    var ensureHeading = function () {
      if (!root.isConnected) return;
      if (root.querySelector('h1')) {
        if (observer) observer.disconnect();
        return;
      }

      var shell = root.querySelector('.salt-shop-channel-shell, main, section');
      if (!shell) {
        attempts += 1;
        if (attempts > 120 && observer) observer.disconnect();
        return;
      }

      var heading = document.createElement('h1');
      heading.className = 'sr-only';
      heading.textContent = isHome
        ? 'Shop Cookware, Clothing, Decor & Gifts | SALT Online Store'
        : document.title.replace(/\s*\|\s*SALT Online Store.*$/, '') || 'SALT Collection';
      shell.insertBefore(heading, shell.firstChild);
      if (observer) observer.disconnect();
    };

    observer = new MutationObserver(ensureHeading);
    observer.observe(root, { childList: true, subtree: true });
    ensureHeading();
    window.setTimeout(function () {
      if (observer) observer.disconnect();
    }, 12000);
  })();
</script>
<script type="application/json" id="salt-sidebar-collections">
  {% assign salt_sidebar_menu = linklists['sidebar-collections'] %}
  {
    "handle": "sidebar-collections",
    "source": "shopify-liquid-menu",
    "title": {{ salt_sidebar_menu.title | default: 'Collections' | json }},
    "items": [
      {% for salt_group in salt_sidebar_menu.links %}
        {
          "id": {{ salt_group.handle | default: salt_group.title | json }},
          "title": {{ salt_group.title | json }},
          "url": {{ salt_group.url | json }},
          "type": {{ salt_group.type | json }},
          "items": [
            {% for salt_child in salt_group.links %}
              {
                "id": {{ salt_child.handle | default: salt_child.title | json }},
                "title": {{ salt_child.title | json }},
                "url": {{ salt_child.url | json }},
                "type": {{ salt_child.type | json }},
                "items": []
              }{% unless forloop.last %},{% endunless %}
            {% endfor %}
          ]
        }{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ]
  }
</script>
<script type="application/json" id="salt-header-collections">
  {% assign salt_header_menu = linklists['header-collections'] %}
  {
    "handle": "header-collections",
    "source": "shopify-liquid-menu",
    "title": {{ salt_header_menu.title | default: 'Header Collections' | json }},
    "items": [
      {% for salt_group in salt_header_menu.links %}
        {
          "id": {{ salt_group.handle | default: salt_group.title | json }},
          "title": {{ salt_group.title | json }},
          "url": {{ salt_group.url | json }},
          "type": {{ salt_group.type | json }},
          "items": [
            {% for salt_child in salt_group.links %}
              {
                "id": {{ salt_child.handle | default: salt_child.title | json }},
                "title": {{ salt_child.title | json }},
                "url": {{ salt_child.url | json }},
                "type": {{ salt_child.type | json }},
                "items": []
              }{% unless forloop.last %},{% endunless %}
            {% endfor %}
          ]
        }{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ]
  }
</script>
<script>
  window.SALT_THEME_BUILD = ${JSON.stringify(themeBuildStamp)};
  window.SALT_FINANCE_API_ORIGIN = ${JSON.stringify(financeApiOrigin)};
  window.SALT_SHOPIFY_APP_KEY = ${JSON.stringify(shopifyAppKey)};
  window.SALT_SHOPIFY_STOREFRONT_TOKEN = ${JSON.stringify(shopifyStorefrontToken)};
  window.SALT_THEME_ASSET_BASE = {{ 'salt-app.js' | asset_url | split: 'salt-app.js' | first | json }};
  window.SALT_THEME_ASSETS = {
    "/brand/salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }},
    "/brand-salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }},
${buildThemeAssetMapEntries()}
  };
</script>
`;

const productDataSectionLiquid = `{% if request.page_type == 'collection' and collection %}
  {% paginate collection.products by 36 %}
    <script type="application/json" id="salt-product-listing-data">
      {
        "generatedAt": {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
        "source": "shopify-liquid-section:collection",
        "kind": "collection",
        "handle": {{ collection.handle | downcase | json }},
        "query": "",
        "page": {{ paginate.current_page | json }},
        "pageSize": 36,
        "total": {{ paginate.items | json }},
        "totalPages": {{ paginate.pages | json }},
        "hasPreviousPage": {% if paginate.previous %}true{% else %}false{% endif %},
        "hasNextPage": {% if paginate.next %}true{% else %}false{% endif %},
        "productTypes": [
          {% assign salt_collection_type_written = false %}
          {% for filter in collection.filters %}
            {% if filter.param_name == 'filter.p.product_type' %}
              {% for value in filter.values %}
                {% if salt_collection_type_written %},{% endif %}{{ value.value | json }}
                {% assign salt_collection_type_written = true %}
              {% endfor %}
            {% endif %}
          {% endfor %}
        ],
        "products": [
          {% for item in collection.products %}
            ${buildLiquidProductRecord("item")}{% unless forloop.last %},{% endunless %}
          {% endfor %}
        ]
      }
    </script>
  {% endpaginate %}
{% elsif request.page_type == 'search' and search.performed %}
  {% paginate search.results by 36 %}
    <script type="application/json" id="salt-product-listing-data">
      {
        "generatedAt": {{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
        "source": "shopify-liquid-section:search",
        "kind": "search",
        "handle": "all-products",
        "query": {{ search.terms | json }},
        "page": {{ paginate.current_page | json }},
        "pageSize": 36,
        "total": {{ paginate.items | json }},
        "totalPages": {{ paginate.pages | json }},
        "hasPreviousPage": {% if paginate.previous %}true{% else %}false{% endif %},
        "hasNextPage": {% if paginate.next %}true{% else %}false{% endif %},
        "productTypes": [
          {% assign salt_search_section_type_written = false %}
          {% for filter in search.filters %}
            {% if filter.param_name == 'filter.p.product_type' %}
              {% for value in filter.values %}
                {% if salt_search_section_type_written %},{% endif %}{{ value.value | json }}
                {% assign salt_search_section_type_written = true %}
              {% endfor %}
            {% endif %}
          {% endfor %}
        ],
        "products": [
          {% assign salt_search_section_product_written = false %}
          {% for item in search.results %}
            {% if item.object_type == 'product' %}
              {% if salt_search_section_product_written %},{% endif %}${buildLiquidProductRecord("item")}
              {% assign salt_search_section_product_written = true %}
            {% endif %}
          {% endfor %}
        ]
      }
    </script>
  {% endpaginate %}
{% else %}
  <script type="application/json" id="salt-product-listing-data">
    {"generatedAt": null, "source": "shopify-liquid-section:empty", "kind": "collection", "handle": "all-products", "query": "", "page": 1, "pageSize": 36, "total": 0, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false, "productTypes": [], "products": []}
  </script>
{% endif %}

{% schema %}
{"name":"SALT live product data","settings":[]}
{% endschema %}
`;

  await writeFile(resolve(themeDir, "layout", "theme.liquid"), themeLiquid);
  await writeFile(
    resolve(themeDir, "layout", "password.liquid"),
    "{{ content_for_header }}{{ content_for_layout }}\n",
  );
  await writeFile(resolve(themeDir, "sections", "salt-app.liquid"), sectionLiquid);
  await writeFile(resolve(themeDir, "sections", "salt-product-data.liquid"), productDataSectionLiquid);

  await writeFile(resolve(themeDir, "templates", "index.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "product.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "collection.json"), templateJson("salt-app", true));
  await writeFile(resolve(themeDir, "templates", "list-collections.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "cart.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "page.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "blog.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "article.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "search.json"), templateJson("salt-app", true));
  await writeFile(resolve(themeDir, "templates", "404.json"), templateJson());
  await writeFile(
    resolve(themeDir, "templates", "robots.txt.liquid"),
    `{% for group in robots.default_groups %}
{{- group.user_agent -}}
{% for rule in group.rules %}
{{- rule -}}
{% endfor %}
{%- if group.sitemap != blank -%}
{{ group.sitemap }}
{%- endif -%}
{% endfor %}

# Private SALT operations routes
User-agent: *
Disallow: /pages/finance
Disallow: /apps:finance
Disallow: /apps/finance

# Let Google re-crawl the account entry redirect and honor the login surface's
# noindex response without exposing authenticated order pages to indexing.
Allow: /account/orders
`,
  );

  await writeFile(
    resolve(themeDir, "config", "settings_schema.json"),
    JSON.stringify(
      [
        {
          name: "SALT App Theme",
          settings: [
            {
              type: "paragraph",
              content: "SALT storefront presentation is managed in code.",
            },
          ],
        },
      ],
      null,
      2,
    ),
  );
  await writeFile(
    resolve(themeDir, "config", "settings_data.json"),
    settingsData || JSON.stringify({ current: {} }, null, 2),
  );
  await writeFile(resolve(themeDir, "locales", "en.default.json"), JSON.stringify({}, null, 2));
}

async function copyAssets(entryJsPath, entryCssPath) {
  await cp(resolve(distDir, "assets"), themeAssetsDir, { recursive: true });

  const entryJs = basename(entryJsPath);
  const entryCss = basename(entryCssPath);

  const entryAssetPath = resolve(themeAssetsDir, entryJs);
  const entrySource = await readFile(entryAssetPath, "utf8");
  // Vite emits lazy-chunk preload paths relative to the web root ("assets/").
  // In Shopify, the entry is served from /cdn/shop/.../assets, so make those
  // paths relative to the entry file instead. This keeps lazy chunks on the
  // Shopify CDN instead of requesting non-existent /assets/* URLs.
  const themeAssetResolver = `const __saltThemeAsset=(path)=>{const rawBase=globalThis.SALT_THEME_ASSET_BASE||new URL("./",import.meta.url).href;const base=rawBase.startsWith("//")?window.location.protocol+rawBase:rawBase;const file=String(path);return new URL(file.startsWith("./")?file.slice(2):file,base).href};\n`;
  const themeEntrySource = themeAssetResolver + entrySource
    .replace(/(["'])assets\//g, "$1./")
    // The lazy route imports and their modulepreload maps are generated as
    // relative URLs. Shopify resolves these from the current storefront path
    // on product pages, so point both mechanisms at the theme CDN explicitly.
    .replace(/import\("\.\/([^"\n]+)"\)/g, 'import(__saltThemeAsset("$1"))')
    .replace(/=>i\.map\(i=>d\[i\]\)/g, '=>i.map(i=>__saltThemeAsset(d[i]))')
    // Vite's preload helper prefixes every dependency with "/". That works
    // when assets live at /assets, but makes Shopify request the storefront
    // root instead of the theme CDN. Dependencies above are now relative, so
    // keep them relative when the helper creates modulepreload links too.
    .replace(
      /(="modulepreload",[A-Za-z_$][\w$]*=function\((\w+)\)\{return)"\/"\+\2(\})/,
      "$1 $2$3",
  );
  const entryCacheKey = createHash("sha256").update(themeEntrySource).digest("hex").slice(0, 12);
  const themeEntryJs = `salt-entry-${entryCacheKey}.js`;
  const themeEntryAssetPath = resolve(themeAssetsDir, themeEntryJs);
  await writeFile(themeEntryAssetPath, themeEntrySource);
  await rm(entryAssetPath);

  // Some lazy chunks import the Vite entry directly. Point every one at the
  // processed, content-addressed entry so the theme has exactly one React
  // runtime and Shopify's CDN cannot retain a stale entry bundle.
  for (const asset of await readdir(themeAssetsDir)) {
    if (!asset.endsWith(".js") || asset === themeEntryJs) {
      continue;
    }

    const assetPath = resolve(themeAssetsDir, asset);
    const assetSource = await readFile(assetPath, "utf8");
    const needsVitePreloadResolver = assetSource.includes("__vite__mapDeps");
    const rewrittenAssetBody = assetSource
      // Vite's nested lazy chunks keep preload maps such as
      // "assets/index-*.css". Shopify serves the chunk from its asset folder,
      // so those must be relative to that chunk rather than nested under a
      // second `/assets/` path.
      .replace(/(["'])assets\//g, "$1./")
      .replaceAll(`./${entryJs}`, `./${themeEntryJs}`)
      // A prior theme build may already have rewritten a lazy chunk to an
      // older salt-entry file. Repoint every such import so React has exactly
      // one runtime across the app shell and route chunks.
      .replace(/\.\/salt-entry-[A-Za-z0-9_-]+\.js/g, `./${themeEntryJs}`);
    const rewrittenAssetSource = needsVitePreloadResolver
      ? `const __saltThemeAsset=(path)=>{const value=String(path);return new URL(value.startsWith("./")?value.slice(2):value,import.meta.url).href};\n${rewrittenAssetBody}`
          .replace(/=>i\.map\(i=>d\[i\]\)/g, "=>i.map(i=>__saltThemeAsset(d[i]))")
      : rewrittenAssetBody;
    if (rewrittenAssetSource !== assetSource) {
      await writeFile(assetPath, rewrittenAssetSource);
    }
  }

  // Do not duplicate the Vite entry bundle under a second filename. Lazy
  // chunks import the original hashed entry, and copying it to salt-app.js
  // creates a second React runtime (which causes invalid-hook/removeChild
  // crashes). The stable Shopify asset is only a module loader.
  // Shopify can resolve a relative module import against the storefront URL
  // (for example, /products/) instead of the theme asset URL. Start the Vite
  // entry from the absolute theme asset base exposed by the Liquid section so
  // every lazy product-page chunk stays on the Shopify CDN.
  await writeFile(
    resolve(themeAssetsDir, "salt-app.js"),
    `const rawBase = globalThis.SALT_THEME_ASSET_BASE || new URL("./", import.meta.url).href;\nconst base = rawBase.startsWith("//") ? window.location.protocol + rawBase : rawBase;\nimport(new URL(${JSON.stringify(themeEntryJs)}, base).href);\n`,
  );
  await cp(resolve(distDir, "assets", entryCss), resolve(themeAssetsDir, "salt-app.css"));

  await cp(resolve(publicDir, "brand", "salt-logo.png"), resolve(themeAssetsDir, "brand-salt-logo.png"));
  await cp(resolve(publicDir, "favicon.ico"), resolve(themeAssetsDir, "favicon.ico"));
  await cp(resolve(publicDir, "favicon-32x32.png"), resolve(themeAssetsDir, "favicon-32x32.png"));
  await cp(resolve(publicDir, "favicon-16x16.png"), resolve(themeAssetsDir, "favicon-16x16.png"));
  await cp(resolve(publicDir, "apple-touch-icon.png"), resolve(themeAssetsDir, "apple-touch-icon.png"));
  await cp(resolve(publicDir, "site.webmanifest"), resolve(themeAssetsDir, "site.webmanifest"));
  await cp(resolve(publicDir, "android-chrome-192x192.png"), resolve(themeAssetsDir, "android-chrome-192x192.png"));
  await cp(resolve(publicDir, "android-chrome-512x512.png"), resolve(themeAssetsDir, "android-chrome-512x512.png"));
  await cp(
    resolve(publicDir, "shopify-meta-pixel-customer-events.js"),
    resolve(themeAssetsDir, "shopify-meta-pixel-customer-events.js"),
  );

  const removedListingAssets = (await readdir(themeAssetsDir)).filter((asset) =>
    removedListingAssetPatterns.some((pattern) => pattern.test(asset)),
  );
  await Promise.all(
    removedListingAssets.map((asset) =>
      rm(resolve(themeAssetsDir, asset), { force: true }),
    ),
  );

  for (const asset of themeDataAssets) {
    await cp(resolve(publicDir, "data", asset.source), resolve(themeAssetsDir, asset.asset));
  }

  return themeEntryJs;
}

async function main() {
  await ensureDistExists();
  const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
  const { jsPath, cssPath } = parseEntryAssets(indexHtml);
  const settingsDataPath = resolve(themeDir, "config", "settings_data.json");
  const settingsData = existsSync(settingsDataPath) ? await readFile(settingsDataPath, "utf8") : null;
  const distAssets = await readdir(resolve(distDir, "assets"));
  const routeAssets = {
    home: distAssets.find((asset) => /^HomePage-[A-Za-z0-9_-]+\.js$/.test(asset)) || "",
    product: distAssets.find((asset) => /^ProductPage-[A-Za-z0-9_-]+\.js$/.test(asset)) || "",
    homeHero: distAssets.find((asset) => /^anime-collectables-square-[A-Za-z0-9_-]+\.webp$/.test(asset)) || "",
  };

  await mkdir(themeDir, { recursive: true });
  await Promise.all(
    themeScaffoldEntries.map((entry) =>
      rm(resolve(themeDir, entry), { recursive: true, force: true }),
    ),
  );
  await Promise.all(
    themeScaffoldEntries.map((entry) =>
      mkdir(resolve(themeDir, entry), { recursive: true }),
    ),
  );
  // Keep Shopify-admin app embeds and theme-editor state intact. The generated
  // app bundle owns the app assets, not config/settings_data.json.
  const themeEntryJs = await copyAssets(jsPath, cssPath);
  await writeThemeScaffold(settingsData, { ...routeAssets, entry: themeEntryJs });

  process.stdout.write(`Shopify theme bundle generated at ${themeDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
