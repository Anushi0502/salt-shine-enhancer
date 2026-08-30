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
- `npm run catalog:taxonomy:audit`: create the read-only tag, collection, and review proposal for the current catalog.
- `npm run catalog:taxonomy:validate`: fail if a product is ambiguous but has managed taxonomy tags, or if product knowledge records collapse.
- `npm run catalog:image-review:build`: generate the local image-review queue for unresolved taxonomy evidence.
- `npm run catalog:image-review:validate`: block release until every review-required product has image-backed classification evidence.
- `npm run catalog:vision:model:verify`: verify an installed Metal/MLX visual taxonomy adapter, its checksums, and its post-training raw-data purge record.
- `npm run catalog:vision:model:stage`: stage a signed local/remote image manifest into an external, resumable raw corpus with checksum verification.
- `npm run catalog:vision:model:ensure`: reuse a verified fine-tuned visual classifier or, when all training inputs are configured, train it once before the release continues.
- `npm run catalog:vision:model:train`: train the visual taxonomy adapter from a marked, human-reviewed image corpus; the default lifecycle purges the raw corpus only after artifact and metric verification.
- `npm run catalog:taxonomy:scale-check`: prove 500,000 repeated-type products retain separate knowledge identities.
- `npm run shopify:products:zero-images:dry-run`: freshly identify active zero-image products before any deletion.
- `npm run shopify:publications:all:dry-run`: read all active products and sales channels, then plan the final all-channel publication pass.
- `npm run shopify:seo:release`: approval-gated SEO apply flow with local validation, dry-run, and live apply. It preserves Shopify prices and existing tags.
- `npm run shopify:seo:full-catalog:apply`: direct full-catalog SEO apply.

SEO reads every Shopify variant for product understanding, but it never updates
variant `price` or `compareAtPrice`. Quality, size, color, and bundle variants
keep their independently configured Shopify prices.
- `npm run shopify:seo:new-products:apply`: direct new-products-only SEO apply.
- `npm run shopify:variant-google-metafields:apply`: bulk update Google variant metafields.
- `npm run shopify:variant-image-mapping:apply`: bulk associate variants to the best matching product images.
- `npm run shopify:product-metafields:backfill:apply`: backfill merchandising metafields for products.
- `npm run release:overnight`: wait for the current SEO apply to finish, then launch the full release pipeline and log progress to `output/overnight-release.log`.
- `npm run release:schedule:install`: install or replace the always-on macOS launchd watcher that owns the canonical release, monitors checkpoints, notifies on errors, and resumes guarded failures without a competing unsupervised release.
- `npm run release:products`: run the frozen product-cohort release path. It requires `output/new-product-cohort-catalog.json` and `output/new-product-cohort-handles.json`, then scopes SEO, metafields, mappings, zero-image cleanup, publication, and storefront/theme rebuild to those handles only.
- `npm run build:shopify-theme`: build app, then generate `shopify-theme/` package.
- `npm run theme:bundle`: generate the Shopify theme package from an existing `dist/`.
- `npm run release`: run the full SALT release pipeline from step 1 with version output and staged failure reporting.
- `npm run release -- --resume`: resume the last failed or interrupted full release from its persisted phase checkpoint.

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

The canonical `release` and `release:daily` workflows do not generate or ship the product, search, or home listing payloads. Their Shopify refresh stages pass `--skip-generated-listings` and keep the temporary full catalog only in ignored `output/release-catalog-source.json` for release audits and mutations. The manual `sync:data` command remains available when a local full snapshot is explicitly needed.

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
- `FINANCE_SUBSCRIPTIONS_JSON`: JSON array of DSers, domain, and other recurring costs that are not owned by the SALT app. SALT app subscriptions are read automatically from `currentAppInstallation`. When this variable is absent or `[]`, the finance view uses the current merchant-provided Shopify Grow charge ($19.99/month) plus the DSers Advanced public-plan reference ($19.90/month), and labels that source for invoice verification.
- `FINANCE_DSER_COSTS_JSON`: optional DSers export mapping keyed by variant ID, variant GID, or SKU, for example `[{"variantId":"44359087816803","cost":4.25}]`.
- `FINANCE_PAYOUTS_JSON`: optional reconciled payout export fallback. It is used only when Shopify payout access is unavailable and accepts `amount`/`fee`/`net` or their `*Cents` equivalents.
- `FINANCE_RECONCILIATION_JSON`: optional workbook/cash bridge. It accepts `{ "source": "Store -2026.xlsx", "rows": [{ "month": "July 2026", "pendingPayout": 1187.29, "payoutPaid": 3448.38, "orderCost": 1662.81, "billCost": 1633.67, "profit": 1339.19 }] }`; each row can be period-scoped with `start`/`end`. This is displayed as a manual cash reconciliation and is kept separate from Shopify accrual profit. `profit` is preserved when supplied; otherwise it is calculated as payout plus pending cash less order cost, bills, campaign cost, and fees.

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

### Visual model data lifecycle

