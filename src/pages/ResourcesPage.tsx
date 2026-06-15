import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const ResourcesPage = () => {
  return (
    <EditorialPageByHandle
      handle="resources"
      loadingTitle="Loading Resource Hub"
      loadingSubtitle="Building the AEO/GEO resource hub."
      errorTitle="Resource Hub unavailable"
      errorSubtitle="Please retry to refresh the resources page."
    />
  );
};

export default ResourcesPage;

