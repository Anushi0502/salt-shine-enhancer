# Design QA: Recently Ordered Hero Cards

## Source of truth

- Homepage corner reference: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-4b8e7dc1-cf0e-4d15-a238-0b4a0dd7f350.png`
- Diagonal ribbon reference: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-a5fcd826-c298-4f1a-aead-6bdf4802d4ff.png`
- Orientation reference for the latest revision: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-b02ef733-45a6-4fef-9664-cf862dcdc873.png`

## Tested state

- Route: `/`
- Data state: four real, unique products from the Shopify recently ordered feed
- Desktop viewport: 1440 x 1100
- Mobile viewport: 390 x 844
- Desktop full view: `output/playwright/recent-orders-desktop.png`
- Desktop focused view: `output/playwright/recent-orders-grid-desktop.png`
- Mobile full view: `output/playwright/recent-orders-mobile.png`
- Combined reference comparison: `output/design-qa/recent-orders-comparison.png`
- Revised desktop focused view: `output/playwright/buy-two-ribbon-left-grid-desktop.png`
- Revised mobile view: `output/playwright/buy-two-ribbon-left-mobile.png`
- Revised side-by-side comparison: `output/design-qa/buy-two-ribbon-left-comparison.png`
- Ribbon typography source capture: `output/design-qa/ribbon-text-before.png`
- Ribbon typography implementation capture: `output/design-qa/ribbon-text-after.png`
- Ribbon typography full-view comparison: `output/design-qa/ribbon-text-comparison.png`
- Ribbon typography focused comparison: `output/design-qa/ribbon-text-focused-comparison.png`
- Ribbon typography viewport: 1269 x 714 desktop, homepage at the initial hero-card state
- Ribbon alignment implementation capture: `output/design-qa/ribbon-text-aligned.png`
- Ribbon alignment comparison: `output/design-qa/ribbon-text-alignment-comparison.png`
- Wide Safari implementation capture: `output/design-qa/ribbon-text-wide-final.png`
- Wide Safari focused comparison: `output/design-qa/ribbon-text-wide-comparison.png`

## Comparison history

### Pass 1

- Layout: passed. The original 2 x 2 corner-card footprint, spacing, rounded corners, and dark lower gradient are preserved.
- Typography: passed. Product titles remain readable over imagery and prices have a distinct yellow hierarchy. Long titles clamp without colliding with the ribbon.
- Color and surfaces: passed. The ribbon uses a bright red satin treatment with white uppercase text and a visible folded tail; the existing navy product-card treatment remains consistent with the homepage.
- Image quality: passed. Shopify product media fills each card without stretching, with a fallback image path retained.
- Copy and content: passed. Four unique recently ordered products, product prices, and clear `Recently ordered` labels are shown.
- Responsiveness: passed. The 2 x 2 block remains intact at 390 px with no overlap, clipping, or horizontal overflow.
- Accessibility: passed. Product cards are semantic links, product images carry descriptive alt text, and the decorative ribbon image is hidden from assistive technology.
- Interaction: passed. Selecting the first card navigates to its matching product route and browser back returns to the homepage.
- Console: homepage loaded with zero errors and three pre-existing warnings. The destination product page reports an existing React `fetchPriority` attribute warning that is outside this homepage change.

### Pass 2: promotion ribbon revision

- Requested change: move each ribbon from the upper-right to the upper-left, preserve its original upward-right diagonal orientation, and change its label to `BUY 2 GET ONE FREE`.
- Layout: passed. Only the ribbon overlay position changed; card dimensions, imagery, title placement, pricing, spacing, and the 2 x 2 grid remain unchanged.
- Orientation: passed. The ribbon asset is translated to the left without mirroring, rotating, or otherwise changing its original diagonal direction.
- Typography and copy: passed. All four overlays display the new uppercase promotional label with no wrapping or collision.
- Desktop and mobile: passed at 1280 px desktop and 390 x 844 mobile. Ribbons remain contained by the rounded cards with no overflow or overlap into product titles.
- Image quality and colors: passed. The original red satin ribbon asset and its white text treatment are retained.
- Accessibility: passed. The promotional text remains decorative and excluded from the product-link accessible name; product links and descriptive image alt text remain unchanged.
- Build: passed. Production build completed successfully with only the existing bundle-size warning.

### Pass 3: ribbon typography visibility

- Requested change: preserve the ribbon position and diagonal orientation while making `BUY 2 GET ONE FREE` larger, heavier, and easier to read.
- Full-view comparison: passed. The homepage composition, card grid, ribbon asset, imagery, product titles, prices, and surrounding spacing remain unchanged.
- Focused comparison: passed. The four-card crop shows the promotion copy is materially more legible without wrapping, clipping, or colliding with product content.
- Fonts and typography: passed. The existing Inter/system sans stack is retained, font weight increases from 700 to 900, rendered desktop size increases from 7.2 px to 9.3 px, letter spacing is tightened for density, and a dark red/black text shadow improves edge contrast.
- Spacing and layout rhythm: passed. The ribbon's left/top coordinates, width, rotation, and card dimensions are unchanged.
- Colors and visual tokens: passed. White promotion text and the existing red satin ribbon remain consistent; the stronger shadow increases contrast without adding a new color treatment.
- Image quality: passed. The original 640 px ribbon asset remains sharp and unmodified.
- Copy and content: passed. All four ribbons continue to display `Buy 2 get one free` and all product content remains intact.
- Interaction and console: passed. Homepage links remain unchanged and the local browser session reported no console errors.
- Build: passed. The production web build and Shopify theme bundle both completed successfully.

### Pass 4: anchor text to the ribbon

- Source visual truth: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-8666123a-a39e-4c88-a328-cf56df7f9bdf.png`.
- Requested correction: the promotion copy must sit on the red ribbon instead of using independent card-level offsets.
- Layout: passed. The text is now positioned inside the same responsive wrapper as the ribbon image, so both scale and move together while the ribbon's existing card position and angle remain unchanged.
- Focused alignment evidence: passed. Browser geometry reports a 0 px horizontal and 0 px vertical difference between the text center and ribbon-wrapper center.
- Typography: passed. The bold 900-weight sans treatment remains readable without wrapping or crossing the ribbon edges.
- Responsive verification: passed at the 1166 x 934 reference viewport and the default desktop viewport.
- Colors, imagery, and copy: passed with no changes to the ribbon asset, product imagery, card gradient, prices, or promotional wording.

