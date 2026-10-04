import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFocusSession } from "./use-focus-session";
import { ClaroProvider, useClaro } from "@/lib/claro-store";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const LAPTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

/**
 * Every navigation the page attempted.
 *
 * jsdom refuses to navigate and warns, so `location` is replaced with a plain
 * object: what is being tested is which URL the hook reached for, not whether
 * a browser would follow it.
 */
let went: string[] = [];

function asDevice(userAgent: string, maxTouchPoints: number) {
  // Defined rather than spied: jsdom's navigator has no `maxTouchPoints` at
  // all, and `vi.spyOn` refuses a property that is not there.
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

beforeEach(() => {
  localStorage.clear();
  went = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      set href(url: string) {
        went.push(url);
      },
      get href() {
        return "http://localhost/";
      },
    },
  });
});

afterEach(() => vi.restoreAllMocks());

type Api = { focus: ReturnType<typeof useFocusSession> | null; store: ReturnType<typeof useClaro> | null };

function harness() {
  const api: Api = { focus: null, store: null };
  function Probe() {
    api.focus = useFocusSession();
    api.store = useClaro();
    return null;
  }
  /*
   * Two instances, as the real app has: the header control and the page both
   * call this hook. Anything fired once per session has to stay once per
   * session with both of them running.
   */
  render(
    <ClaroProvider>
      <Probe />
      <Probe />
    </ClaroProvider>,
  );
  return api;
}

const ready = async (api: Api) => waitFor(() => expect(api.store?.ready).toBe(true));

const turnOn = (api: Api) =>
  act(() => api.store!.setFocusPrefs({ blockAppsOnIphone: true }));

describe("handing a focus block to Shortcuts", () => {
  it("opens ClaroStart with the block length when a session begins", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);

    act(() => api.focus!.start(null, 50 * 60_000, 0));

    await waitFor(() =>
      expect(went).toContain("shortcuts://run-shortcut?name=ClaroStart&input=text&text=50"),
    );
  });

  it("uses the stored block length when the caller names none", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);
    act(() => api.store!.setFocusPrefs({ plannedMs: 15 * 60_000 }));

    act(() => api.focus!.start(null));

    // "Focus on this" and "Focus on the project" pass no length, so the one
    // the user last chose is the one their phone is told about.
    await waitFor(() => expect(went.join(" ")).toContain("text=15"));
  });

  it("stays out of the way until the setting is turned on", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);

    act(() => api.focus!.start(null, 25 * 60_000, 0));

    await waitFor(() => expect(api.focus!.session).not.toBeNull());
    expect(went).toEqual([]);
  });

  it("does nothing on a laptop, where there is no Shortcuts to hand to", async () => {
    asDevice(LAPTOP, 0);
    const api = harness();
    await ready(api);
    turnOn(api);

    act(() => api.focus!.start(null, 25 * 60_000, 0));

    await waitFor(() => expect(api.focus!.session).not.toBeNull());
    expect(went).toEqual([]);
  });

  it("starts the block even when the handover throws", async () => {
    asDevice(IPHONE, 5);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        set href(_url: string) {
          throw new Error("no handler for shortcuts://");
        },
      },
    });

    const api = harness();
    await ready(api);
    turnOn(api);
    act(() => api.focus!.start(null, 25 * 60_000, 0));

    // The bridge is an extra, never a gate.
    await waitFor(() => expect(api.focus!.session?.phase).toBe("running"));
  });
});

describe("handing the end of a block over, once", () => {
  const startOne = (api: Api) => act(() => api.focus!.start(null, 25 * 60_000, 0));
  const ends = () => went.filter((url) => url.includes("ClaroEnd"));

  it("opens ClaroEnd when the block is ended early", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);
    startOne(api);

    act(() => api.focus!.endBlock());

    await waitFor(() => expect(ends()).toEqual(["shortcuts://run-shortcut?name=ClaroEnd"]));
  });

  it("does not open it a second time when the session is then closed", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);
    startOne(api);

    act(() => api.focus!.endBlock());
    await waitFor(() => expect(ends()).toHaveLength(1));
    act(() => api.focus!.close("completed"));

    /*
     * A block can reach its end twice over: "End block" lands on the ended
     * phase and closing it is a second path through, with two hook instances
     * watching both. Asking a phone to unblock itself three times is the bug
     * this guards.
     */
    await waitFor(() => expect(api.focus!.session).toBeNull());
    expect(ends()).toHaveLength(1);
  });

  it("opens it when the session is closed without ending the block first", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);
    startOne(api);

    // Leaving early never passes through the ended phase.
    act(() => api.focus!.close("left"));

    await waitFor(() => expect(ends()).toHaveLength(1));
  });

  it("hands over again for the next block, having forgotten the last", async () => {
    asDevice(IPHONE, 5);
    const api = harness();
    await ready(api);
    turnOn(api);

    startOne(api);
    act(() => api.focus!.close("completed"));
    await waitFor(() => expect(ends()).toHaveLength(1));

    startOne(api);
    act(() => api.focus!.close("completed"));

    // Once per session, not once ever: the guard is cleared when a session is
    // resolved, or the second block of the day would never unblock the phone.
    await waitFor(() => expect(ends()).toHaveLength(2));
  });
});