The checked-in 128M-record catalog knowledge model is a deterministic text-evidence model. The optional visual model is a Metal/MLX fine-tuned image-taxonomy classifier: a declared fine-tuning command adapts a base image encoder over the signed corpus, then a Metal/MLX taxonomy head trains on embeddings emitted by that fine-tuned encoder. It requires a labeled corpus of at least 50,000,000,000 unique bytes, product-isolated train/validation/test splits, and human-reviewed or verified labels. The corpus directory must contain a `.salt-visual-corpus.json` marker with `{"kind":"salt-visual-training-corpus","datasetId":"...","deleteAfterTraining":true}`. The base and fine-tuned encoder checkpoints must be stored outside that corpus.

Example training invocation:

```bash
npm run catalog:vision:model:train -- \
  --dataset-dir /external/salt-visual-corpus \
  --labels-manifest /external/salt-visual-labels.jsonl \
  --base-checkpoint /external/checkpoints/image-encoder.mlpackage \
  --encoder-command-json '["python3","/external/encode-images.py"]' \
  --encoder-train-command-json '["python3","/external/finetune-images.py"]' \
  --fine-tuned-checkpoint-output /external/checkpoints/salt-visual-encoder-finetuned.safetensors
```

The encoder fine-tuning command receives `manifestPath datasetPath labelsPath baseCheckpointPath outputCheckpointPath` and must perform real Metal fine-tuning, write the non-empty output checkpoint, and write `${outputCheckpointPath}.training.json` containing `fineTuned:true`, `device:"metal"`, positive `steps`, the signed `datasetManifestSha256`, and matching `baseCheckpointSha256` and `outputCheckpointSha256` values. The encoder output is then streamed JSONL embeddings from that fine-tuned checkpoint. `catalog:vision:model:stage` can first materialize a signed manifest of checksum-verified local files or URLs into an external corpus, resuming files that are already exact. Metal/MLX training uses class-balanced loss and refuses to install a head for any label absent from the training split. It writes a manifest-fingerprinted epoch checkpoint outside the raw corpus, so an interrupted job can resume without reprocessing completed epochs. The first release preflight uses `catalog:vision:model:ensure`: it reuses a verified model, stages and trains automatically only when the complete source/corpus, labels, base checkpoint, fine-tuning command, inference command, fine-tuned checkpoint path, and signed fine-tuning report are present, and rejects partial configuration. For launchd operation, those non-secret paths and encoder commands may be stored in `output/visual-taxonomy-training-config.json` using the keys `sourceManifest`, `datasetDir`, `labelsManifest`, `stagedLabelsManifest`, `baseCheckpoint`, `encoderCommandJson`, `encoderTrainCommandJson`, and `fineTunedEncoderCheckpoint`; environment variables override the file. After the final model, weights, metrics, taxonomy fingerprint, both encoder checkpoint checksums, and signed fine-tuning report are verified, the marked raw corpus is always removed and the artifact records the purged byte and image counts against the signed manifest; retention cannot be enabled for a successful training run, while failed runs retain the checkpoint and corpus for a compatible resume. The release never modifies system swap settings: large corpora are streamed and macOS manages swap normally. If neither a model nor a complete training configuration exists, release continues with the existing deterministic and explicit fallback gates; if an installed model is stale, unpurged, or incompatible, release stops rather than silently using it.

For catalog-scale preparation, `catalog:vision:catalog-candidates` derives a candidate manifest only from active Shopify catalog images whose current deterministic taxonomy is already resolved. `catalog:vision:catalog-candidates:hydrate` records exact source bytes and SHA-256 checksums without retaining raw images, and `catalog:vision:catalog-candidates:prepare` creates the external shard configuration after the 50 GB target is reached. These records are marked `deterministic-candidate-only`; the resulting model is evidence-only and `catalog:vision:model:infer` refuses to publish its output unless a separate explicit review policy enables it. The release's deterministic taxonomy and fallback gates remain authoritative.

`catalog:vision:open-images:manifest` can add a separate, source-backed candidate corpus when the catalog image projection is smaller than the training target. It streams the official Open Images V7 human-verification and image metadata files, keeps only explicit Creative Commons Attribution records, preserves the image landing page/author/license evidence, and maps only a checked-in set of object labels to existing taxonomy rules. Records are marked `external-human-verified-candidate` and `candidateOnly`; they are training evidence only and cannot publish or override catalog classification. The candidate supervisor runs this supplemental path after catalog hydration is exhausted, hydrates it with the same checksum/readback lifecycle, and retains no raw images after successful training.

The background release watcher runs at login, triggers one canonical `npm run release:daily` run after 12:00 PM local time each day, and owns that release child. Set `SALT_RELEASE_WATCHER_RELEASE_SCRIPT=release` only when a full catalog release is intentionally required. It also repairs detected drift outside the scheduled run. It performs the full active-catalog classification and collection reconciliation in bounded batches, then runs variant-aware SEO, categories, metafields, pricing, publication, verification, web build, and Shopify theme generation. It skips mobile shell sync for unattended runs, writes live checkpoint progress, sends macOS notifications for stale or failed runs, and uses the persisted run state for a compatible resume after interruption. This replaces the older unsupervised one-shot launchd job.

Install or replace the schedule with:

```bash
npm run release:schedule:install
```

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
