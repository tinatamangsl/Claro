import { afterEach, describe, expect, it } from "vitest";

import { clearZones, registerZone, zoneAt } from "./drop-zones";

afterEach(() => clearZones());

const zone = (rect: Partial<DOMRect>): HTMLElement => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }) as DOMRect;
  return el;
};

describe("where a drag can land", () => {
  it("finds the zone under a point", () => {
    registerZone("hour:09:00", zone({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }));
    registerZone("hour:10:00", zone({ left: 0, top: 40, right: 100, bottom: 80, width: 100, height: 40 }));

    expect(zoneAt(50, 20)).toBe("hour:09:00");
    expect(zoneAt(50, 60)).toBe("hour:10:00");
    expect(zoneAt(500, 20)).toBeNull();
  });

  it("ignores a zone that is not on screen", () => {
    // A collapsed element matches every point without this, because an empty
    // rectangle sits at the origin.
    registerZone("hidden", zone({}));

    expect(zoneAt(0, 0)).toBeNull();
  });

  it("forgets a zone when its element goes", () => {
    registerZone("hour:09:00", zone({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }));
    expect(zoneAt(50, 20)).toBe("hour:09:00");

    registerZone("hour:09:00", null);
    expect(zoneAt(50, 20)).toBeNull();
  });

  it("reads the rectangle at the moment it is asked", () => {
    // A drag can scroll the page under itself, and a cached rectangle drops
    // work on the wrong hour.
    const el = document.createElement("div");
    let top = 0;
    el.getBoundingClientRect = () =>
      ({ left: 0, top, right: 100, bottom: top + 40, width: 100, height: 40 }) as DOMRect;
    registerZone("hour:09:00", el);

    expect(zoneAt(50, 20)).toBe("hour:09:00");
    top = 200;
    expect(zoneAt(50, 20)).toBeNull();
    expect(zoneAt(50, 220)).toBe("hour:09:00");
  });
});
