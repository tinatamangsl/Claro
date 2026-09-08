import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PrioritiesBlock } from "./PrioritiesBlock";
import { ScheduleBlock } from "./ScheduleBlock";
import { writePriority } from "@/lib/priorities";
import { blankDay, blankQuarter } from "@/lib/storage";
import {
  PRIORITY_RANKS,
  priorityKey,
  type Day,
  type PriorityRank,
  type ScheduleItem,
} from "@/lib/types";

/*
 * Typing survives the save that happens while you are still typing.
 *
 * The field commits 350ms after the last keystroke, which in practice is the
 * first time somebody pauses, and that is almost always just after a space. If
 * that commit changes the shape of the tree, React destroys the field and
 * builds a new one, the cursor goes with it, and the rest of the sentence is
 * typed into nothing. It was reported as "pressing space throws me out of the
 * text box", which is exactly what it looks like from the outside.
 *
 * These are written against the real components with real state, because a spy
 * for `onChange` never feeds the change back and the remount never happens: the
 * bug only exists once the commit actually lands.
 */

/** Today, with the day held in state so a commit really does re-render. */
function LivePriorities() {
  const [day, setDay] = useState<Day>(blankDay("2026-08-19"));
  return (
    <PrioritiesBlock
      day={day}
      quarter={blankQuarter("2026-Q3")}
      onPatch={(target, patch) =>
        setDay((current) => {
          // A blank slot is addressed by position, a written one by id, which
          // is the whole reason its React key used to change underneath it.
          const rank: PriorityRank =
            "rank" in target
              ? target.rank
              : (PRIORITY_RANKS.find((r) => current[priorityKey(r)].id === target.id) ?? 1);
          const key = priorityKey(rank);
          return {
            ...current,
            [key]: writePriority(current[key], patch, current.id, new Date()),
          };
        })
      }
      onReorder={() => {}}
      onClear={() => {}}
    />
  );
}

function LiveSchedule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  return (
    <ScheduleBlock
      day={{ ...blankDay("2026-08-19"), scheduleItems: items }}
      habits={{}}
      completions={{}}
      onChange={setItems}
      onToggle={() => {}}
    />
  );
}

/** Type into a field the way a person does, then let the debounce fire. */
const typeAndSettle = async (field: HTMLElement, text: string) => {
  field.focus();
  fireEvent.change(field, { target: { value: text } });
  // waitFor rather than a bare sleep: it wraps the retries in act, so React
  // actually flushes the state the debounce set. A raw setTimeout leaves the
  // update pending and every assertion after it reads a stale tree.
  await waitFor(() => expect(landed()).toBe(true), { timeout: 2000 });
};

/** Set by each test to whatever proves its own save reached the store. */
let landed: () => boolean = () => true;

/*
 * Always re-query, never hold the node.
 *
 * A remounted field leaves the old element detached but intact: it keeps its
 * value and it still answers to `.value`, so an assertion against a captured
 * reference passes while the thing on screen is a different, empty box. Both of
 * these tests passed against the broken code until they were rewritten to look
 * up the field again after the save.
 */
const live = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement;

describe("typing does not throw you out of the field", () => {
  it("keeps the cursor in a priority when the first save lands", async () => {
    render(<LivePriorities />);
    landed = () => screen.queryAllByLabelText(/Reorder morning/).length > 0;
    await typeAndSettle(live("Priority 1"), "morning ");

    // The save landed: the slot has words in it now, which is what mints the
    // id that used to change the row's key. Without this the rest is vacuous.
    expect(screen.getByLabelText(/Reorder morning/)).toBeTruthy();

    /*
     * The regression. An empty slot has no id, so the row was keyed on the
     * stand-in `empty-1`; writing in it minted a real id, the key changed, and
     * React threw the row away with the field inside it.
     */
    expect(document.activeElement).toBe(live("Priority 1"));
  });

  it("keeps the cursor in a schedule hour when the first save lands", async () => {
    render(<LiveSchedule />);
    landed = () => screen.queryAllByRole("button", { name: /Remove/ }).length > 0;
    await typeAndSettle(live("Schedule at 9 AM"), "morning ");

    // The save landed: an hour with something in it offers a way to remove it.
    expect(screen.getByLabelText(/Remove the 9 AM time block/)).toBeTruthy();

    /*
     * An empty hour used to render a bare field, and a filled one a whole row.
     * The first save flipped between those two branches, so the field somebody
     * was typing into was replaced by a different one.
     */
    expect(document.activeElement).toBe(live("Schedule at 9 AM"));
  });

  it("does not swallow the space that triggered the save", async () => {
    render(<LiveSchedule />);
    landed = () => screen.queryAllByRole("button", { name: /Remove/ }).length > 0;
    await typeAndSettle(live("Schedule at 9 AM"), "morning ");

    /*
     * The other half of the same complaint. The stored text was trimmed on
     * every save, so the value came back one character shorter than what was on
     * screen, the field took that as the record changing underneath it and
     * resynced, and the space vanished: "morning run" arrived as "morningrun".
     */
    expect(live("Schedule at 9 AM").value).toBe("morning ");

    fireEvent.change(live("Schedule at 9 AM"), { target: { value: "morning run" } });
    await waitFor(() => expect(live("Schedule at 9 AM").value).toBe("morning run"));
  });

  it("still treats whitespace on its own as an empty hour", async () => {
    render(<LiveSchedule />);
    // Nothing should land, so wait on the clock instead of on a change.
    landed = () => true;
    await typeAndSettle(live("Schedule at 9 AM"), "   ");
    await new Promise((r) => setTimeout(r, 500));

    expect(screen.queryByLabelText("Remove the 9 AM time block")).toBeNull();
  });
});
