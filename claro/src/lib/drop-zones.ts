/**
 * Places a drag can land that its own list knows nothing about.
 *
 * `useSortable` reorders within one set of items, which is the right shape for
 * a list. Dragging a task onto four o'clock is a different move: the source and
 * the target are separate components holding separate records, and neither can
 * own the other's coordinates.
 *
 * A registry rather than a React context, because the only thing being shared
 * is where some elements are on the screen. That is a DOM fact, it changes on
 * every scroll, and threading it through the tree as state would mean
 * re-rendering the page to answer a question `getBoundingClientRect` already
 * answers.
 */

const zones = new Map<string, HTMLElement>();

export function registerZone(id: string, element: HTMLElement | null): void {
  if (element) zones.set(id, element);
  else zones.delete(id);
}

/**
 * The zone under a point, or null.
 *
 * Read at the moment of the question rather than cached: a drag can scroll the
 * page under itself, and a stale rectangle drops work on the wrong hour.
 */
export function zoneAt(x: number, y: number): string | null {
  for (const [id, element] of zones) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
  }
  return null;
}

/** Only for tests, which would otherwise inherit zones from the last render. */
export function clearZones(): void {
  zones.clear();
}
