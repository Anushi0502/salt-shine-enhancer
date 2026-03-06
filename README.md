# SALT Online Store (React Storefront)

Conversion-focused React storefront for SALT, integrated with Shopify catalog/checkout and Judge.me reviews.

## What this app does

- Renders SALT storefront pages (`Home`, `Shop`, `Collections`, `Product`, `Cart`, `Blog`, `About`, `Contact`, policy pages).
- Pulls product/collection/about/blog snapshot data from Shopify via sync scripts.
- Uses live Shopify handoff for checkout/cart URLs.
- Uses Judge.me for ratings/reviews and review submission.
- Builds a Shopify theme package (`shopify-theme/`) from this app bundle.

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
- `npm run build:dev`: development-mode build.
- `npm run test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run sync:data`: pull Shopify snapshot JSON into `public/data`.
- `npm run build:shopify-theme`: build app, then generate `shopify-theme/` package.

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

If a review is visible in Judge.me admin but not in storefront UI, confirm it is published/public in Judge.me.

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

## Quality checks

Before deploy

```bash
npm run build
npm run test -- --run
```

## Notes

- This is the React storefront source project.
- If your production theme is maintained in a separate repository/folder (for example `salt-online-store-v2`), copy/sync the generated assets/templates there as part of release workflow.
