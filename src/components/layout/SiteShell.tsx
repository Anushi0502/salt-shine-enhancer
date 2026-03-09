import { useEffect, useState, type PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import MainHeader from "@/components/layout/MainHeader";
import MainFooter from "@/components/layout/MainFooter";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import { useCollections } from "@/lib/shopify-data";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

const ENTRY_SPLASH_MAX_MS = 2400;
const ENTRY_SPLASH_MIN_MS = 900;

const SiteShell = ({ children }: PropsWithChildren) => {
  const [splashStartedAt] = useState(() => Date.now());
  const [showEntrySplash, setShowEntrySplash] = useState(
    () => typeof window !== "undefined" && window.location.pathname === "/",
  );
  const { data: collectionsPayload } = useCollections();
  const rankedCollections = [...(collectionsPayload?.collections || [])].sort((a, b) => {
    if (b.products_count !== a.products_count) {
      return b.products_count - a.products_count;
    }

    return (
      new Date(b.updated_at || b.published_at || "1970-01-01").getTime() -
      new Date(a.updated_at || a.published_at || "1970-01-01").getTime()
    );
  });
  const gardenCollection = rankedCollections.find((collection) =>
    /garden|tool/i.test(`${collection.title} ${collection.handle}`),
  );
  const gardenLoaderImage = 'https://m.media-amazon.com/images/I/81Lg3hkn5KL.jpg';
  const hasGardenLoaderImage = Boolean(gardenLoaderImage);

  useEffect(() => {
    if (!showEntrySplash || typeof window === "undefined") {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => setShowEntrySplash(false),
      reducedMotion ? 420 : ENTRY_SPLASH_MAX_MS,
    );

    return () => window.clearTimeout(timer);
  }, [showEntrySplash]);

  useEffect(() => {
    if (!showEntrySplash || typeof window === "undefined" || !collectionsPayload) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minVisibleMs = reducedMotion ? 260 : ENTRY_SPLASH_MIN_MS;
    const elapsedMs = Date.now() - splashStartedAt;
    const remainingMs = Math.max(0, minVisibleMs - elapsedMs);
    const timer = window.setTimeout(() => setShowEntrySplash(false), remainingMs);

    return () => window.clearTimeout(timer);
  }, [collectionsPayload, showEntrySplash, splashStartedAt]);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {showEntrySplash ? (
        <div className="salt-entry-overlay" role="status" aria-live="polite" aria-label="Loading storefront">
          <div className="salt-entry-banner">
            <div className="salt-entry-media">
              <div className="salt-entry-rail" aria-hidden="true">
                <span className="salt-entry-barcode" />
                <span className="salt-entry-dotline" />
              </div>
              <div className={`salt-entry-hero-core${hasGardenLoaderImage ? " salt-entry-hero-core--image" : ""}`}>
                {hasGardenLoaderImage ? (
                  <>
                    <img
                      src={gardenLoaderImage || ""}
                      alt={gardenCollection?.title || "Garden collection"}
                      className="salt-entry-live-image"
                      loading="eager"
                    />
                    <span className="salt-entry-image-veil" aria-hidden="true" />
                  </>
                ) : null}
                <span className="salt-entry-offer">
                  <strong>UP TO</strong>
                  <em>40%</em>
                  <small>OFF</small>
                </span>
                {!hasGardenLoaderImage ? (
                  <>
                    <div className="salt-entry-tool-row" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="salt-entry-ground" aria-hidden="true" />
                  </>
                ) : null}
                <p className="salt-entry-media-note">
                  {hasGardenLoaderImage
                    ? "Live garden collection cover • Updated from Shopify"
                    : "Limited seasonal drop • Curated for everyday outdoor tasks"}
                </p>
              </div>
            </div>
            <div className="salt-entry-copy">
              <p className="salt-entry-kicker">Garden Essentials</p>
              <h2>Outdoor tools ready for this season</h2>
              <p>Hand-picked picks for pruning, planting, and easy maintenance with faster, cleaner checkout.</p>
              <div className="salt-entry-stat-strip">
                <span>Live pricing</span>
                <span>Secure checkout</span>
                <span>Dispatch-ready picks</span>
              </div>
              <div className="salt-entry-cta">Loading catalog…</div>
              <div className="salt-entry-progress" aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_12%_8%,rgba(200,105,46,0.33),transparent_36%),radial-gradient(circle_at_88%_16%,rgba(59,121,104,0.24),transparent_34%)] opacity-80 dark:opacity-45" />
      <div className="pointer-events-none absolute inset-x-0 top-[42%] -z-10 h-[620px] bg-[radial-gradient(circle_at_20%_30%,rgba(186,168,117,0.22),transparent_32%),radial-gradient(circle_at_85%_68%,rgba(200,105,46,0.18),transparent_36%)] opacity-75 dark:opacity-38" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_55%_90%,rgba(39,88,75,0.18),transparent_42%)] opacity-70 dark:opacity-35" />
      <div className="pointer-events-none absolute inset-x-0 top-[18%] -z-10 h-[420px] bg-[radial-gradient(circle_at_50%_40%,rgba(230,210,164,0.2),transparent_52%)] opacity-70 dark:opacity-32" />

      <MainHeader />
      <ChatBootstrap />
      <main id="main-content" className="relative">{children || <Outlet />}</main>
      <MainFooter />
    </div>
  );
};

export default SiteShell;
