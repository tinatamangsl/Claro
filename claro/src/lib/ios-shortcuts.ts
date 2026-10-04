/**
 * The iPhone bridge: handing a focus block to the Shortcuts app.
 *
 * Claro cannot block anything on a phone. A web page has no access to which
 * apps are open, and no browser will ever give it any. What iOS does offer is
 * a URL scheme: opening `shortcuts://run-shortcut` runs a shortcut the user
 * made themselves, and a shortcut can turn a Focus mode on. So this is a
 * handover, not a feature Claro implements: Claro says a block started and how
 * long it is, and what happens next is entirely the user's own automation.
 *
 * Everything here is pure except `openShortcut`, which is the one line that
 * actually navigates. The detection takes the user agent rather than reading
 * `navigator`, so it is testable and so nothing touches a browser global
 * during render.
 */

/** The two shortcuts the setup guide asks the user to create. */
export const START_SHORTCUT = "ClaroStart";
export const END_SHORTCUT = "ClaroEnd";

/**
 * Whether this is an iPhone or iPad.
 *
 * **iPadOS 13 and later lie.** They report a desktop user agent saying
 * "Macintosh", which is why the touch-point count is part of the question: a
 * real Mac reports 0 and an iPad reports 5. Without that half, the whole
 * feature is silently missing on every iPad.
 *
 * A Mac must never match. `shortcuts://` does resolve on macOS, but the
 * setting says iPhone, and quietly running somebody's phone automation from
 * their laptop is not what it offered to do.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPod/.test(userAgent)) return true;
  if (/iPad/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * The URL that starts a block.
 *
 * The minutes travel as the shortcut's input so one shortcut can serve every
 * block length: a 25 and a 50 are the same automation with a different number,
 * and asking somebody to build one shortcut per length would be absurd.
 */
export function startShortcutUrl(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  return `shortcuts://run-shortcut?name=${encodeURIComponent(START_SHORTCUT)}&input=text&text=${encodeURIComponent(String(whole))}`;
}

export function endShortcutUrl(): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(END_SHORTCUT)}`;
}

/**
 * Whether a block should hand over at all.
 *
 * Three conditions, all of which must hold, and the order is the cheap one
 * first: the setting is on, this is an iPhone, and there is a browser to
 * navigate. Off by default, so a store written before this existed hands over
 * nothing.
 */
export function shouldBridge(
  enabled: boolean,
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  return enabled && isIosDevice(userAgent, maxTouchPoints);
}

/**
 * The one impure line.
 *
 * `location.href` rather than `window.open`, because a custom scheme opened in
 * a new tab leaves an empty tab behind on iOS Safari when the handover
 * succeeds. Wrapped, because a scheme nothing handles throws in some browsers,
 * and a focus block must still start when the handover fails: the bridge is an
 * extra, never a gate.
 */
export function openShortcut(url: string): void {
  if (typeof window === "undefined") return;
  try {
    window.location.href = url;
  } catch {
    // Nothing to tell the user: their block is running either way.
  }
}
