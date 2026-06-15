import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const WholesaleInquiriesPage = () => {
  return (
    <EditorialPageByHandle
      handle="wholesale-inquiries"
      loadingTitle="Loading wholesale inquiries"
      loadingSubtitle="Preparing the wholesale support page."
      errorTitle="Wholesale inquiries unavailable"
      errorSubtitle="Please retry to refresh the wholesale page."
    />
  );
};

export default WholesaleInquiriesPage;

