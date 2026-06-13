import EditorialPageTemplate from "@/components/storefront/EditorialPageTemplate";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useEditorialPage } from "@/lib/shopify-data";

const AffiliateProgramPage = () => {
  const { data, isLoading, error, refetch } = useEditorialPage("affiliate-program");

  if (isLoading) {
    return (
      <LoadingState
        title="Loading Affiliate Program"
        subtitle="Fetching the workbook-backed affiliate details."
      />
    );
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title="Affiliate Program unavailable"
        subtitle="Please retry to refresh the page content."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  return <EditorialPageTemplate page={data.page} />;
};

export default AffiliateProgramPage;

