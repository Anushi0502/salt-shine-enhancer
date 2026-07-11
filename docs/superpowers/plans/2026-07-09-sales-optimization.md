# Shopify Sales Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve storefront sales performance with stronger ranking, recommendation, trust, and SEO/AI visibility features driven by Shopify data and CLI-backed verification.

**Architecture:** Add a shared sales-optimization layer that scores products for merchandising, builds structured data for product/collection/home routes, and powers related/complementary/cart recommendations. Wire that layer into the existing homepage, shop, product, cart, and shell surfaces, then add a Shopify CLI verification step to the release pipeline.

**Tech Stack:** React, TypeScript, Vite, Shopify CLI, Judge.me, Shopify Admin/Storefront JSON data, React Router.

---

### Task 1: Shared Sales Intelligence Helpers

**Files:**
- Create: `src/lib/sales-optimization.ts`
- Create: `src/lib/sales-optimization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("sales optimization", () => {
  it("ranks a reviewed discounted product above a plain product", () => {});
  it("prefers collection-overlap recommendations over same-type fallbacks", () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/sales-optimization.test.ts -v`
Expected: fail because the module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement merchandising scoring, recommendation scoring, and JSON-LD builders.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/sales-optimization.test.ts -v`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales-optimization.ts src/lib/sales-optimization.test.ts
git commit -m "feat: add sales optimization helpers"
```

### Task 2: Storefront Sales Surfaces

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/ShopPage.tsx`
- Modify: `src/pages/ProductPage.tsx`
- Modify: `src/components/storefront/CartDrawer.tsx`
- Modify: `src/components/layout/SiteShell.tsx`
- Create: `src/components/storefront/SeoMetadata.tsx`

- [ ] **Step 1: Write the failing test**

Add targeted tests for the helper-driven product ranking/recommendation behavior that the storefront will consume.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/sales-optimization.test.ts -v`
Expected: pass once Task 1 is done; storefront changes can be verified with the build.

- [ ] **Step 3: Write minimal implementation**

Wire the new helpers into homepage ranking, featured sort, product recommendations, cart upsells, and SEO/meta tags.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:web`
Expected: pass with no TypeScript or Vite errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.tsx src/pages/ShopPage.tsx src/pages/ProductPage.tsx src/components/storefront/CartDrawer.tsx src/components/layout/SiteShell.tsx src/components/storefront/SeoMetadata.tsx
git commit -m "feat: upgrade storefront sales surfaces"
```

### Task 3: Shopify CLI Verification and Release Flow

**Files:**
- Create: `scripts/verify-shopify-merchandising.mjs`
- Modify: `scripts/release.mjs`

- [ ] **Step 1: Write the failing test**

```bash
node --check scripts/verify-shopify-merchandising.mjs
```

- [ ] **Step 2: Run test to verify it fails**

Expected: fail until the verification script exists.

- [ ] **Step 3: Write minimal implementation**

Add a Shopify CLI readback that checks one product, one collection, and shop-level merchandising fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check scripts/verify-shopify-merchandising.mjs && npm run release`
Expected: release completes with the verification step included.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-shopify-merchandising.mjs scripts/release.mjs
git commit -m "feat: add shopify merchandising verification"
```

### Task 4: Final Validation

**Files:**
- Modify: generated storefront files only if build issues appear

- [ ] **Step 1: Run the targeted tests**

Run: `npm test`

- [ ] **Step 2: Run the web build**

Run: `npm run build:web`

- [ ] **Step 3: Run the release pipeline**

Run: `npm run release`

- [ ] **Step 4: Confirm live Shopify readback**

Use Shopify CLI readback commands to confirm product, collection, and shop metafields still resolve after the release.

### Task 5: Shop Channel Priority Floor for Sub-$25 Products

**Files:**
- Modify: `src/lib/sales-optimization.ts`
- Modify: `src/lib/shopify-product-metafield-backfill.js`
- Modify: `scripts/shopify-product-metafield-backfill.mjs`
- Modify: `src/lib/shopify-data.ts`
- Modify: `src/pages/ShopPage.tsx`
- Modify: `src/components/storefront/CartDrawer.tsx`
- Modify: `src/components/storefront/ProductCard.tsx`
- Modify: `src/pages/ProductPage.tsx`
- Modify: `src/pages/CartPage.tsx`
- Modify: `src/lib/cart.tsx`
- Modify: `src/lib/pumper-bridge.ts`
- Modify: `src/lib/product-custom-data.js`
- Modify: `src/lib/shopify-product-metafield-definitions.js`
- Modify: `scripts/verify-shopify-merchandising.mjs`

- [ ] **Step 1: Add the Shop floor metafield contract**

Introduce a merchant-editable `salt-marketing.shop_channel_minimum_quantity` product metafield, normalize it in the data layer, and backfill it with the current floor for every product that does not already have one.

- [ ] **Step 2: Add Shop-channel ranking and copy**

Add a Shop-only ranking helper that boosts sub-$25 products ahead of higher-price catalog items, then surface a small embedded floor message in the Shop page and Shop-style product cards.

- [ ] **Step 3: Wire the floor into cart and product controls**

Pass the product floor through the cart state, product page, cart drawer, cart page, and pumper bridge so the minimum stays visible and editable without falling back to bundle logic.

- [ ] **Step 4: Verify with tests and Shopify CLI**

Run the Shop-channel and backfill tests, then verify the live metafields with the Shopify CLI readback script before release.

- [ ] **Step 5: Release**

```bash
npm run release
```
