/**
 * The catalogue of shipped audio, and the licence manifest a track must carry
 * before it can appear in it.
 *
 * **The catalogue is empty, and that is the correct state today.** This
 * repository contains no audio assets: no `.mp3`, `.wav`, `.ogg`, `.m4a`,
 * `.flac`, `.aac` or `.opus` outside `node_modules`, no `public/` directory,
 * and no licence file. Nothing may be added here that has not cleared every
 * field below.
 *
 * Generated soundscapes are deliberately *not* in this catalogue. They are
 * synthesised noise, and calling them lo-fi or jazz would misdescribe them.
 */

export type DeliveryDecision =
  /** Shipped inside the app bundle. Adds to install size. */
  | "bundled"
  /** Fetched on demand. Introduces a network dependency and a hosting cost. */
  | "streamed";

/**
 * Every field is required. A track with an unknown creator, an unwritten
 * licence, or an unanswered delivery question is not shippable, and the type
 * is what stops it being added anyway.
 */
export type TrackLicence = {
  /** Who made it. */
  creator: string;
  /** Where it came from, as a resolvable reference. */
  source: string;
  /**
   * The written licence permitting redistribution inside a commercial
   * application. A "free for personal use" or "royalty free" download is
   * usually neither, and is not sufficient.
   */
  commercialRedistribution: string;
  /** The exact attribution the licence requires, or null when it requires none. */
  attribution: string | null;
  /** Kept beside the audio in the repository. */
  licenceFile: string;
};

export type ShippedTrack = {
  id: string;
  /** What the user sees. Must describe the audio honestly. */
  label: string;
  hint: string;
  /** Path to the asset within the app. */
  file: string;
  bytes: number;
  delivery: DeliveryDecision;
  licence: TrackLicence;
};

/** No licensed or original assets exist in this repository yet. */
export const AUDIO_CATALOGUE: ShippedTrack[] = [];

const filled = (value: string) => value.trim() !== "";

/**
 * What is still missing before a track could ship. An empty list means it has
 * cleared every requirement; anything else is a blocker, not a warning.
 */
export function missingLicenceFields(track: ShippedTrack): string[] {
  const missing: string[] = [];
  if (!filled(track.file)) missing.push("asset file");
  if (track.bytes <= 0) missing.push("file size");
  if (!filled(track.licence.creator)) missing.push("creator");
  if (!filled(track.licence.source)) missing.push("source");
  if (!filled(track.licence.commercialRedistribution)) {
    missing.push("written commercial app redistribution licence");
  }
  if (!filled(track.licence.licenceFile)) missing.push("licence file in the repository");
  // `attribution: null` is a real answer; an empty string is an unanswered one.
  if (track.licence.attribution !== null && !filled(track.licence.attribution)) {
    missing.push("attribution requirement");
  }
  return missing;
}

export function isShippable(track: ShippedTrack): boolean {
  return missingLicenceFields(track).length === 0;
}

/** Only fully cleared tracks are ever offered. */
export function shippableTracks(): ShippedTrack[] {
  return AUDIO_CATALOGUE.filter(isShippable);
}
