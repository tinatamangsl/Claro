import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
}));

// A signed-in session, without reaching a network. The component asks two
// questions of sync, and these are the honest answers for "signed in".
const sync = { session: { user: { id: "u1", email: "a@b.c" } }, available: true };
vi.mock("@/lib/use-sync", () => ({ useSync: () => sync }));

import { CycleSyncConsent } from "./CycleSyncConsent";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { forUpload } from "@/lib/sync";

beforeEach(() => localStorage.clear());

function harness() {
  const api: { store: ReturnType<typeof useClaro> | null } = { store: null };
  function Probe() {
    api.store = useClaro();
    return null;
  }
  const view = render(
    <ClaroProvider>
      <Probe />
      <CycleSyncConsent />
    </ClaroProvider>,
  );
  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

describe("asking again before cycle notes leave the device", () => {
  it("says nothing until cycle notes are actually turned on", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(container.textContent).toBe("");
  });

  it("asks once cycle notes are on and the answer is still missing", async () => {
    const { api, container } = harness();
    await ready(api);
    act(() => api.store!.setCycleEnabled(true, new Date()));

    expect(container.textContent).toContain("Should your cycle notes go to your account?");
    // And says plainly what is happening in the meantime.
    expect(container.textContent).toContain("being left out of the sync");
  });

  it("withholds the whole cycle branch from the upload until it is answered", async () => {
    const { api } = harness();
    await ready(api);
    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.logCycleStart({
        id: "e0",
        startDate: "2026-08-01",
        endDate: "2026-08-05",
        loggedAt: "x",
      });
    });

    const payload = forUpload(api.store!.state);
    expect("cycle" in payload).toBe(false);
    // The rest of the planner is unaffected: this withholds one branch, not sync.
    expect(payload.days).toBeTruthy();
  });

  it("lets them travel once, and only once, the person agrees", async () => {
    const { api } = harness();
    await ready(api);
    act(() => api.store!.setCycleEnabled(true, new Date()));

    fireEvent.click(screen.getByRole("button", { name: "Yes, sync my cycle notes" }));

    await waitFor(() => expect(api.store!.cycle.settings.syncConsentAt).toBeTruthy());
    expect("cycle" in forUpload(api.store!.state)).toBe(true);
  });

  it("changes nothing at all when they decline", async () => {
    const { api, container } = harness();
    await ready(api);
    act(() => api.store!.setCycleEnabled(true, new Date()));

    fireEvent.click(screen.getByRole("button", { name: "Keep them on this device" }));

    await waitFor(() => expect(api.store!.cycle.settings.syncConsentAt).toBeNull());
    // Declining is an answer, and the answer is that nothing is uploaded.
    expect("cycle" in forUpload(api.store!.state)).toBe(false);
    // Cycle notes themselves are untouched: this was never about turning them off.
    expect(api.store!.cycle.settings.enabled).toBe(true);
    expect(container.textContent).toContain("Should your cycle notes go to your account?");
  });

  it("stops asking once it has been answered yes", async () => {
    const { api, container } = harness();
    await ready(api);
    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleSyncConsent(new Date().toISOString());
    });

    expect(container.textContent).toBe("");
  });
});
