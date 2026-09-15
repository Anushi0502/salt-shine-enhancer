import { asArray, createShopifyAdminGraphQLClient, normalizeText } from "./shopify-admin-graphql-client.mjs";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const rootDir = process.cwd();
const outputPath = resolve(rootDir, "output", "salt-gsc-404-redirect-repair-2026-09-15.json");
const origin = "https://www.saltonlinestore.com";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--verify") ? "verify" : "dry-run";

// Each source URL was an active GSC 404 example. Targets were selected from the
// fresh active Shopify catalog and must remain indexable, self-canonical pages.
const redirects = [
  {
    source: "/products/formal-black-slim-fit-business-suit-set-for-men-elegant-double-breasted-tuxedo-2-pieces-customized-mens-suits-wedding-party",
    target: "/products/new-mens-suit-2-piece-business-formal-blazer-double-breasted-design-groom-tuxedo-for-wedding-xs-6xl-outfit",
    reason: "current two-piece men's formal suit with double-breasted tuxedo wording",
  },
  {
    source: "/products/for-magsafe-magnetic-vacuum-adsorption-suction-cup-bracket-360-rotatable-folding-magnetic-car-stable-holder-for-magsafe-iphone",
    target: "/products/upgraded-foldable-magnetic-car-phone-holder-n52-magnet-360-rotatable-dashboard-suction-cup-abs-with-wrench-mount-pad",
    reason: "current Magsafe-compatible magnetic 360-degree car holder",
  },
  {
    source: "/products/for-dr-althea-345-face-moisturizer-daily-soothing-cream-mist-for-skin-recovery-nourishing-calming-gentle-care-for-all-skin-1",
    target: "/products/for-dr-althea-345-face-moisturizer-daily-soothing-cream-mist-for-skin-recovery-nourishing-calming-gentle-care-for-all-skin",
    reason: "current canonical Dr Althea 345 product without the duplicate -1 suffix",
  },
  {
    source: "/products/meal-planner",
    target: "/products/recipe-notebook-100-sheets-recipe-book-empty-cookbook-handwritten-cooking-planner-for-daily-meal-prep-beginners-baking",
    reason: "current recipe notebook explicitly includes meal-prep planning use",
  },
  {
    source: "/products/fashion-creativity-usb-flash-drive-128gb-64gb-pen-drive-4gb-8gb-16gb-32gb-pen-drive-usb-2-0-flash-memory-stick-custom-logo",
    target: "/products/original-pen-drive-16tb-usb-3-2-flash-drive-high-speed-pen-drive-type-c-metal-usb-memory-for-computer-storage-devices",
    reason: "current pen-drive and USB flash-storage product",
  },
  {
    source: "/products/1pc-washable-portable-lint-roller-pet-hair-remover-for-clothes-sofas-beds-ideal-for-cat-owners-furniture-cleaning",
    target: "/products/1pc-washable-portable-lint-roller-pet-hair-remover-for-clothes-sofas-beds-ideal-for-cat-owners-furniture-cleaning-1",
    reason: "current active duplicate-suffix product with the same lint-roller listing",
  },
  {
    source: "/products/collagen-moisturizing-mask-deep-hydration-lock-soothing-redness-cuticle-repair-long-lasting-moisturization-hydrating-face-mask-1",
    target: "/products/collagen-moisturizing-mask-deep-hydration-lock-soothing-redness-cuticle-repair-long-lasting-moisturization-hydrating-face-mask",
    reason: "current canonical collagen moisturizing mask without the duplicate -1 suffix",
  },
  {
    source: "/products/cc-cream-color-changing-liquid-foundation-centella-korean-high-coverage-foundation-foundation-cream-for-face-base-makeup",
    target: "/products/cc-cream-centella-high-coverage-foundation-foundation-cream-for-face-base-makeup-color-changing-liquid-foundation-korean-makeup",
    reason: "current Centella color-changing CC cream with matching foundation intent",
  },
];

function parseMeta(html, pattern) {
  return html.match(pattern)?.[1] || null;
}

