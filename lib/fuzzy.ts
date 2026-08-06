/**
 * A port of the rapidfuzz scorers the notebook relies on
 * (`process.extractOne(..., scorer=fuzz.WRatio, score_cutoff=89)`).
 *
 * The cutoff in GEMINI_API_VL_5 is calibrated against WRatio specifically, so
 * a generic edit-distance score would move the accept/reject line. These
 * functions reproduce rapidfuzz's definitions:
 *
 *   ratio            normalized Indel similarity = 200 * LCS / (len1 + len2)
 *   partial_ratio    best ratio of s1 against any equal-length window of s2
 *   token_sort_ratio ratio of the two token-sorted strings
 *   token_set_ratio  ratio over intersection / difference token groups
 *   WRatio           length-aware blend of the four, with rapidfuzz's scales
 *
 * Inputs are expected to be pre-normalized (see lib/reference.ts) — rapidfuzz's
 * default processor is None, and the notebook normalizes before matching.
 */

/** Length of the longest common subsequence (Indel distance basis). */
function lcsLength(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  // Row-rolled DP: O(len(a) * len(b)) time, O(len(b)) memory.
  const prev = new Uint16Array(b.length + 1);
  const cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const ai = a.charCodeAt(i - 1);
    cur[0] = 0;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = ai === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev.set(cur);
  }
  return prev[b.length];
}

/** fuzz.ratio — 0..100. */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 100;
  if (!a.length || !b.length) return 0;
  return (200 * lcsLength(a, b)) / (a.length + b.length);
}

/**
 * fuzz.partial_ratio — the shorter string scored against its best-matching
 * window of the longer one. rapidfuzz picks candidate alignments from matching
 * blocks; sliding every window is equivalent for strings this short.
 *
 * Windows that hang off either end are compared as the FULL shorter string vs.
 * the truncated window (as rapidfuzz does), so a one-character overlap scores
 * near zero instead of a spurious 100.
 */
export function partialRatio(a: string, b: string): number {
  if (!a.length || !b.length) return a.length === b.length ? 100 : 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let best = bestWindow(short, long);
  // Equal-length strings have no obvious needle, so rapidfuzz tries both roles.
  if (best < 100 && short.length === long.length) best = Math.max(best, bestWindow(long, short));
  return best;
}

/** Best fuzz.ratio of `needle` against any window of `haystack`. */
function bestWindow(needle: string, haystack: string): number {
  const n = needle.length;
  let best = 0;
  for (let start = 0; start + n <= haystack.length; start++) {
    const score = ratio(needle, haystack.substr(start, n));
    if (score > best) best = score;
    if (best === 100) return 100;
  }
  for (let i = 1; i < n; i++) {
    best = Math.max(best, ratio(needle, haystack.slice(0, i)));                 // window running off the start
    best = Math.max(best, ratio(needle, haystack.slice(haystack.length - i))); // …and off the end
  }
  return best;
}

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function sortedJoin(list: string[]): string {
  return [...list].sort().join(" ");
}

/** fuzz.token_sort_ratio */
export function tokenSortRatio(a: string, b: string): number {
  return ratio(sortedJoin(tokens(a)), sortedJoin(tokens(b)));
}

/** fuzz.token_set_ratio */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  const sect = [...ta].filter((t) => tb.has(t));
  const diffA = [...ta].filter((t) => !tb.has(t));
  const diffB = [...tb].filter((t) => !ta.has(t));

  if (sect.length && (!diffA.length || !diffB.length)) return 100; // one side is a subset

  const s = sortedJoin(sect);
  const ab = (s + " " + sortedJoin(diffA)).trim();
  const ba = (s + " " + sortedJoin(diffB)).trim();
  if (!sect.length) return ratio(ab, ba);
  return Math.max(ratio(s, ab), ratio(s, ba), ratio(ab, ba));
}

function partialTokenSortRatio(a: string, b: string): number {
  return partialRatio(sortedJoin(tokens(a)), sortedJoin(tokens(b)));
}

function partialTokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  const sect = [...ta].filter((t) => tb.has(t));
  if (sect.length) return 100; // rapidfuzz: any shared token saturates the partial variant
  return partialRatio(sortedJoin([...ta]), sortedJoin([...tb]));
}

const UNBASE_SCALE = 0.95;

