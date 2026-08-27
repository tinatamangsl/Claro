import { useEffect, useState } from "react";

/** Tailwind's `md`. Above it there is room to leave long sections open. */
const WIDE = 768;

/**
 * Is there room for the long sections to sit open?
 *
 * **Safe to read at first render here, and only here.** `AppShell` renders a
 * skeleton until the store is `ready`, so nothing that calls this has ever been
 * rendered on the server or in the client's first pass: by the time it runs
 * there is a real window to ask. The `typeof window` guard is belt and braces
 * for anything that later renders outside that gate, and the honest answer in
 * that case is the narrow one, because collapsed is the safe default.
 *
 * A media query rather than a resize listener on `innerWidth`: the browser
 * already knows when the answer changes and says so once, instead of firing on
 * every pixel of a drag.
 *
 * `matchMedia` is reached for through an optional call because jsdom does not
 * implement it, and a hook that throws in every test that happens to render a
 * page is worse than one that answers "narrow" where it cannot tell.
 */
function query(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia?.(`(min-width: ${WIDE}px)`) ?? null;
}

export function useIsWide(): boolean {
  const [wide, setWide] = useState(() => query()?.matches ?? false);

  useEffect(() => {
    const mql = query();
    if (!mql) return;
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return wide;
}
