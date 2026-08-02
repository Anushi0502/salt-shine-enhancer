# SALT Catalog Collection Blueprint

Taxonomy version: `2026-08-01.7`

## Status

Approval required. This is a read-only proposal built from the current 12,149-product snapshot and 77 existing Shopify collections. It does not change Shopify products, prices, discounts, variants, publications, tags, SEO, metafields, collections, redirects, or theme data.

## Non-Negotiable Rules

- Only products with a high-confidence taxonomy classification can enter a managed collection. The current proposal has 11,494 eligible products and 655 products held for review.
- Held products receive no `salt:` tags and no taxonomy-driven collection membership.
- A collection rule uses controlled `salt:department:*` or `salt:category:*` tags, not supplier tags, titles, or stale collection membership.
- Product publication is never changed by classification. The future apply step must read each product's Online Store publication state and exclude products that are not published to that channel.
- Prices, compare-at prices, discounts, inventory, variants, and existing merchant tags are outside this collection plan and must not be changed. Existing tags remain searchable and are documented in `output/catalog-existing-tag-inventory.md`, but never become collection rules on their own.
- Before retiring or renaming a collection, Shopify redirects and live collection membership must be read back and verified.

## Proposed Customer Hierarchy

The physical collection layer stays deliberately compact. Every category and subcategory remains searchable through controlled tags, while a Shopify collection is created or rebuilt only for a shopper-facing parent or a high-volume discovery group.

| Collection | Rule | Eligible products | Action |
| --- | --- | ---: | --- |
| Women | `salt:department:women` | 1,027 | Create parent collection |
| Women's Fashion | `salt:category:women-fashion` | 300 | Create collection |
| Women's Beauty & Skincare | `salt:category:women-beauty-skincare` | 359 | Rebuild `womens-beauty-essentials` |
| Women's Accessories | `salt:category:women-accessories` | 170 | Create collection |
| Women's Bags & Wallets | `salt:category:women-bags-wallets` | 198 | Rebuild `women-bags-and-wallets` |
| Men | `salt:department:men` | 2,302 | Rebuild `men-collection` |
| Men's Fashion | `salt:category:men-fashion` | 1,415 | Create collection |
| Men's Bags & Wallets | `salt:category:men-bags-wallets` | 335 | Create collection |
| Men's Accessories | `salt:category:men-accessories` | 215 | Create collection |
| Men's Beauty & Skincare | `salt:category:men-beauty-skincare` | 337 | Create collection |
| Kids | `salt:department:kids` | 962 | Create parent collection |
| Kids Wear | `salt:category:kids-wear` | 675 | Create collection |
| Kids Toys & Games | `salt:category:kids-toys-games` | 218 | Create collection |
| Home & Decor | `salt:department:home-decor` | 1,629 | Rebuild `home-decor` and merge lighting/decor leaf pages |
| Kitchen & Cookware | `salt:category:kitchen-cookware` | 1,032 | Rebuild `cookware` |
| Lighting & Decor | `salt:category:lighting-decor` | 360 | Rebuild `smart-lighting`; merge `wall-lights` into it |
| Bedsheets, Handlooms & Towels | `salt:category:bedsheets-handlooms-towels` | 77 | Create collection |
| Home & Car Accessories | `salt:category:home-car-accessories` | 127 | Rebuild `car-accessories` with a corrected scope |
| Electronic Accessories | `salt:department:electronic-accessories` | 1,063 | Rebuild `portable-gadgets` |
| Covers & Cases | `salt:category:covers-cases` | 384 | Create collection |
| Mouse & Keyboard | `salt:category:mouse-keyboard` | 246 | Create collection |
| Audio & Earbuds | `salt:category:audio` | 160 | Create collection |
| Office & School Supplies | `salt:category:office-school-supplies` | 1,069 | Create collection |
| Camping & Travel Essentials | `salt:department:camping-travel` | 371 | Rebuild `travel-outdoor` |
| Watches | `salt:category:watches` | 349 | Rebuild `women-watches` as gender-neutral Watches |
| Sports & Fitness | `salt:category:fitness-equipment` | 241 | Create collection |
| Health & Wellness | `salt:category:health-wellness` | 81 | Create `health-wellness`, redirect legacy `face-mask` |

## Filter-Only Children

These stay as exact tag-driven routes inside their approved parent collection until they have at least 50 eligible products. This avoids dozens of thin Shopify collections without hiding them from discovery.

