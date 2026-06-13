import EditorialPageTemplate from "@/components/storefront/EditorialPageTemplate";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useEditorialPage } from "@/lib/shopify-data";

const MissionVisionPage = () => {
  const { data, isLoading, error, refetch } = useEditorialPage("mission-vision");

  if (isLoading) {
    return (
      <LoadingState
        title="Loading Mission & Vision"
        subtitle="Fetching the workbook-backed mission statement."
      />
    );
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title="Mission & Vision unavailable"
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

export default MissionVisionPage;

