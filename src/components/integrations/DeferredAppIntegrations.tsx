import { useEffect, useState, type ComponentType } from "react";
import { scheduleAfterPaint } from "@/lib/after-paint";

type DeferredIntegrationComponents = {
  MetaPixelTracker: ComponentType;
  NotificationBootstrap: ComponentType;
};

export default function DeferredAppIntegrations() {
  const [components, setComponents] = useState<DeferredIntegrationComponents | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      void Promise.all([
        import("@/components/integrations/MetaPixelTracker"),
        import("@/components/integrations/NotificationBootstrap"),
      ])
        .then(([metaPixelModule, notificationModule]) => {
          if (cancelled) {
            return;
          }

          setComponents({
            MetaPixelTracker: metaPixelModule.default,
            NotificationBootstrap: notificationModule.default,
          });
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, []);

  if (!components) {
    return null;
  }

  const { MetaPixelTracker, NotificationBootstrap } = components;

  return (
    <>
      <MetaPixelTracker />
      <NotificationBootstrap />
    </>
  );
}
