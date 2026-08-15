let counter = 0;

/**
 * crypto.randomUUID is available in secure contexts (localhost and https),
 * but fall back so an item can never fail to be created.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
