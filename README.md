# SALT Online Store (React Storefront)

SALT Online Store is a production‑ready, Shopify‑backed ecommerce experience built in React/Vite and deployed both as a standalone web app and as a Shopify theme bundle. It prioritizes conversion with fast discovery, curated collections, premium product cards, real‑time checkout handoff, and integrated reviews, while maintaining strict UI/UX consistency across light and dark themes. The codebase includes automated sync tooling to generate Shopify assets, robust SEO metadata (canonical, Open Graph, structured data, sitemap/robots), and official SALT branding and favicon support for strong search visibility.

## What this app does

- Renders SALT storefront pages (`Home`, `Shop`, `Collections`, `Product`, `Cart`, `Blog`, `About`, `Contact`, policy pages).
- Pulls product/collection/about/blog snapshot data from Shopify via sync scripts.
- Uses live Shopify handoff for checkout/cart URLs.
- Uses Judge.me for ratings/reviews and review submission.
- Includes `/bulk-review` admin route for CSV/XLSX bulk review upload to Judge.me.
- Builds a Shopify theme package (`shopify-theme/`) from this app bundle.
- Stores cart and order-history state locally on the device/browser. No Supabase backend is used.

## Stack

- React + TypeScript + Vite
- Tailwind + shadcn-ui
- TanStack Query
- React Router

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Dev server defaults:

- Local: `http://localhost:8080/`
- Network: `http://<your-lan-ip>:8080/`

## NPM scripts

- `npm run dev`: start local dev server.
- `npm run build`: production build + compatibility aliases in `dist/assets`.
- `npm run build:web`: Vite production build without the Shopify data refresh wrapper.
- `npm run build:dev`: development-mode build.
- `npm run test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run shopify:product-metafields:ensure`: ensure the product metafield definitions used by the storefront exist in Shopify through Shopify CLI store auth.
- `npm run sync:data`: pull Shopify snapshot JSON into `public/data`.
- `npm run seo`: run the Shopify SEO pipeline for the current scope, including Google variant metafields, SEO/pricing reconciliation, variant image mapping, and merchandising metafields.
- `npm run seo:all-products:dry-run`: dry-run the full catalog SEO pipeline.
- `npm run seo:all-products:apply`: apply the full catalog SEO pipeline.
- `npm run seo:new-products:dry-run`: dry-run the new-products-only SEO pipeline.
- `npm run seo:new-products:apply`: apply the new-products-only SEO pipeline.
- `npm run shopify:seo:release`: guarded SEO apply flow with local audit, dry-run, and live apply.
- `npm run shopify:seo:full-catalog:apply`: direct full-catalog SEO apply.
- `npm run shopify:seo:new-products:apply`: direct new-products-only SEO apply.
- `npm run shopify:variant-google-metafields:apply`: bulk update Google variant metafields.
- `npm run shopify:variant-image-mapping:apply`: bulk associate variants to the best matching product images.
- `npm run shopify:product-metafields:backfill:apply`: backfill merchandising metafields for products.
- `npm run release:overnight`: wait for the current SEO apply to finish, then launch the full release pipeline and log progress to `output/overnight-release.log`.
- `npm run build:shopify-theme`: build app, then generate `shopify-theme/` package.
- `npm run theme:bundle`: generate the Shopify theme package from an existing `dist/`.
- `npm run release`: run the full SALT release pipeline with version output and staged failure reporting.

## Environment variables

Use `.env.local` for local development.

