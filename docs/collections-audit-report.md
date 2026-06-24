# Shopify Collection Audit Report

> Generated from live Shopify Admin data, the checked-in storefront snapshots, and the canonical nav registry on 2026-06-24.

## Scope

- Source of truth reviewed: `src/lib/site-navigation.ts`, `src/lib/collection-hierarchy.ts`, `public/data/collections.json`, `public/data/collection-products.json`, and the live Admin snapshot captured through Shopify CLI.
- Goal: keep the eight primary mega-menu collections stable, preserve SEO-friendly routes, and isolate legacy promo buckets without deleting anything.

## Audit Summary

- Live Shopify Admin collections inspected: 48
- Missing mega-menu handles in live Admin: 0
- Live zero-count collections: 0
- Extra live collections outside the primary mega menu: 25

## Canonical Mega-Menu Collections

- `books` for Senior Living Solutions
- `cookware` for Home & Kitchen
- `home-decor` for Home Decor & Lighting
- `pet-assocerries` for Pet Essentials
- `face-mask` for Health & Wellness
- `shopping-bags-jute-bags` for Travel & Outdoor
- `gifts` for Gifts Collection
- `unique-products` for Trending Finds

## Live Collections Outside the Primary Mega Menu

These remain in Shopify as legacy, promotional, or broader browse buckets:

- `all-products`
- `apparel`
- `appplaza-best-sellers`
- `backyard-garden-gifts`
- `bundle-deals`
- `camping-gifts`
- `candles`
- `cooking-essential`
- `garden-tools`
- `gifts-for-her`
- `gifts-for-him`
- `gloves`
- `holiday-gifts`
- `housewarming-gifts`
- `medical-accessories`
- `men-collection`
- `pet-lover-gifts`
- `premium-picks`
- `self-care-gifts`
- `shoes`
- `shopping-bag-market-trolley-bag-with-wheels-collapsible`
- `summer-collection`
- `travel-gifts`
- `under-10`
- `under-100`
- `under-25`
- `under-50`
- `clearance-archive`

## Overlap Findings

- `cooking-essential` is a focused subset of `cookware` and should stay treated as a sub-route, not a separate top-level family.
- `apparel` overlaps strongly with `men-collection`, `jeans`, `t-shirt`, `trousers`, and `robe`; it should remain a legacy fashion bucket rather than a menu-facing family.
- `deals-sale`, `under-10`, `under-25`, `under-35`, `under-50`, `under-100`, and the clearance bucket are broad promo-style buckets and should stay secondary to the eight primary collections.
- The live Admin snapshot uses `clearance-archive` for the clearance bucket; `winter-wear` is the legacy alias so old links keep working while the live handle stays canonical.

## Proposed Reconciliation

- Keep the current eight canonical mega-menu families unchanged.
- Treat `winter-wear` as a legacy alias of `clearance-archive` in the storefront code and preserve redirects for old URLs.
- Smart-merge the obvious overlap buckets so the storefront treats them as one family at route and product-matching time:
  - `cooking-essential` -> `cookware`
  - `apparel` -> `men-collection`
  - `winter-wear` -> `clearance-archive`
- Keep `deals-sale` as the canonical promo collection used by the header and featured routes.
- Leave all non-menu collections in place until there is an explicit request to merge, retitle, or delete them in Shopify Admin.

## Applied Repository Changes

- Lifted the home hierarchy registry into `src/lib/site-navigation.ts` so the header, drawer, and homepage now consume one shared collection map.
- Added smart-merge handle normalization so `cooking-essential`, `apparel`, and `winter-wear` resolve to their canonical routes while preserving legacy URLs.
- Added merge-aware collection matching and merged product-id lookups so Shopify CLI-driven dashboard syncs treat overlapping buckets as one family.
- Updated the collection audit and navigation tests to assert the canonical route behavior.

## Snapshot Sync

- `public/data/collections.json` and `public/data/collection-products.json` were refreshed locally from the live storefront/Admin source through the Shopify CLI sync flow on 2026-06-24.
- Re-run the same sync command after future collection changes so the checked-in snapshots stay aligned with Admin.