/** fuzz.WRatio — the scorer the notebook passes to process.extractOne. */
export function wRatio(a: string, b: string): number {
  if (!a.length || !b.length) return 0;

  const lenRatio = Math.max(a.length, b.length) / Math.min(a.length, b.length);
  let end = ratio(a, b);

  if (lenRatio < 1.5) {
    const tokenRatio = Math.max(tokenSortRatio(a, b), tokenSetRatio(a, b));
    return Math.max(end, tokenRatio * UNBASE_SCALE);
  }

  // fuzzywuzzy/rapidfuzz drop to 0.6 only once one string is MORE than 8× the other.
  const partialScale = lenRatio > 8 ? 0.6 : 0.9;
  end = Math.max(end, partialRatio(a, b) * partialScale);
  const partialTokenRatio = Math.max(partialTokenSortRatio(a, b), partialTokenSetRatio(a, b));
  return Math.max(end, partialTokenRatio * UNBASE_SCALE * partialScale);
}

/* ── Indexed search ──────────────────────────────────────────────────────
   Scoring one value against ~700 master names means ~700 WRatio calls, each
   several LCS passes — far too slow to run per table cell in a browser. Every
   candidate is therefore pre-measured once (length, character multiset, token
   set), which is enough to bound its best possible WRatio in O(len) and skip
   the DP entirely for the ~95% of candidates that cannot reach the cutoff.
   The surviving candidates are scored with the exact scorer, so results are
   identical to the unfiltered search.                                        */

export interface Candidate {
  value: string;
  len: number;
  counts: Map<number, number>; // char code → occurrences
  tokens: Set<string>;
}

function charCounts(s: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

export function indexChoices(choices: Iterable<string>): Candidate[] {
  const out: Candidate[] = [];
  for (const value of choices) {
    out.push({ value, len: value.length, counts: charCounts(value), tokens: new Set(tokens(value)) });
  }
  return out;
}

/** Characters the two strings share, counting multiplicity — an LCS ceiling. */
function commonChars(a: Map<number, number>, b: Map<number, number>): number {
  let total = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [code, count] of small) {
    const other = large.get(code);
    if (other) total += Math.min(count, other);
  }
  return total;
}

/** Highest WRatio the pair could possibly reach, from length/character data alone. */
function upperBound(query: Candidate, cand: Candidate): number {
  const l1 = query.len;
  const l2 = cand.len;
  if (!l1 || !l2) return 0;
  const common = commonChars(query.counts, cand.counts);
  if (!common) return 0;

  const base = (200 * common) / (l1 + l2); // bounds ratio and token_sort_ratio
  let shared = false;
  for (const t of query.tokens) {
    if (cand.tokens.has(t)) { shared = true; break; }
  }
  // A shared token can drive token_set_ratio to 100 (subset case).
  const tokenUb = shared ? 100 : base;

  const lenRatio = Math.max(l1, l2) / Math.min(l1, l2);
  if (lenRatio < 1.5) return Math.max(base, tokenUb * UNBASE_SCALE);

  const n = Math.min(l1, l2);
  const c = Math.min(common, n);
  // Best window alignment: full-length windows give 100·c/n, and a truncated
  // edge window of length i gives at most 200·c/(n+i), maximised at i = c.
  const partialUb = c >= n ? 100 : (200 * c) / (n + c);
  const partialScale = lenRatio > 8 ? 0.6 : 0.9;
  return Math.max(base, partialUb * partialScale, (shared ? 100 : partialUb) * UNBASE_SCALE * partialScale);
}

/**
 * process.extractOne(query, choices, scorer=WRatio, score_cutoff=…).
 * Ties keep the first choice in iteration order, as rapidfuzz does.
 */
export function extractOne(
  query: string,
  choices: Candidate[] | Iterable<string>,
  scoreCutoff: number
): { choice: string; score: number } | null {
  const candidates = Array.isArray(choices) && (choices[0] === undefined || typeof choices[0] === "object")
    ? (choices as Candidate[])
    : indexChoices(choices as Iterable<string>);

  const q: Candidate = { value: query, len: query.length, counts: charCounts(query), tokens: new Set(tokens(query)) };
  let best: { choice: string; score: number } | null = null;

  for (const cand of candidates) {
    // Skip anything that cannot beat the cutoff, or the best score so far.
    if (upperBound(q, cand) < Math.max(scoreCutoff, best?.score ?? 0)) continue;
    const score = wRatio(query, cand.value);
    if (score >= scoreCutoff && (best === null || score > best.score)) {
      best = { choice: cand.value, score };
      if (score === 100) break;
    }
  }
  return best;
}