### Pass 5: wide Safari visibility

- Source visual truth: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-f1054462-1cfc-4de7-913b-18c9ab7b953c.png`.
- Requested correction: make the anchored ribbon copy materially larger in the wide Safari layout.
- Typography: passed. The responsive maximum increases to 16 px at the 1920 px test viewport while retaining weight 900 and the existing sans-serif treatment.
- Alignment: passed. Browser geometry still reports a 0 px horizontal and 0 px vertical center difference between the text and ribbon wrapper.
- Fit: passed. The rendered text occupies 153.6 px inside 201.2 px of available ribbon-copy width, leaving safe space at both ends with no wrapping or clipping.
- Focused comparison: passed. The revised copy is more prominent across all four cards while the ribbon image, card content, and grid geometry remain unchanged.

## Residual notes

- Product imagery and titles are live commerce data, so exact subjects differ from the static reference by design.
- No P0, P1, or P2 visual issues remain in the changed surface.

final result: passed

## Pass 10 - Exact b987ec4 restoration

- Selected source of truth: source commit `b987ec4` and the supplied Safari reference `codex-clipboard-46756d78-b661-4468-8fa2-e6e12715f2b4.png`.
- Source fidelity: passed. `git diff --exit-code b987ec4 -- src/pages/HomePage.tsx` returns 0.
- Ribbon wrapper: restored verbatim to `absolute -left-[18%] -top-[24%] w-[68%]`.
- Ribbon label: restored verbatim to the centered 76% width and `clamp(0.42rem,1.1vw,0.62rem)` typography.
- Alignment: passed. Browser geometry reports 0 px horizontal and 0 px vertical label-to-wrapper center delta for all four cards.
- Console: passed with zero browser errors.
- Scope: local preview only; no production push performed.

final result: passed

## Pass 9 - Narrow-browser text floor

- Source visual truth: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-8b249fd4-9d50-4b3e-b56d-0ca3d7656e6d.png`.
- Root cause: the previous rem-based minimum inherited the app's reduced narrow-screen root font size and rendered at 9.75 px.
- Typography: passed. The promotion now uses a literal 12 px minimum, weight 900, and cannot shrink with the root font.
- Containment: passed. All four labels remain fully inside their cards at the 678 x 736 live preview viewport.
- Title clearance: passed. The nearest ribbon-to-title gap is 41 px.
- Scope: local preview only; no production push performed.

final result: passed

## Pass 8 - Compact ribbon correction

- Source visual truth: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-de00287d-7385-4a03-8358-99622c55f125.png`.
- QA viewport: 2048 x 742, matching the supplied screenshot.
- Ribbon size: reduced from 52% to 42% of each product-card width.
- Typography: 13.12 px at the QA viewport, weight 900, single-line, and fully contained.
- Product-title clearance: 85 px between the ribbon-label boundary and each product title.
- Asset and orientation: the original 640 px satin ribbon and its upward-right diagonal orientation are unchanged.
- Scope: local preview only; no production push performed for this pass.

final result: passed

## Pass 6 - Safari CSS viewport scaling

- Live Safari inspection reported a 992px CSS viewport and only 9.92px ribbon text with the earlier 1vw rule.
- Increased the fluid preferred size to 1.4vw while retaining the 16px maximum and a compact mobile minimum.
- Expected desktop Safari rendering at the observed viewport: approximately 13.9px, weight 900, centered on the ribbon.

## Pass 7 - Contain the ribbon in the card

- Source visual truth: `/var/folders/5v/j7kjz8x10gs92h69wc2ydc840000gn/T/codex-clipboard-67321ccf-c545-4b4f-89ea-7b5fd5dff5e2.png`.
- Root cause: the `-18%` horizontal and `-24%` vertical offsets pushed the enlarged ribbon and label outside the card's clipped boundary.
- Position: passed. The same unrotated 640 px satin ribbon now starts at the top-left card corner with a 52% responsive width and a 4% top inset.
- Copy: passed. `BUY 2 GET ONE FREE` remains 900 weight, 15 px at the 1280 px QA viewport, single-line, and fully inside every card.
- Asset: passed. All four ribbon images report a 640 px natural width.
- Geometry: passed. All four label bounding boxes are fully contained by their respective product cards.
- Layout: passed. Product cards, product imagery, pricing, hero carousel, and surrounding homepage sections remain unchanged.

final result: passed
