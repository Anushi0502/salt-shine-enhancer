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
- `npm run sync:data`: pull Shopify snapshot JSON into `public/data`.
- `npm run build:shopify-theme`: build app, then generate `shopify-theme/` package.
- `npm run theme:bundle`: generate the Shopify theme package from an existing `dist/`.
- `npm run release`: run the full SALT release pipeline with version output and staged failure reporting.

## Environment variables

Use `.env.local` for local development.

- `VITE_SHOPIFY_STOREFRONT_URL`: Shopify storefront base URL.
- `VITE_SALT_SHOP_URL`: canonical storefront URL used by runtime fallbacks.
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

- `public/data/products.json`
- `public/data/collections.json`
- `public/data/collection-products.json`
- `public/data/about.json`
- `public/data/blog-posts.json`

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

## Release

Run the full release workflow from the repository root:

```bash
npm run release
```

That single command:

1. Refreshes Shopify snapshot data.
2. Builds the Vite web app.
3. Generates the Shopify theme bundle.
4. Syncs the iOS Capacitor shell.
5. Syncs the Android Capacitor shell.

The release script prints Node, npm, Vite, and Capacitor CLI versions before starting, then stops immediately on the first failing stage and reports which step failed.

## Quality checks

Before deploy:

```bash
npm run build
npm run test -- --run
```

## Notes

- This is the React storefront source project.
- If your production theme is maintained in a separate repository/folder (for example `salt-online-store-v2`), copy/sync the generated assets/templates there as part of release workflow.
