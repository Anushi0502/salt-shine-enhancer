# SALT Editorial Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild only the About us, Our Mission & Vision, and Affiliate Program pages as warm, editorial pages that borrow Amazon's clarity and scanability without copying Amazon's chrome or tone.

**Architecture:** Move the three page narratives into page-scoped content modules and render them through one shared editorial template. The template will use the existing SALT styling system, section reveals, cards, chips, and FAQ/CTA patterns so the pages feel organized and trustworthy, while keeping all other storefront surfaces untouched.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS, existing SALT storefront primitives, Vitest, Testing Library.

---

**File map**
- `src/components/storefront/EditorialPageTemplate.tsx`: shared renderer for hero, quick facts, section cards, FAQ blocks, and CTA rails.
- `src/content/pages/types.ts`: shared content types for the three editorial pages.
- `src/content/pages/about.ts`: structured About us copy from the source doc.
- `src/content/pages/mission-vision.ts`: structured Mission & Vision copy from the source doc.
- `src/content/pages/affiliate-program.ts`: structured Affiliate Program copy from the source doc.
- `src/pages/AboutPage.tsx`: convert the current heuristic Shopify HTML parser into a doc-driven page wrapper.
- `src/pages/MissionVisionPage.tsx`: new page wrapper for the mission page.
- `src/pages/AffiliateProgramPage.tsx`: new page wrapper for the affiliate page.
- `src/App.tsx`: add routes for the two new pages only.
- `src/components/storefront/EditorialPageTemplate.test.tsx`, `src/pages/AboutPage.test.tsx`, `src/pages/MissionVisionPage.test.tsx`, `src/pages/AffiliateProgramPage.test.tsx`: verify headings, section order, and CTA targets.

### Task 1: Build the shared editorial template

**Files:**
- Create: `src/content/pages/types.ts`
- Create: `src/components/storefront/EditorialPageTemplate.tsx`
- Create: `src/components/storefront/EditorialPageTemplate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
render(<EditorialPageTemplate copy={sampleCopy} />);
expect(screen.getByRole("heading", { name: /about salt online store/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /shop the catalog/i })).toHaveAttribute("href", "/shop");
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- src/components/storefront/EditorialPageTemplate.test.tsx`
Expected: FAIL because the template and content types do not exist yet.

- [ ] **Step 3: Implement the shared content model and template**

```tsx
export type EditorialPageCopy = {
  eyebrow: string;
  title: string;
  summary: string;
  chips: string[];
  sections: Array<
    | { kind: "rich"; title: string; body: string[] }
    | { kind: "cards"; title: string; items: Array<{ title: string; body: string }> }
    | { kind: "faq"; title: string; items: Array<{ question: string; answer: string }> }
  >;
  actions: Array<{ label: string; to: string; primary?: boolean }>;
};
```

Use a warm SALT surface, rounded cards, compact chips, and a dense but calm section rhythm. Borrow Amazon's information hierarchy and scanability, not its black/orange palette or literal nav labels.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- src/components/storefront/EditorialPageTemplate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the template work**

```bash
git add src/content/pages/types.ts src/components/storefront/EditorialPageTemplate.tsx src/components/storefront/EditorialPageTemplate.test.tsx
git commit -m "feat: add shared editorial page template"
```

### Task 2: Rework About us from the source doc

**Files:**
- Create: `src/content/pages/about.ts`
- Modify: `src/pages/AboutPage.tsx`
- Create: `src/pages/AboutPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
render(
  <MemoryRouter initialEntries={["/about"]}>
    <AboutPage />
  </MemoryRouter>,
);
expect(screen.getByRole("heading", { name: /about salt online store/i })).toBeInTheDocument();
expect(screen.getByText(/our story/i)).toBeInTheDocument();
expect(screen.getByRole("link", { name: /shop the catalog/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to confirm the current page fails the new expectations**

Run: `npm run test -- src/pages/AboutPage.test.tsx`
Expected: FAIL until the About page is converted to the structured doc-driven layout.

- [ ] **Step 3: Replace the heuristic Shopify parsing with explicit About doc sections**

```tsx
export default function AboutPage() {
  return <EditorialPageTemplate copy={aboutPageCopy} />;
}
```

Use the source doc structure directly: hero, founder story, why SALT exists, FAQ, and family-of-brands section. Keep the current `/about` and `/pages/about-us` routes, but stop depending on the stale generic fallback copy in `public/data/about.json` for this page.

- [ ] **Step 4: Run the test again and verify the About page content**

Run: `npm run test -- src/pages/AboutPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the About page rewrite**

