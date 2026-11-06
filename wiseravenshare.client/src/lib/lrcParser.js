/**
 * LRC parser supporting standard and enhanced (word-timing) formats.
 */

/**
 * Convert an LRC time tag "[mm:ss.xx]" or "<mm:ss.xx>" to seconds.
 * @param {string} tag – e.g. "01:23.45" (brackets already stripped)
 * @returns {number}
 */
export function parseTime(tag) {
  // tag may arrive as "mm:ss.xx" or "mm:ss:xx" (some tools use colon as decimal sep)
  const clean = tag.trim();
  // match mm:ss.xx  or  mm:ss:xx
  const m = clean.match(/^(\d+):(\d+)(?:[.:](\d+))?$/);
  if (!m) return 0;
  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  const frac = m[3] ? parseFloat(`0.${m[3]}`) : 0;
  return minutes * 60 + seconds + frac;
}

/**
 * Parse word-timing segment within an enhanced LRC line.
 * Input example: "<01:23.45>Hello <01:23.90>World"
 * Returns Word[] = [{ text, time }]
 */
function parseWords(segment) {
  const words = [];
  // tokens: <time>word
  const re = /<(\d+:\d+(?:[.:]\d+)?)>(.*?)(?=<|$)/g;
  let match;
  while ((match = re.exec(segment)) !== null) {
    const time = parseTime(match[1]);
    const text = match[2];
    if (text) words.push({ text, time });
  }
  return words.length > 0 ? words : null;
}

const METADATA_TAGS = {
  ar: "artist",
  ti: "title",
  al: "album",
  by: "by",
  offset: "offset",
  re: "re",
  ve: "ve",
};

/**
 * Parse an LRC string.
 * @param {string} text
 * @returns {{ lines: Array<{time: number, text: string, words: Array|null}>, metadata: {artist?:string, title?:string, album?:string} }}
 */
export function parseLrc(text) {
  if (!text) return { lines: [], metadata: {} };

  const lines = [];
  const metadata = {};

  const rawLines = text.split(/\r?\n/);

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Match all leading time tags: [mm:ss.xx]
    const timeTagRe = /^\[(\d+:\d+(?:[.:]\d+)?)\]/;

    // Check metadata tags first: [ar:text], [ti:text], etc.
    const metaMatch = trimmed.match(/^\[([a-z]+):(.*)\]$/i);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      const mapped = METADATA_TAGS[key];
      if (mapped && val) metadata[mapped] = val;
      continue;
    }

    // Collect all time tags at the start of the line
    let rest = trimmed;
    const times = [];
    let tagMatch;
    while ((tagMatch = rest.match(/^\[(\d+:\d+(?:[.:]\d+)?)\]/))) {
      times.push(parseTime(tagMatch[1]));
      rest = rest.slice(tagMatch[0].length);
    }

    if (times.length === 0) continue; // no time tags → skip

    // rest is now the lyric text (may contain word timing)
    const hasWordTiming = rest.includes("<");
    const words = hasWordTiming ? parseWords(rest) : null;
    // Plain text: strip <...> tags
    const plainText = rest.replace(/<[^>]+>/g, "").trim();

    for (const t of times) {
      lines.push({ time: t, text: plainText, words });
    }
  }

  lines.sort((a, b) => a.time - b.time);

  return { lines, metadata };
}
