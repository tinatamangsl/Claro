import { describe, expect, it } from "vitest";

import { Route } from "./today";

/**
 * Guards CLAUDE.md invariant 4: every search key must be genuinely optional.
 * Returning `{ d: undefined }` here would make `search` a required prop on every
 * <Link> to /today — an error that surfaces far from its cause.
 */
const validate = Route.options.validateSearch as (
  search: Record<string, unknown>,
) => { d?: string; focus?: true };

describe("/today search validation", () => {
  it("returns an empty object when nothing is passed", () => {
    const result = validate({});

    expect(result).toEqual({});
    expect("d" in result).toBe(false);
    expect("focus" in result).toBe(false);
  });

  it("keeps a well-formed day id", () => {
    expect(validate({ d: "2026-08-18" })).toEqual({ d: "2026-08-18" });
  });

  it("drops a malformed day id rather than passing it to the store", () => {
    expect(validate({ d: "yesterday" })).toEqual({});
    expect(validate({ d: "2026-8-1" })).toEqual({});
  });

  it("accepts every shape a bare ?focus can arrive in", () => {
    for (const value of [true, "", "1", "true"]) {
      expect(validate({ focus: value })).toEqual({ focus: true });
    }
  });

  it("ignores a focus value it does not recognise", () => {
    expect(validate({ focus: "banana" })).toEqual({});
    expect(validate({ focus: false })).toEqual({});
  });

  it("carries a day and focus together without inventing keys", () => {
    expect(validate({ d: "2026-08-18", focus: "" })).toEqual({
      d: "2026-08-18",
      focus: true,
    });
  });
});
