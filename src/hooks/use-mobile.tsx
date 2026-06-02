import * as React from "react";

const MOBILE_MAX_WIDTH = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
