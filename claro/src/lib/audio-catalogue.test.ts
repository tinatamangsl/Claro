import { describe, expect, it } from "vitest";

import {
  AUDIO_CATALOGUE,
  isShippable,
  missingLicenceFields,
  shippableTracks,
  type ShippedTrack,
} from "./audio-catalogue";

const track = (patch: Partial<ShippedTrack> = {}): ShippedTrack => ({
  id: "t1",
  label: "A track",
  hint: "",
  file: "/audio/a-track.mp3",
  bytes: 4_200_000,
  delivery: "bundled",
  licence: {
    creator: "A composer",
    source: "https://example.test/a-track",
    commercialRedistribution: "Licence granting redistribution inside a commercial application",
    attribution: "Music by A composer",
    licenceFile: "audio/a-track.LICENCE.txt",
  },
  ...patch,
});

describe("the shipped audio catalogue", () => {
  it("is empty, because this repository holds no audio assets", () => {
    expect(AUDIO_CATALOGUE).toEqual([]);
    expect(shippableTracks()).toEqual([]);
  });

  it("accepts a track only when every licence question is answered", () => {
    expect(missingLicenceFields(track())).toEqual([]);
    expect(isShippable(track())).toBe(true);
  });

  it("treats no attribution requirement as a real answer", () => {
    expect(isShippable(track({ licence: { ...track().licence, attribution: null } }))).toBe(true);
  });

  it("refuses a track with an unanswered attribution requirement", () => {
    expect(
      missingLicenceFields(track({ licence: { ...track().licence, attribution: "  " } })),
    ).toContain("attribution requirement");
  });

  it("refuses a track without a written commercial redistribution licence", () => {
    const missing = missingLicenceFields(
      track({ licence: { ...track().licence, commercialRedistribution: "" } }),
    );

    expect(missing).toContain("written commercial app redistribution licence");
    expect(isShippable(track({ licence: { ...track().licence, commercialRedistribution: "" } }))).toBe(false);
  });

  it("refuses a track with no creator, source, licence file, asset or size", () => {
    expect(missingLicenceFields(track({ licence: { ...track().licence, creator: "" } }))).toContain("creator");
    expect(missingLicenceFields(track({ licence: { ...track().licence, source: "" } }))).toContain("source");
    expect(
      missingLicenceFields(track({ licence: { ...track().licence, licenceFile: "" } })),
    ).toContain("licence file in the repository");
    expect(missingLicenceFields(track({ file: "" }))).toContain("asset file");
    expect(missingLicenceFields(track({ bytes: 0 }))).toContain("file size");
  });

  it("keeps an incomplete track out of what is offered", () => {
    const incomplete = [track({ id: "bad", licence: { ...track().licence, licenceFile: "" } })];
    expect(incomplete.filter(isShippable)).toEqual([]);
  });
});
