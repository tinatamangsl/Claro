/** Pure list helpers shared by every capped list in the app. */

export function addCapped<T>(list: T[], item: T, cap: number): T[] {
  if (list.length >= cap) return list;
  return [...list, item];
}

export function updateById<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}

export function toggleById<T extends { id: string; done: boolean }>(
  list: T[],
  id: string,
): T[] {
  return list.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
}
