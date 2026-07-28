import { useCallback, useEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { cn } from "@/lib/utils";
import { buildHomeCollectionHierarchy } from "@/lib/collection-hierarchy";
import type { ShopifyCollection } from "@/types/shopify";

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function isActiveHandle(activeHandle: string, candidate: string): boolean {
  return normalizeHandle(activeHandle) === normalizeHandle(candidate);
}

export interface HomeCategoryHierarchyProps {
  collections: ShopifyCollection[];
  className?: string;
}

export function HomeCategoryHierarchy({ collections, className }: HomeCategoryHierarchyProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hierarchy = useMemo(() => buildHomeCollectionHierarchy(collections), [collections]);
  const liveCategoryHandles = useMemo(
    () => new Set(hierarchy.categories.map((category) => normalizeHandle(category.handle))),
    [hierarchy.categories],
  );

  const currentCategoryHandle = normalizeHandle(searchParams.get("category"));
  const selectedCategoryHandle =
    (currentCategoryHandle && liveCategoryHandles.has(currentCategoryHandle) && currentCategoryHandle) ||
    hierarchy.defaultCategoryHandle ||
    "";

  const selectedCategory = useMemo(
    () => hierarchy.categories.find((category) => isActiveHandle(category.handle, selectedCategoryHandle)) || null,
    [hierarchy.categories, selectedCategoryHandle],
  );

  useEffect(() => {
    if (!selectedCategoryHandle) {
      return;
    }

    if (currentCategoryHandle === selectedCategoryHandle) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("category", selectedCategoryHandle);
    setSearchParams(nextParams, { replace: !currentCategoryHandle || !liveCategoryHandles.has(currentCategoryHandle) });
  }, [currentCategoryHandle, liveCategoryHandles, searchParams, selectedCategoryHandle, setSearchParams]);

  const selectCategory = useCallback(
    (handle: string) => {
      const normalizedHandle = normalizeHandle(handle);
      if (!normalizedHandle || normalizedHandle === selectedCategoryHandle || !liveCategoryHandles.has(normalizedHandle)) {
        return;
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("category", normalizedHandle);
      setSearchParams(nextParams);
    },
    [liveCategoryHandles, searchParams, selectedCategoryHandle, setSearchParams],
  );

  if (!hierarchy.categories.length || !selectedCategory) {
    return (
      <div className={cn("rounded-[1.5rem] border border-border/70 bg-background/92 px-4 py-5 text-sm text-muted-foreground", className)}>
        Live collections are loading.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {hierarchy.featuredShortcuts.length ? (
        <div className="flex flex-wrap gap-2">
          {hierarchy.featuredShortcuts.map((shortcut) => (
            <Link
              key={shortcut.handle}
              to={shortcut.href}
              className="salt-outline-chip inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold tracking-[0.02em]"
            >
              <span>{shortcut.label}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <div className="rounded-[1.5rem] border border-border/70 bg-background/92 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">All Departments</p>
          </div>
          <div className="max-h-[18rem] space-y-1 overflow-y-auto p-2 pr-1 lg:max-h-[29rem]">
            {hierarchy.categories.map((category) => {
              const active = isActiveHandle(category.handle, selectedCategory.handle);

              return (
                <button
                  key={category.handle}
                type="button"
                aria-pressed={active}
                onClick={() => selectCategory(category.handle)}
                className={cn(
                    "group flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-[0.95rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary/20 bg-primary/10 text-foreground shadow-[0_8px_20px_rgba(15,23,42,0.1)]"
                      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40",
                  )}
                >
                  <span className="leading-snug">{category.label}</span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition group-hover:translate-x-0.5",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border/70 bg-background/92 px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-[36rem]">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                {selectedCategory.collectionTitle}
              </p>
              <h3 className="mt-1 font-display text-[1.18rem] leading-tight text-foreground sm:text-[1.3rem]">
                {selectedCategory.label}
              </h3>
            </div>

            <Link
              to={selectedCategory.href}
              className="salt-outline-chip inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold"
              aria-label={`View all ${selectedCategory.label}`}
            >
              <span>View all</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeCategoryHierarchy;
