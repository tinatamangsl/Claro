import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UndoBar } from "./UndoBar";
import { ClaroProvider, useClaro } from "@/lib/claro-store";

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

function harness() {
  const api: { store: ReturnType<typeof useClaro> | null } = { store: null };

  function Probe() {
    api.store = useClaro();
    return null;
  }

  const view = render(
    <ClaroProvider>
      <Probe />
      <UndoBar />
    </ClaroProvider>,
  );

  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

const habit = (id: string, name: string) => ({
  id,
  name,
  createdAt: "2026-01-01T09:00:00.000Z",
  archivedAt: null,
});

describe("the way back", () => {
  it("stays out of sight until something is taken away", async () => {
    const { api, container } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));

    // Adding is not a loss, so nothing is offered.
    expect(container.innerHTML).toBe("");
  });

  it("appears when something is deleted, and says what went", async () => {
    const { api, container } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));

    expect(container.textContent).toContain("Habit deleted");
    expect(screen.getByRole("button", { name: /Undo/ })).toBeTruthy();
  });

  it("puts back exactly what was removed", async () => {
    const { api } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));
    expect(api.store!.state.habits.h1).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));

    expect(api.store!.state.habits.h1.name).toBe("Walk");
  });

  it("takes back a whole cycle history, which is the worst thing to lose", async () => {
    const { api } = harness();
    await ready(api);

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries({
        e0: { id: "e0", startDate: "2026-08-01", endDate: "2026-08-04", loggedAt: "x" },
      });
    });

    act(() => api.store!.deleteAllCycleData());
    expect(api.store!.cycle.entries).toEqual({});

    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));

    expect(api.store!.cycle.entries.e0.startDate).toBe("2026-08-01");
    expect(api.store!.cycle.settings.enabled).toBe(true);
  });

  it("walks back a run of deletions one at a time", async () => {
    const { api } = harness();
    await ready(api);

    act(() => {
      api.store!.addHabit(habit("h1", "Walk"));
      api.store!.addHabit(habit("h2", "Read"));
    });
    act(() => api.store!.deleteHabit("h1"));
    act(() => api.store!.deleteHabit("h2"));

    act(() => api.store!.undo());
    expect(api.store!.state.habits.h2.name).toBe("Read");
    expect(api.store!.state.habits.h1).toBeUndefined();

    act(() => api.store!.undo());
    expect(api.store!.state.habits.h1.name).toBe("Walk");
  });

  it("does nothing when there is nothing to take back", async () => {
    const { api } = harness();
    await ready(api);

    expect(api.store!.canUndo).toBe(false);
    act(() => api.store!.undo());

    expect(api.store!.ready).toBe(true);
  });

  it("stops offering itself after a few seconds", async () => {
    vi.useFakeTimers();
    const { api, container } = harness();
    await vi.waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));
    expect(container.textContent).toContain("Habit deleted");

    act(() => void vi.advanceTimersByTime(9000));

    // Gone from the screen, but still on the stack for the keyboard.
    expect(container.innerHTML).toBe("");
    expect(api.store!.canUndo).toBe(true);
  });
});

describe("the keyboard route", () => {
  const press = (target: Element | Document) =>
    fireEvent.keyDown(target, { key: "z", metaKey: true });

  it("undoes on command Z from anywhere on the page", async () => {
    const { api } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));

    act(() => void press(document.body));

    expect(api.store!.state.habits.h1.name).toBe("Walk");
  });

  it("leaves typing alone, where the browser's own undo is the right one", async () => {
    const { api } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));

    const field = document.createElement("input");
    document.body.append(field);
    act(() => void press(field));

    // Retyping a sentence must not resurrect somebody's deleted habit.
    expect(api.store!.state.habits.h1).toBeUndefined();
    field.remove();
  });

  it("ignores redo, which Claro does not claim to do", async () => {
    const { api } = harness();
    await ready(api);

    act(() => api.store!.addHabit(habit("h1", "Walk")));
    act(() => api.store!.deleteHabit("h1"));

    act(() => void fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true }));

    expect(api.store!.state.habits.h1).toBeUndefined();
  });
});