- `VITE_SHOPIFY_STOREFRONT_URL`: Shopify storefront base URL.
- `VITE_SALT_SHOP_URL`: canonical storefront URL used by runtime fallbacks.
- `VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`: Shopify Customer Account API client ID used for login and order history.
- `VITE_DATA_MODE`: data mode (`live` recommended).
- `VITE_SALT_PAGE_LIMIT`: page size for sync/data fetches.
- `VITE_ABOUT_PAGE_HANDLE`: About page handle.
- `VITE_BLOG_HANDLE`: default blog handle.
- `VITE_JUDGEME_SHOP_DOMAIN`: Judge.me shop domain.
- `VITE_JUDGEME_PUBLIC_TOKEN`: Judge.me public token.
- `VITE_JUDGEME_PRIVATE_TOKEN`: optional Judge.me private token for native bulk write mode.
- `VITE_ONESIGNAL_APP_ID`: optional OneSignal app ID for native push notifications.
- `VITE_ENABLE_SHOPIFY_INBOX`: optional chat toggle.
- `VITE_ENABLE_MOOSEDESK`: optional chat toggle.

## Shopify data sync

Sync latest product/collection/about/blog snapshots:

```bash
SALT_SHOP_URL=https://0309d3-72.myshopify.com \
SALT_PAGE_LIMIT=250 \
SALT_ABOUT_HANDLE=about-us \
SALT_BLOG_HANDLE=posts,news,blog,journal,updates,whom-we-serve \
npm run sync:data
```

Outputs:

- `public/data/products.json` (small manifest)
- `public/data/products-0001.json` and additional bounded product shards
- `public/data/collections.json`
- `public/data/collection-products.json`
- `public/data/about.json`
- `public/data/blog-posts.json`

The sync path also ensures the product metafield definitions required by the storefront are present in Shopify before it refreshes the local snapshot files.

The full product catalog is split into 45 MiB shards by default so every generated file remains below GitHub's 100 MB single-file limit. Set `SALT_PRODUCTS_SHARD_MAX_BYTES` to lower the limit when needed; generation hard-caps the value at 90 MiB. The storefront resolves the manifest and fetches shards in parallel; ordinary discovery pages use the smaller `product-search.json` index instead of downloading the full catalog.

## Shopify orders bundle update

Apply the 35% price uplift and buy-more-save-more tiers from the orders export:

```bash
npm run shopify:orders-bundle:dry-run -- --input /Users/mac/Downloads/orders_export_1.csv
npm run shopify:orders-bundle:apply -- --input /Users/mac/Downloads/orders_export_1.csv
```

Default manifest output:

- `output/orders_export_1.bundle-manifest.json`

The script resolves Shopify products by handle first, then falls back to title search, and updates matching variants with `productVariantsBulkUpdate`.

## Judge.me reviews behavior

- Product-level review counts are sourced from Judge.me preview badge data.
- Review counts shown in UI are total published reviews (verified and unverified).
- Verified reviewers are marked with a tick badge on review cards.
- New review submissions trigger immediate and delayed refetches to reduce lag.
- `/bulk-review` now runs fully native API submission for all rows, including rows with date fields.

If a review is visible in Judge.me admin but not in storefront UI, confirm it is published/public in Judge.me.

### Bulk review import notes

- `/bulk-review` supports `product_url`, `product_handle`, or `product_id` mapping in one file.
- Date aliases are supported: `review_date`, `date`, `created_at`, `published_at`, `posted_at`.
- Date rows are sent with multiple timestamp fields (`created_at`, `review_date`, `published_at`) in native API mode.
- Judge.me may still normalize timestamps to current submission time depending on API permissions/app behavior.
- Submission summary reports date rows as `kept`, `overridden`, or `pending confirmation`.

## Build Shopify theme package

```bash
npm run build:shopify-theme
```

Generated folder: `shopify-theme/`

Includes:

- `layout/theme.liquid`
- `sections/salt-app.liquid`
- templates (`index`, `product`, `collection`, `cart`, `page`, `blog`, `article`, `search`, `404`)
- assets: bundled app JS/CSS + logo + synced JSON

Push with Shopify CLI:

```bash
npx @shopify/cli theme push --path shopify-theme --store 0309d3-72.myshopify.com
```

## Scheduled Storefront Refresh

