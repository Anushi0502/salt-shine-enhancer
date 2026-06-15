import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const CollectionsPage = () => {
  return (
    <EditorialPageByHandle
      handle="collections"
      loadingTitle="Loading collections"
      loadingSubtitle="Building the curated collection directory."
      errorTitle="Collection directory unavailable"
      errorSubtitle="Please retry to refresh the collections page."
    />
  );
};

export default CollectionsPage;

