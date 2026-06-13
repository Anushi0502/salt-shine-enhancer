import EditorialPageTemplate from "@/components/storefront/EditorialPageTemplate";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useAboutPage } from "@/lib/shopify-data";

const AboutPage = () => {
  const { data, isLoading, error, refetch } = useAboutPage();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading About"
        subtitle="Fetching the workbook-backed About content."
      />
    );
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title="About page unavailable"
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

export default AboutPage;

