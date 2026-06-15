import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const AffiliateProgramPage = () => {
  return (
    <EditorialPageByHandle
      handle="affiliate-program"
      loadingTitle="Loading Affiliate Program"
      loadingSubtitle="Fetching the workbook-backed affiliate details."
      errorTitle="Affiliate Program unavailable"
      errorSubtitle="Please retry to refresh the page content."
    />
  );
};

export default AffiliateProgramPage;