| Parent | Child routes and filters |
| --- | --- |
| Women | footwear, jackets, trousers, hair accessories, sunglasses, belts, scarves, beauty subtypes |
| Men | t-shirts, jeans, trousers, footwear, hats, belts, grooming, fragrance, wallets, handbags |
| Kids | soft toys, baby care, kids accessories, bath toys, games and puzzles, educational toys |
| Home & Decor | garden tools, cleaning tools, storage, furniture, bathroom accessories, home appliances, candles |
| Electronic Accessories | chargers, USB flash drives, phone holders and mounts, laptop accessories, phone/tablet stands, camera accessories |
| Office & School Supplies | notebooks, planners, books and learning, writing supplies, pen and pencil cases, card collecting, binders, craft supplies |
| Camping & Travel | backpacks, luggage, organizers, tents, portable tables, camp showers, bathing rooms, vehicle accessories |
| Watches | fashion watches, smart watches, watch bands, watch chargers |
| Sports & Fitness | fitness training, sports protection, massage and recovery |

## Collections That Must Not Receive Automatic Membership

The following existing collections have a title, handle, or audience scope that conflicts with the current taxonomy. They are deliberately blocked as automatic targets until the approved rebuild or redirect is complete.

| Legacy collection | Reason | Proposed resolution |
| --- | --- | --- |
| `books` - Senior Living Solutions | Not a general books or school-supplies collection | Create Office & School Supplies and add Books & Learning as a filter route |
| `women-watches` | Gendered name conflicts with a general Watches department | Rebuild as Watches and redirect the legacy route |
| `women-sunglases` | Misspelled and women-only | Merge into Women's Accessories after rebuild |
| `women-bags-and-wallets` for men or unisex goods | Wrong audience | Only women-tagged products may use it until Men's Bags & Wallets exists |
| `womens-beauty-essentials` for men or unisex goods | Wrong audience | Only women-tagged products may use it until Men's Beauty & Skincare exists |
| `face-mask` - Health & Wellness | Handle and title disagree | Create a correct `health-wellness` route and redirect it |
| `medical-accessories` - Health, Wellness & Planners | Scope is too broad and title is misleading | Merge into approved Health & Wellness |
| `t-shirt`, `trousers`, `jeans`, `robe` | Thin legacy leaf collections | Merge into the approved gender-specific Fashion parent |

## Low-Volume Collection Consolidation

Every current collection below 50 products is proposed for consolidation, archive, or a redirect. No deletion occurs until the replacement collection and redirect are verified.

| Existing collection(s) | Recommended destination |
| --- | --- |
| Under $25, Under 35 | Replace with dynamic price filters; archive the static collections |
| Caregiver Essentials, Mobility Support, Posture Support, Home Safety, Health, Wellness & Planners | Health & Wellness |
| Robes, T-Shirts, Jeans, Trousers | Men's Fashion, using the appropriate gender category only |
| Candles, Cleaning Tools, Garden & Tools | Home & Decor |
| Artificial Aquarium Decor Plants | Pet Care / Aquarium Supplies filter, not Home Decor |
| Camping Gear | Camping & Travel Essentials |
| sunglasses | Women's Accessories |
| Repair & Shine Serums | Beauty & Skincare |
| Gifts for Dad, Gifts for Mom, Gifts for Seniors, Holiday Gifts | Gifts Collection, maintained as a single campaign family |
| Viral TikTok Products | Trending Finds, only while the campaign is active; otherwise archive |

## Existing High-Value Merchandising Collections

These are not taxonomy parents and should remain independent merchandising routes with explicit curation rules: All Products, Best Sellers, New Arrivals, Premium Picks, Trending Finds, Staff Picks, price filters, Pet Essentials, and Gifts Collection. Their product selection cannot be inferred only from product type.

## Approval Needed

Approve or revise all of the following before any Shopify write:

1. The existing-tag preservation and evidence policy in `output/catalog-existing-tag-inventory.md`.
2. The controlled `salt:` tag vocabulary in `output/catalog-tag-proposal.md`.
3. The create/rebuild actions in the Proposed Customer Hierarchy table.
4. The redirect and consolidation actions in the Low-Volume Collection Consolidation table.
5. The policy that children below 50 products remain tag-driven routes rather than thin physical Shopify collections.

After approval, the apply phase will apply controlled additive product tags and classification metafields to eligible active products, without changing Shopify product categories. Collection creation, rebuild, merge, archive, and redirect work remains separately approval-gated and requires a fresh live readback before the final publication phase.
