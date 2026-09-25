/**
 * @typedef {{
 *   userId: string,
 *   contentId: string,
 *   timestamp: number,
 *   watchSeconds: number,
 *   contentDuration: number,
 *   rewatchCount?: number,
 *   skipEvents?: number,
 *   rewindEvents?: number,
 *   pausedEvents?: number,
 *   device?: string,
 *   timeOfDay?: number,
 *   sessionId?: string,
 *   abandoned?: boolean
 * }} ViewingEvent
 */

/**
 * @typedef {{
 *   contentId: string,
 *   title: string,
 *   genres: string[],
 *   tags?: string[],
 *   mood?: string[],
 *   pacing: "slow"|"medium"|"fast",
 *   complexity: number,
 *   violence?: number,
 *   humor?: number,
 *   romance?: number,
 *   duration?: number,
 *   releaseYear?: number,
 *   language?: string,
 *   embedding?: number[]
 * }} ContentItem
 */

/**
 * @typedef {{
 *   pacingPreference: number,
 *   complexityTolerance: number,
 *   emotionalIntensity: number,
 *   noveltySeeking: number,
 *   bingePropensity: number,
 *   attentionSpan: number,
 *   genreBreadth: number,
 *   timeOfDayAffinity: number,
 *   completionDiscipline: number,
 *   rewatchLoyalty: number
 * }} Profile
 */

/**
 * @typedef {{
 *   contentId: string,
 *   title: string,
 *   score: number,
 *   reason: string
 * }} Recommendation
 */

export const PROFILE_TRAITS = [
  'pacingPreference', 'complexityTolerance', 'emotionalIntensity',
  'noveltySeeking', 'bingePropensity', 'attentionSpan',
  'genreBreadth', 'timeOfDayAffinity', 'completionDiscipline',
  'rewatchLoyalty',
];

/** @returns {Profile} */
export const NEUTRAL_PROFILE = () =>
  Object.fromEntries(PROFILE_TRAITS.map(t => [t, 0.5]));
