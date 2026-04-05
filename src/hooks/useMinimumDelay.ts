import { useEffect, useState } from "react";

export function useMinimumDelay(durationMs: number): boolean {
  const normalizedDuration = Math.max(0, Math.floor(durationMs || 0));
  const [elapsed, setElapsed] = useState(normalizedDuration === 0);

  useEffect(() => {
    if (normalizedDuration === 0) {
      setElapsed(true);
      return;
    }

    setElapsed(false);
    const timer = window.setTimeout(() => setElapsed(true), normalizedDuration);

    return () => window.clearTimeout(timer);
  }, [normalizedDuration]);

  return elapsed;
}
