import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { buildCollectionRoute, buildSubcollectionRoute, type SiteCollection } from "@/lib/site-navigation";

type CollectionHoverMenuProps = {
  collections: SiteCollection[];
  className?: string;
  onLinkClick?: () => void;
};

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function CollectionHoverMenu({ collections, className, onLinkClick }: CollectionHoverMenuProps) {
  const defaultHandle = normalizeHandle(collections[0]?.handle);
  const [activeCollectionHandle, setActiveCollectionHandle] = useState(defaultHandle);
  const [submenuOpen, setSubmenuOpen] = useState(Boolean(defaultHandle));
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setSubmenuOpen(false);
    }, 160);
  }, [clearCloseTimeout]);

  const openCollection = useCallback(
    (handle: string) => {
      const normalizedHandle = normalizeHandle(handle);
      if (!normalizedHandle) {
        return;
      }

      clearCloseTimeout();
      setActiveCollectionHandle(normalizedHandle);
      setSubmenuOpen(true);
    },
    [clearCloseTimeout],
  );

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, [clearCloseTimeout]);

  useEffect(() => {
    if (!collections.length) {
      setActiveCollectionHandle("");
      setSubmenuOpen(false);
      return;
    }

    const liveHandles = new Set(collections.map((collection) => normalizeHandle(collection.handle)));
    if (!activeCollectionHandle || !liveHandles.has(activeCollectionHandle)) {
      const nextHandle = normalizeHandle(collections[0]?.handle);
      setActiveCollectionHandle(nextHandle);
      setSubmenuOpen(Boolean(nextHandle));
    }
  }, [activeCollectionHandle, collections]);

  const activeCollection = useMemo(() => {
    if (!collections.length) {
      return null;
    }

    return (
      collections.find((collection) => normalizeHandle(collection.handle) === activeCollectionHandle) ||
      collections[0] ||
      null
    );
  }, [activeCollectionHandle, collections]);

  if (!activeCollection) {
    return null;
  }

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={clearCloseTimeout}
      onMouseLeave={scheduleClose}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-[0.95rem] border border-[#e2edf8] bg-white shadow-[0_16px_32px_-28px_rgba(12,32,72,0.18)]">
          <div className="flex items-center justify-between border-b border-[#e2edf8] px-3 py-2.5">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Collections</p>
            <p className="text-[0.52rem] font-semibold uppercase tracking-[0.14em] text-[#8a99aa]">
              {collections.length} live groups
            </p>
          </div>

          <div className="max-h-[18rem] space-y-1 overflow-y-auto p-2 pr-1">
            {collections.map((collection) => {
              const isActive = normalizeHandle(collection.handle) === normalizeHandle(activeCollection.handle);

              return (
                <button
                  key={collection.handle}
                  type="button"
                  onMouseEnter={() => openCollection(collection.handle)}
                  onFocus={() => openCollection(collection.handle)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-[0.95rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                    isActive
                      ? "border-[#a8c8ff] bg-[#dce9ff] text-[#0f3b7f] shadow-[0_8px_20px_rgba(74,120,204,0.12)]"
                      : "border-transparent text-slate-700 hover:border-[#d9e6fa] hover:bg-[#f2f7ff]",
                  )}
                  aria-expanded={isActive && submenuOpen}
                >
                  <span className="min-w-0 flex-1 leading-snug">{collection.title}</span>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dbe8f6] bg-white text-[#7d90aa] transition group-hover:border-[#bfd7f2] group-hover:text-[#1f55aa]">
                    <ChevronRight
                      className={cn("h-4 w-4 transition", isActive ? "rotate-90 text-[#1654b2]" : "")}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative min-h-[18rem] lg:self-stretch">
          <div
            data-testid="collection-hover-submenu"
            onMouseEnter={clearCloseTimeout}
            onMouseLeave={scheduleClose}
            aria-hidden={!submenuOpen}
            data-state={submenuOpen ? "open" : "closed"}
            className={cn(
              "h-full max-h-[18rem] overflow-y-auto rounded-[0.95rem] border border-[#d8e6f5] bg-[#eef5ff] p-3 shadow-[0_16px_38px_-30px_rgba(12,32,72,0.25)] transition-all duration-200",
              submenuOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#dbe8f6] pb-3">
              <div className="min-w-0">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Subcategories</p>
                <h3 className="mt-1 truncate text-[1.03rem] font-semibold leading-6 text-[#102A43]">
                  {activeCollection.title}
                </h3>
              </div>

              <Link
                to={buildCollectionRoute(activeCollection.handle)}
                onClick={onLinkClick}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#9cbcf2] bg-white px-3 py-1.5 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[#1c4d94] transition hover:border-[#7ea9ef] hover:bg-[#f8fbff]"
              >
                <span>View all</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-3 grid gap-1.5">
              {activeCollection.subcollections.length ? (
                activeCollection.subcollections.map((subcollection) => (
                  <Link
                    key={subcollection.handle}
                    to={buildSubcollectionRoute(activeCollection.handle, subcollection.handle)}
                    onClick={onLinkClick}
                    className="group flex items-center justify-between rounded-[0.8rem] px-3 py-2.5 text-sm font-medium text-[#102A43] transition hover:bg-white hover:text-[#1c4d94]"
                  >
                    <span className="line-clamp-1">{subcollection.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                  </Link>
                ))
              ) : (
                <div className="rounded-[0.8rem] border border-dashed border-[#cfdff2] bg-white px-3 py-4 text-sm text-[#5C748F]">
                  No subcategories yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CollectionHoverMenu;