```bash
git add src/content/pages/about.ts src/pages/AboutPage.tsx src/pages/AboutPage.test.tsx
git commit -m "feat: rewrite about page from source doc"
```

### Task 3: Add the Our Mission & Vision page

**Files:**
- Create: `src/content/pages/mission-vision.ts`
- Create: `src/pages/MissionVisionPage.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/MissionVisionPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
render(
  <MemoryRouter initialEntries={["/pages/our-mission-vision"]}>
    <Routes>
      <Route path="/pages/our-mission-vision" element={<MissionVisionPage />} />
    </Routes>
  </MemoryRouter>,
);
expect(screen.getByRole("heading", { name: /our mission & vision/i })).toBeInTheDocument();
expect(screen.getByText(/compassion/i)).toBeInTheDocument();
expect(screen.getByRole("link", { name: /about salt/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to confirm the route is missing**

Run: `npm run test -- src/pages/MissionVisionPage.test.tsx`
Expected: FAIL until the route and page component exist.

- [ ] **Step 3: Add the page route and render the mission doc**

```tsx
<Route path="/pages/our-mission-vision" element={<MissionVisionPage />} />
```

Render the page with the shared template using the source doc's mission, vision, values, and commitment sections. Add compact section-jump chips near the top so the page feels easy to scan, similar to Amazon's utility-first structure but still warm and editorial.

- [ ] **Step 4: Run the test again and verify the page shape**

Run: `npm run test -- src/pages/MissionVisionPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the mission page**

```bash
git add src/content/pages/mission-vision.ts src/pages/MissionVisionPage.tsx src/App.tsx src/pages/MissionVisionPage.test.tsx
git commit -m "feat: add mission and vision page"
```

### Task 4: Add the Affiliate Program page

**Files:**
- Create: `src/content/pages/affiliate-program.ts`
- Create: `src/pages/AffiliateProgramPage.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/AffiliateProgramPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
render(
  <MemoryRouter initialEntries={["/pages/affiliate-program"]}>
    <Routes>
      <Route path="/pages/affiliate-program" element={<AffiliateProgramPage />} />
    </Routes>
  </MemoryRouter>,
);
expect(screen.getByRole("heading", { name: /affiliate program/i })).toBeInTheDocument();
expect(screen.getByText(/how it works/i)).toBeInTheDocument();
expect(screen.getByRole("link", { name: /contact support/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to confirm the page is not wired yet**

Run: `npm run test -- src/pages/AffiliateProgramPage.test.tsx`
Expected: FAIL until the page and route are added.

- [ ] **Step 3: Add the page route and render the affiliate doc**

```tsx
<Route path="/pages/affiliate-program" element={<AffiliateProgramPage />} />
```

Structure the page around benefits, eligibility, what affiliates promote, the step-by-step process, FAQ, and a CTA to `/contact` for applications. Keep the tone mission-led and welcoming, not sales-bro or copy-heavy.

- [ ] **Step 4: Run the test again and verify the page shape**

Run: `npm run test -- src/pages/AffiliateProgramPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the affiliate page**

```bash
git add src/content/pages/affiliate-program.ts src/pages/AffiliateProgramPage.tsx src/App.tsx src/pages/AffiliateProgramPage.test.tsx
git commit -m "feat: add affiliate program page"
```

### Task 5: Regression pass and scope lock

**Files:**
- Modify only if a regression appears in `src/components/storefront/EditorialPageTemplate.tsx`, `src/pages/AboutPage.tsx`, `src/pages/MissionVisionPage.tsx`, `src/pages/AffiliateProgramPage.tsx`, or `src/App.tsx`
- Test: `npm run test`
- Test: `npm run build`

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS for the existing storefront suite plus the three new editorial pages.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS with no routing errors and no broken content imports.

- [ ] **Step 3: Browser-check the three scoped pages**

Verify `/about`, `/pages/our-mission-vision`, and `/pages/affiliate-program` on desktop and mobile widths.

- [ ] **Step 4: Confirm the scope stayed locked**

Check that no header, home, catalog, product, cart, wishlist, or policy-page files were changed for this request.

