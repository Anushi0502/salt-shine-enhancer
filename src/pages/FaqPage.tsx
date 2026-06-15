import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const FaqPage = () => {
  return (
    <EditorialPageByHandle
      handle="faq"
      loadingTitle="Loading FAQ"
      loadingSubtitle="Fetching the support answers."
      errorTitle="FAQ unavailable"
      errorSubtitle="Please retry to refresh the FAQ page."
    />
  );
};

export default FaqPage;

