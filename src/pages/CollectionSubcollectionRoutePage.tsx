import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ShopPage from "@/pages/ShopPage";
import { getSubcollectionByHandle } from "@/lib/site-navigation";

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

    if (next.get("collection") !== normalizedHandle) {
      next.set("collection", normalizedHandle);
      changed = true;
    }

    const nextQuery = subcollection?.searchQuery?.trim() || "";
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
  }, [normalizedHandle, searchParams, setSearchParams, subcollection?.searchQuery]);

  return <ShopPage />;
};

export default CollectionSubcollectionRoutePage;
