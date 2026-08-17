import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { buildCollectionRoute, buildSubcollectionRoute, type SiteCollection } from "@/lib/site-navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const [activeCollectionHandle, setActiveCollectionHandle] = useState<string | null>(
    () => normalizeHandle(collections[0]?.handle),
  );
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setActiveCollectionHandle(null);
      closeTimerRef.current = null;
    }, 150);
  }

  useEffect(() => {
    if (!collections.length) {
      setActiveCollectionHandle(null);
      return;
    }

    const liveHandles = new Set(collections.map((collection) => normalizeHandle(collection.handle)));
    if (activeCollectionHandle && !liveHandles.has(activeCollectionHandle)) {
      setActiveCollectionHandle(null);
    }
  }, [activeCollectionHandle, collections]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  if (!collections.length) {
    return null;
  }

  return (
    <div className={cn("relative flex min-h-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col rounded-[0.85rem] border border-border/70 bg-background/95 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-2">
          <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">Collections</p>
          <p className="text-[0.48rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {collections.length} live groups
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5 pr-1">
          {collections.map((collection) => {
            const collectionHandle = normalizeHandle(collection.handle);
            const isActive = activeCollectionHandle === collectionHandle;

            return (
              <Popover
                key={collection.handle}
                open={isActive}
                onOpenChange={(open) => {
                  setActiveCollectionHandle(open ? collectionHandle : null);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      clearCloseTimer();
                      setActiveCollectionHandle(collectionHandle);
                    }}
                    onMouseLeave={scheduleClose}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-[0.85rem] border px-2.5 py-2 text-left text-[0.8rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "border-primary/20 bg-primary/10 text-foreground shadow-[0_8px_20px_rgba(15,23,42,0.1)]"
                        : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40",
                    )}
                    aria-expanded={isActive}
                    aria-haspopup="dialog"
                  >
                    <span className="min-w-0 flex-1 leading-snug">{collection.title}</span>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition group-hover:border-primary/20 group-hover:text-primary">
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition", isActive ? "rotate-90 text-primary" : "")}
                      />
                    </span>
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  forceMount
                  align="start"
                  side="right"
                  sideOffset={12}
                  collisionPadding={12}
                  aria-hidden={!isActive}
                  data-testid="collection-hover-submenu"
                  onMouseEnter={clearCloseTimer}
                  onMouseLeave={scheduleClose}
                  className="isolate z-50 w-[min(18rem,calc(100vw-1rem))] max-w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-[1.05rem] border border-border/75 bg-background p-3 opacity-100 shadow-[0_24px_52px_-38px_rgba(15,23,42,0.24),inset_0_1px_0_hsl(0_0%_100%/0.72)] backdrop-blur-none"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
                    <div className="min-w-0">
                      <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Subcategories
                      </p>
                      <h3 className="mt-0.5 truncate text-[0.96rem] font-semibold leading-5 text-foreground">
                        {collection.title}
                      </h3>
                    </div>

                    <Link
                      to={buildCollectionRoute(collection.handle)}
                      onClick={() => {
                        onLinkClick?.();
                        setActiveCollectionHandle(null);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary/20 hover:bg-muted/40"
                    >
                      <span>View all</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="mt-2.5 grid max-h-[min(24rem,calc(100vh-12rem))] gap-1 overflow-y-auto pr-0.5">
                    {collection.subcollections.length ? (
                      collection.subcollections.map((subcollection) => (
                        <Link
                          key={subcollection.handle}
                          to={buildSubcollectionRoute(collection.handle, subcollection.handle)}
                          onClick={() => {
                            onLinkClick?.();
                            setActiveCollectionHandle(null);
                          }}
                          className="group flex items-center justify-between rounded-[0.85rem] border border-transparent px-3 py-2.5 text-[0.78rem] font-semibold leading-5 text-foreground transition hover:border-primary/12 hover:bg-muted/40 hover:text-primary"
                        >
                          <span className="line-clamp-1">{subcollection.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[0.85rem] border border-dashed border-border/70 bg-background px-3 py-3 text-[0.78rem] text-muted-foreground">
                        No subcategories yet.
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CollectionHoverMenu;
