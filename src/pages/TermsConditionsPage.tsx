import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const TermsConditionsPage = () => {
  return (
    <EditorialPageByHandle
      handle="terms-conditions"
      loadingTitle="Loading Terms & Conditions"
      loadingSubtitle="Fetching the store terms page."
      errorTitle="Terms & Conditions unavailable"
      errorSubtitle="Please retry to refresh the terms page."
    />
  );
};

export default TermsConditionsPage;

