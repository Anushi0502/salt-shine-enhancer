import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";
import SeoMetadata from "@/components/storefront/SeoMetadata";

const CollectionsPage = () => {
  return (
    <>
      <SeoMetadata canonicalPath="/collections" title="Collections | SALT Online Store" />
      <EditorialPageByHandle
        handle="collections"
        loadingTitle="Loading collections"
        loadingSubtitle="Building the curated collection directory."
        errorTitle="Collection directory unavailable"
        errorSubtitle="Please retry to refresh the collections page."
      />
    </>
  );
};

export default CollectionsPage;
