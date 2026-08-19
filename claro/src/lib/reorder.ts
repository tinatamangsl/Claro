/**
 * Pure list movement. Every reorder in the app goes through these, so the
 * "what moved where" logic is testable without a DOM, a pointer or a timer.
 */

/** Moves one item, clamping both ends. Out-of-range indices return the list unchanged. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;

  const target = Math.min(Math.max(to, 0), list.length - 1);
  if (target === from) return list;

  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export function moveById<T extends { id: string }>(list: T[], id: string, to: number): T[] {
  const from = list.findIndex((item) => item.id === id);
  return from === -1 ? list : moveItem(list, from, to);
}

/** One step up or down — the keyboard path. */
export function nudgeById<T extends { id: string }>(
  list: T[],
  id: string,
  delta: number,
): T[] {
  const from = list.findIndex((item) => item.id === id);
  return from === -1 ? list : moveItem(list, from, from + delta);
}

/**
 * Re-materialises a list from an explicit id order. Ids that are not in the
 * list are ignored, and items the order forgot keep their relative position at
 * the end — so a stale order can never drop a user's work.
 */
export function applyOrder<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((item) => [item.id, item]));
  const ordered: T[] = [];

  for (const id of ids) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }

  for (const item of list) if (byId.has(item.id)) ordered.push(item);
  return ordered;
}

/**
 * Moves an item into another group, landing it at `to` *within that group*
 * while leaving every other group's relative order untouched.
 */
export function moveAcrossGroups<T extends { id: string }, G>(
  list: T[],
  id: string,
  group: G,
  to: number,
  getGroup: (item: T) => G,
  setGroup: (item: T, group: G) => T,
): T[] {
  const item = list.find((i) => i.id === id);
  if (!item) return list;

  const rest = list.filter((i) => i.id !== id);
  const moved = getGroup(item) === group ? item : setGroup(item, group);

  // Rebuild by walking the destination group's members and splicing in at `to`.
  const destination = rest.filter((i) => getGroup(i) === group);
  const index = Math.min(Math.max(to, 0), destination.length);
  const anchor = destination[index];

  const next: T[] = [];
  let placed = false;
  for (const current of rest) {
    if (anchor && current.id === anchor.id && !placed) {
      next.push(moved);
      placed = true;
    }
    next.push(current);
  }
  if (!placed) next.push(moved);

  return next;
}
