# SALT Inner-Page Enhancement Checklist

Scope: improve all non-home pages while preserving the homepage UI exactly as-is.

## Current Status (Execution Board)

- [x] Homepage UI freeze rule enforced for all ongoing work.
- [x] Collection page desktop filter sidebar is hideable.
- [x] Desktop filters are hidden by default.
- [x] Mobile filter interaction is inline (not full-screen popup).
- [x] Product card duplicate price/action block issue fixed.
- [x] Collection page sticky toolbar polish + chips refinement pass.
- [x] Product page conversion layout pass (source-verified; live route remains heavy for browser readback).
- [x] Search relevance/predictive suggestions pass.
- [x] Cart reassurance + hierarchy pass.

## 0) Hard Guardrail (Must Pass First)

- [ ] Do not modify homepage layout, spacing, typography, tile styles, section order, banners, product-card visuals, or promotion logic.
- [ ] Keep homepage component tree untouched in `src/pages/HomePage.tsx`.
- [ ] Treat homepage as the design reference for tokens and merchandising tone only.
- [ ] Reject any change request that introduces a second design language.

## 1) Design DNA Extraction (From Home, Applied to Inner Pages)

- [ ] Inventory and normalize reusable tokens from the existing storefront look:
  - [ ] Colors
  - [ ] Typography scales
  - [ ] Spacing rhythm
  - [ ] Radius/shadow style
  - [ ] CTA/button heights and states
  - [ ] Card/image treatment
- [ ] Keep those tokens in shared styling and apply to inner pages only.
- [ ] Ensure hover/focus/active states are consistent across non-home pages.

## 2) Collection Pages (`src/pages/ShopPage.tsx`, `src/pages/CollectionsPage.tsx`)

### Header + Discovery
- [ ] Add/keep a premium but lightweight collection hero band:
  - [ ] Breadcrumb
  - [ ] Collection title
  - [ ] One-line support copy
  - [ ] Elegant product count placement
  - [ ] Optional trust line (shipping/returns)

### Filter + Sort UX
- [ ] Desktop:
  - [ ] Sticky filter/sort toolbar
  - [ ] Cleaner filter grouping and spacing
  - [ ] Refined applied-filter chips
  - [ ] Clear "Clear all" pattern
- [ ] Mobile:
  - [ ] Filter drawer polish
  - [ ] Unified behavior with desktop filters (no duplicated/conflicting states)
  - [ ] Sticky filter/sort controls with clear active-filter state

### Product Grid + Cards
- [ ] Enforce consistent image ratio and uniform card height behavior.
- [ ] Clamp titles to max 2 lines.
- [ ] Standardize sale/new badge placement and styling.
- [ ] Standardize price block spacing and CTA language.
- [ ] Reduce duplicated metadata/repeated visual blocks.
- [ ] Add polished hover states without introducing layout shift.

### Merchandising Blocks in Large Collections
- [ ] Add modular inserts:
  - [ ] Best in this collection
  - [ ] Most gifted
  - [ ] New in this category
  - [ ] Under $25
  - [ ] Pairs well with
  - [ ] Occasional editorial micro-blocks

## 3) Product Pages (`src/pages/ProductPage.tsx`, `src/pages/ProductReviewsPage.tsx`)

### Above the Fold
- [ ] Gallery + product purchase panel hierarchy.
- [ ] Strong H1, clear price/sale logic, concise benefit bullets.
- [ ] Variants/quantity/CTA arranged for fast decision-making.
- [ ] Trust strip under CTA (shipping, returns, secure checkout).

### Product Content System
- [ ] Structured storytelling:
  - [ ] Overview
  - [ ] Key features
  - [ ] Who it's for
  - [ ] Specs/materials/dimensions
  - [ ] Shipping/care
  - [ ] Related items
- [ ] Handle long titles gracefully (H1 scale + line control + optional short descriptor).

### Option + Trust UX
- [ ] Improve selected/disabled states for variants.
- [ ] Use touch-friendly controls on mobile.
- [ ] Add sticky add-to-cart bar on mobile.
- [ ] Improve support/FAQ visibility on PDP.

