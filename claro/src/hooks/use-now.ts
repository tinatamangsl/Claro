import { useEffect, useState } from "react";

/**
 * The app's single tick source.
 *
 * It returns `null` until mount, so nothing time-dependent is rendered on the
 * server or during hydration — the same contract the store's `ready` flag keeps.
 * Pass `null` as the interval when nothing is counting, so a page with no live
 * timer isn't waking up once a second for nothing.
 */
export function useNow(intervalMs: number | null): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (intervalMs === null) {
      setNow(null);
      return;
    }

    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(tick);
  }, [intervalMs]);

  return now;
}
