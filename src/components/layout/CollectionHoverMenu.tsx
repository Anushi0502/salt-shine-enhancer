import { useEffect, useState } from "react";
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
  const [activeCollectionHandle, setActiveCollectionHandle] = useState<string | null>(null);

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

  if (!collections.length) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      <div className="rounded-[0.85rem] border border-[#e2edf8] bg-white shadow-[0_16px_32px_-28px_rgba(12,32,72,0.18)]">
        <div className="flex items-center justify-between border-b border-[#e2edf8] px-2.5 py-2">
          <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Collections</p>
          <p className="text-[0.48rem] font-semibold uppercase tracking-[0.14em] text-[#8a99aa]">
            {collections.length} live groups
          </p>
        </div>

        <div className="max-h-[15rem] space-y-0.5 overflow-y-auto p-1.5 pr-1">
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
                    className={cn(
                      "group flex w-full items-center justify-between rounded-[0.85rem] border px-2.5 py-2 text-left text-[0.8rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                      isActive
                        ? "border-[#a8c8ff] bg-[#dce9ff] text-[#0f3b7f] shadow-[0_8px_20px_rgba(74,120,204,0.12)]"
                        : "border-transparent text-slate-700 hover:border-[#d9e6fa] hover:bg-[#f2f7ff]",
                    )}
                    aria-expanded={isActive}
                    aria-haspopup="dialog"
                  >
                    <span className="min-w-0 flex-1 leading-snug">{collection.title}</span>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#dbe8f6] bg-white text-[#7d90aa] transition group-hover:border-[#bfd7f2] group-hover:text-[#1f55aa]">
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition", isActive ? "rotate-90 text-[#1654b2]" : "")}
                      />
                    </span>
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  align="start"
                  side="right"
                  sideOffset={12}
                  collisionPadding={12}
                  className="z-50 w-[min(15.5rem,calc(100vw-1rem))] max-w-[min(15.5rem,calc(100vw-1rem))] rounded-[0.85rem] border border-[#d8e6f5] bg-[#eef5ff] p-2.5 shadow-[0_16px_38px_-30px_rgba(12,32,72,0.25)]"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-[#dbe8f6] pb-2.5">
                    <div className="min-w-0">
                      <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">
                        Subcategories
                      </p>
                      <h3 className="mt-0.5 truncate text-[0.9rem] font-semibold leading-5 text-[#102A43]">
                        {collection.title}
                      </h3>
                    </div>

                    <Link
                      to={buildCollectionRoute(collection.handle)}
                      onClick={() => {
                        onLinkClick?.();
                        setActiveCollectionHandle(null);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#9cbcf2] bg-white px-2.5 py-1 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#1c4d94] transition hover:border-[#7ea9ef] hover:bg-[#f8fbff]"
                    >
                      <span>View all</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="mt-2 grid gap-1">
                    {collection.subcollections.length ? (
                      collection.subcollections.map((subcollection) => (
                        <Link
                          key={subcollection.handle}
                          to={buildSubcollectionRoute(collection.handle, subcollection.handle)}
                          onClick={() => {
                            onLinkClick?.();
                            setActiveCollectionHandle(null);
                          }}
                          className="group flex items-center justify-between rounded-[0.65rem] px-2.5 py-2 text-[0.75rem] font-medium text-[#102A43] transition hover:bg-white hover:text-[#1c4d94]"
                        >
                          <span className="line-clamp-1">{subcollection.title}</span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[0.65rem] border border-dashed border-[#cfdff2] bg-white px-2.5 py-3 text-[0.75rem] text-[#5C748F]">
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
