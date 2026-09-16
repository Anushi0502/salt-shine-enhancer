# SALT Release Bottleneck Report

Generated: 2026-09-16T11:45:21.325Z
Profile: catalog
Status: running
Measured: 5/66 steps (3.82 minutes)
Bottleneck threshold: 1.00 minutes

## Top Bottlenecks

| Step | Category | Duration | Share | Status |
| ---: | --- | ---: | ---: | --- |
| 5 | shopify-io | 3.75 min | 98.09% | bottleneck |
  Recommendation: Reuse the complete variant map, process cost bands in bounded batches, and read back only changed variants.
| 1 | local-model | 0.05 min | 1.27% | bottleneck |
  Recommendation: Reuse fingerprinted local artifacts and keep MLX/Metal inference bounded by memory while batching CPU preparation.
| 2 | local-model | 0.01 min | 0.32% | bottleneck |
  Recommendation: Reuse fingerprinted local artifacts and keep MLX/Metal inference bounded by memory while batching CPU preparation.
| 3 | local-model | 0.01 min | 0.24% | bottleneck |
  Recommendation: Reuse fingerprinted local artifacts and keep MLX/Metal inference bounded by memory while batching CPU preparation.
| 4 | local-model | 0 min | 0.07% | bottleneck |
  Recommendation: Reuse fingerprinted local artifacts and keep MLX/Metal inference bounded by memory while batching CPU preparation.

## All Steps

| Step | Label | Duration | Status |
| ---: | --- | ---: | --- |
| 1 | Audit visual taxonomy training inputs and 25 GB shard policy | 0.05 min | bottleneck |
| 2 | Ensure verified Metal visual taxonomy model and raw-data retention gate | 0.01 min | bottleneck |
| 3 | Verify trained 128M-record catalog knowledge model | 0.01 min | bottleneck |
| 4 | Verify approved catalog taxonomy release | 0 min | bottleneck |
| 5 | Scan and remove active products missing live variant cost | 3.75 min | bottleneck |
| 6 | Refresh Shopify data: Shopify product and collection data | - min | pending |
| 7 | Refresh Shopify data: recently ordered products and managed collection membership (parallel) | - min | pending |
| 8 | Dry-run active product option and unit-cost anomaly repair | - min | pending |
| 9 | Apply deterministic option repairs and draft high-cost outliers | - min | pending |
| 10 | Verify product anomaly repairs with live readback | - min | pending |
| 11 | Refresh Shopify data after product anomaly repairs: Shopify product and collection data | - min | pending |
| 12 | Refresh Shopify data after product anomaly repairs: recently ordered products and managed collection membership (parallel) | - min | pending |
| 13 | Build shared full-catalog release snapshot | - min | pending |
| 14 | Read live Shopify tag inventory | - min | pending |
| 15 | Regenerate catalog taxonomy and preserved-tag audit | - min | pending |
| 16 | Validate refreshed catalog taxonomy | - min | pending |
| 17 | Build visual taxonomy review queue | - min | pending |
| 18 | Ensure local free-use SigLIP visual candidate is downloaded | - min | pending |
| 19 | Verify downloaded local SigLIP visual candidate on Metal | - min | pending |
| 20 | Run local SigLIP visual review assist for unresolved products | - min | pending |
| 21 | Run verified Metal visual taxonomy model when installed | - min | pending |
| 22 | Require image-backed taxonomy evidence | - min | pending |
| 23 | Validate deterministic collection classification repairs | - min | pending |
| 24 | Dry-run exact full-catalog collection reconciliation | - min | pending |
| 25 | Apply exact full-catalog collection reconciliation | - min | pending |
| 26 | Refresh Shopify data after collection reconciliation: Shopify product and collection data | - min | pending |
| 27 | Refresh Shopify data after collection reconciliation: recently ordered products and managed collection membership (parallel) | - min | pending |
| 28 | Finalize supervised visual decisions and zero the review queue | - min | pending |
| 29 | Ensure Shopify product metafield definitions | - min | pending |
| 30 | Verify approved live cost-based pricing policy | - min | pending |
| 31 | Ensure Shopify variant-specific SEO metafield definitions | - min | pending |
| 32 | Dry-run full-catalog cost-band variant pricing | - min | pending |
| 33 | Apply full-catalog cost-band variant pricing | - min | pending |
| 34 | Verify full-catalog cost-band variant pricing and compare-at values | - min | pending |
| 35 | Prepare GPT SEO enrichment in 500-product checkpoints | - min | pending |
| 36 | Reconcile and verify Shopify SEO/product fields | - min | pending |
| 37 | Delete verified active zero-image products | - min | pending |
| 38 | Publish every active product to all sales channels | - min | pending |
| 39 | Refresh Shopify data after final product publication: Shopify product and collection data | - min | pending |
| 40 | Refresh Shopify data after final product publication: recently ordered products and managed collection membership (parallel) | - min | pending |
| 41 | Apply Shopify merchandising metafield backfill after catalog boundary changes | - min | pending |
| 42 | Refresh Shopify data after merchandising backfill: Shopify product and collection data | - min | pending |
| 43 | Refresh Shopify data after merchandising backfill: recently ordered products and managed collection membership (parallel) | - min | pending |
| 44 | Apply and verify GPT product-type metafields in 500-product checkpoints | - min | pending |
| 45 | Verify every active product has product-specific SEO and metafields | - min | pending |
| 46 | Apply final current-generation collection reconciliation | - min | pending |
| 47 | Refresh live merchandising data after final catalog writes: Shopify product and collection data | - min | pending |
| 48 | Refresh live merchandising data after final catalog writes | - min | pending |
| 49 | Verify exact collection membership and price rules | - min | pending |
| 50 | Verify Shopify merchandising backfill | - min | pending |
| 51 | Validate final catalog taxonomy snapshot | - min | pending |
| 52 | Build web app | - min | pending |
| 53 | Generate Shopify theme bundle | - min | pending |
| 54 | Dry-run approved similar-purpose collection merges | - min | pending |
| 55 | Apply approved similar-purpose collection merges with live readback | - min | pending |
| 56 | Snapshot and dry-run guarded SALT tag and collection cleanup | - min | pending |
| 57 | Abort on ambiguous SALT tag or collection cleanup changes | - min | pending |
| 58 | Apply verified SALT tag and collection cleanup with live readback | - min | pending |
| 59 | Reconcile variant-aware SEO profiles after final catalog writes | - min | pending |
| 60 | Verify variant-aware SEO profiles for every active variant | - min | pending |
| 61 | Dry-run daily manual collection shuffle | - min | pending |
| 62 | Apply daily manual collection shuffle with live readback | - min | pending |
| 63 | Verify daily manual collection shuffle | - min | pending |
| 64 | Repair final governed collection sources before strict audit | - min | pending |
| 65 | Strict live audit of repaired collection classification | - min | pending |
| 66 | Final live-readback gate against the applied catalog generation | - min | pending |

