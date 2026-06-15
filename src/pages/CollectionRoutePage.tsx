import { useParams } from "react-router-dom";
import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";
import ShopPage from "@/pages/ShopPage";
import { getCollectionByHandle } from "@/lib/site-navigation";

const CollectionRoutePage = () => {
  const { handle } = useParams();
  const normalizedHandle = String(handle || "").trim().toLowerCase();

  if (getCollectionByHandle(normalizedHandle)) {
    return (
      <EditorialPageByHandle
        handle={normalizedHandle}
        loadingTitle="Loading collection"
        loadingSubtitle="Building the curated collection landing page."
        errorTitle="Collection unavailable"
        errorSubtitle="Please retry to refresh the collection landing page."
      />
    );
  }

  return <ShopPage />;
};

export default CollectionRoutePage;

