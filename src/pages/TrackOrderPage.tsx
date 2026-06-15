import EditorialPageByHandle from "@/components/storefront/EditorialPageByHandle";

const TrackOrderPage = () => {
  return (
    <EditorialPageByHandle
      handle="track-order"
      loadingTitle="Loading track order"
      loadingSubtitle="Opening the order portal bridge."
      errorTitle="Track order unavailable"
      errorSubtitle="Please retry to refresh the tracking page."
    />
  );
};

export default TrackOrderPage;

