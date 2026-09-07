# SALT Full-Catalog Release Blueprint

Taxonomy version: `2026-08-06.1`
Collection plan version: `2026-08-06.1-collections.4`
Collection governance version: `2026-08-20.2`

## Release Boundary

- Scope is every active Shopify product and every live collection.
- The current guarded manifest contains 13,949 active products.
- Classification is deterministic for 13,945 products and local-image verified for four opaque supplier titles.
- Release-boundary guesses are permitted only when unresolved classification would otherwise fail the release. The approved manifest contains zero guesses.
- Every active product must have at least one exact semantic collection tag and must be verified in at least one live collection.
- Unmanaged merchant tags are preserved exactly. Only checked-in `salt:` taxonomy, collection, and classification namespaces are exact-replaced.

## Product Content Gate

- SEO title, SEO description, product description, subtitle, highlights, collection signal, and search boosts must be specific to the product's own title, type, taxonomy, options, measurements, use, and visible evidence.
- Generic filler, evidence-free content, and normalized duplicates across products fail the release.
- Existing non-empty metafields are retained only when they pass the same product-specificity and uniqueness checks.
- Product and variant prices, compare-at prices, inventory, and Shopify product category are never changed by this flow.

## Collection Rules

- The registry governs 96 semantic collections, six exact price collections, and the `all-products` catalog boundary.
- Every semantic collection has one canonical condition: `TAGGED_WITH salt:collection:<handle>`.
- Product tags are calculated from the checked-in taxonomy and dynamic merchandising assignments, then live collection membership is compared as an exact set.
- New canonical collections are published to Online Store. Existing publication state is otherwise preserved.
- Collection merges, archives, and deletions are not part of this release.

## Special Collections

| Collection | Controlled tag | Approved manifest count |
| --- | --- | ---: |
| Creator Essentials | `salt:collection:creator-essentials` | 513 |
| Anime Collectables | `salt:collection:anime-collectables` | 1,027 |

The release fails if Creator Essentials drops below 500 or Anime Collectables drops below 1,000.

## Canonical Handle Repairs

| Legacy handle | Canonical handle | Canonical title |
| --- | --- | --- |
| `appplaza-best-sellers` | `best-sellers` | Best Sellers |
| `books` | `senior-living-solutions` | Senior Living Solutions |
| `pet-assocerries` | `pet-essentials` | Pet Essentials |
| `unique-products` | `trending-finds` | Trending Finds |
| `under-100` | `under-44-99` | Under $44.99 |
| `gloves` | `under-60` | Under $60 |

Only these checked-in handle migrations may create redirects.

## Exact Price Collections

| Handle | Membership condition |
| --- | --- |
| `under-25` | Any variant price `< 25.00 USD` |
| `under-35` | Any variant price `< 35.00 USD` |
| `under-44-99` | Any variant price `< 45.00 USD` |
| `under-50` | Any variant price `< 50.00 USD` |
| `under-60` | Any variant price `< 60.00 USD` |
| `premium-picks` | Any variant price `> 99.99 USD` |

The verifier reads Shopify's collection source condition details and compares every price-driven collection's live membership against current variant prices.

## Required Readback

The release is complete only when `output/shopify-catalog-integrity-manifest.json` records:

- zero guessed assignments in the approved pre-apply manifest;
- exact managed-tag readback for every active product;
- canonical title, handle, and source condition for every governed collection;
- exact semantic and price membership with zero missing or extra products;
- zero collectionless active products;
- 513 or more Creator Essentials products and 1,000 or more Anime Collectables products.

The integrated catalog/daily release then applies and verifies product-specific SEO and metafields, publishes all active products to every sales channel, refreshes storefront data, builds the web app, and regenerates the paired Shopify theme repository.
