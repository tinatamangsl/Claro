import { describe, expect, it } from "vitest";

import {
  END_SHORTCUT,
  START_SHORTCUT,
  endShortcutUrl,
  isIosDevice,
  shouldBridge,
  startShortcutUrl,
} from "./ios-shortcuts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_OLD =
  "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";
/** iPadOS 13+ reports itself as a Mac. The touch points are the giveaway. */
const IPAD_NEW =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC = IPAD_NEW;
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

describe("knowing an iPhone from everything else", () => {
  it("recognises an iPhone and an older iPad", () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
    expect(isIosDevice(IPAD_OLD, 5)).toBe(true);
  });

  it("recognises an iPad that is pretending to be a Mac", () => {
    /*
     * iPadOS 13 and later send a desktop user agent saying "Macintosh". Going
     * by the string alone leaves the whole feature silently missing on every
     * iPad, so the touch points are half the question.
     */
    expect(isIosDevice(IPAD_NEW, 5)).toBe(true);
  });

  it("never matches an actual Mac", () => {
    // The scheme does resolve on macOS, so this is the one that matters:
    // running somebody's phone automation from their laptop is not what the
    // setting offered to do.
    expect(isIosDevice(MAC, 0)).toBe(false);
  });

  it("matches nothing else", () => {
    expect(isIosDevice(ANDROID, 5)).toBe(false);
    expect(isIosDevice(WINDOWS, 0)).toBe(false);
    expect(isIosDevice("", 0)).toBe(false);
  });
});

describe("the URLs handed to Shortcuts", () => {
  it("carries the block length as the shortcut's input", () => {
    expect(startShortcutUrl(25)).toBe(
      "shortcuts://run-shortcut?name=ClaroStart&input=text&text=25",
    );
  });

  it("ends with nothing to say but the name", () => {
    expect(endShortcutUrl()).toBe("shortcuts://run-shortcut?name=ClaroEnd");
  });

  it("sends whole minutes, and never zero or less", () => {
    // One shortcut has to serve every block length, so the number is the only
    // thing that varies; a block of "0 minutes" would be a Focus mode that
    // ends the instant it starts.
    expect(startShortcutUrl(49.6)).toContain("text=50");
    expect(startShortcutUrl(0)).toContain("text=1");
    expect(startShortcutUrl(-10)).toContain("text=1");
  });

  it("names the two shortcuts the guide asks for", () => {
    expect(startShortcutUrl(25)).toContain(START_SHORTCUT);
    expect(endShortcutUrl()).toContain(END_SHORTCUT);
  });
});

describe("whether to hand over at all", () => {
  it("stays out of the way until the setting is turned on", () => {
    // Off by default, so a store written before this existed hands over
    // nothing and an iPhone behaves exactly as it did.
    expect(shouldBridge(false, IPHONE, 5)).toBe(false);
    expect(shouldBridge(true, IPHONE, 5)).toBe(true);
  });

  it("does nothing on a device that has no Shortcuts app", () => {
    expect(shouldBridge(true, ANDROID, 5)).toBe(false);
    expect(shouldBridge(true, WINDOWS, 0)).toBe(false);
    expect(shouldBridge(true, MAC, 0)).toBe(false);
  });
});
