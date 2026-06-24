# SALT Collection List

Source: `src/lib/site-navigation.ts` (canonical nav registry)

## Top-Level Collections

| Collection | Handle | Shopify Handle | Summary |
| --- | --- | --- | --- |
| Senior Living Solutions | `senior-living-solutions` | `books` | Practical daily supports for easier routines, safer rooms, stronger organization, and more confident independent living. |
| Home & Kitchen | `home-kitchen` | `cookware` | Useful kitchen, dining, storage, and clean-up essentials that make everyday routines easier to manage. |
| Home Decor & Lighting | `home-decor-lighting` | `home-decor` | Lighting and decorative touches that warm a room, highlight a wall, and finish a space with intention. |
| Pet Essentials | `pet-essentials` | `pet-assocerries` | Feeding, grooming, travel, and play basics for dogs and cats that keep pet care straightforward. |
| Health & Wellness | `health-wellness` | `face-mask` | Sleep, posture, relaxation, and recovery-focused products for everyday wellbeing. |
| Travel & Outdoor | `travel-outdoor` | `shopping-bags-jute-bags` | Portable helpers for road trips, camping, and organized travel days that stay easy to pack. |
| Gifts Collection | `gifts` | `gifts` | Giftable finds for birthdays, holidays, housewarmings, and everyday surprises that feel useful and thoughtful. |
| Trending Finds | `trending-finds` | `unique-products` | What’s moving now: viral picks, best sellers, new arrivals, staff picks, and budget-friendly favorites. |

## Subcollections

### Senior Living Solutions
- Daily Living Aids (`daily-living-aids`)
- Home Safety (`home-safety`)
- Memory & Organization (`memory-organization`)
- Caregiver Essentials (`caregiver-essentials`)
- Gifts for Seniors (`gifts-for-seniors`)
- Mobility Support (`mobility-support`)

### Home & Kitchen
- Kitchen Gadgets (`kitchen-gadgets`)
- Cookware (`cookware`)
- Storage & Organization (`storage-organization`)
- Coffee & Tea Accessories (`coffee-tea-accessories`)
- Dining Essentials (`dining-essentials`)
- Cleaning Tools (`cleaning-tools`)
- Home Decor & Lighting (`home-decor-lighting`)

### Home Decor & Lighting
- Wall Lights (`wall-lights`)
- Decorative Lamps (`decorative-lamps`)
- Wall Art (`wall-art`)
- Seasonal Decor (`seasonal-decor`)
- Smart Lighting (`smart-lighting`)
- Decorative Accessories (`decorative-accessories`)
- Pet Essentials (`pet-essentials`)

### Pet Essentials
- Dog Supplies (`dog-supplies`)
- Cat Supplies (`cat-supplies`)
- Pet Travel (`pet-travel`)
- Pet Feeding (`pet-feeding`)
- Pet Grooming (`pet-grooming`)
- Pet Toys (`pet-toys`)
- Health & Wellness (`health-wellness`)

### Health & Wellness
- Posture Support (`posture-support`)
- Sleep Essentials (`sleep-essentials`)
- Relaxation Products (`relaxation-products`)
- Massage Tools (`massage-tools`)
- Wellness Accessories (`wellness-accessories`)
- Travel & Outdoor (`travel-outdoor`)

### Travel & Outdoor
- Travel Organizers (`travel-organizers`)
- Car Accessories (`car-accessories`)
- Camping Gear (`camping-gear`)
- Portable Gadgets (`portable-gadgets`)
- Outdoor Essentials (`outdoor-essentials`)

### Gifts Collection
- Gifts for Mom (`gifts-for-mom`)
- Gifts for Dad (`gifts-for-dad`)
- Gifts for Seniors (`gifts-for-seniors`)
- Housewarming Gifts (`housewarming-gifts`)
- Birthday Gifts (`birthday-gifts`)
- Holiday Gifts (`holiday-gifts`)

### Trending Finds
- Viral TikTok Products (`viral-tiktok-products`)
- Best Sellers (`best-sellers`)
- New Arrivals (`new-arrivals`)
- Staff Picks (`staff-picks`)
- Under $25 (`under-25`)
- Under $50 (`under-50`)

## Route Notes

- Collection routes use `/collections/<handle>`.
- Subcollection routes use `/collections/<collection-handle>?collection=<shopify-handle-or-subhandle>`.
- Legacy `winter-wear` routes normalize to the live clearance collection (`clearance-archive`) for backward compatibility.
- Smart-merge aliases normalize `cooking-essential` -> `cookware` and `apparel` -> `men-collection` so legacy links land on the canonical families.
- The search page uses `/shop?q=<query>` when a direct search is needed.
