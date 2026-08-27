I've exported the new cycle page design from Claude Design into claro/design-export/. Please read Claro Cycle Page.dc.html and its imported support.js in that folder, then implement this design into the existing Claro cycle page.

Context on why this redesign exists: The current cycle page is an unstructured information dump, phase info, eating suggestions, training suggestions, logging, notes, and a graph all shown at once with no hierarchy. The new design fixes this by leading with a calendar view (color coded by phase: menstrual, follicular, ovulation, luteal) with today's date emphasized, followed by a compact "today" summary (phase name, cycle day, and an affirmation revealed via tooltip, personalized from the user's historical logged energy and mood data where available). Below that are four collapsed, tappable cards, Work Focus, Movement, Journal Prompt, and Food, each expanding to a short, non-prescriptive suggestion. Deeper phase education, the logging table, recent notes, and the cycle length graph move to a secondary section below the fold.

Requirements:

Preserve all existing functionality, the logging system, historical data connections, and any backend logic currently powering the cycle page. This is a restructuring of layout and content presentation, not a rebuild of the data layer.
Match Claro's existing design system, components, and conventions already in this codebase (you should already have this context from the earlier /design-sync).
For all per-phase copy (affirmations, work/movement/journal/food suggestions): keep language hedged and non-prescriptive, questions rather than definitive readings, no "normality" verdicts about the user's body or energy. If the design file's copy drifts from this, flag it and adjust rather than implementing it verbatim.
If anything in the design file or this brief is ambiguous, ask me before proceeding rather than guessing.

Once implemented, tell me exactly which files you changed and flag any copy you adjusted for tone.