### Cross-Sell
- [ ] Add modules:
  - [ ] Complete the look
  - [ ] Often bought together
  - [ ] You may also like
  - [ ] Same collection
  - [ ] Recently viewed

## 4) Search + Discovery (`/shop`, `/search` behaviors in `ShopPage`)

- [ ] Predictive search with image, title, price, and category.
- [ ] Typo tolerance and synonym mapping.
- [ ] Category suggestions, recent searches, trending searches.
- [ ] Strong no-results fallback:
  - [ ] Related categories
  - [ ] Suggested products
  - [ ] "Under $X" or popular edits

## 5) Cart + Pre-Checkout (`src/pages/CartPage.tsx`)

- [ ] Improve visual hierarchy for thumbnail/title/variant/qty/price.
- [x] Add trust messaging near subtotal (shipping, secure checkout, returns).
- [ ] Improve checkout CTA prominence.
- [ ] Add optional add-on/recommendation area.
- [ ] Reduce dead space and visual clutter.
- [ ] Keep coupon/gift-note UI clean and non-distracting.

## 6) Taxonomy + Catalog Cleanliness

- [ ] Normalize category naming and capitalization.
- [ ] Fix spelling inconsistencies in collection/product taxonomy labels.
- [ ] Reduce overlapping/duplicated category group names.
- [ ] Validate sale/compare-at-price rendering consistency.
- [ ] Standardize vendor/review visibility rules on cards.
- [ ] Standardize image crop/background quality expectations.

## 7) Mobile-First QA (All Non-Home Pages)

- [ ] No overflow on long titles, badges, chips, or buttons.
- [ ] Touch targets meet comfortable minimum sizing.
- [ ] Product grids remain readable (adaptive 1/1.5/2-column logic as needed).
- [ ] Filter/sort controls remain sticky and clear on scroll.
- [ ] PDP purchase actions accessible without scroll fatigue.

## 8) Conversion + Trust Layers

- [ ] Carry trust tone from home into collection/PDP/cart.
- [ ] Use social proof selectively:
  - [ ] Show strong review signals where available.
  - [ ] Where sparse, prioritize benefits, trust, and curation messaging.
- [ ] Add genuine offer architecture:
  - [ ] First-order incentive
  - [ ] Bundle suggestions
  - [ ] Spend-threshold promotions
  - [ ] Gift-focused pairings

## 9) Execution Order

1. [ ] Collection pages
2. [ ] Product pages
3. [ ] Search/discovery
4. [ ] Cart
5. [ ] Account/login + policy/help pages (visual consistency pass)

## 10) Definition of Done

- [ ] Homepage UI remains pixel-consistent with current baseline.
- [ ] Inner pages match homepage design quality and merchandising tone.
- [ ] No default-template look leaks through on collection/product/cart flows.
- [ ] Responsive QA passed on key viewport tiers.
- [ ] Accessibility pass complete for focus order, contrast, and interaction states.
- [ ] No performance regressions from added UI modules.

## 2026-09-15 Verification Readback

- Live `/shop?inner_qa=20260915`: `All Products` is no longer rendered as an active filter chip; the page reports `NO ACTIVE FILTERS` and the responsive price fields have unique IDs.
- Live `/shop?q=earbuds&inner_qa=20260915`: current catalog returned 410 exact results, Electronics & Accessories classification, and four relevant category suggestions; no console warnings/errors were recorded.
- Live `/cart?inner_qa=20260915`: empty-cart state, navigation, and footer read back cleanly. The populated-cart confidence block is present in the published source and is intentionally rendered only when cart lines exist.
- Build and focused storefront tests passed. The standalone accessibility helper could not run because the local Chrome binary is not installed; this is tracked separately from the live browser readback.
- Theme Check after publish: 0 errors and 10 existing warnings (orphaned review snippet warnings plus one layout complexity warning); no new warning was introduced by this pass.
