import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const MissionVisionPage = () => {
  return (
    <EditorialPageByHandle
      handle="mission-vision"
      loadingTitle="Loading Mission & Vision"
      loadingSubtitle="Fetching the workbook-backed mission statement."
      errorTitle="Mission & Vision unavailable"
      errorSubtitle="Please retry to refresh the page content."
    />
  );
};

export default MissionVisionPage;
