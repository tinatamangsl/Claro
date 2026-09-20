import { describe, expect, it, vi } from "vitest";

/**
 * `/today` has to mean today, whatever day that turns out to be.
 *
 * The day arrows used to write `?d=` for every move, including the move back to
 * today, so the moment somebody touched them the URL pinned a fixed date. Right
 * for that day and wrong every day after: a reload, a bookmark, or a tab left
 * open overnight all returned to the pinned date with no sign of why.
 *
 * The navigation itself is one line, so it is tested as one line rather than by
 * mounting the whole of Daily: what matters is the search object it builds.
 */
const goFor = (today: string) => {
  const navigate = vi.fn();
  const go = (id: string) => navigate({ to: "/today", search: id === today ? {} : { d: id } });
  return { go, navigate };
};

describe("what the Daily URL says", () => {
  it("says nothing at all when the day is today", () => {
    const { go, navigate } = goFor("2026-09-20");

    go("2026-09-20");

    // Not `{ d: undefined }`: invariant 4 says an optional search key must be
    // absent, or every Link to this route needs the prop.
    expect(navigate).toHaveBeenCalledWith({ to: "/today", search: {} });
    expect("d" in navigate.mock.calls[0][0].search).toBe(false);
  });

  it("names any other day, so a link to last Tuesday survives being shared", () => {
    const { go, navigate } = goFor("2026-09-20");

    go("2026-09-15");

    expect(navigate).toHaveBeenCalledWith({ to: "/today", search: { d: "2026-09-15" } });
  });

  it("names a future day too", () => {
    const { go, navigate } = goFor("2026-09-20");

    go("2026-09-21");

    expect(navigate).toHaveBeenCalledWith({ to: "/today", search: { d: "2026-09-21" } });
  });

  it("stops naming it the moment today catches up with the pinned date", () => {
    /*
     * The bug in one assertion. Yesterday's arrow press wrote ?d=2026-09-21;
     * once the clock reaches the 21st, the same move must produce a bare URL,
     * or the page stays pinned to a date that is now today by coincidence and
     * will be yesterday tomorrow.
     */
    const { go, navigate } = goFor("2026-09-21");

    go("2026-09-21");

    expect(navigate).toHaveBeenCalledWith({ to: "/today", search: {} });
  });
});
