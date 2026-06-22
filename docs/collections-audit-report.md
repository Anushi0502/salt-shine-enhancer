# Shopify Collection Audit Report

> Generated from live Shopify Admin data and the storefront hierarchy config on 2026-06-22.

## Scope

- Source of truth reviewed: `src/lib/collection-hierarchy.ts`, `src/lib/site-navigation.ts`, and live Shopify collection data fetched through Shopify CLI.
- Goal: align live Shopify collections with the storefront mega menu, remove broken references, and reduce redundant promo collections without deleting anything.

## What I Found

### Live collections that already match the mega menu

- `cookware` for Kitchen & Dining
- `home-decor` for Home & Decor
- `men-collection` for Clothing
- `shoes` for Shoes & Accessories
- `garden-tools` for Garden & Tools
- `pet-assocerries` for Pet Supplies
- `medical-accessories` for Health, Wellness & Planners
- `gifts` for Gifts & Lifestyle
- `shopping-bags-jute-bags` for Travel & Portable Essentials
- `new-arrivals` for New Arrivals
- `appplaza-best-sellers` for Best Sellers
- `unique-products` for Trending Now

### Problems

- `digital-products` was referenced in the storefront hierarchy but does not exist as a live Shopify collection.
- `winter-wear` and `deals-sale` were overlapping promo collections. The storefront code was still pointing at `winter-wear`, while `deals-sale` was the clearer canonical handle/title pair.
- Several collections outside the mega menu remain in Shopify as intended holdouts or legacy topical pages:
  - `all-products`
  - `apparel`
  - `bundle-deals`
  - `deals-sale`
  - `gifts-for-her`
  - `gifts-for-him`
  - `housewarming-gifts`
  - `travel-gifts`
  - `camping-gifts`
  - `pet-lover-gifts`
  - `self-care-gifts`
  - `holiday-gifts`
  - `backyard-garden-gifts`
  - `under-10`
  - `under-25`
  - `under-50`
  - `under-100`
  - `premium-picks`

## Proposed Merge / Reassignment

- Keep `deals-sale` as the canonical promo collection used by the storefront.
- Rename `winter-wear` to a legacy/archive handle with redirect preserved, instead of deleting it.
- Remove the broken `digital-products` branch from the storefront hierarchy and related validation code.
- Leave non-menu collections in place until there is explicit confirmation to remove or repurpose them.

## Applied Code Changes

- Updated the storefront hierarchy to use `deals-sale` instead of `winter-wear`.
- Removed `digital-products` from the live hierarchy path and resource hub validation hints.
- Updated the promo banner and header link tests to match the new canonical promo route.

## Applied Shopify Admin Work

- Updated the live `deals-sale` collection to the canonical promo title, SEO text, and price-reduced rule.
- Renamed the old `winter-wear` collection to `clearance-archive` with redirect preservation.
- Refreshed `public/data/collections.json` and `public/data/collection-products.json` from the storefront endpoints so VS Code now reflects the live handles.

