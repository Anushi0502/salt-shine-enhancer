import { useParams } from "react-router-dom";
import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

type RouteEditorialPageProps = {
  resolveHandle: (params: Readonly<Record<string, string | undefined>>) => string;
  loadingTitle: string;
  loadingSubtitle: string;
  errorTitle: string;
  errorSubtitle: string;
};

const RouteEditorialPage = ({
  resolveHandle,
  loadingTitle,
  loadingSubtitle,
  errorTitle,
  errorSubtitle,
}: RouteEditorialPageProps) => {
  const params = useParams();

  return (
    <EditorialPageByHandle
      handle={resolveHandle(params)}
      loadingTitle={loadingTitle}
      loadingSubtitle={loadingSubtitle}
      errorTitle={errorTitle}
      errorSubtitle={errorSubtitle}
    />
  );
};

export default RouteEditorialPage;

