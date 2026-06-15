import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ShopPage from "@/pages/ShopPage";
import { getSubcollectionByHandle, resolveCollectionShopifyHandle } from "@/lib/site-navigation";

const CollectionSubcollectionRoutePage = () => {
  const { handle, subhandle } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const normalizedSubhandle = String(subhandle || "").trim().toLowerCase();

  const subcollection = useMemo(() => {
    if (!normalizedHandle || !normalizedSubhandle) {
      return null;
    }

    return getSubcollectionByHandle(normalizedHandle, normalizedSubhandle);
  }, [normalizedHandle, normalizedSubhandle]);

  useEffect(() => {
    if (!normalizedHandle) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    let changed = false;

    const feedHandle = subcollection?.shopifyHandle || resolveCollectionShopifyHandle(normalizedHandle);
    if (feedHandle && next.get("collection") !== feedHandle) {
      next.set("collection", feedHandle);
      changed = true;
    }

    const nextMin = subcollection?.priceFilter?.min;
    const nextMax = subcollection?.priceFilter?.max;

    if (nextMin != null) {
      const minValue = String(nextMin);
      if (next.get("min") !== minValue) {
        next.set("min", minValue);
        changed = true;
      }
    } else if (next.has("min")) {
      next.delete("min");
      changed = true;
    }

    if (nextMax != null) {
      const maxValue = String(nextMax);
      if (next.get("max") !== maxValue) {
        next.set("max", maxValue);
        changed = true;
      }
    } else if (next.has("max")) {
      next.delete("max");
      changed = true;
    }

    const hasDirectFeed = Boolean(subcollection?.shopifyHandle || subcollection?.priceFilter);
    const nextQuery = hasDirectFeed ? "" : subcollection?.searchQuery?.trim() || "";
    if (nextQuery) {
      if (next.get("q") !== nextQuery) {
        next.set("q", nextQuery);
        changed = true;
      }
    } else if (next.has("q")) {
      next.delete("q");
      changed = true;
    }

    if (next.has("page")) {
      next.delete("page");
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [
    normalizedHandle,
    searchParams,
    setSearchParams,
    subcollection?.searchQuery,
    subcollection?.shopifyHandle,
    subcollection?.priceFilter?.max,
    subcollection?.priceFilter?.min,
  ]);

  return <ShopPage />;
};

export default CollectionSubcollectionRoutePage;
