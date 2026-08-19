/** Reorders are silent to a screen reader without this. */
export function SortAnnouncer({ message }: { message: string }) {
  return (
    <span aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
}
