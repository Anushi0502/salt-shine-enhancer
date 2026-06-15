import EditorialPageTemplate from "@/components/storefront/EditorialPageTemplate";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useEditorialPage } from "@/lib/shopify-data";

type EditorialPageByHandleProps = {
  handle: string;
  loadingTitle: string;
  loadingSubtitle: string;
  errorTitle: string;
  errorSubtitle: string;
};

const EditorialPageByHandle = ({
  handle,
  loadingTitle,
  loadingSubtitle,
  errorTitle,
  errorSubtitle,
}: EditorialPageByHandleProps) => {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const { data, isLoading, error, refetch } = useEditorialPage(normalizedHandle);

  if (isLoading) {
    return <LoadingState title={loadingTitle} subtitle={loadingSubtitle} />;
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title={errorTitle}
        subtitle={errorSubtitle}
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

export default EditorialPageByHandle;