async function readPublicTarget(target) {
  const response = await fetch(`${origin}${target}`, { redirect: "follow" });
  const html = await response.text();
  return {
    status: response.status,
    finalUrl: response.url,
    canonical: parseMeta(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i),
    robots: parseMeta(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i),
    title: parseMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.replace(/\s+/g, " ").trim() || null,
  };
}

function assertTargetContract(entry, result) {
  if (result.status !== 200) throw new Error(`${entry.target} returned HTTP ${result.status}`);
  if (result.finalUrl !== `${origin}${entry.target}`) throw new Error(`${entry.target} followed to ${result.finalUrl}`);
  if (result.canonical !== `${origin}${entry.target}`) throw new Error(`${entry.target} is not self-canonical`);
  if (!/^index,follow(?:,|$)/i.test(String(result.robots || ""))) {
    throw new Error(`${entry.target} is not indexable: ${result.robots || "missing robots metadata"}`);
  }
}

const targetReadback = [];
for (const entry of redirects) {
  const readback = await readPublicTarget(entry.target);
  assertTargetContract(entry, readback);
  targetReadback.push({ ...entry, readback });
}

const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "gsc-404-redirect-repair" });
const existingData = await client.run(
  `#graphql
    query Gsc404Redirects {
      urlRedirects(first: 250) { nodes { path target } }
    }
  `,
  {},
  { operation: "read Shopify redirects for GSC 404 repair" },
);
const existing = new Map(asArray(existingData?.urlRedirects?.nodes).map((redirect) => [redirect.path, redirect.target]));
const conflicts = redirects.filter((entry) => existing.has(entry.source) && existing.get(entry.source) !== entry.target);
if (conflicts.length) {
  throw new Error(`Existing redirect target conflict: ${conflicts.map((entry) => `${entry.source} -> ${existing.get(entry.source)}`).join("; ")}`);
}

const created = [];
const alreadyPresent = redirects.filter((entry) => existing.get(entry.source) === entry.target).map((entry) => entry.source);

if (mode === "apply") {
  for (const entry of redirects) {
    if (existing.get(entry.source) === entry.target) continue;
    const result = await client.run(
      `#graphql
        mutation CreateGsc404Redirect($redirect: UrlRedirectInput!) {
          urlRedirectCreate(urlRedirect: $redirect) {
            urlRedirect { path target }
            userErrors { field message }
          }
        }
      `,
      { redirect: { path: entry.source, target: entry.target } },
      { allowMutations: true, operation: `create GSC 404 redirect ${entry.source}` },
    );
    const errors = asArray(result?.urlRedirectCreate?.userErrors);
    if (errors.length) throw new Error(`${entry.source}: ${errors.map((error) => normalizeText(error.message)).join("; ")}`);
    created.push(result.urlRedirectCreate.urlRedirect);
    existing.set(entry.source, entry.target);
  }
}

const verificationData = await client.run(
  `#graphql
    query VerifyGsc404Redirects {
      urlRedirects(first: 250) { nodes { path target } }
    }
  `,
  {},
  { operation: "verify Shopify GSC 404 redirects" },
);
const verifiedRedirects = new Map(asArray(verificationData?.urlRedirects?.nodes).map((redirect) => [redirect.path, redirect.target]));
const missingAfterMode = redirects.filter((entry) => verifiedRedirects.get(entry.source) !== entry.target).map((entry) => entry.source);

const manifest = {
  generatedAt: new Date().toISOString(),
  mode,
  scope: "Eight current GSC Not found (404) product examples with evidence-backed active replacement targets",
  sourceEvidence: "GSC Page indexing Not found (404) drilldown, last update 2026-09-04; public target readback performed before Admin mutation",
  targetReadback,
  alreadyPresent,
  created,
  verifiedCount: redirects.length - missingAfterMode.length,
  missingAfterMode,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
if (missingAfterMode.length) throw new Error(`GSC 404 redirect verification incomplete: ${missingAfterMode.join(", ")}`);
process.stdout.write(`${mode} complete: ${redirects.length} target contracts verified; ${created.length} redirects created; ${alreadyPresent.length} already present.\n`);
process.stdout.write(`Manifest: ${outputPath}\n`);