`.github/workflows/storefront-refresh.yml` runs every five minutes without requiring a visitor. It refreshes Admin prices, products, availability, collections, collection membership, search data, homepage merchandising, and the live Shopify theme. The workflow skips the upload when the catalog content is unchanged.

`.github/workflows/seo-maintenance.yml` runs the safe new-product SEO reconciliation every six hours. A full SEO rewrite is intentionally not run every five minutes because it would consume Shopify API budget and repeatedly churn unchanged metadata.

Configure these GitHub repository secrets before enabling the schedules:

- `SHOPIFY_ADMIN_ACCESS_TOKEN`: Shopify Admin API token with product, collection, SEO, and read order access.
- `SALT_THEME_REPO_TOKEN`: token that can push `Anushi0502/salt-online-store-v2`.

## Private Finance Workspace

The `/pages/finance` route is the private, server-backed workspace. Legacy `/apps:finance` and `/apps/finance` links still resolve to it, but the canonical storefront path is `/pages/finance`. It never puts Shopify Admin or DSers credentials in the browser bundle.

Configure these deployment-only variables before publishing it:

- `SHOPIFY_ADMIN_ACCESS_TOKEN`: server-only Admin API token with order, inventory/cost, `read_shopify_payments_payouts`, and Shopify app billing access. Shopify Payments payout access also requires merchant approval in Shopify.
- `FINANCE_APP_PASSWORD_HASH`: scrypt hash generated with `npm run finance:hash-password -- '<password>'`.
- `FINANCE_SESSION_SECRET`: long random value used to sign the HTTP-only finance session cookie.
- `FINANCE_TIMEZONE`: reporting timezone, for example `America/New_York`.
- `FINANCE_SUBSCRIPTIONS_JSON`: JSON array of DSers, domain, and other recurring costs that are not owned by the SALT app. SALT app subscriptions are read automatically from `currentAppInstallation`.
- `FINANCE_DSER_COSTS_JSON`: optional DSers export mapping keyed by variant ID, variant GID, or SKU, for example `[{"variantId":"44359087816803","cost":4.25}]`.
- `FINANCE_PAYOUTS_JSON`: optional reconciled payout export fallback. It is used only when Shopify payout access is unavailable and accepts `amount`/`fee`/`net` or their `*Cents` equivalents.

The backend tries Shopify Payments GraphQL first and REST second. It never fabricates a payout or supplier cost when Shopify or DSers has not supplied one; those records remain visible as reconciliation exceptions.

Use the supplied finance password only when generating the hash. Do not commit the plaintext password or put any of these variables behind a `VITE_` prefix.

## Release

Run the full release workflow from the repository root:

```bash
npm run release
```

That single command:

1. Ensures the Shopify product metafield definitions.
2. Refreshes Shopify snapshot data.
3. Reconciles and verifies Shopify SEO/product fields.
4. Maps variant images.
5. Backfills merchandising metafields.
6. Refreshes Shopify snapshot data again.
7. Verifies merchandising backfill.
8. Builds the Vite web app.
9. Generates the Shopify theme bundle.
10. Syncs the iOS Capacitor shell.
11. Syncs the Android Capacitor shell.

### Overnight release

If you need to let the catalog jobs finish overnight, use:

```bash
npm run release:overnight
```

This waits for the current SEO/apply manifest to report completion, then runs `npm run release` automatically.

The release script prints Node, npm, Vite, and Capacitor CLI versions before starting, then stops immediately on the first failing stage and reports which step failed.

The metafield-definition stage uses Shopify CLI store auth. If the store session is missing, run:

```bash
shopify store auth --store 0309d3-72.myshopify.com
```

## Quality checks

Before deploy:

```bash
npm run build
npm run test -- --run
```

## Notes

- This is the React storefront source project.
- If your production theme is maintained in a separate repository/folder (for example `salt-online-store-v2`), copy/sync the generated assets/templates there as part of release workflow.
