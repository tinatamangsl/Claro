import { useEffect, useRef, useState } from "react";

/**
 * Keeps text input local and fast, committing to the store on a debounce and on
 * blur. This is what makes "the whole store lives in one useState" viable —
 * typing re-renders a single leaf component rather than the whole tree.
 */
export function useDebouncedField(
  external: string,
  commit: (value: string) => void,
  delay = 350,
) {
  const [local, setLocal] = useState(external);
  const committed = useRef(external);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync when the underlying record changes beneath us — e.g. the user
  // navigates to a different day, or resets all data.
  useEffect(() => {
    if (external !== committed.current) {
      committed.current = external;
      setLocal(external);
    }
  }, [external]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (local !== committed.current) {
      committed.current = local;
      commit(local);
    }
  };

  // Flush on unmount (route change) without re-running the effect on every keystroke.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const onChange = (value: string) => {
    setLocal(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      committed.current = value;
      commit(value);
    }, delay);
  };

  return { value: local, onChange, onBlur: flush };
}
