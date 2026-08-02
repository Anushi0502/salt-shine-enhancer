# SALT Catalog Taxonomy

## Purpose

This knowledge base classifies catalog products from merchant-owned evidence so search, SEO, metafields, collection rules, and variant enrichment use the same product identity. It is designed to process at least 500,000 separate product records without collapsing them into a single generic type.

## Evidence Order

1. Product title
2. Product handle
3. Product type
4. Existing merchant/supplier tags
5. Existing collection signal

Generated SEO copy is never classification evidence. A bad description must not turn a charger into lighting or a belt into pants.

## Output Contract

Every product receives:

- A stable product knowledge identity plus a specific product-type key, so two products can share a category without being treated as the same catalog record.
- One primary department/category/subcategory path for ranking, plus zero or more verified related category memberships represented by controlled tags. Shopify product categories are not written by this workflow.
- Search aliases and negative terms for predictable search ranking.
- Evidence and confidence score.
- A review flag when the taxonomy cannot safely auto-classify the product.
- Controlled proposed tags in the `salt:` namespace only when the product is SEO-eligible.
- Existing collection targets or a new-collection candidate.

## Controlled Tags

- `salt:department:*`
- `salt:category:*`
- `salt:type:*`
- `salt:audience:*`
- `salt:feature:*`
- `salt:compatibility:*`

Existing Shopify tags are preserved exactly, including capitalization, spelling mistakes, and supplier wording. `output/catalog-existing-tag-inventory.md` is the reviewable inventory for them; it is separate from the controlled `salt:` vocabulary. Search aliases remain in the knowledge index instead of creating uncontrolled free-form Shopify tags.

Products can belong to more than one shopper path. The primary taxonomy path resolves ranking conflicts, while every verified additional path adds its own `salt:department:*` and `salt:category:*` tags. No second Shopify product category is assigned, and unrelated cross-category memberships are never inferred from a loose keyword alone.

Existing tags remain available for raw shopper discovery and as the lowest-priority classification evidence. They cannot override title, handle, or product type, and they cannot drive taxonomy collections by themselves. A future approved tag write may use Shopify's additive tag operation for approved `salt:` tags only; it must verify that the final live tag list is a superset of the tag list it read. No taxonomy operation may remove a pre-existing Shopify tag.

The release workflow reads the live Shopify tag inventory after refreshing catalog data, then regenerates the preservation audit. The workflow stops if that live read cannot be completed; it never treats a cached inventory as current release proof.

## Safety Gates

- A title, handle, or explicit product type always outranks a conflicting supplier tag.
- Singular and plural spellings count as one piece of evidence, preventing tag noise from inflating a score.
- Unknown, low-confidence, and conflicting products receive no managed `salt:` tags and cannot enter automated SEO/category updates.
- Exact product corrections live in `src/lib/catalog-taxonomy-overrides.js`. Each override must be explicitly approved and must reference an existing taxonomy rule; an invalid override fails the build instead of silently changing SEO.
- The taxonomy records evidence, confidence, review reason, primary path, related tag memberships, and collection target for every product.
- Legacy collections whose title conflicts with their handle or their intended audience are never automatic targets. They require an approved rebuild and redirect plan before any taxonomy membership is applied.

## Scale Check

Run `npm run catalog:taxonomy:scale-check` to stream 500,000 distinct product records through the knowledge base. The check deliberately repeats the supplier product type across all records, then verifies that every record still receives its own immutable knowledge identity and descriptor key without creating an in-memory synthetic catalog.

## Approval Flow

1. Run `npm run catalog:taxonomy:audit` after a catalog refresh.
2. Review `output/catalog-tag-proposal.md`, `docs/catalog-collection-blueprint.md`, `output/catalog-collection-rationalization.md`, and `output/catalog-taxonomy-review.csv`.
3. Obtain approval for tag vocabulary, collection merges, and any new collection candidates.
4. Apply only approved high-confidence classifications, then perform a fresh Shopify readback.
5. Keep review-required products out of automated SEO/category/tag updates until their classifications are resolved through a taxonomy rule or approved product-level override.

## Release Safety

- `npm run catalog:taxonomy:validate` is read-only and runs after every catalog refresh before search assets are generated.
- `npm run release` and `npm run shopify:seo:release` stop before any Shopify mutation unless `docs/catalog-taxonomy-approval.json` records an explicit approval for the active taxonomy version.
- An approved release also requires `SALT_CATALOG_TAXONOMY_APPROVED=1` and the matching `SALT_CATALOG_TAXONOMY_APPROVAL_ID` at runtime. This prevents an old approval or a scheduled workflow from applying a newer taxonomy by accident.
- The guarded SEO flow always passes `--preserve-prices --preserve-tags`; taxonomy uses its own audited additive-tag and classification-metafield phase after approval. It does not mutate Shopify product categories.

## Regression Rules

The taxonomy must continue to keep these distinctions separate:

- Belt vs. pants/trousers
- Ring vs. ring light, key ring, and O-ring
- Phone case vs. phone holder/pouch
- Charger/cable vs. lighting
- Beauty UV nail lamp vs. home lamp
- Bath toy vs. lighting
- Smart watch vs. watch charger/band
- USB flash drive/pendrive vs. writing pens
