import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A signed-in session, without a network or a real Supabase project.
const session = { user: { id: "user-1", email: "a@b.c" } };
vi.mock("./supabase", () => ({
  syncAvailable: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {},
    },
  },
}));

const pull = vi.fn();
const push = vi.fn();
vi.mock("./sync-client", () => ({
  pull: (...a: unknown[]) => pull(...a),
  push: (...a: unknown[]) => push(...a),
}));

import { ClaroProvider } from "./claro-store";
import { SyncProvider, useSync } from "./use-sync";

function Probe() {
  const { status } = useSync();
  return <span data-testid="status">{status}</span>;
}

const mount = () =>
  render(
    <ClaroProvider>
      <SyncProvider>
        <Probe />
      </SyncProvider>
    </ClaroProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  pull.mockReset();
  push.mockReset();
});

describe("what signing in actually does", () => {
  it("seeds an empty account instead of only claiming to have", async () => {
    // No row on the server yet: the first device to sign in owns the account.
    pull.mockResolvedValue({ ok: true, row: null });
    push.mockResolvedValue({ ok: true, token: "2026-09-04T00:00:00Z" });

    mount();

    /*
     * The regression this exists for. Signing in used to report "synced"
     * without writing anything, because the push effect only fires when the
     * state later changes. Somebody could sign in, close the tab, and lose a
     * device still believing there was a copy of their planner.
     */
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));

    const [userId, payload] = push.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(payload.version).toBeGreaterThan(0);
  });

  it("does not overwrite an account it has not read", async () => {
    // Someone else seeded it between our read and our write.
    pull
      .mockResolvedValueOnce({ ok: true, row: null })
      .mockResolvedValue({ ok: true, row: { payload: { version: 1 }, token: "t", version: 1 } });
    push.mockResolvedValue({ ok: false, reason: "conflict" });

    mount();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("conflict"));
    // One attempt, refused, and no retry that would have clobbered it.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("says error rather than synced when the seed fails", async () => {
    pull.mockResolvedValue({ ok: true, row: null });
    push.mockResolvedValue({ ok: false, reason: "error", message: "network down" });

    mount();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
  });

  it("takes the account's copy onto an empty browser without pushing over it", async () => {
    pull.mockResolvedValue({
      ok: true,
      row: { payload: { version: 1, days: {} }, token: "t", version: 1 },
    });

    mount();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
    // Nothing was written back: this browser had nothing worth sending.
    expect(push).not.toHaveBeenCalled();
  });
});
