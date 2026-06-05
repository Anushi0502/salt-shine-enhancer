import { useEffect, useRef, useState } from "react";
import { isNativeApp, NATIVE_LAUNCH_READY_EVENT } from "@/lib/mobile";

const NativeAppLaunchBanner = () => {
  const [isMounted, setIsMounted] = useState(isNativeApp());
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isNativeApp()) {
      return undefined;
    }

    const dismissBanner = () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
      }

      setIsExiting(true);
      exitTimerRef.current = window.setTimeout(() => {
        setIsMounted(false);
      }, 360);
    };

    window.addEventListener(NATIVE_LAUNCH_READY_EVENT, dismissBanner);

    const fallbackTimer = window.setTimeout(dismissBanner, 3200);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
      }
      window.removeEventListener(NATIVE_LAUNCH_READY_EVENT, dismissBanner);
    };
  }, []);

  if (!isNativeApp() || !isMounted) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center bg-[#eef5ff] px-6 transition-opacity duration-300 ease-out ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,rgba(30,58,110,0.96),rgba(61,122,171,0.88)_58%,rgba(255,241,204,0.94))] p-6 text-white shadow-[0_24px_80px_rgba(14,26,52,0.34)]">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top_right,rgba(255,255,255,0.36),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,223,128,0.18),transparent_30%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-white/30 bg-white/95 p-2 shadow-[0_10px_24px_rgba(14,26,52,0.2)]">
            <img
              src="/brand/salt-logo.png"
              alt="S.A.L.T."
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-white/70">S.A.L.T.</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Opening your store</h1>
            <p className="mt-2 text-sm leading-6 text-white/88">
              Loading the live Shopify catalog and app navigation.
            </p>
          </div>
        </div>

        <div className="relative mt-6 overflow-hidden rounded-full bg-white/12">
          <div className="h-2 w-full rounded-full bg-white/12">
            <div className="native-launch-progress h-full w-1/2 rounded-full bg-gradient-to-r from-[#f6cf6d] via-white to-[#7ae1f1]" />
          </div>
        </div>

        <p className="relative mt-4 text-xs uppercase tracking-[0.36em] text-white/65">
          Please wait
        </p>
      </div>
    </div>
  );
};

export default NativeAppLaunchBanner;
